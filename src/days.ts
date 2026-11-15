// The learner's days: which local day an answer belongs to, when a day counts, the streak and rest days.
//
// - A day is the learner's own calendar day, turning over at 3:00 am, in the IANA time zone their client sends.
// - A day counts once it has 5 answers, recall or course (or its recall set had fewer than 5 and is finished).
// - Every 7 counted days in a row bank a rest day, up to 2. A missed day spends one, if every missed day
//   can be covered, and the streak carries on. Otherwise the streak restarts and the rest days are kept.
// - The streak is the number of counted days in the unbroken run. Rest days hold the run together without adding to it.

export const DAY_MS = 86_400_000;
const ROLLOVER_HOUR = 3;
export const DAY_GOAL = 5;
const REST_EVERY = 7;
const MAX_REST = 2;
const GOALS = [5, 10, 15, 20];

/** The key for a learner in the recall tables. The admin account is owner NULL elsewhere, and '' here. */
export const ownerKey = (owner: string | null) => owner ?? "";

const formatters = new Map<string, Intl.DateTimeFormat | null>();
function formatter(zone: string) {
  if (!formatters.has(zone)) {
    try {
      formatters.set(zone, new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }));
    } catch {
      formatters.set(zone, null);
    }
  }
  return formatters.get(zone)!;
}

/** The zone if it is a real IANA name, otherwise null. */
export const validZone = (zone: string | null | undefined) => (zone && zone.length <= 64 && formatter(zone) ? zone : null);

/**
 * The learner's day at `time`, as YYYY-MM-DD. Before 3:00 am on their clock it is still the day before.
 * The rule reads the wall-clock hour rather than taking three hours off the instant, so the day still turns
 * over at 3:00 am on the two days a year the clocks change.
 */
export function localDay(time: number, zone: string) {
  const parts = (formatter(zone) ?? formatter("UTC")!).formatToParts(new Date(time));
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  const day = `${part("year")}-${part("month")}-${part("day")}`;
  return Number(part("hour")) < ROLLOVER_HOUR ? addDays(day, -1) : day;
}

export function addDays(day: string, count: number) {
  return new Date(Date.parse(`${day}T00:00:00Z`) + count * DAY_MS).toISOString().slice(0, 10);
}
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

export type Learner = {
  owner: string; time_zone: string; daily_goal: number; short_answers: number;
  rest_days: number; longest_streak: number; last_seen_at: number | null;
};

const findLearner = (env: Env, key: string) => env.DB.prepare("SELECT * FROM learners WHERE owner = ?").bind(key).first<Learner>();

/** The learner's row, made on first use. Keeps the time zone in step with what the client sends. */
export async function getLearner(env: Env, owner: string | null, zone?: string | null, now = Date.now()): Promise<Learner> {
  const key = ownerKey(owner);
  const sent = validZone(zone);
  let learner = await findLearner(env, key);
  if (!learner) {
    await env.DB.prepare("INSERT INTO learners (owner, time_zone, last_seen_at, created_at) VALUES (?, ?, ?, ?) ON CONFLICT (owner) DO NOTHING")
      .bind(key, sent ?? "UTC", now, now).run();
    learner = (await findLearner(env, key))!;
  }
  const moved = sent !== null && sent !== learner.time_zone;
  if (moved || !learner.last_seen_at || now - learner.last_seen_at > 3_600_000) {
    learner = { ...learner, time_zone: moved ? sent : learner.time_zone, last_seen_at: now };
    await env.DB.prepare("UPDATE learners SET time_zone = ?, last_seen_at = ? WHERE owner = ?").bind(learner.time_zone, now, key).run();
  }
  return learner;
}

export const settingsView = (learner: Learner) => ({
  daily_goal: learner.daily_goal, short_answers: Boolean(learner.short_answers), time_zone: learner.time_zone, goals: GOALS,
});

