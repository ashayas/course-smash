// Choosing which courses feed daily recall, and "Recall this course" sessions.
import assert from "node:assert/strict";
import { test } from "node:test";
import { AnswerError, listCourses } from "../src/agent";
import { getLearner, saveSettings } from "../src/days";
import {
  answerRecall, checkRecallCourses, courseRecall, moreRecall, recallCourses, setRecallCourses, skipRecall, startCourseRecall, today, yourCatalogCourse,
} from "../src/recall";
import { DAY, ZONE, addBank, addCourse, makeEnv, one, rows, usualLearner } from "./world";

type Row = { id: string; course_id: string; item_id: string | null; origin: string; status: string; session_id: string | null; correct_index: number | null; concept: string };
const setRows = (env: Env) => rows<Row>(env, "SELECT * FROM recall_questions WHERE session_id IS NULL ORDER BY position");
const sessionRows = (env: Env, session: string) => rows<Row>(env, "SELECT * FROM recall_questions WHERE session_id = ? ORDER BY position", session);

/** A second, finished course with `count` subtopics, each answered right, each with unseen bank questions. */
async function wideCourse(env: Env, count: number, answeredAt: number, owner: string | null = null) {
  const names = Array.from({ length: count }, (_, i) => `idea ${i}`);
  const bank = await addBank(env, "wide", 0, names.flatMap((concept, i) => [
    { id: `w-core-${i}`, concept, tier: "core" as const },
    { id: `w-more-${i}`, concept },
    { id: `w-again-${i}`, concept },
  ]));
  await addCourse(env, "wide-course", owner, "wide", [{ status: "passed", catalogModule: bank, concepts: names, questions: names.map((concept, i) => ({ id: `wq-${i}`, concept, bank: `w-core-${i}`, verdict: "correct" as const })) }], answeredAt);
}

/** A course that has only just started: nothing passed. */
async function newCourse(env: Env, answeredAt: number) {
  await addCourse(env, "fresh", null, null, [{ status: "active", catalogModule: null, concepts: ["delta"], questions: [{ id: "q-delta", concept: "delta" }] }], answeredAt);
}

async function rejects(promise: Promise<unknown>, status: number, message?: RegExp) {
  await assert.rejects(promise, (error) => error instanceof AnswerError && error.status === status && (!message || message.test(error.message)));
}

test("every course starts in daily recall, and settings list them", async () => {
  const env = makeEnv();
  const now = Date.now();
  await usualLearner(env, now - 10 * DAY);
  await newCourse(env, now - 10 * DAY);
  assert.ok((await listCourses(env, null)).every((c) => c.in_recall === true));
  const listed = await recallCourses(env, null, ZONE, now);
  assert.deepEqual(listed.map((c) => [c.id, c.included]).sort(), [["c1", true], ["fresh", true]]);
  assert.equal(listed.find((c) => c.id === "c1")!.detail, "2 ideas to recall");
  assert.equal(listed.find((c) => c.id === "fresh")!.detail, "Nothing to recall yet");
  assert.equal(listed[0]!.course.id, listed[0]!.id); // a /api/courses row, so clients can draw the building
});

test("a course turned off gives the day's set nothing, neither recall nor its new questions", async () => {
  const env = makeEnv();
  const now = Date.now();
  await usualLearner(env, now - 10 * DAY);
  await wideCourse(env, 6, now - 10 * DAY);
  await setRecallCourses(env, null, [["c1", false]], ZONE, now);
  const day = await today(env, null, ZONE, now);
  assert.equal(day.recall.status, "ready");
  assert.equal(day.recall.off, false);
  const built = await setRows(env);
  assert.ok(built.length > 0);
  assert.ok(built.every((r) => r.course_id === "wide-course" && r.origin !== "course"));
});

