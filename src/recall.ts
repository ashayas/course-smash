// Daily recall: what the Today screen shows, and what happens when a recall question is answered.
//
// - A recall item is one subtopic of one passed module of a learner's course, with an FSRS schedule (src/fsrs.ts).
//   Items are made the first time the learner's Today is read after a module is passed.
// - The day's set is built once per learner per day: due items (most overdue first, at most 4 a course),
//   up to three unanswered questions from courses in progress, then items that aren't due yet.
// - The question for an item is a bank question on that subtopic the learner hasn't had. When the bank has
//   run out, it is the question they answered longest ago. No model writes anything here.
// - Multiple choice is graded by the key. Short answers are graded as in a course (Clef, then gpt-oss).
import { type Answer, type BankQuestion, AnswerError, SCORE, answerQuestion, catalogCards, concept, gradeShort, listCourses, placeOptions, privateBankId, shuffled } from "./agent";
import { DAY_MS, type Learner, countDay, currentDay, getLearner, localDay, recordAnswer, setRecallSkipped, streakView } from "./days";
import { nearestCourses, storedCloseness } from "./embeddings";
import { type Grade, first, intervalDays, retrievability, review } from "./fsrs";

const PER_COURSE = 4;
const NEW_SHARE = 0.3; // of a set, when a course in progress has questions waiting
const MORE = 5;
const GRADE: Record<Answer["verdict"], Grade> = { incorrect: 1, partial: 2, correct: 3 };

type Item = {
  id: string; owner: string; course_id: string; module_id: string; concept: string;
  stability: number; difficulty: number; due_at: number; last_reviewed_at: number | null;
  last_verdict: Answer["verdict"] | null; reviews: number; lapses: number;
  catalog_module_id: string | null;
};
type SetRow = {
  id: string; owner: string; course_id: string; item_id: string | null; course_question_id: string | null; bank_id: string | null;
  origin: "bank" | "repeat" | "course" | "generated"; kind: "mcq" | "short"; prompt: string; options: string | null;
  correct_index: number | null; reference: string | null; concept: string; why: string | null;
  figure: string | null; figure_alt: string | null; source_url: string | null;
  status: "ready" | "set" | "answered" | "skipped"; day: string; position: number; created_at: number;
  last_reviewed_at: number | null;
};
type Attempt = {
  id: string; question_id: string; response: string; verdict: Answer["verdict"]; score: number; confidence: number | null;
  error_type: string | null; feedback: string; concept: string; due_in_days: number | null;
};
type Draft = Omit<SetRow, "id" | "owner" | "status" | "day" | "position" | "created_at" | "last_reviewed_at">;

const sentence = (text: string) => (text ? text[0]!.toUpperCase() + text.slice(1) : text);
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;
/** "tomorrow", "in 3 days", "in 3 weeks": the same words on every client. */
function when(days: number) {
  if (days <= 1) return "tomorrow";
  if (days < 14) return `in ${days} days`;
  if (days < 56) return `in ${Math.round(days / 7)} weeks`;
  return `in ${Math.round(days / 30)} months`;
}

/* Items */

