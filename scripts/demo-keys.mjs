// A local helper for the app walkthroughs: it reads a demo database (scripts/demo.mjs) and says what the right
// answer is to the question the demo learner is on, so a walkthrough can score well and the store screenshots
// show a believable run. It is test tooling. The Worker has no such endpoint, and this never touches a real one:
// it opens one local SQLite file, read-only, and listens on this machine.
//
//   node scripts/demo-keys.mjs data/demo.db            # http://localhost:8790
//   node scripts/demo-keys.mjs data/demo.db --port 8791
//
// GET /recall              the open question of the demo learner's latest recall set
// GET /course?title=...    the next unanswered question of their newest course with that title (or newest course)
//
// Both answer {"kind":"mcq","index":2,"answer":"…"} or {"kind":"short","answer":"…"}, or 404 when nothing is open.
// The walkthroughs read CS_KEY_URL: http://localhost:8790 for iOS, http://10.0.2.2:8790 for the Android emulator.
import { createServer } from "node:http";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const path = process.argv[2];
if (!path || path.startsWith("--")) {
  console.error("Usage: node scripts/demo-keys.mjs <demo database file> [--port 8790]");
  process.exit(1);
}
const portAt = process.argv.indexOf("--port");
const port = portAt > 0 ? Number(process.argv[portAt + 1]) : 8790;
const db = new DatabaseSync(resolve(path), { readOnly: true });
const first = (sql, ...values) => db.prepare(sql).get(...values);

const key = (row) => {
  if (!row) return null;
  if (row.kind !== "mcq") return { kind: "short", answer: row.reference };
  return { kind: "mcq", index: row.correct_index, answer: JSON.parse(row.options)[row.correct_index] };
};

// The demo learner is the admin account: owner '' in the recall tables and NULL in courses.
const recall = () => key(first(
  `SELECT r.kind, COALESCE(r.options, q.options) AS options, COALESCE(r.correct_index, q.correct_index) AS correct_index, COALESCE(r.reference, q.reference) AS reference
   FROM recall_questions r LEFT JOIN questions q ON q.id = r.course_question_id
   WHERE r.owner = '' AND r.status = 'set' AND r.day = (SELECT MAX(day) FROM recall_questions WHERE owner = '')
   ORDER BY r.position LIMIT 1`));

const course = (title) => key(first(
  `SELECT q.kind, q.options, q.correct_index, q.reference FROM questions q
   JOIN modules m ON m.id = q.module_id AND m.status = 'active' JOIN courses c ON c.id = q.course_id
   WHERE c.owner IS NULL AND (? = '' OR c.title = ? OR c.title LIKE '%' || ? || '%')
     AND NOT EXISTS (SELECT 1 FROM answers a WHERE a.question_id = q.id)
   ORDER BY c.created_at DESC, q.round, q.position LIMIT 1`, title, title, title));

createServer((request, response) => {
  const url = new URL(request.url, "http://localhost");
  const found = url.pathname === "/recall" ? recall() : url.pathname === "/course" ? course(url.searchParams.get("title") ?? "") : null;
  response.writeHead(found ? 200 : 404, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  response.end(JSON.stringify(found ?? { error: "Nothing is open." }));
}).listen(port, "0.0.0.0", () => console.log(`Answer keys for ${path} on http://localhost:${port}`));
