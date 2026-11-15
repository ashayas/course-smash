import assert from "node:assert/strict";
import { test } from "node:test";
import { getLearner, localDay, recordAnswer, saveSettings, streakView, validZone } from "../src/days";
import { ZONE, makeEnv, one, rows } from "./world";

// Noon in Denver on a day of November 2026 (UTC-7).
const noon = (day: number) => Date.UTC(2026, 10, day, 19);
const date = (day: number) => `2026-11-${String(day).padStart(2, "0")}`;
const fullDay = async (env: Env, day: number) => {
  for (let i = 0; i < 5; i++) await recordAnswer(env, null, i % 2 ? "course" : "recall", ZONE, noon(day) + i);
};
const streakOn = async (env: Env, day: number) => streakView(env, await getLearner(env, null, ZONE, noon(day)), noon(day));

test("the local day turns over at 3:00 am in the learner's zone", () => {
  assert.equal(localDay(Date.UTC(2026, 10, 15, 9, 59), ZONE), "2026-11-14"); // 2:59 am in Denver
  assert.equal(localDay(Date.UTC(2026, 10, 15, 10, 1), ZONE), "2026-11-15"); // 3:01 am
  assert.equal(localDay(Date.UTC(2026, 10, 15, 2, 39), ZONE), "2026-11-14"); // 7:39 pm the evening before
  assert.equal(validZone("Not/AZone"), null);
  assert.equal(validZone(ZONE), ZONE);
});

test("answers add to the local day", async () => {
  const env = makeEnv();
  await recordAnswer(env, null, "recall", ZONE, noon(15));
  await recordAnswer(env, null, "course", ZONE, noon(15) + 1);
  assert.deepEqual(await rows(env, "SELECT day, recall_answered, course_answered, counted FROM learner_days"), [{ day: date(15), recall_answered: 1, course_answered: 1, counted: 0 }]);
  const streak = await streakOn(env, 15);
  assert.deepEqual(streak.today, { answered: 2, needed: 5, counted: false });
  assert.equal(streak.current, 0);
});

test("a day counts at five answers", async () => {
  const env = makeEnv();
  await fullDay(env, 15);
  const streak = await streakOn(env, 15);
  assert.equal(streak.current, 1);
  assert.equal(streak.today.counted, true);
  assert.equal(streak.week.find((d) => d.day === date(15))?.state, "done");
  // Sunday the 15th is the last day of a week that starts on Monday the 9th.
  assert.equal(streak.week[0]?.day, date(9));
  assert.equal(streak.calendar.length, 28);
  assert.equal(streak.calendar.at(-1)?.day, date(15));
});

test("the streak holds overnight, before today is counted", async () => {
  const env = makeEnv();
  await fullDay(env, 14);
  const streak = await streakOn(env, 15);
  assert.equal(streak.current, 1);
  assert.equal(streak.week.find((d) => d.day === date(15))?.state, "today");
});

test("seven days bank a rest day, and no more than two are kept", async () => {
  const env = makeEnv();
  for (let day = 1; day <= 7; day++) await fullDay(env, day);
  assert.deepEqual(await one(env, "SELECT rest_days, longest_streak FROM learners"), { rest_days: 1, longest_streak: 7 });
  for (let day = 8; day <= 28; day++) await fullDay(env, day);
  assert.deepEqual(await one(env, "SELECT rest_days, longest_streak FROM learners"), { rest_days: 2, longest_streak: 28 });
});

test("a rest day covers a missed day", async () => {
  const env = makeEnv();
  for (let day = 1; day <= 7; day++) await fullDay(env, day);
  const morning = await streakOn(env, 9); // the 8th was missed
  assert.equal(morning.current, 7);
  assert.equal(morning.rest_days, 0);
  assert.equal(morning.calendar.find((d) => d.day === date(8))?.state, "rest");
  // Reading again doesn't spend another one.
  assert.equal((await streakOn(env, 9)).rest_days, 0);
  await fullDay(env, 9);
  assert.equal((await streakOn(env, 9)).current, 8);
});

test("two missed days with one rest day break the streak, and the rest day is kept", async () => {
  const env = makeEnv();
  for (let day = 1; day <= 7; day++) await fullDay(env, day);
  const streak = await streakOn(env, 10); // the 8th and 9th were missed
  assert.equal(streak.current, 0);
  assert.equal(streak.rest_days, 1);
  assert.equal(streak.longest, 7);
  assert.equal(streak.calendar.find((d) => d.day === date(8))?.state, "missed");
});

test("the day never moves backwards", async () => {
  const env = makeEnv();
  // 4:00 am on the 16th in Tokyo, then a minute later from Denver, where it is still noon on the 15th.
  await recordAnswer(env, null, "recall", "Asia/Tokyo", noon(15));
  await recordAnswer(env, null, "recall", ZONE, noon(15) + 60_000);
  assert.deepEqual(await rows(env, "SELECT day, recall_answered FROM learner_days"), [{ day: date(16), recall_answered: 2 }]);
});

test("each account has its own days", async () => {
  const env = makeEnv();
  await fullDay(env, 15);
  await recordAnswer(env, "sam", "recall", ZONE, noon(15));
  assert.equal((await streakView(env, await getLearner(env, "sam", ZONE, noon(15)), noon(15))).current, 0);
  assert.equal((await streakOn(env, 15)).current, 1);
});

test("days before the first answer aren't shown as missed", async () => {
  const env = makeEnv();
  await fullDay(env, 15);
  assert.equal((await streakOn(env, 15)).calendar[0]?.state, "none");
});

test("settings accept only the choices the app offers", async () => {
  const env = makeEnv();
  const learner = await getLearner(env, null, ZONE);
  assert.equal(await saveSettings(env, learner, { daily_goal: 7 }), null);
  assert.equal(await saveSettings(env, learner, { short_answers: "no" }), null);
  assert.deepEqual(await saveSettings(env, learner, { daily_goal: 15, short_answers: false }), { daily_goal: 15, short_answers: false, time_zone: ZONE, goals: [5, 10, 15, 20] });
  assert.deepEqual(await one(env, "SELECT daily_goal, short_answers FROM learners"), { daily_goal: 15, short_answers: 0 });
});
