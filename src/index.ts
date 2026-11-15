import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { AnswerError, advance, advanceWaiting, answerQuestion, catalogCourse, catalogMisses, courseView, createCourse, deleteCourse, learnerStats, listCatalog, listCourses, listTopics, setCourseIcon, similarCatalogCourses, startCatalogCourse } from "./agent";
import { authenticate, authenticateBasic, clearedSessionCookie, ownerOf, sessionCookie, sessionToken, sessionUser } from "./auth";
import { type EmbedMessage, consume, sweep } from "./embeddings";
import { IconSchema } from "./icon";
import { createMcpServer } from "./mcp";
import { getLearner, saveSettings, settingsView } from "./days";
import { answerRecall, moreRecall, skipRecall, skipRecallDay, today } from "./recall";
import { appConfig, filterCatalog, withInsights } from "./views";

const PUBLIC_PATHS = new Set(["/login", "/styles.css", "/favicon.svg", "/login.js", "/login-city.js", "/city.js", "/og.png", "/privacy", "/support"]);

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

/** Login for native apps: JSON in, a session token out. The token goes back as `Authorization: Bearer <token>`. */
async function handleApiLogin(request: Request, env: Env): Promise<Response> {
  const { success } = await env.LOGIN_LIMIT.limit({ key: clientKey(request) });
  if (!success) return json({ error: "Too many tries. Wait a minute and try again." }, 429);
  const body = (await request.json().catch(() => null)) as { username?: unknown; password?: unknown } | null;
  const username = await authenticate(
    typeof body?.username === "string" ? body.username.trim() : "",
    typeof body?.password === "string" ? body.password : "",
    env,
  );
  if (!username) return json({ error: "That username or password isn't right." }, 401);
  const { token, expires } = await sessionToken(username, env);
  return json({ token, username, expires_at: expires });
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
  // The learner's IANA time zone, which decides the day an answer belongs to. See src/days.ts.
  const zone = request.headers.get("X-Time-Zone");
  if (path === "/api/me" && method === "GET") return json({ username });
  if (path === "/api/courses" && method === "GET") return json({ courses: await listCourses(env, owner) });

  if (path === "/api/courses" && method === "POST") {
    const body = (await request.json().catch(() => null)) as { prompt?: unknown } | null;
    const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
    if (prompt.length < 3) return json({ error: "Tell me a bit more about what you want to learn." }, 400);
    if (prompt.length > 2000) return json({ error: "Keep your request under 2000 characters." }, 400);
    return json({ id: await createCourse(env, prompt, owner) }, 201);
  }

  if (path === "/api/app" && method === "GET") return json(appConfig());
  if (path === "/api/stats" && method === "GET") return json(withInsights(await learnerStats(env, owner, zone)));

  if (path === "/api/today" && method === "GET") return json(await today(env, owner, zone));
  if (path === "/api/settings" && method === "GET") return json(settingsView(await getLearner(env, owner, zone)));
  if (path === "/api/settings" && method === "PUT") {
    const body = (await request.json().catch(() => null)) as { daily_goal?: unknown; short_answers?: unknown } | null;
    const saved = await saveSettings(env, await getLearner(env, owner, zone), body ?? {});
    return saved ? json(saved) : json({ error: "Pick one of the choices on the screen." }, 400);
  }
  if (path === "/api/recall/more" && method === "POST") return json(await moreRecall(env, owner, zone));
  if (path === "/api/recall/skip-day" && method === "POST") {
    const body = (await request.json().catch(() => null)) as { skipped?: unknown } | null;
    return json(await skipRecallDay(env, owner, body?.skipped !== false, zone));
  }
  const recall = path.match(/^\/api\/recall\/([\w-]+)\/(answer|skip)$/);
  if (recall && method === "POST") {
    try {
      if (recall[2] === "skip") return json(await skipRecall(env, owner, recall[1]!, zone));
      const body = (await request.json().catch(() => null)) as { response?: unknown } | null;
      if (typeof body?.response !== "string") return json({ error: "Write an answer first." }, 400);
      const { advance: waiting, ...answer } = await answerRecall(env, owner, recall[1]!, body.response, zone);
      // That answer finished a course's round, so start writing what comes next while the learner carries on.
      if (waiting) ctx.waitUntil(advance(env, waiting, owner));
      return json(answer);
    } catch (error) {
      if (error instanceof AnswerError) return json({ error: error.message }, error.status);
      throw error;
    }
  }

  if (path === "/api/catalog" && method === "GET") {
    const { searchParams } = new URL(request.url);
    return json(filterCatalog(await listCatalog(env), (searchParams.get("q") ?? "").slice(0, 200), searchParams.get("track") ?? ""));
  }
  if (path === "/api/topics" && method === "GET") return json({ topics: await listTopics(env) });
  const related = path.match(/^\/api\/catalog\/([\w-]+)\/(similar|misses)$/);
  if (related && method === "GET") {
    const view = related[2] === "similar" ? await similarCatalogCourses(env, related[1]!) : await catalogMisses(env, related[1]!);
    return view ? json(view) : json({ error: "That course isn't in the library." }, 404);
  }
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

  const iconPath = path.match(/^\/api\/courses\/([\w-]+)\/icon$/);
  if (iconPath && method === "PUT") {
    const parsed = IconSchema.safeParse(((await request.json().catch(() => null)) as { icon?: unknown } | null)?.icon);
    if (!parsed.success) return json({ error: "Pick a building from the list." }, 400);
    return (await setCourseIcon(env, iconPath[1]!, parsed.data, owner)) ? json({ icon: parsed.data }) : json({ error: "Course not found." }, 404);
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
      return json(await answerQuestion(env, question[1]!, body.response, owner, zone));
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
      if (pathname === "/api/login" && request.method === "POST") return await handleApiLogin(request, env);
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

  // Embedding work: the cron sweep queues stale banks and rebuilds topics, and the queue consumer embeds them.
  // The same trigger writes the next round for courses that are waiting on the agent, so a learner who comes back
  // finds a question. The two jobs run side by side and neither depends on the other.
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(sweep(env).catch((error) => console.error(JSON.stringify({ message: "embedding sweep failed", error: String(error) }))));
    ctx.waitUntil(advanceWaiting(env).catch((error) => console.error(JSON.stringify({ message: "advancing waiting courses failed", error: String(error) }))));
  },

  async queue(batch, env) {
    await consume(batch as MessageBatch<EmbedMessage>, env);
  },
} satisfies ExportedHandler<Env>;