/** Make recall items for the learner's passed modules that have none yet, starting each from how the course went. */
async function seedItems(env: Env, owner: string | null, key: string, now: number) {
  const { results: modules } = await env.DB.prepare(
    `SELECT m.id, m.course_id, m.concepts, m.catalog_module_id FROM modules m JOIN courses c ON c.id = m.course_id
     WHERE c.owner IS ? AND m.status = 'passed' AND NOT EXISTS (SELECT 1 FROM recall_items i WHERE i.module_id = m.id)`,
  ).bind(owner).all<{ id: string; course_id: string; concepts: string; catalog_module_id: string | null }>();
  for (const module of modules) {
    const { results: answers } = await env.DB.prepare(
      "SELECT q.concept, a.verdict, a.created_at FROM answers a JOIN questions q ON q.id = a.question_id WHERE q.module_id = ? ORDER BY a.created_at",
    ).bind(module.id).all<{ concept: string; verdict: Answer["verdict"]; created_at: number }>();
    // How often every learner misses each subtopic of a library module. Ideas most people get wrong start out harder.
    const shared = module.catalog_module_id && !module.catalog_module_id.startsWith(privateBankId(""));
    const missRates = new Map<string, number>();
    if (shared) {
      const { results } = await env.DB.prepare(
        `SELECT cq.concept, COUNT(*) AS answered, SUM(a.verdict != 'correct') AS missed
         FROM answers a JOIN questions q ON q.id = a.question_id JOIN catalog_questions cq ON cq.id = q.bank_id
         WHERE cq.catalog_module_id = ? GROUP BY cq.concept HAVING answered >= 5`,
      ).bind(module.catalog_module_id).all<{ concept: string; answered: number; missed: number }>();
      for (const row of results) missRates.set(concept(row.concept), row.missed / row.answered);
    }
    const last = new Map<string, { verdict: Answer["verdict"]; created_at: number }>();
    for (const answer of answers) last.set(concept(answer.concept), answer);
    const concepts = [...new Set([...(JSON.parse(module.concepts) as string[]).map(concept), ...last.keys()])];
    const statements = concepts.map((name, i) => {
      const seen = last.get(name);
      // A subtopic the course never asked about is treated as shaky, so it comes back soon.
      const grade = seen ? GRADE[seen.verdict] : 2;
      const memory = first(grade);
      const rate = missRates.get(name);
      const difficulty = Math.min(10, Math.max(1, memory.difficulty + (rate === undefined ? 0 : (rate - 0.5) * 2)));
      // Spread a module's solid subtopics over a few days, so they don't all come due at once.
      const days = intervalDays(memory.stability) + (grade === 3 ? i % 3 : 0);
      const reviewed = seen?.created_at ?? now;
      return env.DB.prepare(
        `INSERT INTO recall_items (id, owner, course_id, module_id, concept, stability, difficulty, due_at, last_reviewed_at, last_verdict, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (module_id, concept) DO NOTHING`,
      ).bind(crypto.randomUUID(), key, module.course_id, module.id, name, memory.stability, difficulty, reviewed + days * DAY_MS, reviewed, seen?.verdict ?? null, now);
    });
    if (statements.length) await env.DB.batch(statements);
  }
}

/* The day's set */

type History = {
  id: string; kind: "mcq" | "short"; prompt: string; options: string | null; correct_index: number | null; reference: string | null;
  concept: string; figure: string | null; figure_alt: string | null; bank_id: string | null; source_url: string | null;
  verdict: Answer["verdict"]; asked_at: number;
};

/**
 * Choose up to `size` questions for the learner: recall items first, then new questions from courses in progress.
 * `taken` is what today's set already holds. Returns nothing unless one or more recall items can be asked.
 */
