import assert from "node:assert/strict";
import { test } from "node:test";
import { advanceWaiting, answerQuestion, deleteCourse, learnerStats } from "../src/agent";
import { getLearner, saveSettings } from "../src/days";
import { answerRecall, moreRecall, skipRecall, skipRecallDay, today } from "../src/recall";
import { DAY, ZONE, addBank, addCourse, makeEnv, one, rows, usualLearner } from "./world";

type Row = { id: string; item_id: string | null; course_question_id: string | null; bank_id: string | null; origin: string; kind: string; concept: string; correct_index: number | null; status: string; why: string | null; position: number };
const setRows = (env: Env) => rows<Row>(env, "SELECT * FROM recall_questions ORDER BY position");
const rowFor = async (env: Env, concept: string) => (await setRows(env)).find((r) => r.concept === concept && r.item_id)!;
const item = (env: Env, concept: string) => one<{ id: string; due_at: number; reviews: number; lapses: number; stability: number; last_verdict: string }>(env, "SELECT * FROM recall_items WHERE concept = ?", concept);

/** A finished course with `count` subtopics, each answered right, each with one unseen multiple-choice and one unseen short question. */
async function wideLearner(env: Env, count: number, answeredAt: number) {
  const names = Array.from({ length: count }, (_, i) => `idea ${i}`);
  const bank = await addBank(env, "wide", 0, names.flatMap((concept, i) => [
    { id: `w-core-${i}`, concept, tier: "core" as const },
    { id: `w-more-${i}`, concept },
    { id: `w-short-${i}`, concept, kind: "short" as const },
  ]));
  await addCourse(env, "wide-course", null, "wide", [{ status: "passed", catalogModule: bank, concepts: names, questions: names.map((concept, i) => ({ id: `wq-${i}`, concept, bank: `w-core-${i}`, verdict: "correct" as const })) }], answeredAt);
}

test("the set is built once per day, from the bank and the course in progress", async () => {
  const env = makeEnv();
  const now = Date.now();
  await usualLearner(env, now - 10 * DAY);
  const first = await today(env, null, ZONE, now);
  assert.equal(first.recall.status, "ready");
  assert.equal(first.recall.total, 5); // two subtopics to recall and three new questions
  assert.deepEqual(first.recall.marks, ["open", "open", "open", "open", "open"]);
  const built = await setRows(env);
  assert.deepEqual(built.map((r) => r.origin).sort(), ["bank", "bank", "course", "course", "course"]);
  const again = await today(env, null, ZONE, now + 1000);
  assert.equal(again.recall.question?.id, first.recall.question?.id);
  assert.deepEqual((await setRows(env)).map((r) => r.id), built.map((r) => r.id));
});

test("an unseen reviewed bank question is picked before a generated one, aimed at a miss", async () => {
  const env = makeEnv();
  const now = Date.now();
  await usualLearner(env, now - 10 * DAY);
  await today(env, null, ZONE, now);
  const beta = await rowFor(env, "beta");
  assert.equal(beta.bank_id, "b-beta-1");
  assert.equal(beta.why, "You missed this last time, so here it is from another angle.");
  const alpha = await rowFor(env, "alpha");
  assert.equal(alpha.bank_id, "b-alpha-1");
  assert.equal(alpha.why, null);
});

test("the answer key never reaches the client before an answer", async () => {
  const env = makeEnv();
  const now = Date.now();
  await usualLearner(env, now - 10 * DAY);
  const body = JSON.stringify(await today(env, null, ZONE, now));
  assert.ok(!body.includes("correct_index"));
  assert.ok(!body.includes("Because "));
});

