import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { AnswerError, advance, answerQuestion, catalogCourse, courseView, createCourse, deleteCourse, listCatalog, listCourses, startCatalogCourse } from "./agent";
import { authenticate, authenticateBasic, clearedSessionCookie, ownerOf, sessionCookie, sessionUser } from "./auth";
import { createMcpServer } from "./mcp";

const PUBLIC_PATHS = new Set(["/login", "/styles.css", "/favicon.svg", "/login.js", "/login-city.js", "/city.js"]);

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

const redirect = (location: string, cookie?: string) =>
  new Response(null, { status: 303, headers: { Location: location, ...(cookie ? { "Set-Cookie": cookie } : {}) } });

const clientKey = (request: Request) => request.headers.get("CF-Connecting-IP") ?? "unknown";

async function serveAsset(request: Request, env: Env): Promise<Response> {
  const asset = await env.ASSETS.fetch(request);
  const response = new Response(asset.body, asset);
  response.headers.set(
    "Content-Security-Policy",
    "default-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  );
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "same-origin");
  return response;
}

async function handleLogin(request: Request, env: Env): Promise<Response> {
  const { success } = await env.LOGIN_LIMIT.limit({ key: clientKey(request) });
  if (!success) return redirect("/login?error=slow");
  const form = await request.formData();
  const username = await authenticate(String(form.get("username") ?? "").trim(), String(form.get("password") ?? ""), env);
  if (!username) return redirect("/login?error=wrong");
  return redirect("/", await sessionCookie(request, username, env));
}

async function handleMcp(request: Request, env: Env): Promise<Response> {
  const username = await authenticateBasic(request, env);
  if (!username) {
    const { success } = await env.LOGIN_LIMIT.limit({ key: clientKey(request) });
    return new Response(success ? "Unauthorized" : "Too many attempts", {
      status: success ? 401 : 429,
      headers: { "WWW-Authenticate": 'Basic realm="coursesmash"' },
    });
  }
  // Stateless: a new server and transport for each request.
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await createMcpServer(env, ownerOf(username, env)).connect(transport);
  return transport.handleRequest(request);
}

async function handleApi(request: Request, env: Env, ctx: ExecutionContext, path: string, username: string): Promise<Response> {
  const { method } = request;
  const owner = ownerOf(username, env);
  if (path === "/api/me" && method === "GET") return json({ username });
  if (path === "/api/courses" && method === "GET") return json({ courses: await listCourses(env, owner) });

  if (path === "/api/courses" && method === "POST") {
    const body = (await request.json().catch(() => null)) as { prompt?: unknown } | null;
    const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
    if (prompt.length < 3) return json({ error: "Tell me a bit more about what you want to learn." }, 400);
    if (prompt.length > 2000) return json({ error: "Keep your request under 2000 characters." }, 400);
    return json({ id: await createCourse(env, prompt, owner) }, 201);
  }

  if (path === "/api/catalog" && method === "GET") return json(await listCatalog(env));
  const library = path.match(/^\/api\/catalog\/([\w-]+)(\/start)?$/);
  if (library) {
    if (!library[2] && method === "GET") {
      const view = await catalogCourse(env, library[1]!);
      return view ? json(view) : json({ error: "That course isn't in the library." }, 404);
    }
    if (library[2] && method === "POST") {
      const body = (await request.json().catch(() => null)) as { goal?: unknown } | null;
      const goal = typeof body?.goal === "string" ? body.goal : "";
      if (goal.length > 1000) return json({ error: "Keep your goal under 1000 characters." }, 400);
      const id = await startCatalogCourse(env, library[1]!, goal, owner);
      return id ? json({ id }, 201) : json({ error: "That course isn't in the library." }, 404);
    }
  }

  const course = path.match(/^\/api\/courses\/([\w-]+)(\/advance)?$/);
  if (course) {
    const id = course[1]!;
    if (!course[2] && method === "GET") {
      const view = await courseView(env, id, owner);
      return view ? json(view) : json({ error: "Course not found." }, 404);
    }
    if (!course[2] && method === "DELETE") {
      await deleteCourse(env, id, owner);
      return json({ ok: true });
    }
    if (course[2] && method === "POST") {
      // Keep working briefly if the learner navigates away; the lease covers anything longer.
      const work = advance(env, id, owner);
      ctx.waitUntil(work);
      const result = await work;
      return json(result, result.status === "error" ? 502 : result.status === "missing" ? 404 : 200);
    }
  }

  const question = path.match(/^\/api\/questions\/([\w-]+)\/answer$/);
  if (question && method === "POST") {
    const body = (await request.json().catch(() => null)) as { response?: unknown } | null;
    if (typeof body?.response !== "string") return json({ error: "Write an answer first." }, 400);
    try {
      return json(await answerQuestion(env, question[1]!, body.response, owner));
    } catch (error) {
      if (error instanceof AnswerError) return json({ error: error.message }, error.status);
      throw error;
    }
  }

  return json({ error: "Not found." }, 404);
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const { pathname } = new URL(request.url);
    try {
      if (pathname === "/mcp") return await handleMcp(request, env);
      if (pathname === "/login" && request.method === "POST") return await handleLogin(request, env);
      if (pathname === "/logout" && request.method === "POST") return redirect("/login", clearedSessionCookie(request));
      if (PUBLIC_PATHS.has(pathname)) {
        if (pathname === "/login" && (await sessionUser(request, env))) return redirect("/");
        return await serveAsset(request, env);
      }

      const username = await sessionUser(request, env);
      if (!username) {
        return pathname.startsWith("/api/") ? json({ error: "Please log in." }, 401) : redirect("/login");
      }
      if (pathname.startsWith("/api/")) return await handleApi(request, env, ctx, pathname, username);
      return await serveAsset(request, env);
    } catch (error) {
      console.error(JSON.stringify({ message: "unhandled error", pathname, error: String(error) }));
      return json({ error: "Something went wrong." }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