test("turning a course off mid-day takes its open questions out of today's set and keeps the answered ones", async () => {
  const env = makeEnv();
  const now = Date.now();
  await usualLearner(env, now - 10 * DAY);
  await wideCourse(env, 6, now - 10 * DAY);
  await today(env, null, ZONE, now);
  const fromC1 = (await setRows(env)).filter((r) => r.course_id === "c1" && r.item_id);
  assert.ok(fromC1.length >= 1);
  const answered = fromC1[0]!;
  await answerRecall(env, null, answered.id, String(answered.correct_index), ZONE, now);
  await setRecallCourses(env, null, [["c1", false]], ZONE, now + 1000);
  const after = await setRows(env);
  assert.deepEqual(after.filter((r) => r.course_id === "c1").map((r) => r.id), [answered.id]);
  const view = await today(env, null, ZONE, now + 2000);
  assert.equal(view.recall.total, after.length);
  assert.equal(view.recall.marks.length, after.length);
  // Numbered within the set, not by stored position, which now has gaps.
  assert.equal(view.recall.question!.number, view.recall.marks.indexOf("open") + 1);
  assert.ok(view.recall.question!.number <= view.recall.total);
  assert.notEqual(view.recall.question!.course?.id, "c1");
});

test("with every course off, Today says so, and turning one back on brings recall back", async () => {
  const env = makeEnv();
  const now = Date.now();
  await usualLearner(env, now - 10 * DAY);
  await wideCourse(env, 3, now - 10 * DAY);
  await setRecallCourses(env, null, [["c1", false], ["wide-course", false]], ZONE, now);
  const off = await today(env, null, ZONE, now);
  assert.equal(off.recall.status, "empty");
  assert.equal(off.recall.off, true);
  assert.match(off.recall.lead, /turned off for daily recall/);
  assert.equal((await setRows(env)).length, 0);
  await setRecallCourses(env, null, [["wide-course", true]], ZONE, now + 1000);
  const back = await today(env, null, ZONE, now + 2000);
  assert.equal(back.recall.off, false);
  assert.equal(back.recall.status, "ready");
  assert.ok((await setRows(env)).every((r) => r.course_id === "wide-course"));
});

test("only the learner's own courses can be turned on or off", async () => {
  const env = makeEnv();
  const now = Date.now();
  await usualLearner(env, now - 10 * DAY);
  await wideCourse(env, 2, now - 10 * DAY, "someone");
  assert.equal(await checkRecallCourses(env, null, { "wide-course": false }), null);
  assert.equal(await checkRecallCourses(env, null, { c1: "no" }), null);
  assert.equal(await checkRecallCourses(env, null, ["c1"]), null);
  assert.deepEqual(await checkRecallCourses(env, null, { c1: false }), [["c1", false]]);
  assert.equal((await one<{ in_recall: number }>(env, "SELECT in_recall FROM courses WHERE id = 'wide-course'"))!.in_recall, 1);
});

test("a course session asks only about that course's passed modules, and works with the course off for daily recall", async () => {
  const env = makeEnv();
  const now = Date.now();
  await usualLearner(env, now - 10 * DAY);
  await wideCourse(env, 6, now - 10 * DAY);
  await setRecallCourses(env, null, [["c1", false]], ZONE, now);
  const started = await startCourseRecall(env, null, "c1", ZONE, now);
  assert.equal(started.recall.scope, "course");
  assert.equal(started.recall.course_id, "c1");
  assert.equal(started.recall.status, "ready");
  assert.match(started.recall.lead, /^2 questions from Course c1\./);
  const asked = await sessionRows(env, started.recall.session!);
  assert.equal(asked.length, 2); // alpha and beta, with no new questions from the module in progress
  assert.ok(asked.every((r) => r.course_id === "c1" && r.item_id && r.origin !== "course"));
  assert.deepEqual(asked.map((r) => r.concept).sort(), ["alpha", "beta"]);
  // The day's set is untouched.
  assert.ok((await setRows(env)).every((r) => r.course_id === "wide-course"));
});