async function pick(env: Env, learner: Learner, owner: string | null, day: string, now: number, size: number, taken: SetRow[]): Promise<Draft[]> {
  const takenItems = new Set(taken.map((r) => r.item_id));
  const takenCourse = new Set(taken.map((r) => r.course_question_id));
  const [{ results: allItems }, { results: waiting }, { results: seenRows }] = await Promise.all([
    env.DB.prepare("SELECT i.*, m.catalog_module_id FROM recall_items i JOIN modules m ON m.id = i.module_id WHERE i.owner = ?").bind(learner.owner).all<Item>(),
    env.DB.prepare(
      `SELECT q.id, q.course_id, q.kind, q.prompt, q.options, q.concept, q.why, q.figure, q.figure_alt, q.bank_id FROM questions q
       JOIN modules m ON m.id = q.module_id AND m.status = 'active' JOIN courses c ON c.id = q.course_id
       WHERE c.owner IS ? AND c.status = 'active' AND NOT EXISTS (SELECT 1 FROM answers a WHERE a.question_id = q.id)
       ORDER BY (SELECT COALESCE(MAX(a.created_at), c.created_at) FROM answers a WHERE a.course_id = c.id) DESC, q.round, q.position LIMIT 12`,
    ).bind(owner).all<{ id: string; course_id: string; kind: "mcq" | "short"; prompt: string; options: string | null; concept: string; why: string | null; figure: string | null; figure_alt: string | null; bank_id: string | null }>(),
    env.DB.prepare(
      `SELECT q.bank_id FROM questions q JOIN courses c ON c.id = q.course_id WHERE c.owner IS ? AND q.bank_id IS NOT NULL
       UNION SELECT bank_id FROM recall_questions WHERE owner = ? AND bank_id IS NOT NULL`,
    ).bind(owner, learner.owner).all<{ bank_id: string }>(),
  ]);
  const items = allItems.filter((i) => !takenItems.has(i.id));
  if (!items.length) return [];

  const pending = waiting.filter((q) => !takenCourse.has(q.id) && (q.kind === "mcq" || learner.short_answers));
  const fresh = pending.slice(0, Math.round(size * NEW_SHARE));
  const room = size - fresh.length;

  const isDue = (item: Item) => localDay(item.due_at, learner.time_zone) <= day;
  const fading = (item: Item) => retrievability((now - (item.last_reviewed_at ?? item.due_at)) / DAY_MS, item.stability);
  const due = items.filter(isDue).sort((a, b) => a.due_at - b.due_at);
  const early = items.filter((i) => !isDue(i)).sort((a, b) => fading(a) - fading(b));
  // Most overdue first with a cap per course, then what isn't due yet, then whatever the cap held back.
  const perCourse = new Map<string, number>();
  const capped: Item[] = [];
  const held: Item[] = [];
  for (const item of [...due, ...early]) {
    const used = perCourse.get(item.course_id) ?? 0;
    if (used < PER_COURSE) {
      capped.push(item);
      perCourse.set(item.course_id, used + 1);
    } else held.push(item);
  }
  const queue = [...capped, ...held];

  const seen = new Set(seenRows.map((r) => r.bank_id));
  const bankCache = new Map<string, Promise<BankQuestion[]>>();
  const bankOf = (moduleId: string) => {
    if (!bankCache.has(moduleId)) {
      bankCache.set(moduleId, env.DB.prepare("SELECT * FROM catalog_questions WHERE catalog_module_id = ? ORDER BY position").bind(moduleId).all<BankQuestion>().then((r) => r.results));
    }
    return bankCache.get(moduleId)!;
  };
  /** Everything this learner has already been asked on the item, in the course and in recall, oldest first. */
  const historyOf = async (item: Item) => {
    const [course, recall] = await Promise.all([
      env.DB.prepare(
        `SELECT q.id, q.kind, q.prompt, q.options, q.correct_index, q.reference, q.concept, q.figure, q.figure_alt, q.bank_id, q.source_url, a.verdict, a.created_at AS asked_at
         FROM questions q JOIN answers a ON a.question_id = q.id WHERE q.module_id = ?`,
      ).bind(item.module_id).all<History>(),
      env.DB.prepare(
        `SELECT r.id, r.kind, r.prompt, r.options, r.correct_index, r.reference, r.concept, r.figure, r.figure_alt, r.bank_id, r.source_url, t.verdict, t.created_at AS asked_at
         FROM recall_questions r JOIN recall_attempts t ON t.question_id = r.id WHERE r.item_id = ?`,
      ).bind(item.id).all<History>(),
    ]);
    return [...course.results.filter((q) => concept(q.concept) === item.concept), ...recall.results].sort((a, b) => a.asked_at - b.asked_at);
  };

  let shortsLeft = learner.short_answers ? Math.round(size / 5) : 0;
  const used = new Set<string>();
  const drafts: Draft[] = [];
  const keyed = (kind: "mcq" | "short", options: string | null, correctIndex: number | null) => {
    if (kind !== "mcq" || !options || correctIndex === null) return { options: null, correct_index: null };
    // Placed again, so a question that comes back doesn't keep its answer in the same spot.
    const placed = placeOptions(JSON.parse(options) as string[], correctIndex);
    return { options: JSON.stringify(placed.options), correct_index: placed.correctIndex };
  };

  for (const item of queue) {
    if (drafts.length >= room) break;
    // Every fourth question is a short answer when the learner allows them, since writing an answer tests recall harder.
    const wantShort = shortsLeft > 0 && drafts.length % 4 === 3;
    const kinds: ("mcq" | "short")[] = wantShort ? ["short", "mcq"] : shortsLeft > 0 ? ["mcq", "short"] : ["mcq"];
    const missed = item.last_verdict !== null && item.last_verdict !== "correct";
    const history = await historyOf(item);
    const unseen = item.catalog_module_id
      ? (await bankOf(item.catalog_module_id)).filter((q) => concept(q.concept) === item.concept && !seen.has(q.id) && !used.has(q.id))
      : [];
    const missedIds = history.filter((q) => q.verdict !== "correct" && q.bank_id).map((q) => q.bank_id!);
    const closeness = unseen.length > 1 && missedIds.length ? await storedCloseness(env, unseen.map((q) => q.id), missedIds) : new Map<string, number>();
    const near = (q: BankQuestion) => Math.round((closeness.get(q.id) ?? 0) * 20);

    let draft: Draft | null = null;
    for (const kind of kinds) {
      // Reviewed before generated, then closest to what they missed, then easiest.
      const bank = unseen.filter((q) => q.kind === kind && (kind === "short" || (q.options && q.correct_index !== null)))
        .sort((a, b) => Number(a.source === "generated") - Number(b.source === "generated") || near(b) - near(a) || a.difficulty - b.difficulty || a.position - b.position)[0];
      if (!bank) continue;
      used.add(bank.id);
      draft = {
        course_id: item.course_id, item_id: item.id, course_question_id: null, bank_id: bank.id, origin: "bank", kind,
        prompt: bank.prompt, ...keyed(kind, bank.options, bank.correct_index), reference: bank.reference, concept: item.concept,
        why: missed ? "You missed this last time, so here it is from another angle." : null,
        figure: bank.figure, figure_alt: bank.figure_alt, source_url: bank.source_url,
      };
      break;
    }
    if (!draft) {
      for (const kind of kinds.includes("short") ? (["mcq", "short"] as const) : (["mcq"] as const)) {
        const again = history.find((q) => q.kind === kind && q.reference && (kind === "short" || (q.options && q.correct_index !== null)));
        if (!again) continue;
        draft = {
          course_id: item.course_id, item_id: item.id, course_question_id: null, bank_id: again.bank_id, origin: "repeat", kind,
          prompt: again.prompt, ...keyed(kind, again.options, again.correct_index), reference: again.reference, concept: item.concept,
          why: missed ? "You missed this last time, so here it is again." : null,
          figure: again.figure, figure_alt: again.figure_alt, source_url: again.source_url,
        };
        break;
      }
    }
    if (!draft) continue; // nothing to ask on this subtopic
    if (draft.kind === "short") shortsLeft--;
    drafts.push(draft);
  }
  if (!drafts.length) return [];

  for (const q of fresh) {
    drafts.push({
      course_id: q.course_id, item_id: null, course_question_id: q.id, bank_id: null, origin: "course", kind: q.kind,
      prompt: q.prompt, options: q.options, correct_index: null, reference: null, concept: concept(q.concept), why: q.why,
      figure: q.figure, figure_alt: q.figure_alt, source_url: null,
    });
  }
  return shuffled(drafts);
}

