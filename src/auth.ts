// Login gate: a signed session cookie for the web app, and Basic auth for MCP clients.
const SESSION_COOKIE = "cs_session";
const SESSION_SECONDS = 14 * 24 * 3600;

const encode = (value: string) => new TextEncoder().encode(value);

async function sha256(value: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest("SHA-256", encode(value));
}

// Hash both sides so the comparison is constant-time regardless of length.
async function safeEqual(a: string, b: string): Promise<boolean> {
  // Written out because crypto.subtle.timingSafeEqual only exists on Workers.
  const [left, right] = [new Uint8Array(await sha256(a)), new Uint8Array(await sha256(b))];
  let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left[i]! ^ right[i]!;
  return difference === 0;
}

async function sign(payload: string, env: Env): Promise<string> {
  // Keyed on the credentials, so changing the password ends every session.
  const key = await crypto.subtle.importKey(
    "raw",
    await sha256(`session:${env.USER_NAME}:${env.PW}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, encode(payload));
  return btoa(String.fromCharCode(...new Uint8Array(mac)));
}

export async function credentialsMatch(user: string, password: string, env: Env): Promise<boolean> {
  const [userOk, passwordOk] = await Promise.all([safeEqual(user, env.USER_NAME), safeEqual(password, env.PW)]);
  return userOk && passwordOk;
}

export async function hasBasicAuth(request: Request, env: Env): Promise<boolean> {
  const expected = `Basic ${btoa(`${env.USER_NAME}:${env.PW}`)}`;
  return safeEqual(request.headers.get("Authorization") ?? "", expected);
}

// Self-hosted setups can be plain http, where a Secure cookie would never be sent back.
const flags = (request: Request) => `Path=/; HttpOnly;${new URL(request.url).protocol === "https:" ? " Secure;" : ""} SameSite=Lax`;

export async function sessionCookie(request: Request, env: Env): Promise<string> {
  const expires = String(Math.floor(Date.now() / 1000) + SESSION_SECONDS);
  const value = `${expires}.${await sign(expires, env)}`;
  return `${SESSION_COOKIE}=${encodeURIComponent(value)}; ${flags(request)}; Max-Age=${SESSION_SECONDS}`;
}

export const clearedSessionCookie = (request: Request) => `${SESSION_COOKIE}=; ${flags(request)}; Max-Age=0`;

export async function hasSession(request: Request, env: Env): Promise<boolean> {
  const cookies = request.headers.get("Cookie") ?? "";
  const raw = cookies.split(/;\s*/).find((c) => c.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1);
  if (!raw) return false;
  const [expires, mac] = decodeURIComponent(raw).split(".");
  if (!expires || !mac || Number(expires) < Date.now() / 1000) return false;
  return safeEqual(mac, await sign(expires, env));
}