test("a course session answer is scheduled, stored and counted like daily recall, and returns the session", async () => {
  const env = makeEnv();
  const now = Date.now();
  await usualLearner(env, now - 10 * DAY);
  const started = await startCourseRecall(env, null, "c1", ZONE, now);
  const session = started.recall.session!;
  const [first, second] = await sessionRows(env, session);
  const before = (await one<{ reviews: number; due_at: number }>(env, "SELECT * FROM recall_items WHERE id = ?", first!.item_id))!;
  const answered = await answerRecall(env, null, first!.id, String(first!.correct_index), ZONE, now + 1000);
  assert.equal(answered.result.verdict, "correct");
  assert.equal(answered.recall.session, session);
  assert.equal(answered.recall.answered, 1);
  assert.equal(answered.recall.question!.id, second!.id);
  assert.equal(answered.streak.today.answered, 1);
  const after = (await one<{ reviews: number; due_at: number }>(env, "SELECT * FROM recall_items WHERE id = ?", first!.item_id))!;
  assert.equal(after.reviews, before.reviews + 1);
  assert.equal(after.due_at, now + 1000 + answered.schedule!.days * DAY);
  assert.ok(await one(env, "SELECT 1 FROM recall_attempts WHERE question_id = ?", first!.id));
  const skipped = await skipRecall(env, null, second!.id, ZONE, now + 2000);
  assert.equal(skipped.recall.status, "done");
  assert.equal(skipped.recall.session, session);
  assert.deepEqual(skipped.recall.marks, ["correct", "skipped"]);
  // A second answer to the same question changes nothing.
  const again = await answerRecall(env, null, first!.id, "1", ZONE, now + 3000);
  assert.equal(again.result.verdict, "correct");
  assert.equal(again.streak.today.answered, 1);
});

test("starting again carries on with today's open session, and five more draws from the course alone", async () => {
  const env = makeEnv();
  const now = Date.now();
  await wideCourse(env, 14, now - 10 * DAY);
  await usualLearner(env, now - 10 * DAY);
  const first = await startCourseRecall(env, null, "wide-course", ZONE, now);
  assert.equal(first.recall.total, 10); // the daily goal
  assert.equal(first.recall.more_available, true);
  const again = await startCourseRecall(env, null, "wide-course", ZONE, now + 1000);
  assert.equal(again.recall.session, first.recall.session);
  const more = await moreRecall(env, null, ZONE, now + 2000, first.recall.session);
  assert.equal(more.recall.session, first.recall.session);
  const asked = await sessionRows(env, first.recall.session!);
  assert.equal(asked.length, 14);
  assert.equal(new Set(asked.map((r) => r.item_id)).size, 14);
  assert.ok(asked.every((r) => r.course_id === "wide-course"));
  assert.equal(more.recall.more_available, false);
  // Once every question is answered, Recall starts a fresh session.
  for (const row of asked) await answerRecall(env, null, row.id, String(row.correct_index), ZONE, now + 3000);
  const fresh = await startCourseRecall(env, null, "wide-course", ZONE, now + 4000);
  assert.notEqual(fresh.recall.session, first.recall.session);
});