const loadSet = async (env: Env, key: string, day: string) =>
  (await env.DB.prepare(
    "SELECT r.*, i.last_reviewed_at FROM recall_questions r LEFT JOIN recall_items i ON i.id = r.item_id WHERE r.owner = ? AND r.day = ? ORDER BY r.position",
  ).bind(key, day).all<SetRow>()).results;

/** Add questions to the day's set. If another request added the same positions first, this one's batch fails and theirs stands. */
async function addToSet(env: Env, key: string, day: string, start: number, drafts: Draft[], now: number) {
  if (!drafts.length) return;
  try {
    await env.DB.batch(drafts.map((d, i) => env.DB.prepare(
      `INSERT INTO recall_questions (id, owner, course_id, item_id, course_question_id, bank_id, origin, kind, prompt, options, correct_index, reference, concept, why, figure, figure_alt, source_url, status, day, position, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'set', ?, ?, ?)`,
    ).bind(crypto.randomUUID(), key, d.course_id, d.item_id, d.course_question_id, d.bank_id, d.origin, d.kind, d.prompt, d.options, d.correct_index, d.reference, d.concept, d.why, d.figure, d.figure_alt, d.source_url, day, start + i, now)));
  } catch (error) {
    console.log(JSON.stringify({ message: "the day's recall set was already being built", error: String(error) }));
  }
}

/** Today's set, built on first use. A course question answered on the course screen closes its entry here. */
async function daySet(env: Env, learner: Learner, owner: string | null, day: string, now: number) {
  let rows = await loadSet(env, learner.owner, day);
  if (!rows.length) {
    await seedItems(env, owner, learner.owner, now);
    await addToSet(env, learner.owner, day, 0, await pick(env, learner, owner, day, now, learner.daily_goal, []), now);
    rows = await loadSet(env, learner.owner, day);
  }
  const open = rows.filter((r) => r.origin === "course" && r.status === "set");
  if (open.length) {
    const { results } = await env.DB.prepare(`SELECT question_id FROM answers WHERE question_id IN (${open.map(() => "?").join(", ")})`)
      .bind(...open.map((r) => r.course_question_id)).all<{ question_id: string }>();
    const answered = new Set(results.map((r) => r.question_id));
    const closed = open.filter((r) => answered.has(r.course_question_id!));
    if (closed.length) {
      await env.DB.batch(closed.map((r) => env.DB.prepare("UPDATE recall_questions SET status = 'answered' WHERE id = ?").bind(r.id)));
      for (const row of closed) row.status = "answered";
      await countDay(env, learner, day);
    }
  }
  return rows;
}