/** Change the daily goal or the short-answer switch. Returns null if a value isn't one the app offers. */
export async function saveSettings(env: Env, learner: Learner, change: { daily_goal?: unknown; short_answers?: unknown }) {
  const goal = change.daily_goal === undefined ? learner.daily_goal : change.daily_goal;
  const short = change.short_answers === undefined ? Boolean(learner.short_answers) : change.short_answers;
  if (typeof goal !== "number" || !GOALS.includes(goal) || typeof short !== "boolean") return null;
  await env.DB.prepare("UPDATE learners SET daily_goal = ?, short_answers = ? WHERE owner = ?").bind(goal, short ? 1 : 0, learner.owner).run();
  return settingsView({ ...learner, daily_goal: goal, short_answers: short ? 1 : 0 });
}

type DayRow = { day: string; recall_answered: number; course_answered: number; counted: number; rest: number; recall_skipped: number };

/** Newest first. Two years is more than any calendar shows, and enough to walk a long streak. */
async function loadDays(env: Env, owner: string) {
  return (await env.DB.prepare("SELECT * FROM learner_days WHERE owner = ? ORDER BY day DESC LIMIT 800").bind(owner).all<DayRow>()).results;
}

/**
 * Today for this learner. Never earlier than the last day they answered on, so a clock or a time zone
 * that moves backwards can't reopen a day that is over.
 */
export async function currentDay(env: Env, learner: Learner, now = Date.now()) {
  const day = localDay(now, learner.time_zone);
  const last = await env.DB.prepare("SELECT MAX(day) AS day FROM learner_days WHERE owner = ? AND recall_answered + course_answered > 0")
    .bind(learner.owner).first<{ day: string | null }>();
  return last?.day && last.day > day ? last.day : day;
}

/** Counted days in the unbroken run that ends today, or yesterday when today hasn't counted yet. */
function runLength(rows: Map<string, DayRow>, today: string) {
  let count = rows.get(today)?.counted ? 1 : 0;
  for (let day = addDays(today, -1); ; day = addDays(day, -1)) {
    const row = rows.get(day);
    if (row?.counted) count++;
    else if (!row?.rest) return count;
  }
}

/**
 * Spend rest days on the days missed since the learner last had a counted or rested day, but only when
 * there are enough to cover all of them. Each day's spend is one transaction, so two requests can't spend twice.
 */
async function settle(env: Env, learner: Learner, today: string, rows: DayRow[]) {
  if (learner.rest_days <= 0) return false;
  const last = rows.find((row) => row.day < today && (row.counted || row.rest));
  if (!last) return false;
  const missed = daysBetween(last.day, today) - 1;
  if (missed <= 0 || missed > learner.rest_days) return false;
  for (let i = 1; i <= missed; i++) {
    const day = addDays(last.day, i);
    await env.DB.batch([
      env.DB.prepare("UPDATE learners SET rest_days = rest_days - 1 WHERE owner = ? AND rest_days > 0 AND NOT EXISTS (SELECT 1 FROM learner_days WHERE owner = ? AND day = ? AND rest = 1)")
        .bind(learner.owner, learner.owner, day),
      env.DB.prepare("INSERT INTO learner_days (owner, day, rest) VALUES (?, ?, 1) ON CONFLICT (owner, day) DO UPDATE SET rest = 1").bind(learner.owner, day),
    ]);
  }
  return true;
}

/** Mark the day as counted if it has met the goal, and bank a rest day on every seventh day in a row. */
export async function countDay(env: Env, learner: Learner, day: string) {
  const row = await env.DB.prepare("SELECT * FROM learner_days WHERE owner = ? AND day = ?").bind(learner.owner, day).first<DayRow>();
  if (!row || row.counted) return;
  const answered = row.recall_answered + row.course_answered;
  let met = answered >= DAY_GOAL;
  if (!met && answered > 0) {
    // A short recall set, finished, is a full day for a learner who doesn't have five questions to answer yet.
    const set = await env.DB.prepare("SELECT COUNT(*) AS total, COALESCE(SUM(status = 'set'), 0) AS open FROM recall_questions WHERE owner = ? AND day = ?")
      .bind(learner.owner, day).first<{ total: number; open: number }>();
    met = Boolean(set && set.total > 0 && set.total < DAY_GOAL && !set.open);
  }
  if (!met) return;
  const { meta } = await env.DB.prepare("UPDATE learner_days SET counted = 1 WHERE owner = ? AND day = ? AND counted = 0").bind(learner.owner, day).run();
  if (!meta.changes) return;
  const streak = runLength(new Map((await loadDays(env, learner.owner)).map((r) => [r.day, r])), day);
  await env.DB.prepare("UPDATE learners SET longest_streak = MAX(longest_streak, ?), rest_days = MIN(?, rest_days + ?) WHERE owner = ?")
    .bind(streak, MAX_REST, streak % REST_EVERY === 0 ? 1 : 0, learner.owner).run();
}