test("an idea open in today's set isn't asked in a course session at the same time", async () => {
  const env = makeEnv();
  const now = Date.now();
  await usualLearner(env, now - 10 * DAY);
  await today(env, null, ZONE, now);
  const daily = (await setRows(env)).filter((r) => r.item_id);
  assert.equal(daily.length, 2); // alpha and beta are both in today's set
  await rejects(startCourseRecall(env, null, "c1", ZONE, now), 409, /today's daily recall/);
  await answerRecall(env, null, daily[0]!.id, String(daily[0]!.correct_index), ZONE, now);
  const started = await startCourseRecall(env, null, "c1", ZONE, now + 1000);
  assert.deepEqual((await sessionRows(env, started.recall.session!)).map((r) => r.item_id), [daily[0]!.item_id]);
});

test("a course with nothing passed says why it can't be recalled", async () => {
  const env = makeEnv();
  const now = Date.now();
  await newCourse(env, now);
  const found = (await courseRecall(env, null, "fresh", ZONE, now))!;
  assert.equal(found.available, false);
  assert.match(found.reason!, /^Pass a module first/);
  await rejects(startCourseRecall(env, null, "fresh", ZONE, now), 409, /^Pass a module first/);
  await rejects(startCourseRecall(env, "someone", "fresh", ZONE, now), 404);
  assert.equal(await courseRecall(env, "someone", "fresh", ZONE, now), null);
});

test("a library course you have studied shows your course and whether it can be recalled", async () => {
  const env = makeEnv();
  const now = Date.now();
  await usualLearner(env, now - 10 * DAY);
  const yours = (await yourCatalogCourse(env, null, "lib", ZONE, now))!;
  assert.equal(yours.course.id, "c1");
  assert.equal(yours.recall.available, true);
  assert.equal(yours.recall.label, "2 ideas from 1 passed module · 2 due");
  assert.equal(await yourCatalogCourse(env, "someone", "lib", ZONE, now), null);
});

test("deleting a course removes its sessions", async () => {
  const env = makeEnv();
  const now = Date.now();
  await usualLearner(env, now - 10 * DAY);
  await startCourseRecall(env, null, "c1", ZONE, now);
  await env.DB.prepare("DELETE FROM courses WHERE id = 'c1'").run();
  assert.equal((await rows(env, "SELECT * FROM recall_sessions")).length, 0);
  assert.equal((await rows(env, "SELECT * FROM recall_questions")).length, 0);
});

test("two Recall taps at the same moment make one session, and no idea is open twice", async () => {
  const env = makeEnv();
  const now = Date.now();
  await wideCourse(env, 6, now - 10 * DAY);
  const results = await Promise.allSettled([startCourseRecall(env, null, "wide-course", ZONE, now), startCourseRecall(env, null, "wide-course", ZONE, now)]);
  const started = results.flatMap((r) => (r.status === "fulfilled" ? [r.value.recall.session] : []));
  assert.ok(started.length >= 1);
  assert.equal(new Set(started).size, 1);
  assert.equal((await rows(env, "SELECT * FROM recall_sessions")).length, 1);
  const open = await rows<{ item_id: string }>(env, "SELECT item_id FROM recall_questions WHERE status = 'set'");
  assert.equal(new Set(open.map((r) => r.item_id)).size, open.length);
});

test("a set's results count only its own answers", async () => {
  const env = makeEnv();
  const now = Date.now();
  await usualLearner(env, now - 10 * DAY);
  // Multiple choice only, so nothing here needs a model to grade it.
  await saveSettings(env, await getLearner(env, null, ZONE, now), { short_answers: false });
  await wideCourse(env, 4, now - 10 * DAY);
  for (const course of ["c1", "wide-course"]) {
    const started = await startCourseRecall(env, null, course, ZONE, now);
    for (const row of await sessionRows(env, started.recall.session!)) await answerRecall(env, null, row.id, String(row.correct_index), ZONE, now + 1000);
  }
  const c1 = await startCourseRecall(env, null, "c1", ZONE, now + 2000);
  const first = (await sessionRows(env, c1.recall.session!))[0]!;
  const answered = await answerRecall(env, null, first.id, String(first.correct_index), ZONE, now + 3000);
  assert.equal(answered.recall.correct, 1);
  assert.ok(answered.recall.coming_back.length <= 1);
  // Today's set has nothing answered from the sessions.
  const day = await today(env, null, ZONE, now + 4000);
  assert.equal(day.recall.correct, 0);
});

test("a session from another day can't be extended", async () => {
  const env = makeEnv();
  const now = Date.now();
  await wideCourse(env, 14, now - 10 * DAY);
  const started = await startCourseRecall(env, null, "wide-course", ZONE, now);
  await rejects(moreRecall(env, null, ZONE, now + DAY, started.recall.session), 409, /another day/);
  await rejects(moreRecall(env, "someone", ZONE, now, started.recall.session), 404);
});

test("when a course session holds every idea, Today and Recall on another course say why", async () => {
  const env = makeEnv();
  const now = Date.now();
  await usualLearner(env, now - 10 * DAY);
  await newCourse(env, now - 10 * DAY);
  await env.DB.prepare("UPDATE courses SET status = 'complete' WHERE id = 'c1'").run(); // no new questions to fill Today
  await startCourseRecall(env, null, "c1", ZONE, now);
  const day = await today(env, null, ZONE, now + 1000);
  assert.equal(day.recall.status, "empty");
  assert.match(day.recall.lead, /in the course recall you started/);
  // A course whose own ideas aren't in any set gets its own reason, not "they're in today's daily recall".
  await env.DB.prepare("UPDATE modules SET status = 'passed' WHERE course_id = 'fresh'").run();
  await env.DB.prepare("UPDATE modules SET concepts = '[]' WHERE course_id = 'fresh'").run();
  await rejects(startCourseRecall(env, null, "fresh", ZONE, now + 2000), 409, /^(?!.*today's daily recall)/);
});

test("the course list in settings is capped below D1's bound-parameter limit", async () => {
  const env = makeEnv();
  const change = Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`c${i}`, true]));
  assert.equal(await checkRecallCourses(env, null, change), null);
});