/* What the clients see */

type CourseCard = Awaited<ReturnType<typeof listCourses>>[number];

/** The recall part of Today. Never includes an answer key. */
async function recallView(env: Env, learner: Learner, rows: SetRow[], courses: CourseCard[], skipped: boolean, now: number) {
  const day = rows[0]?.day;
  const courseIds = rows.filter((r) => r.course_question_id).map((r) => r.course_question_id!);
  const [attempts, courseAnswers, unused] = await Promise.all([
    day
      ? env.DB.prepare("SELECT t.question_id, t.verdict, t.concept, t.due_in_days FROM recall_attempts t JOIN recall_questions r ON r.id = t.question_id WHERE r.owner = ? AND r.day = ?")
        .bind(learner.owner, day).all<{ question_id: string; verdict: Answer["verdict"]; concept: string; due_in_days: number | null }>().then((r) => r.results)
      : [],
    courseIds.length
      ? env.DB.prepare(`SELECT question_id, verdict FROM answers WHERE question_id IN (${courseIds.map(() => "?").join(", ")})`)
        .bind(...courseIds).all<{ question_id: string; verdict: Answer["verdict"] }>().then((r) => r.results)
      : [],
    day
      ? env.DB.prepare("SELECT COUNT(*) AS n FROM recall_items i WHERE i.owner = ? AND NOT EXISTS (SELECT 1 FROM recall_questions r WHERE r.item_id = i.id AND r.day = ?)")
        .bind(learner.owner, day).first<{ n: number }>()
      : null,
  ]);
  const verdicts = new Map<string, Answer["verdict"]>([
    ...attempts.map((a) => [a.question_id, a.verdict] as const),
    ...rows.flatMap((r) => {
      const answer = courseAnswers.find((a) => a.question_id === r.course_question_id);
      return answer ? [[r.id, answer.verdict] as const] : [];
    }),
  ]);
  const next = rows.find((r) => r.status === "set") ?? null;
  const byCourse = new Map(courses.map((c) => [c.id, c]));
  const answered = rows.filter((r) => r.status === "answered").length;
  const correct = [...verdicts.values()].filter((v) => v === "correct").length;
  const left = rows.filter((r) => r.status === "set").length;
  const status = !rows.length ? "empty" : !next ? "done" : skipped ? "skipped" : "ready";
  const seenConcepts = new Set<string>();
  // The words under the heading are written here, so the web app and both phone apps say the same thing.
  const lead = {
    empty: "When you pass a module, its ideas come back here a few days later as new questions.",
    skipped: "Recall is skipped for today.",
    done: answered ? `Recall done, ${correct} of ${answered} right.` : "Recall done for today.",
    ready: left < rows.length
      ? `${left} of ${rows.length} left.`
      : `${plural(rows.length, "question")} from your courses. About ${plural(Math.max(1, Math.round(rows.length * 0.4)), "minute")}.`,
  }[status];
  const seen = (days: number | null) => (days === null ? "" : days === 0 ? " · last seen today" : days === 1 ? " · last seen yesterday" : ` · last seen ${days} days ago`);
  const lastSeen = next?.last_reviewed_at == null ? null : Math.max(0, Math.floor((now - next.last_reviewed_at) / DAY_MS));
  return {
    status,
    lead,
    total: rows.length,
    answered,
    correct,
    /** One entry per question, in order: its verdict, "skipped", or "open". */
    marks: rows.map((r) => (r.status === "skipped" ? "skipped" : r.status === "answered" ? (verdicts.get(r.id) ?? "correct") : "open")),
    more_available: Boolean(unused?.n),
    question: next
      ? {
          id: next.id, kind: next.kind, prompt: next.prompt, options: next.options ? (JSON.parse(next.options) as string[]) : null,
          concept: sentence(next.concept), why: next.why, figure: next.figure, figure_alt: next.figure_alt,
          new: next.origin === "course", number: next.position + 1, last_seen_days: lastSeen,
          // "Taints and tolerations · last seen 9 days ago", under the course's name.
          detail: next.origin === "course" ? `${sentence(next.concept)} · new in your course` : `${sentence(next.concept)}${seen(lastSeen)}`,
          course: byCourse.get(next.course_id) ?? null,
        }
      : null,
    // The soonest three, so the finished screen can say what comes back when.
    coming_back: attempts.filter((a) => a.due_in_days !== null).sort((a, b) => a.due_in_days! - b.due_in_days!)
      .filter((a) => !seenConcepts.has(a.concept) && seenConcepts.add(a.concept)).slice(0, 3)
      .map((a) => ({ concept: sentence(a.concept), when: when(a.due_in_days!) })),
  };
}