test("an answer reschedules the item, stores the attempt and counts toward the day", async () => {
  const env = makeEnv();
  const now = Date.now();
  await usualLearner(env, now - 10 * DAY);
  await today(env, null, ZONE, now);
  const beta = await rowFor(env, "beta");
  const before = (await item(env, "beta"))!;
  assert.ok(before.due_at < now); // missed in the course, so it was due the next day
  const answered = await answerRecall(env, null, beta.id, String(beta.correct_index), ZONE, now);
  assert.equal(answered.result.verdict, "correct");
  assert.equal(answered.result.correct_index, beta.correct_index);
  assert.match(answered.schedule!.label, /^You'll see beta again (tomorrow|in \d+ days)\.$/);
  const after = (await item(env, "beta"))!;
  assert.equal(after.reviews, 1);
  assert.equal(after.last_verdict, "correct");
  assert.ok(after.stability > before.stability);
  assert.equal(after.due_at, now + answered.schedule!.days * DAY);
  assert.equal(answered.recall.answered, 1);
  assert.ok(answered.recall.marks.includes("correct"));
  assert.equal(answered.streak.today.answered, 1);
  assert.deepEqual(await rows(env, "SELECT verdict, concept FROM recall_attempts"), [{ verdict: "correct", concept: "beta" }]);
});

test("a wrong answer is a lapse and comes back within days", async () => {
  const env = makeEnv();
  const now = Date.now();
  await usualLearner(env, now - 10 * DAY);
  await today(env, null, ZONE, now);
  const alpha = await rowFor(env, "alpha");
  const wrong = (alpha.correct_index! + 1) % 4;
  const answered = await answerRecall(env, null, alpha.id, String(wrong), ZONE, now);
  assert.equal(answered.result.verdict, "incorrect");
  assert.ok(answered.schedule!.days <= 3);
  assert.equal((await item(env, "alpha"))!.lapses, 1);
  await assert.rejects(() => answerRecall(env, null, (alpha.id + "x"), "0", ZONE, now), /doesn't exist/);
});

test("a second answer returns the first", async () => {
  const env = makeEnv();
  const now = Date.now();
  await usualLearner(env, now - 10 * DAY);
  await today(env, null, ZONE, now);
  const beta = await rowFor(env, "beta");
  await answerRecall(env, null, beta.id, String(beta.correct_index), ZONE, now);
  const second = await answerRecall(env, null, beta.id, String((beta.correct_index! + 1) % 4), ZONE, now + 5);
  assert.equal(second.result.verdict, "correct");
  assert.equal((await rows(env, "SELECT id FROM recall_attempts")).length, 1);
  assert.equal((await item(env, "beta"))!.reviews, 1);
  assert.equal((await one<{ n: number }>(env, "SELECT recall_answered AS n FROM learner_days"))!.n, 1);
});

test("another account can't answer or skip the question", async () => {
  const env = makeEnv();
  const now = Date.now();
  await usualLearner(env, now - 10 * DAY);
  await today(env, null, ZONE, now);
  const beta = await rowFor(env, "beta");
  await assert.rejects(() => answerRecall(env, "sam", beta.id, "0", ZONE, now), /doesn't exist/);
  await assert.rejects(() => skipRecall(env, "sam", beta.id, ZONE, now), /doesn't exist/);
});

test("a skip leaves the item due", async () => {
  const env = makeEnv();
  const now = Date.now();
  await usualLearner(env, now - 10 * DAY);
  await today(env, null, ZONE, now);
  const alpha = await rowFor(env, "alpha");
  const before = (await item(env, "alpha"))!;
  const state = await skipRecall(env, null, alpha.id, ZONE, now);
  assert.equal(state.recall.marks.filter((m) => m === "skipped").length, 1);
  assert.deepEqual(await item(env, "alpha"), before);
  assert.equal((await rows(env, "SELECT id FROM recall_attempts")).length, 0);
});

test("a skipped question can't be answered afterwards", async () => {
  const env = makeEnv();
  const now = Date.now();
  await usualLearner(env, now - 10 * DAY);
  await today(env, null, ZONE, now);
  const alpha = await rowFor(env, "alpha");
  const before = (await item(env, "alpha"))!;
  await skipRecall(env, null, alpha.id, ZONE, now);
  await assert.rejects(() => answerRecall(env, null, alpha.id, String(alpha.correct_index), ZONE, now + 5), /skipped that question/);
  assert.deepEqual(await item(env, "alpha"), before);
  assert.equal((await rows(env, "SELECT id FROM recall_attempts")).length, 0);
  assert.equal((await rowFor(env, "alpha")).status, "skipped");
  // The same holds for a question from the course in progress: it stays skipped here, and is still open in its course.
  const fresh = (await setRows(env)).find((r) => r.origin === "course")!;
  await skipRecall(env, null, fresh.id, ZONE, now);
  await assert.rejects(() => answerRecall(env, null, fresh.id, "0", ZONE, now + 5), /skipped that question/);
  assert.equal((await rows(env, "SELECT id FROM answers WHERE question_id = ?", fresh.course_question_id)).length, 0);
  // A skip after an answer changes nothing either.
  const beta = await rowFor(env, "beta");
  await answerRecall(env, null, beta.id, String(beta.correct_index), ZONE, now);
  await skipRecall(env, null, beta.id, ZONE, now + 5);
  assert.equal((await rowFor(env, "beta")).status, "answered");
});

test("a course answer closes its set entry, and the last one leaves the course for the cron", async (t) => {
  const env = makeEnv();
  const now = Date.now();
  await usualLearner(env, now - 10 * DAY);
  await today(env, null, ZONE, now);
  // Answered on the course screen.
  await answerQuestion(env, "q-gamma-1", "0", null, ZONE);
  const after = await today(env, null, ZONE, now + 1000);
  assert.equal(after.recall.answered, 1);
  assert.equal((await setRows(env)).find((r) => r.course_question_id === "q-gamma-1")?.status, "answered");
  // Answered from the recall set.
  const [second, third] = (await setRows(env)).filter((r) => r.origin === "course" && r.status === "set");
  const middle = await answerRecall(env, null, second!.id, "0", ZONE, now + 2000);
  assert.equal(middle.result.verdict, "correct");
  assert.equal(middle.schedule, null);
  assert.equal(await advanceWaiting(env), 0); // one question is still waiting
  const last = await answerRecall(env, null, third!.id, "1", ZONE, now + 3000);
  assert.equal(last.result.verdict, "incorrect");
  assert.ok(!("advance" in last));
  assert.equal((await rows(env, "SELECT id FROM answers WHERE question_id LIKE 'q-gamma-%'")).length, 3);
  assert.deepEqual(await one(env, "SELECT recall_answered, course_answered FROM learner_days"), { recall_answered: 0, course_answered: 3 });
  // The round is fully answered now, so the cron takes the course from here. No model is reachable in this test,
  // so its step fails, which is enough to show the course was picked up.
  t.mock.method(globalThis, "fetch", async () => { throw new Error("no network in tests"); });
  assert.equal(await advanceWaiting(env), 1);
});

test("a day counts at five answers across recall and the course", async () => {
  const env = makeEnv();
  const now = Date.now();
  await usualLearner(env, now - 10 * DAY);
  let state = (await today(env, null, ZONE, now)) as { recall: { question: { id: string } | null; status: string }; streak: { current: number; today: { counted: boolean } } };
  while (state.recall.question) state = await answerRecall(env, null, state.recall.question.id, "0", ZONE, now);
  assert.equal(state.recall.status, "done");
  assert.equal(state.streak.today.counted, true);
  assert.equal(state.streak.current, 1);
});

test("a short set counts when finished", async () => {
  const env = makeEnv();
  const now = Date.now();
  await wideLearner(env, 2, now - 10 * DAY);
  let state = (await today(env, null, ZONE, now)) as Awaited<ReturnType<typeof answerRecall>> | Awaited<ReturnType<typeof today>>;
  assert.equal(state.recall.total, 2);
  state = await answerRecall(env, null, state.recall.question!.id, "0", ZONE, now);
  assert.equal(state.streak.today.counted, false);
  state = await answerRecall(env, null, state.recall.question!.id, "0", ZONE, now);
  assert.equal(state.recall.status, "done");
  assert.equal(state.streak.today.counted, true);
  assert.equal(state.recall.coming_back.length, 2);
});

test("when the bank has run out, the question answered longest ago comes back", async () => {
  const env = makeEnv();
  const now = Date.now();
  const bank = await addBank(env, "thin", 0, [{ id: "t-core", concept: "delta", tier: "core" }]);
  await addCourse(env, "thin-course", null, "thin", [{ status: "passed", catalogModule: bank, concepts: ["delta"], questions: [{ id: "tq", concept: "delta", bank: "t-core", verdict: "incorrect" }] }], now - 5 * DAY);
  await today(env, null, ZONE, now);
  const [row] = await setRows(env);
  assert.equal(row?.origin, "repeat");
  assert.equal(row?.bank_id, "t-core");
  assert.equal(row?.why, "You missed this last time, so here it is again.");
});

test("a set holds at most four from one course until the others run out, and five more never repeats an item", async () => {
  const env = makeEnv();
  const now = Date.now();
  await wideLearner(env, 8, now - 30 * DAY);
  await saveSettings(env, await getLearner(env, null, ZONE), { daily_goal: 5 });
  const first = await today(env, null, ZONE, now);
  assert.equal(first.recall.total, 5); // four, then one more because there is no other course to draw from
  assert.equal(first.recall.more_available, true);
  const more = await moreRecall(env, null, ZONE, now);
  assert.equal(more.recall.total, 8);
  assert.equal(more.recall.more_available, false);
  const all = await setRows(env);
  assert.equal(new Set(all.map((r) => r.item_id)).size, 8);
  assert.deepEqual(all.map((r) => r.position), [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.equal((await moreRecall(env, null, ZONE, now)).recall.total, 8);
});

test("short answers appear only when the learner allows them, and only a few", async () => {
  const on = makeEnv();
  const now = Date.now();
  await wideLearner(on, 10, now - 30 * DAY);
  await today(on, null, ZONE, now);
  assert.equal((await setRows(on)).filter((r) => r.kind === "short").length, 2);

  const off = makeEnv();
  await wideLearner(off, 10, now - 30 * DAY);
  await saveSettings(off, await getLearner(off, null, ZONE), { short_answers: false });
  await today(off, null, ZONE, now);
  assert.equal((await setRows(off)).filter((r) => r.kind === "short").length, 0);
  assert.equal((await setRows(off)).length, 10);
});

test("skip for today hides recall, and it can be brought back", async () => {
  const env = makeEnv();
  const now = Date.now();
  await usualLearner(env, now - 10 * DAY);
  await today(env, null, ZONE, now);
  assert.equal((await skipRecallDay(env, null, true, ZONE, now)).recall.status, "skipped");
  assert.equal((await today(env, null, ZONE, now)).recall.status, "skipped");
  assert.equal((await skipRecallDay(env, null, false, ZONE, now)).recall.status, "ready");
});

test("a learner with nothing passed has no recall, and a course to continue", async () => {
  const env = makeEnv();
  const now = Date.now();
  await addCourse(env, "new-course", null, null, [{ status: "active", catalogModule: null, concepts: ["one"], questions: [{ id: "n1", concept: "one", verdict: null }, { id: "n2", concept: "one", verdict: null }] }], now);
  const view = await today(env, null, ZONE, now);
  assert.equal(view.recall.status, "empty");
  assert.equal(view.recall.question, null);
  assert.equal(view.continue?.course.id, "new-course");
  assert.equal(view.continue?.detail, "Module 1 of 1 · 2 questions waiting");
  assert.equal((await setRows(env)).length, 0);
});

test("a learner with no courses gets library picks", async () => {
  const env = makeEnv();
  await addBank(env, "pick-a", 0, [{ id: "pa", concept: "x" }]);
  const view = await today(env, null, ZONE);
  assert.equal(view.continue, null);
  assert.equal(view.up_next, null);
  assert.deepEqual(view.picks.map((c) => c.id), ["pick-a"]);
});

test("up next is the course the one being finished leads to, once it is on its last module", async () => {
  const env = makeEnv();
  const now = Date.now();
  await usualLearner(env, now - 10 * DAY);
  await addBank(env, "lib-next", 0, [{ id: "ln", concept: "x" }]);
  await env.DB.prepare("INSERT INTO course_prerequisites (course_id, requires_id, created_at) VALUES ('lib-next', 'lib', 1)").run();
  const view = await today(env, null, ZONE, now);
  assert.equal(view.continue?.last_module, true);
  assert.equal(view.up_next?.course.id, "lib-next");
  assert.equal(view.up_next?.reason, "leads_to");
  assert.equal(view.up_next?.detail, "Builds on Course c1");
  // Not offered once the learner has started it.
  await addCourse(env, "c2", null, "lib-next", [{ status: "active", catalogModule: null, concepts: ["x"], questions: [] }], now - 20 * DAY);
  assert.equal((await today(env, null, ZONE, now + 1000)).up_next, null);
});

test("deleting a course removes its recall and keeps the days", async () => {
  const env = makeEnv();
  const now = Date.now();
  await usualLearner(env, now - 10 * DAY);
  await today(env, null, ZONE, now);
  const beta = await rowFor(env, "beta");
  await answerRecall(env, null, beta.id, "0", ZONE, now);
  await deleteCourse(env, "c1", null);
  for (const table of ["recall_items", "recall_questions", "recall_attempts"]) assert.equal((await rows(env, `SELECT 1 FROM ${table}`)).length, 0, table);
  assert.equal((await rows(env, "SELECT 1 FROM learner_days WHERE recall_answered = 1")).length, 1);
  assert.equal((await today(env, null, ZONE, now)).recall.status, "empty");
});

test("stats count recall answers on the learner's own day", async () => {
  const env = makeEnv();
  const now = Date.now();
  await usualLearner(env, now - 10 * DAY);
  await today(env, null, ZONE, now);
  const beta = await rowFor(env, "beta");
  await answerRecall(env, null, beta.id, String(beta.correct_index), ZONE, now);
  const stats = await learnerStats(env, null, ZONE);
  assert.equal(stats.totals.answered, 3); // two in the course, one in recall
  assert.equal(stats.totals.recall_answered, 1);
  assert.equal(stats.days.length, 30);
  assert.equal(stats.days.at(-1)?.date, stats.streak.day);
  assert.equal(stats.days.at(-1)?.answered, 1);
  assert.equal(stats.streak.calendar.length, 28);
});

test("the cron advances only courses whose round is fully answered, and leaves a failed one alone", async (t) => {
  const env = makeEnv();
  const now = Date.now();
  await usualLearner(env, now - 10 * DAY);
  assert.equal(await advanceWaiting(env), 0); // three questions are still waiting
  for (const id of ["q-gamma-1", "q-gamma-2", "q-gamma-3"]) await answerQuestion(env, id, "0", null, ZONE);
  // Every subtopic cleared the bar, so the agent passes the module without asking a model.
  assert.equal(await advanceWaiting(env), 1);
  assert.equal((await one<{ status: string }>(env, "SELECT status FROM courses WHERE id = 'c1'"))!.status, "complete");
  assert.equal(await advanceWaiting(env), 0);
  // The module that just passed joins recall the next time Today is read.
  await today(env, null, ZONE, now);
  assert.equal((await rows(env, "SELECT 1 FROM recall_items WHERE concept = 'gamma'")).length, 1);

  // A course that needs a model, with none reachable: the step fails once and is then left for the learner.
  t.mock.method(globalThis, "fetch", async () => { throw new Error("no network in tests"); });
  await addCourse(env, "c3", null, null, [{ status: "active", catalogModule: null, concepts: ["one"], questions: [{ id: "w1", concept: "one", verdict: "incorrect" }, { id: "w2", concept: "one", verdict: "incorrect" }] }], now);
  assert.equal(await advanceWaiting(env), 1);
  assert.ok((await one<{ last_error: string | null }>(env, "SELECT last_error FROM courses WHERE id = 'c3'"))!.last_error);
  assert.equal(await advanceWaiting(env), 0);
});
