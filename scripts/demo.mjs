// Makes a SQLite database with a learner who has something on every screen: two library courses part-way
// through, questions to recall, a 12-day streak with a rest day in it, and a course to take next.
// It is for trying the app locally, for the walkthrough tests and for store screenshots. Each run starts over.
//
//   node scripts/demo.mjs data/demo.db
//   set -a; source .env; set +a
//   DATABASE_PATH=data/demo.db CLOUDFLARE_ACCOUNT_ID=<id> npm run start:server
//
// The learner is the admin login (USER_NAME and PW). `--zone` sets the time zone the streak's days are in;
// it defaults to this machine's, which is what a simulator or emulator on it reports.
//
// `--keep-library` starts the learner over but keeps the library in an existing database, with its embeddings,
// topics and learning paths. The server makes those in the background over its first twenty minutes or so, and
// the library screens only show topics and paths once it has, so keep a database that has them.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const ROOT = new URL("../", import.meta.url).pathname;
const path = process.argv[2];
if (!path || path.startsWith("--")) {
  console.error("Usage: node scripts/demo.mjs <database file> [--zone <IANA time zone>] [--keep-library]");
  process.exit(1);
}
const zoneAt = process.argv.indexOf("--zone");
const zone = zoneAt > 0 ? process.argv[zoneAt + 1] : Intl.DateTimeFormat().resolvedOptions().timeZone;

const file = resolve(path);
mkdirSync(dirname(file), { recursive: true });
const keep = process.argv.includes("--keep-library") && existsSync(file);
if (!keep) for (const suffix of ["", "-wal", "-shm"]) rmSync(file + suffix, { force: true });

// The same steps the Node server takes on start: every migration, in order.
const db = new DatabaseSync(file);
db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)");
const applied = new Set(db.prepare("SELECT name FROM schema_migrations").all().map((row) => String(row.name)));
for (const name of readdirSync(join(ROOT, "migrations")).filter((f) => f.endsWith(".sql")).sort()) {
  if (applied.has(name)) continue;
  db.exec(readFileSync(join(ROOT, "migrations", name), "utf8"));
  db.prepare("INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)").run(name, Date.now());
}
if (keep) {
  // Every learner's courses go, and with them their questions, answers and recall. The library stays as it is.
  db.exec("DELETE FROM courses; DELETE FROM catalog_courses WHERE visibility = 'private'; DELETE FROM learners; DELETE FROM learner_days;");
}
db.close();
if (!keep) execFileSync("node", [join(ROOT, "scripts/catalog/import.mjs"), "--sqlite", file], { stdio: "inherit" });

const DAY = 86_400_000;
const now = Date.now();
// The learner's day, as src/days.ts works it out: the calendar day in their zone, turning over at 3:00 am.
const dayOf = (time) => new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(time - 3 * 3_600_000));

const open = new DatabaseSync(file);
open.exec("PRAGMA foreign_keys = ON;");
const run = (sql, ...values) => open.prepare(sql).run(...values);
const all = (sql, ...values) => open.prepare(sql).all(...values);

/**
 * The learner's copy of a library course. `passed` modules have their first round answered, with a miss on every
 * fourth question, and the next module is open with `answered` of its questions done.
 */