/** The course to carry on with: the one answered in most recently that isn't finished. */
async function continueCard(env: Env, owner: string | null, courses: CourseCard[]) {
  const open = courses.filter((c) => c.status !== "complete");
  if (!open.length) return null;
  const { results } = await env.DB.prepare(
    "SELECT c.id, (SELECT MAX(a.created_at) FROM answers a WHERE a.course_id = c.id) AS last FROM courses c WHERE c.owner IS ? AND c.status != 'complete'",
  ).bind(owner).all<{ id: string; last: number | null }>();
  const last = new Map(results.map((r) => [r.id, r.last]));
  const course = [...open].sort((a, b) => (last.get(b.id) ?? b.created_at) - (last.get(a.id) ?? a.created_at))[0]!;
  const module = await env.DB.prepare(
    `SELECT m.position, m.title,
       (SELECT COUNT(*) FROM questions q WHERE q.module_id = m.id AND NOT EXISTS (SELECT 1 FROM answers a WHERE a.question_id = q.id)) AS waiting
     FROM modules m WHERE m.course_id = ? AND m.status = 'active'`,
  ).bind(course.id).first<{ position: number; title: string; waiting: number }>();
  const total = course.modules;
  const place = module ? `Module ${module.position + 1} of ${total}` : "";
  return {
    course,
    waiting: module?.waiting ?? 0,
    last_module: Boolean(module && module.position === total - 1),
    detail: !module ? "Being planned" : module.waiting ? `${place} · ${plural(module.waiting, "question")} waiting` : `${place} · the next questions are on their way`,
  };
}

/**
 * The library course to take next, when the learner is on a course's last module or has nothing in progress:
 * one the course they are finishing leads to, else the closest in meaning, else the next in its topic.
 */
async function upNext(env: Env, courses: CourseCard[], current: Awaited<ReturnType<typeof continueCard>>) {
  if (current && !current.last_module) return null;
  const source = current?.course ?? courses.find((c) => c.status === "complete");
  if (!source) return null;
  const started = new Set(courses.map((c) => c.catalog_id).filter(Boolean));
  const title = source.title ?? source.prompt;
  const card = async (ids: string[], reason: string, detail: string) => {
    const id = ids.find((x) => !started.has(x));
    const found = id ? (await catalogCards(env, [id]))[0] : undefined;
    return found ? { course: found, reason, detail } : null;
  };
  try {
    if (source.catalog_id) {
      const { results } = await env.DB.prepare(
        "SELECT p.course_id AS id FROM course_prerequisites p JOIN catalog_courses c ON c.id = p.course_id WHERE p.requires_id = ? AND c.visibility = 'public' ORDER BY c.position",
      ).bind(source.catalog_id).all<{ id: string }>();
      const leads = await card(results.map((r) => r.id), "leads_to", `Builds on ${title}`);
      if (leads) return leads;
    }
    const bank = source.catalog_id ?? privateBankId(source.id);
    const similar = await card((await nearestCourses(env, bank, 6)).map((n) => n.id), "similar", `Close to ${title}`);
    if (similar) return similar;
    const { results } = await env.DB.prepare(
      `SELECT c.id FROM course_embeddings e JOIN catalog_courses c ON c.id = e.course_id
       WHERE c.visibility = 'public' AND e.topic_id = (SELECT topic_id FROM course_embeddings WHERE course_id = ?) AND c.id != ?
       ORDER BY CASE c.level WHEN 'intro' THEN 0 WHEN 'intermediate' THEN 1 ELSE 2 END, c.position`,
    ).bind(bank, bank).all<{ id: string }>();
    return await card(results.map((r) => r.id), "topic", "Next in the same topic");
  } catch (error) {
    // Up next is a suggestion. Today still loads without it.
    console.error(JSON.stringify({ message: "up next failed", error: String(error) }));
    return null;
  }
}

