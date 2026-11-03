// Runs the same Worker on plain Node, for Docker or any other host.
// It supplies the three Cloudflare primitives the app uses: D1, Assets and the rate limiter.
import { createReadStream, existsSync, statSync } from "node:fs";
import { type IncomingMessage, type ServerResponse, createServer } from "node:http";
import { extname, join, resolve } from "node:path";
import { Readable } from "node:stream";
import worker from "../index";
import { openDatabase } from "./sqlite";

const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required. See .env.example.`);
  return value;
};

const root = process.cwd();
const publicDir = resolve(root, "public");
const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml",
};

const ASSETS = {
  async fetch(request: Request) {
    const { pathname } = new URL(request.url);
    const relative = pathname === "/" ? "index.html" : pathname.endsWith(".html") || extname(pathname) ? pathname.slice(1) : `${pathname.slice(1)}.html`;
    const file = resolve(publicDir, relative);
    if (!file.startsWith(publicDir + "/") || !existsSync(file) || !statSync(file).isFile()) return new Response("Not found", { status: 404 });
    return new Response(Readable.toWeb(createReadStream(file)) as unknown as ReadableStream, {
      headers: { "Content-Type": TYPES[extname(file)] ?? "application/octet-stream", "Cache-Control": "no-cache" },
    });
  },
};

// Same limit as wrangler.jsonc: 10 per minute per key.
const attempts = new Map<string, { count: number; resetAt: number }>();
const LOGIN_LIMIT = {
  async limit({ key }: { key: string }) {
    const time = Date.now();
    for (const [k, entry] of attempts) if (entry.resetAt < time) attempts.delete(k);
    const entry = attempts.get(key) ?? { count: 0, resetAt: time + 60_000 };
    entry.count += 1;
    attempts.set(key, entry);
    return { success: entry.count <= 10 };
  },
};

// The adapter covers only what the app calls, so it can't satisfy the full platform types.
const env = {
  DB: openDatabase(process.env.DATABASE_PATH ?? join(root, "data", "coursesmash.db"), resolve(root, "migrations")),
  ASSETS,
  LOGIN_LIMIT,
  USER_NAME: required("USER_NAME"),
  PW: required("PW"),
  CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID ?? "",
  CLOUDFLARE_API_KEY: process.env.CLOUDFLARE_API_KEY ?? "",
  OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_MODEL: process.env.OPENAI_MODEL,
} as unknown as Env;

if (!env.CLOUDFLARE_API_KEY && !process.env.OPENAI_BASE_URL) {
  throw new Error("Set OPENAI_BASE_URL and OPENAI_MODEL, or CLOUDFLARE_API_KEY and CLOUDFLARE_ACCOUNT_ID. See .env.example.");
}

const background = new Set<Promise<unknown>>();
const ctx = {
  waitUntil(promise: Promise<unknown>) {
    background.add(promise);
    promise.catch(() => {}).finally(() => background.delete(promise));
  },
  passThroughOnException() {},
} as unknown as ExecutionContext;

function toRequest(req: IncomingMessage): Request {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (value) headers.set(name, Array.isArray(value) ? value.join(", ") : value);
  }
  // This header keys the rate limiter, so a client must not be able to choose it.
  headers.set("CF-Connecting-IP", req.socket.remoteAddress ?? "unknown");
  const protocol = req.headers["x-forwarded-proto"] === "https" ? "https" : "http";
  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  return new Request(`${protocol}://${req.headers.host ?? "localhost"}${req.url}`, {
    method: req.method,
    headers,
    body: hasBody ? (Readable.toWeb(req) as unknown as ReadableStream) : undefined,
    ...(hasBody ? { duplex: "half" } : {}),
  } as RequestInit);
}

async function respond(req: IncomingMessage, res: ServerResponse) {
  try {
    const response = await worker.fetch(toRequest(req) as Parameters<typeof worker.fetch>[0], env, ctx);
    const headers: Record<string, string | string[]> = {};
    response.headers.forEach((value, name) => {
      if (name !== "set-cookie") headers[name] = value;
    });
    const cookies = response.headers.getSetCookie();
    if (cookies.length) headers["set-cookie"] = cookies;
    res.writeHead(response.status, headers);
    if (response.body) Readable.fromWeb(response.body as never).pipe(res);
    else res.end();
  } catch (error) {
    console.error(JSON.stringify({ message: "request failed", error: String(error) }));
    if (!res.headersSent) res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("Something went wrong.");
  }
}

const port = Number(process.env.PORT ?? 8787);
const server = createServer((req, res) => void respond(req, res));
// Agent steps can run for minutes, so keep Node from cutting them off.
server.requestTimeout = 0;
server.listen(port, "0.0.0.0", () => console.log(JSON.stringify({ message: "listening", port })));

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close();
    void Promise.allSettled(background).then(() => process.exit(0));
  });
}