function startCourse(id, catalogId, { passed, answered, lastAnswer }) {
  const course = all("SELECT * FROM catalog_courses WHERE id = ?", catalogId)[0];
  if (!course) throw new Error(`The library has no course ${catalogId}. Is catalog/courses/${catalogId}.json there?`);
  const modules = all("SELECT * FROM catalog_modules WHERE catalog_course_id = ? ORDER BY position", catalogId);
  // A finished course is asked for with more modules than any course has.
  passed = Math.min(passed, modules.length);
  run("INSERT INTO courses (id, prompt, title, summary, status, owner, catalog_id, icon, created_at) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?)",
    id, course.prompt, course.title, course.summary, passed >= modules.length ? "complete" : "active", catalogId, course.icon, lastAnswer - (passed + 2) * 2 * DAY);
  run("INSERT INTO events (course_id, message, created_at) VALUES (?, ?, ?)", id, `Opened "${course.title}" from the library: ${modules.length} modules.`, lastAnswer - (passed + 2) * 2 * DAY);
  let count = 0;
  modules.forEach((module, position) => {
    const status = position < passed ? "passed" : position === passed ? "active" : "locked";
    const moduleId = `${id}-m${position}`;
    run("INSERT INTO modules (id, course_id, position, title, objective, concepts, status, catalog_module_id, importance, mastery_target, max_follow_ups) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'supporting', 0.7, 2)",
      moduleId, id, position, module.title, module.objective, module.concepts, status, module.id);
    if (status === "locked") return;
    const core = all("SELECT * FROM catalog_questions WHERE catalog_module_id = ? AND tier = 'core' ORDER BY position", module.id);
    // A passed module was answered two days before the next one.
    const when = lastAnswer - (passed - position) * 2 * DAY;
    core.forEach((q, i) => {
      const questionId = `${moduleId}-q${i}`;
      run("INSERT INTO questions (id, course_id, module_id, round, position, kind, prompt, options, correct_index, reference, concept, figure, figure_alt, bank_id, source_url) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        questionId, id, moduleId, i, q.kind, q.prompt, q.options, q.correct_index, q.reference, q.concept.trim().toLowerCase(), q.figure, q.figure_alt, q.id, q.source_url);
      if (status === "active" && i >= answered) return;
      const miss = count++ % 4 === 3;
      const options = q.options ? JSON.parse(q.options) : null;
      const response = options ? options[miss ? (q.correct_index + 1) % options.length : q.correct_index] : "A demo answer in my own words.";
      run("INSERT INTO answers (id, question_id, course_id, concept, response, verdict, score, confidence, error_type, feedback, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        `a-${questionId}`, questionId, id, q.concept.trim().toLowerCase(), response, miss ? "incorrect" : "correct", miss ? 0 : 1, options ? null : 0.9, options ? null : miss ? "misconception" : "none", q.reference, when + i * 60_000);
    });
  });
}

// Studied yesterday and on its last module, so Today offers it as the course to continue and suggests what comes next.
startCourse("demo-llm-apis", "llm-api-fundamentals", { passed: 5, answered: 4, lastAnswer: now - DAY });
// Older, so most of what it taught is due for recall.
startCourse("demo-kubernetes", "k8s-architecture", { passed: 3, answered: 2, lastAnswer: now - 9 * DAY });
// With more of the library on disk than the three public samples, the learner has also finished a course,
// so the city has a building with every floor lit.
const finished = ["rag-fundamentals", "k8s-pods-workloads", "prompt-engineering-basics"].find((id) => all("SELECT 1 FROM catalog_courses WHERE id = ?", id).length);
if (finished) startCourse("demo-finished", finished, { passed: 99, answered: 0, lastAnswer: now - 20 * DAY });
// The library works this out itself once it has embedded enough courses. The demo states one learning path directly.
run("INSERT OR IGNORE INTO course_prerequisites (course_id, requires_id, created_at) VALUES ('inference-basics', 'llm-api-fundamentals', ?)", now);

// Four weeks of history: twelve counted days up to yesterday with one rest day in the run, a missed day before
// that, and an earlier run. Days the migration filled in from the answers above are replaced by these.
run("INSERT INTO learners (owner, time_zone, rest_days, longest_streak, created_at) VALUES ('', ?, 1, 21, ?)", zone, now - 60 * DAY);
run("DELETE FROM learner_days");
for (let back = 27; back >= 1; back--) {
  const day = dayOf(now - back * DAY);
  if (back === 14) continue;
  if (back === 4) run("INSERT INTO learner_days (owner, day, rest) VALUES ('', ?, 1)", day);
  else run("INSERT INTO learner_days (owner, day, recall_answered, course_answered, counted) VALUES ('', ?, ?, ?, 1)", day, 6 + (back % 5), back % 3);
}
open.close();
console.log(`Demo data is in ${file}, with days in ${zone}.`);
if (!existsSync(join(ROOT, "dist/server.mjs"))) console.log("Build the server first: npm run build:server");