/** Three intro courses from different tracks, for a learner with no courses yet. */
async function starterPicks(env: Env) {
  const { results } = await env.DB.prepare(
    "SELECT id, track FROM catalog_courses WHERE visibility = 'public' ORDER BY CASE level WHEN 'intro' THEN 0 WHEN 'intermediate' THEN 1 ELSE 2 END, position, track LIMIT 40",
  ).all<{ id: string; track: string }>();
  const tracks = new Set<string>();
  const ids = results.filter((r) => !tracks.has(r.track) && tracks.add(r.track)).slice(0, 3).map((r) => r.id);
  return ids.length ? catalogCards(env, ids) : [];
}

/** The streak and the recall part of Today: what every recall action returns. */
async function state(env: Env, learner: Learner, owner: string | null, now: number, courses?: CourseCard[]) {
  const day = await currentDay(env, learner, now);
  const rows = await daySet(env, learner, owner, day, now);
  const streak = await streakView(env, learner, now);
  return { streak, recall: await recallView(env, learner, rows, courses ?? (await listCourses(env, owner)), streak.recall_skipped, now) };
}

/** Everything the Today screen needs, in one call. */
export async function today(env: Env, owner: string | null, zone?: string | null, now = Date.now()) {
  const learner = await getLearner(env, owner, zone, now);
  const courses = await listCourses(env, owner);
  const { streak, recall } = await state(env, learner, owner, now, courses);
  const current = await continueCard(env, owner, courses);
  return {
    day: streak.day,
    streak,
    recall,
    continue: current,
    up_next: await upNext(env, courses, current),
    picks: courses.length ? [] : await starterPicks(env),
  };
}

/* Actions */

async function findRow(env: Env, key: string, id: string) {
  const row = await env.DB.prepare("SELECT r.*, i.last_reviewed_at FROM recall_questions r LEFT JOIN recall_items i ON i.id = r.item_id WHERE r.id = ? AND r.owner = ?")
    .bind(id, key).first<SetRow>();
  if (!row) throw new AnswerError("That question doesn't exist.", 404);
  return row;
}

const revealAttempt = (row: SetRow, attempt: Attempt) => ({
  question_id: row.id, response: attempt.response, verdict: attempt.verdict, score: attempt.score, confidence: attempt.confidence,
  error_type: attempt.error_type, feedback: attempt.feedback, correct_index: row.correct_index, reference: row.reference, source_url: row.source_url,
});

/**
 * Grade one recall question, move its subtopic's schedule, and count the answer toward the day.
 * Returns the verdict, when the subtopic comes back, and the state of the set with the next question.
 * `advance` names a course whose round this answer finished, so the caller can start the agent on it.
 */
