// Loads catalog/courses/*.json into the library tables. Only verified modules go in, and a course
// goes in only once every module is verified. Ids are stable (slug, slug--m0, slug--m0--q3), so a rerun
// updates in place and learners' copies keep pointing at the right bank questions.
//
//   node scripts/catalog/import.mjs --remote      # D1 on Cloudflare
//   node scripts/catalog/import.mjs --local       # wrangler's local D1
//   node scripts/catalog/import.mjs --sqlite /data/coursesmash.db   # Docker
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("../../", import.meta.url).pathname;
const COURSES = join(ROOT, "catalog/courses");
const TOPICS = JSON.parse(readFileSync(join(ROOT, "scripts/catalog/topics.json"), "utf8"));
// Each library course's building on the city map. A course missing here gets one from its topic.
const ICONS = JSON.parse(readFileSync(join(ROOT, "catalog/icons.json"), "utf8"));
const target = process.argv[2];
if (!["--remote", "--local", "--sqlite"].includes(target)) {
  console.error("Usage: node scripts/catalog/import.mjs --remote | --local | --sqlite <path>");
  process.exit(1);
}

const quote = (v) => (v === null || v === undefined ? "NULL" : typeof v === "number" ? String(v) : `'${String(v).replaceAll("'", "''")}'`);
const upsert = (table, row) => {
  const cols = Object.keys(row);
  return `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols.map((c) => quote(row[c])).join(", ")}) ON CONFLICT (id) DO UPDATE SET ${cols.filter((c) => c !== "id").map((c) => `${c} = excluded.${c}`).join(", ")};`;
};

const statements = [];
let courses = 0;
let questions = 0;
const now = Date.now();
for (const [track, list] of Object.entries(TOPICS)) {
  list.forEach(([slug, level], position) => {
    const file = join(COURSES, `${slug}.json`);
    if (!existsSync(file)) return;
    const course = JSON.parse(readFileSync(file, "utf8"));
    if (!course.outline || !course.modules?.length || !course.modules.every((m) => m.verified && m.bank?.length)) return;
    courses++;
    statements.push(upsert("catalog_courses", {
      id: slug, track, title: course.outline.title, summary: course.outline.summary, prompt: course.outline.prompt,
      level, tags: JSON.stringify(course.outline.tags), position, created_at: now, visibility: "public", owner: null, icon: ICONS[slug] ? JSON.stringify(ICONS[slug]) : null,
    }));
    // Questions the agent wrote during courses (source 'generated') are kept; only stale reviewed ones go.
    statements.push(`DELETE FROM catalog_modules WHERE catalog_course_id = ${quote(slug)} AND position >= ${course.modules.length};`);
    course.modules.forEach((m, i) => {
      const moduleId = `${slug}--m${i}`;
      statements.push(upsert("catalog_modules", {
        id: moduleId, catalog_course_id: slug, position: i, title: m.title, objective: m.objective, concepts: JSON.stringify(m.concepts),
      }));
      statements.push(`DELETE FROM catalog_questions WHERE catalog_module_id = ${quote(moduleId)} AND source = 'library' AND position >= ${m.bank.length};`);
      m.bank.forEach((q, j) => {
        questions++;
        statements.push(upsert("catalog_questions", {
          id: `${moduleId}--q${j}`, catalog_module_id: moduleId, position: j, tier: q.tier, kind: q.kind, prompt: q.prompt,
          options: q.options ? JSON.stringify(q.options) : null, correct_index: q.kind === "mcq" ? q.correct_index : null,
          reference: q.reference, concept: q.concept, difficulty: q.difficulty, figure: q.figure ?? null, figure_alt: q.figure_alt ?? null,
          source: "library", source_url: q.source_url ?? null,
        }));
      });
    });
  });
}

const stateDir = join(ROOT, "catalog/.state");
mkdirSync(stateDir, { recursive: true });
const sqlFile = join(stateDir, "seed.sql");
writeFileSync(sqlFile, statements.join("\n") + "\n");
console.log(`Prepared ${courses} courses and ${questions} questions (${statements.length} statements).`);

if (target === "--sqlite") {
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(process.argv[3]);
  db.exec("BEGIN");
  db.exec(readFileSync(sqlFile, "utf8"));
  db.exec("COMMIT");
  console.log("Imported into SQLite.");
} else {
  execFileSync("npx", ["wrangler", "d1", "execute", "coursesmash-db", target, "--file", sqlFile, "--yes"], { stdio: "inherit", cwd: ROOT });
}