/** Call once for every answer that is stored, recall or course. `zone` is the client's, when it sent one. */
export async function recordAnswer(env: Env, owner: string | null, kind: "recall" | "course", zone?: string | null, now = Date.now()) {
  const learner = await getLearner(env, owner, zone, now);
  const day = await currentDay(env, learner, now);
  await settle(env, learner, day, await loadDays(env, learner.owner));
  const column = kind === "recall" ? "recall_answered" : "course_answered";
  await env.DB.prepare(`INSERT INTO learner_days (owner, day, ${column}) VALUES (?, ?, 1) ON CONFLICT (owner, day) DO UPDATE SET ${column} = ${column} + 1`)
    .bind(learner.owner, day).run();
  await countDay(env, learner, day);
  return day;
}

/** Hide or bring back recall for the day. */
export async function setRecallSkipped(env: Env, learner: Learner, day: string, skipped: boolean) {
  await env.DB.prepare("INSERT INTO learner_days (owner, day, recall_skipped) VALUES (?, ?, ?) ON CONFLICT (owner, day) DO UPDATE SET recall_skipped = excluded.recall_skipped")
    .bind(learner.owner, day, skipped ? 1 : 0).run();
}

export type DayState = "done" | "rest" | "missed" | "today" | "future" | "none";

/**
 * The streak as every client draws it: the count, this week from Monday, and the last 4 weeks ending today.
 * `none` is a day before the learner's first answer, so a new learner doesn't see a row of missed days.
 */
export async function streakView(env: Env, learner: Learner, now = Date.now()) {
  const today = await currentDay(env, learner, now);
  let rows = await loadDays(env, learner.owner);
  if (await settle(env, learner, today, rows)) rows = await loadDays(env, learner.owner);
  const fresh = (await findLearner(env, learner.owner)) ?? learner;
  const byDay = new Map(rows.map((r) => [r.day, r]));
  const firstDay = rows.at(-1)?.day ?? today;
  const current = runLength(byDay, today);
  const state = (day: string): DayState => {
    const row = byDay.get(day);
    if (day > today) return "future";
    if (row?.counted) return "done";
    if (day === today) return "today";
    if (row?.rest) return "rest";
    return day > firstDay ? "missed" : "none";
  };
  const entry = (day: string) => ({ day, state: state(day), recall: byDay.get(day)?.recall_answered ?? 0, course: byDay.get(day)?.course_answered ?? 0 });
  const monday = addDays(today, -((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7));
  const mine = byDay.get(today);
  const answered = (mine?.recall_answered ?? 0) + (mine?.course_answered ?? 0);
  const more = Math.max(1, DAY_GOAL - answered);
  const days = (count: number) => `${count} day${count === 1 ? "" : "s"}`;
  return {
    day: today,
    current,
    // Written here, so every client says the same thing about the streak.
    label: mine?.counted
      ? `${days(current)} in a row`
      : current
        ? `Answer ${more} more today to keep your ${current}-day streak.`
        : answered ? `Answer ${more} more today to start a streak.` : `Answer ${DAY_GOAL} questions today to start a streak.`,
    rest_label: fresh.rest_days ? `${fresh.rest_days} rest day${fresh.rest_days === 1 ? "" : "s"} saved` : null,
    longest: Math.max(fresh.longest_streak, current),
    rest_days: fresh.rest_days,
    today: { answered, needed: DAY_GOAL, counted: Boolean(mine?.counted) },
    recall_skipped: Boolean(mine?.recall_skipped),
    week: Array.from({ length: 7 }, (_, i) => entry(addDays(monday, i))),
    calendar: Array.from({ length: 28 }, (_, i) => entry(addDays(today, i - 27))),
  };
}
