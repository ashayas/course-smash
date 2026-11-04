// Add or update a login account.
//
//   Cloudflare:  NEW_PASSWORD='...' node scripts/add-user.mjs <username> > user.sql
//                npx wrangler d1 execute coursesmash-db --remote --file user.sql && rm user.sql
//   Docker:      docker compose exec -e NEW_PASSWORD='...' coursesmash node scripts/add-user.mjs <username> --sqlite /data/coursesmash.db
//
// The admin login comes from USER_NAME and PW instead, so don't reuse that username here.
const [username, flag, sqlitePath] = process.argv.slice(2);
const password = process.env.NEW_PASSWORD;
if (!username || !/^[\w.@-]{1,64}$/.test(username) || !password || password.length < 8) {
  console.error("Usage: NEW_PASSWORD=<8+ characters> node scripts/add-user.mjs <username> [--sqlite <path>]");
  process.exit(1);
}

// Must match hashPassword in src/auth.ts.
const iterations = 100_000;
const salt = crypto.getRandomValues(new Uint8Array(16));
const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
const hash = `pbkdf2-sha256$${iterations}$${Buffer.from(salt).toString("base64")}$${Buffer.from(bits).toString("base64")}`;

const sql = "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?) ON CONFLICT (username) DO UPDATE SET password_hash = excluded.password_hash";
if (flag === "--sqlite") {
  const { DatabaseSync } = await import("node:sqlite");
  new DatabaseSync(sqlitePath).prepare(sql).run(username, hash, Date.now());
  console.error(`Saved ${username}.`);
} else {
  const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
  console.log(sql.replace("?", quote(username)).replace("?", quote(hash)).replace("?", String(Date.now())) + ";");
}
