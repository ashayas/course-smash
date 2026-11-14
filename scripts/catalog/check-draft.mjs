// Checks a hand-written module draft (see catalog/.state/canada/BRIEF.md) before it is merged into a course.
//   node scripts/catalog/check-draft.mjs <module.json> [plan.json]
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

const file = process.argv[2];
if (!file) {
  console.error("Usage: node scripts/catalog/check-draft.mjs <module.json> [plan.json]");
  process.exit(1);
}
const planFile = process.argv[3] ?? join(dirname(file), "..", "plan.json");
const problems = [];
let draft;
try {
  draft = JSON.parse(readFileSync(file, "utf8"));
} catch (e) {
  console.error(`Not valid JSON: ${e.message}`);
  process.exit(1);
}
const plan = JSON.parse(readFileSync(planFile, "utf8"));
const planned = plan.modules.find((m) => m.position === draft.position);
if (!planned) problems.push(`position ${draft.position} is not in plan.json`);
else {
  if (draft.title !== planned.title) problems.push(`title must be exactly "${planned.title}"`);
  if (draft.objective !== planned.objective) problems.push("objective must match plan.json exactly");
  if (JSON.stringify(draft.concepts) !== JSON.stringify(planned.concepts)) problems.push("concepts must match plan.json exactly");
}
const concepts = new Set(planned?.concepts ?? draft.concepts ?? []);
const bank = Array.isArray(draft.bank) ? draft.bank : [];
if (!bank.length) problems.push("bank is empty");

const prompts = new Set();
bank.forEach((q, i) => {
  const at = `bank[${i}]`;
  if (!["core", "reserve"].includes(q.tier)) problems.push(`${at}: tier must be core or reserve`);
  if (!["mcq", "short"].includes(q.kind)) problems.push(`${at}: kind must be mcq or short`);
  if (typeof q.prompt !== "string" || q.prompt.length < 20) problems.push(`${at}: prompt is missing or too short`);
  if (prompts.has(q.prompt)) problems.push(`${at}: duplicate prompt`);
  prompts.add(q.prompt);
  if (typeof q.reference !== "string" || q.reference.length < 20) problems.push(`${at}: reference is missing or too short`);
  if (!concepts.has(q.concept)) problems.push(`${at}: concept "${q.concept}" is not one of the module's concepts`);
  if (![1, 2, 3].includes(q.difficulty)) problems.push(`${at}: difficulty must be 1, 2 or 3`);
  if (typeof q.source_url !== "string" || !/^https:\/\/[^\s]+$/.test(q.source_url)) problems.push(`${at}: source_url must be an https URL`);
  const text = `${q.prompt} ${q.reference} ${(q.options ?? []).join(" ")}`;
  if (/\$|\\\(|\*\*|`/.test(text)) problems.push(`${at}: plain text only (no $, LaTeX, Markdown or backticks)`);
  if (/\b(option|answer|choice) [A-D1-4]\b|\([a-d]\)/i.test(`${q.prompt} ${q.reference}`)) problems.push(`${at}: don't refer to option letters or numbers`);
  if (q.kind === "mcq") {
    if (!Array.isArray(q.options) || q.options.length !== 4) problems.push(`${at}: mcq needs exactly 4 options`);
    else {
      if (new Set(q.options.map((o) => o.trim().toLowerCase())).size !== 4) problems.push(`${at}: options must be distinct`);
      if (q.options.some((o) => /all of the above|none of the above/i.test(o))) problems.push(`${at}: no "all/none of the above"`);
    }
    if (!Number.isInteger(q.correct_index) || q.correct_index < 0 || q.correct_index > 3) problems.push(`${at}: correct_index must be 0 to 3`);
  } else if (q.options != null && q.options.length) problems.push(`${at}: short answers have options: null`);
});

const count = (f) => bank.filter(f).length;
const core = bank.filter((q) => q.tier === "core");
if (core.length !== 7) problems.push(`core tier has ${core.length} questions; it needs exactly 7`);
if (count((q) => q.tier === "core" && q.kind === "short") !== 2) problems.push("core tier needs exactly 2 short answers");
for (const c of concepts) {
  if (!core.some((q) => q.concept === c)) problems.push(`core tier has no question on "${c}"`);
  const reserve = count((q) => q.tier === "reserve" && q.concept === c);
  if (reserve < 3) problems.push(`only ${reserve} reserve questions on "${c}"; aim for 5 or more`);
}
if (bank.length < 30) problems.push(`${bank.length} questions; the module needs 30`);
const hard = count((q) => q.difficulty === 3) / (bank.length || 1);
if (hard < 0.3) problems.push(`only ${Math.round(hard * 100)}% at difficulty 3; aim for about 40%`);
const keys = [0, 1, 2, 3].map((k) => count((q) => q.kind === "mcq" && q.correct_index === k));
if (Math.max(...keys) > 0.5 * keys.reduce((a, b) => a + b, 0)) problems.push(`correct_index is lopsided (${keys.join("/")}); options are shuffled at use, but spread them anyway`);

// A learner shouldn't be able to pass by picking the longest or most detailed option.
const mcqs = bank.filter((q) => q.kind === "mcq" && Array.isArray(q.options) && q.options.length === 4);
const longest = mcqs.filter((q) => q.options[q.correct_index]?.length === Math.max(...q.options.map((o) => o.length))).length;
if (mcqs.length && longest / mcqs.length > 0.35) {
  problems.push(
    `the correct option is the longest in ${longest} of ${mcqs.length} mcqs; keep it to about a quarter. ` +
      "Make distractors as specific and detailed as the key (same length, same kind of qualifiers), or trim the key.",
  );
}
const listed = mcqs
  .filter((q) => {
    const key = q.options[q.correct_index]?.length ?? 0;
    const others = q.options.filter((_, k) => k !== q.correct_index).map((o) => o.length);
    return key > 1.3 * Math.max(...others);
  })
  .map((q) => bank.indexOf(q));
if (listed.length) problems.push(`key is over 30% longer than every distractor in bank[${listed.join("], bank[")}]`);

if (problems.length) {
  console.log(`${file}: ${problems.length} problem(s)`);
  for (const p of problems) console.log(`  - ${p}`);
  process.exit(1);
}
console.log(`${file}: OK. ${bank.length} questions (${core.length} core), ${count((q) => q.kind === "short")} short, ${Math.round(hard * 100)}% hard.`);
