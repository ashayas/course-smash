// A small world for the tests: the real migrations on an in-memory SQLite, through the same D1 adapter the
// Node server uses, with one library course and one learner part-way through it. No test here reaches a model.
import { resolve } from "node:path";
import { openDatabase } from "../src/server/sqlite";

export const DAY = 86_400_000;
export const ZONE = "America/Denver";

export function makeEnv() {
  // No inference key: anything that would call a model fails fast instead of reaching the network.
  return { DB: openDatabase(":memory:", resolve(process.cwd(), "migrations")), USER_NAME: "admin", PW: "x", CLOUDFLARE_API_KEY: "", CLOUDFLARE_ACCOUNT_ID: "" } as unknown as Env;
}

const run = (env: Env, sql: string, ...values: unknown[]) => env.DB.prepare(sql).bind(...values).run();

type BankSpec = { id: string; concept: string; kind?: "mcq" | "short"; tier?: "core" | "reserve"; source?: "library" | "generated" };

export async function addBank(env: Env, catalogId: string, moduleIndex: number, questions: BankSpec[]) {
  const moduleId = `${catalogId}--m${moduleIndex}`;
  await run(env, "INSERT INTO catalog_courses (id, track, title, summary, prompt, level, tags, position, created_at) VALUES (?, 'kubernetes', ?, 'A course', 'Learn it', 'intro', '[]', 0, 1) ON CONFLICT (id) DO NOTHING", catalogId, `Library ${catalogId}`);
  await run(env, "INSERT INTO catalog_modules (id, catalog_course_id, position, title, objective, concepts) VALUES (?, ?, ?, ?, 'Know it', ?)", moduleId, catalogId, moduleIndex, `Module ${moduleIndex}`, JSON.stringify([...new Set(questions.map((q) => q.concept))]));
  for (const [i, q] of questions.entries()) {
    const mcq = (q.kind ?? "mcq") === "mcq";
    await run(env,
      "INSERT INTO catalog_questions (id, catalog_module_id, position, tier, kind, prompt, options, correct_index, reference, concept, difficulty, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 2, ?)",
      q.id, moduleId, i, q.tier ?? "reserve", q.kind ?? "mcq", `Bank question ${q.id}?`, mcq ? JSON.stringify(["right", "wrong one", "wrong two", "wrong three"]) : null, mcq ? 0 : null, `Because ${q.id}.`, q.concept, q.source ?? "library");
  }
  return moduleId;
}

type ModuleSpec = { status: "passed" | "active" | "locked"; catalogModule: string | null; concepts: string[]; questions: { id: string; concept: string; bank?: string; verdict?: "correct" | "partial" | "incorrect" | null }[] };

/** A course for `owner` (null is the admin). Questions with a verdict are answered at `answeredAt`. */
export async function addCourse(env: Env, id: string, owner: string | null, catalogId: string | null, modules: ModuleSpec[], answeredAt: number) {
  const status = modules.every((m) => m.status === "passed") ? "complete" : "active";
  await run(env, "INSERT INTO courses (id, prompt, title, summary, status, owner, catalog_id, created_at) VALUES (?, 'Learn it', ?, 'A course', ?, ?, ?, ?)", id, `Course ${id}`, status, owner, catalogId, answeredAt - DAY);
  for (const [position, m] of modules.entries()) {
    const moduleId = `${id}-m${position}`;
    await run(env, "INSERT INTO modules (id, course_id, position, title, objective, concepts, status, catalog_module_id) VALUES (?, ?, ?, ?, 'Know it', ?, ?, ?)", moduleId, id, position, `Module ${position + 1}`, JSON.stringify(m.concepts), m.status, m.catalogModule);
    for (const [i, q] of m.questions.entries()) {
      await run(env,
        "INSERT INTO questions (id, course_id, module_id, round, position, kind, prompt, options, correct_index, reference, concept, bank_id) VALUES (?, ?, ?, 1, ?, 'mcq', ?, ?, 0, ?, ?, ?)",
        q.id, id, moduleId, i, `Course question ${q.id}?`, JSON.stringify(["right", "wrong one", "wrong two", "wrong three"]), `Because ${q.id}.`, q.concept, q.bank ?? null);
      if (q.verdict) {
        await run(env, "INSERT INTO answers (id, question_id, course_id, concept, response, verdict, score, feedback, created_at) VALUES (?, ?, ?, ?, 'x', ?, ?, 'ok', ?)",
          `a-${q.id}`, q.id, id, q.concept, q.verdict, q.verdict === "correct" ? 1 : q.verdict === "partial" ? 0.5 : 0, answeredAt + i);
      }
    }
  }
}

/**
 * The usual learner: a library course with its first module passed (alpha answered right, beta missed) and its
 * second in progress with three questions waiting. The bank has unseen questions on both subtopics.
 */
export async function usualLearner(env: Env, answeredAt: number, owner: string | null = null) {
  const bank0 = await addBank(env, "lib", 0, [
    { id: "b-alpha-core", concept: "alpha", tier: "core" },
    { id: "b-beta-core", concept: "beta", tier: "core" },
    { id: "b-alpha-1", concept: "alpha" },
    { id: "b-alpha-short", concept: "alpha", kind: "short" },
    { id: "b-beta-1", concept: "beta" },
    { id: "b-beta-generated", concept: "beta", source: "generated" },
  ]);
  const bank1 = await addBank(env, "lib", 1, [{ id: "b-gamma-core", concept: "gamma", tier: "core" }]);
  await addCourse(env, "c1", owner, "lib", [
    { status: "passed", catalogModule: bank0, concepts: ["alpha", "beta"], questions: [
      { id: "q-alpha", concept: "alpha", bank: "b-alpha-core", verdict: "correct" },
      { id: "q-beta", concept: "beta", bank: "b-beta-core", verdict: "incorrect" },
    ] },
    { status: "active", catalogModule: bank1, concepts: ["gamma"], questions: [
      { id: "q-gamma-1", concept: "gamma", bank: "b-gamma-core", verdict: null },
      { id: "q-gamma-2", concept: "gamma", verdict: null },
      { id: "q-gamma-3", concept: "gamma", verdict: null },
    ] },
  ], answeredAt);
}

// node:sqlite returns rows without a prototype. Copy them, so they compare equal to plain objects.
export const rows = async <T>(env: Env, sql: string, ...values: unknown[]) => (await env.DB.prepare(sql).bind(...values).all<T>()).results.map((row) => ({ ...row }));
export const one = async <T>(env: Env, sql: string, ...values: unknown[]) => {
  const row = await env.DB.prepare(sql).bind(...values).first<T>();
  return row ? { ...row } : null;
};
