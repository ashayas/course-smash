// Turns a folder of hand-written module drafts into a library course file that import.mjs can load.
//   node scripts/catalog/merge-drafts.mjs catalog/.state/canada <track>
// The folder holds plan.json and modules/m<position>.json; each draft must pass check-draft.mjs.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("../../", import.meta.url).pathname;
const [dir, track] = process.argv.slice(2);
if (!dir || !track) {
  console.error("Usage: node scripts/catalog/merge-drafts.mjs <drafts folder> <track>");
  process.exit(1);
}
const plan = JSON.parse(readFileSync(join(dir, "plan.json"), "utf8"));
const modules = plan.modules.map((planned) => {
  const file = join(dir, "modules", `m${planned.position}.json`);
  if (!existsSync(file)) throw new Error(`missing ${file}`);
  execFileSync("node", [join(ROOT, "scripts/catalog/check-draft.mjs"), file, join(dir, "plan.json")], { stdio: "inherit" });
  const draft = JSON.parse(readFileSync(file, "utf8"));
  // Core first, then reserve, so positions read naturally in the bank.
  const bank = [...draft.bank.filter((q) => q.tier === "core"), ...draft.bank.filter((q) => q.tier === "reserve")].map((q) => ({
    tier: q.tier, kind: q.kind, prompt: q.prompt.trim(), options: q.kind === "mcq" ? q.options.map((o) => o.trim()) : null,
    correct_index: q.kind === "mcq" ? q.correct_index : null, reference: q.reference.trim(), concept: q.concept,
    difficulty: q.difficulty, figure: null, figure_alt: null, source_url: q.source_url,
  }));
  // verified/expanded stop generate.mjs from sending this course to the Batch API.
  return { title: planned.title, objective: planned.objective, concepts: planned.concepts, bank, verified: true, expanded: true };
});

const course = {
  slug: plan.slug, track, level: plan.level, brief: plan.summary, position: 0,
  outline: { title: plan.title, summary: plan.summary, prompt: plan.prompt, tags: plan.tags, modules: plan.modules.map(({ title, objective, concepts }) => ({ title, objective, concepts })) },
  modules,
};
const out = join(ROOT, "catalog/courses", `${plan.slug}.json`);
writeFileSync(out, JSON.stringify(course, null, 2) + "\n");
console.log(`Wrote ${out}: ${modules.length} modules, ${modules.reduce((n, m) => n + m.bank.length, 0)} questions.`);
