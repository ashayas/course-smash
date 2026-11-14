// Login gate. The admin account lives in the USER_NAME and PW secrets; other accounts live in D1.
// The web app uses a signed session cookie, native apps send the same signed value as a Bearer token,
// and MCP clients use Basic auth.
const SESSION_COOKIE = "cs_session";
const SESSION_SECONDS = 14 * 24 * 3600;
const PBKDF2_ITERATIONS = 100_000; // the most Workers allows

const encode = (value: string) => new TextEncoder().encode(value);
const toBase64 = (bytes: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const fromBase64 = (value: string) => Uint8Array.from(atob(value), (c) => c.charCodeAt(0));

async function sha256(value: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest("SHA-256", encode(value));
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  // Written out because crypto.subtle.timingSafeEqual only exists on Workers.
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left[i]! ^ right[i]!;
  return difference === 0;
}

// Hash both sides so the comparison is constant-time regardless of length.
async function safeEqual(a: string, b: string): Promise<boolean> {
  return bytesEqual(new Uint8Array(await sha256(a)), new Uint8Array(await sha256(b)));
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", encode(password), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256));
}

/** Format: pbkdf2-sha256$iterations$salt$hash. scripts/add-user.mjs writes the same format. */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2-sha256$${PBKDF2_ITERATIONS}$${toBase64(salt)}$${toBase64(await pbkdf2(password, salt, PBKDF2_ITERATIONS))}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, iterations, salt, hash] = stored.split("$");
  if (scheme !== "pbkdf2-sha256" || !iterations || !salt || !hash) return false;
  return bytesEqual(await pbkdf2(password, fromBase64(salt), Number(iterations)), fromBase64(hash));
}

// Checked against when a username doesn't exist, so a miss takes as long as a wrong password.
const DUMMY_HASH = `pbkdf2-sha256$${PBKDF2_ITERATIONS}$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=`;

const findUser = (env: Env, username: string) =>
  env.DB.prepare("SELECT password_hash FROM users WHERE username = ?").bind(username).first<{ password_hash: string }>();

/** Returns the username if the credentials are valid, otherwise null. */
export async function authenticate(username: string, password: string, env: Env): Promise<string | null> {
  const [userOk, passwordOk] = await Promise.all([safeEqual(username, env.USER_NAME), safeEqual(password, env.PW)]);
  if (userOk && passwordOk) return env.USER_NAME;
  const user = username && username !== env.USER_NAME ? await findUser(env, username) : null;
  const valid = await verifyPassword(password, user?.password_hash ?? DUMMY_HASH);
  return user && valid ? username : null;
}

export async function authenticateBasic(request: Request, env: Env): Promise<string | null> {
  const header = request.headers.get("Authorization") ?? "";
  if (!header.startsWith("Basic ")) return null;
  let decoded: string;
  try {
    decoded = new TextDecoder().decode(fromBase64(header.slice(6).trim()));
  } catch {
    return null;
  }
  const split = decoded.indexOf(":");
  if (split < 0) return null;
  return authenticate(decoded.slice(0, split), decoded.slice(split + 1), env);
}

/** Courses owned by the admin account have no owner, so older courses stay with it. */
export const ownerOf = (username: string, env: Env): string | null => (username === env.USER_NAME ? null : username);

async function sign(payload: string, env: Env): Promise<string> {
  // Keyed on the admin credentials, so changing them ends every session.
  const key = await crypto.subtle.importKey(
    "raw",
    await sha256(`session:${env.USER_NAME}:${env.PW}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toBase64(await crypto.subtle.sign("HMAC", key, encode(payload)));
}

// The password hash goes into the signature, so changing a user's password ends their sessions.
async function sessionPayload(username: string, expires: string, env: Env): Promise<string | null> {
  if (username === env.USER_NAME) return `${username}\n${expires}`;
  const user = await findUser(env, username);
  return user ? `${username}\n${expires}\n${user.password_hash}` : null;
}

// Self-hosted setups can be plain http, where a Secure cookie would never be sent back.
const flags = (request: Request) => `Path=/; HttpOnly;${new URL(request.url).protocol === "https:" ? " Secure;" : ""} SameSite=Lax`;

/** A signed session value. The cookie and the Bearer token for native apps are the same thing. */
export async function sessionToken(username: string, env: Env): Promise<{ token: string; expires: number }> {
  const expires = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const payload = (await sessionPayload(username, String(expires), env))!;
  return { token: `${toBase64(encode(username))}.${expires}.${await sign(payload, env)}`, expires };
}

export async function sessionCookie(request: Request, username: string, env: Env): Promise<string> {
  const { token } = await sessionToken(username, env);
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; ${flags(request)}; Max-Age=${SESSION_SECONDS}`;
}

export const clearedSessionCookie = (request: Request) => `${SESSION_COOKIE}=; ${flags(request)}; Max-Age=0`;

/** Returns the signed-in username, or null. Reads `Authorization: Bearer <token>` first, then the session cookie. */
export async function sessionUser(request: Request, env: Env): Promise<string | null> {
  const header = request.headers.get("Authorization") ?? "";
  let value: string | undefined;
  if (header.startsWith("Bearer ")) value = header.slice(7).trim();
  else {
    const cookies = request.headers.get("Cookie") ?? "";
    const raw = cookies.split(/;\s*/).find((c) => c.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1);
    try {
      value = raw && decodeURIComponent(raw);
    } catch {
      return null;
    }
  }
  if (!value) return null;
  const [name, expires, mac] = value.split(".");
  if (!name || !expires || !mac || Number(expires) < Date.now() / 1000) return null;
  let username: string;
  try {
    username = new TextDecoder().decode(fromBase64(name));
  } catch {
    return null;
  }
  const payload = await sessionPayload(username, expires, env);
  return payload && (await safeEqual(mac, await sign(payload, env))) ? username : null;
}