export async function answerRecall(env: Env, owner: string | null, id: string, rawResponse: string, zone?: string | null, now = Date.now()) {
  const learner = await getLearner(env, owner, zone, now);
  const row = await findRow(env, learner.owner, id);

  if (row.origin === "course") {
    // A question from a course in progress: the course grades it, exactly as on its own screen.
    const result = await answerQuestion(env, row.course_question_id!, rawResponse, owner, zone);
    await env.DB.prepare("UPDATE recall_questions SET status = 'answered' WHERE id = ?").bind(row.id).run();
    await countDay(env, learner, await currentDay(env, learner, now));
    const waiting = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM questions q JOIN modules m ON m.id = q.module_id AND m.status = 'active'
       WHERE q.course_id = ? AND NOT EXISTS (SELECT 1 FROM answers a WHERE a.question_id = q.id)`,
    ).bind(row.course_id).first<{ n: number }>();
    return { result: { ...result, question_id: row.id }, schedule: null, advance: waiting?.n ? null : row.course_id, ...(await state(env, learner, owner, now)) };
  }

  const findAttempt = () => env.DB.prepare("SELECT * FROM recall_attempts WHERE question_id = ?").bind(row.id).first<Attempt>();
  let attempt = await findAttempt();
  if (!attempt) {
    const options: string[] | null = row.options ? JSON.parse(row.options) : null;
    const response = rawResponse.trim();
    let chosen: string;
    let graded: { verdict: Answer["verdict"]; confidence: number | null; errorType: string | null; feedback: string };
    if (options) {
      const index = Number(response);
      if (!response || !Number.isInteger(index) || index < 0 || index >= options.length) throw new AnswerError("Pick one of the options.", 400);
      chosen = options[index]!;
      graded = { verdict: index === row.correct_index ? "correct" : "incorrect", confidence: null, errorType: null, feedback: row.reference ?? "" };
    } else {
      if (!response) throw new AnswerError("Write an answer first.", 400);
      if (response.length > 4000) throw new AnswerError("Keep your answer under 4000 characters.", 400);
      chosen = response;
      const course = await env.DB.prepare("SELECT prompt FROM courses WHERE id = ?").bind(row.course_id).first<{ prompt: string }>();
      graded = await gradeShort(env, course?.prompt ?? "", { concept: row.concept, prompt: row.prompt, reference: row.reference ?? "" }, chosen);
    }

    const item = await env.DB.prepare("SELECT * FROM recall_items WHERE id = ?").bind(row.item_id).first<Item>();
    if (!item) throw new AnswerError("That question doesn't exist.", 404);
    const elapsed = item.last_reviewed_at === null ? 0 : Math.max(0, (now - item.last_reviewed_at) / DAY_MS);
    const memory = review(item, GRADE[graded.verdict], elapsed);
    const days = intervalDays(memory.stability);
    const day = await currentDay(env, learner, now);
    const attemptId = crypto.randomUUID();
    // One transaction. If another request answered first, this attempt isn't stored, and then nothing else here applies.
    const mine = "EXISTS (SELECT 1 FROM recall_attempts WHERE id = ?)";
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO recall_attempts (id, owner, question_id, item_id, course_id, concept, day, response, verdict, score, confidence, error_type, feedback, days_since_last, stability_before, stability_after, due_in_days, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (question_id) DO NOTHING`,
      ).bind(attemptId, learner.owner, row.id, item.id, row.course_id, row.concept, day, chosen, graded.verdict, SCORE[graded.verdict], graded.confidence, graded.errorType, graded.feedback, elapsed, item.stability, memory.stability, days, now),
      env.DB.prepare(`UPDATE recall_questions SET status = 'answered' WHERE id = ? AND ${mine}`).bind(row.id, attemptId),
      env.DB.prepare(
        `UPDATE recall_items SET stability = ?, difficulty = ?, due_at = ?, last_reviewed_at = ?, last_verdict = ?, reviews = reviews + 1, lapses = lapses + ? WHERE id = ? AND ${mine}`,
      ).bind(memory.stability, memory.difficulty, now + days * DAY_MS, now, graded.verdict, graded.verdict === "incorrect" ? 1 : 0, item.id, attemptId),
    ]);
    attempt = (await findAttempt())!;
    if (attempt.id === attemptId) await recordAnswer(env, owner, "recall", zone, now);
  }
  const days = attempt.due_in_days ?? 1;
  return {
    result: revealAttempt(row, attempt),
    schedule: { days, label: `${sentence(row.concept)} comes back ${when(days)}.` },
    advance: null,
    ...(await state(env, learner, owner, now)),
  };
}

/** Skip one question. Its subtopic stays due and no attempt is stored. */
export async function skipRecall(env: Env, owner: string | null, id: string, zone?: string | null, now = Date.now()) {
  const learner = await getLearner(env, owner, zone, now);
  const row = await findRow(env, learner.owner, id);
  await env.DB.prepare("UPDATE recall_questions SET status = 'skipped' WHERE id = ? AND status = 'set'").bind(row.id).run();
  await countDay(env, learner, row.day);
  return state(env, learner, owner, now);
}

/** "5 more questions": add to today's set by the same rules. */
export async function moreRecall(env: Env, owner: string | null, zone?: string | null, now = Date.now()) {
  const learner = await getLearner(env, owner, zone, now);
  const day = await currentDay(env, learner, now);
  const rows = await daySet(env, learner, owner, day, now);
  if (rows.length) {
    const start = Math.max(...rows.map((r) => r.position)) + 1;
    await addToSet(env, learner.owner, day, start, await pick(env, learner, owner, day, now, MORE, rows), now);
    await setRecallSkipped(env, learner, day, false);
  }
  return state(env, learner, owner, now);
}

/** "Skip for today" hides recall for the day. `skipped: false` brings it back. */
export async function skipRecallDay(env: Env, owner: string | null, skipped: boolean, zone?: string | null, now = Date.now()) {
  const learner = await getLearner(env, owner, zone, now);
  await setRecallSkipped(env, learner, await currentDay(env, learner, now), skipped);
  return state(env, learner, owner, now);
}
