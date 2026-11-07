// Builds the course library with Claude through the Message Batches API (half price).
//
//   set -a; source .env; set +a
//   node --experimental-strip-types scripts/catalog/generate.mjs run [--cap 150] [--only slug,slug] [--stage outline|bank|verify]
//   node --experimental-strip-types scripts/catalog/generate.mjs status
//
// Three stages, each one batch: outline every course, write a question bank per module, then have a
// second pass review every bank for wrong answer keys and unclear questions. Everything is resumable:
// results land in catalog/courses/<slug>.json and a rerun only does what is missing.
//
// Spend: every result's usage goes into catalog/.state/ledger.jsonl. Before a batch is sent, its
// worst case (every request using all of max_tokens) is added to what has been spent, and requests
// are dropped from the batch until that fits under --cap. So the cap can't be crossed.
import Anthropic from "@anthropic-ai/sdk";
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sanitizeSvg } from "../../src/figure.ts";

const MODEL = "claude-opus-5-5";
// Claude Opus 5.5 per million tokens, at the 50% batch discount.
const PRICE = { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2.5 };
const ROOT = new URL("../../", import.meta.url).pathname;
const COURSES = join(ROOT, "catalog/courses");
const STATE = join(ROOT, "catalog/.state");
const LEDGER = join(STATE, "ledger.jsonl");
const BATCHES = join(STATE, "batches.json");
const TOPICS = JSON.parse(readFileSync(join(ROOT, "scripts/catalog/topics.json"), "utf8"));
const TRACK_TITLES = {
  "ai-engineering": "AI engineering", kubernetes: "Kubernetes", inference: "Inference engineering",
  identity: "Identity and integrations", security: "Cybersecurity", robotics: "Robotics and hardware",
};

const BANK_SIZE = 16;
const EXPAND_SIZE = 8;
const STAGES = {
  outline: { maxTokens: 12_000, effort: "medium" },
  bank: { maxTokens: 28_000, effort: "medium" },
  verify: { maxTokens: 8_000, effort: "high" },
  expand: { maxTokens: 16_000, effort: "medium" },
  "verify-expand": { maxTokens: 6_000, effort: "high" },
};
// What reviewing a module's new questions can cost at most. A bank or expansion is only sent if its review fits too.
const REVIEW_RESERVE = { bank: (8_000 * PRICE.output + 14_000 * PRICE.input) / 1e6, expand: (6_000 * PRICE.output + 8_000 * PRICE.input) / 1e6 };

mkdirSync(COURSES, { recursive: true });
mkdirSync(STATE, { recursive: true });

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const command = args[0] ?? "status";
const CAP = Number(flag("cap", "150"));
const ONLY = flag("only", "")?.split(",").filter(Boolean);
const ONLY_STAGE = flag("stage", "");

/* Spend */
const ledger = () => (existsSync(LEDGER) ? readFileSync(LEDGER, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
const costOf = (u) =>
  ((u.input_tokens ?? 0) * PRICE.input + (u.output_tokens ?? 0) * PRICE.output +
    (u.cache_read_input_tokens ?? 0) * PRICE.cacheRead + (u.cache_creation_input_tokens ?? 0) * PRICE.cacheWrite) / 1e6;
const spent = () => ledger().reduce((sum, row) => sum + row.cost, 0);
const money = (n) => `$${n.toFixed(2)}`;

function status() {
  const rows = ledger();
  const by = {};
  for (const r of rows) {
    const s = (by[r.stage] ??= { requests: 0, cost: 0, output: 0, input: 0 });
    s.requests++; s.cost += r.cost; s.output += r.output_tokens; s.input += r.input_tokens;
  }
  console.log(`Spent ${money(spent())} of the ${money(CAP)} cap (${rows.length} requests).`);
  for (const [stage, s] of Object.entries(by)) {
    console.log(`  ${stage.padEnd(8)} ${String(s.requests).padStart(4)} requests  ${money(s.cost).padStart(8)}  avg ${Math.round(s.output / s.requests)} output / ${Math.round(s.input / s.requests)} input tokens`);
  }
  const courses = loadAll();
  const modules = courses.flatMap((c) => c.modules ?? []);
  const questions = modules.reduce((n, m) => n + (m.bank?.length ?? 0), 0);
  const figures = modules.reduce((n, m) => n + (m.bank?.filter((q) => q.figure).length ?? 0), 0);
  console.log(`Library: ${courses.filter((c) => c.outline).length}/${allTopics().length} outlined, ` +
    `${modules.filter((m) => m.bank).length}/${modules.length} modules banked, ${modules.filter((m) => m.verified).length} verified, ${modules.filter((m) => m.expanded).length} expanded, ` +
    `${questions} questions (${figures} with figures).`);
}

/* Course files */
const allTopics = () =>
  Object.entries(TOPICS).flatMap(([track, list]) => list.map(([slug, level, brief], position) => ({ slug, track, level, brief, position })));
const pathFor = (slug) => join(COURSES, `${slug}.json`);
const load = (topic) => (existsSync(pathFor(topic.slug)) ? JSON.parse(readFileSync(pathFor(topic.slug), "utf8")) : { ...topic });
const save = (course) => writeFileSync(pathFor(course.slug), JSON.stringify(course, null, 2) + "\n");
const loadAll = () => allTopics().map(load);
const selected = () => allTopics().filter((t) => !ONLY?.length || ONLY.includes(t.slug)).map(load);

/* Prompts */
const OUTLINE_SYSTEM = `You plan short, practical courses for engineers and curious beginners. Pitch each course at its level: intro courses assume no background in the field and define every term; advanced ones assume working experience. A course is taught entirely through questions: each module has a bank of multiple-choice and short-answer questions, and the learner moves on once they show they know every subtopic.

Plan one course from the brief. Return:
- title: 2 to 6 plain words, sentence case.
- summary: one or two sentences addressed to the learner as "you", saying what they will be able to do.
- prompt: the learner goal in first person, like "I want to understand X so that I can Y."
- tags: 8 to 14 lowercase search keywords, including acronyms, product names and synonyms someone would type.
- modules: 5 or 6 modules that build on each other, from foundations to applying the ideas under realistic constraints. Each has a short title (no numbering), a one-sentence objective, and 3 to 5 concepts: short lowercase subtopic names, each a distinct thing a learner can get right or wrong.

Keep it current as of 2026, practical over academic, and distinct from the sibling courses listed, which the learner can take separately.`;

const BANK_INTRO = `You write the question bank for one module of a short course. The course is taught entirely through questions, and an adaptive agent draws on your bank: the core questions are the module's first round, and reserve questions are follow-ups aimed at whichever subtopics the learner got wrong. Pitch every question at the course level: intro courses are for complete beginners, so use plain words, explain any term the question depends on, and test intuition rather than jargon.`;

const BANK_SHAPE = `Write exactly ${BANK_SIZE} questions.
- tier "core": 7 questions that together cover every concept at least once. A learner who gets all of them right has met the objective.
- tier "reserve": 9 questions, at least 2 per concept, each approaching an idea from a different angle than the core ones: a realistic scenario, a debugging case, an estimate, a trade-off, a comparison.
- kinds: about 11 "mcq" and 5 "short", with at least 2 short in each tier.`;

const EXPAND_SHAPE = `The module already has the questions listed in existing_questions. Write exactly ${EXPAND_SIZE} new ones, all tier "reserve", for follow-ups.
- Cover every concept at least once, giving more to the concepts with the fewest existing questions.
- Each must test something no existing question tests, or come at an idea from a clearly different angle: a new scenario, a failure to debug, an estimate, a design trade-off, a comparison. Never rephrase an existing question.
- kinds: 5 or 6 "mcq" and 2 or 3 "short". Include 1 or 2 figures if the topic has something visual.`;

const BANK_RULES = `
- difficulty: 1 (checks the idea), 2 (applies it), 3 (combines ideas or reasons through a realistic case).
- concept: one of the module's concepts, exactly as given.

mcq: exactly 4 options of similar length and style. Distractors are mistakes practitioners actually make, never jokes or obviously wrong options. Exactly one option is defensibly correct; correct_index is its 0-based index. Options are shuffled later, so nothing may refer to an option by letter or position, and avoid "all of the above" or "none of the above". reference explains in 1 to 3 sentences why the right answer is right and the key misconception behind the most tempting wrong one.
short: options is empty and correct_index is -1. It must be answerable in 1 to 3 sentences of plain words. Never ask the learner to type a formula, code or an exact number; ask them to explain, predict, diagnose or choose and justify. reference is a model answer that names the essential points a grader should look for.

Writing: plain text with no markdown, sentence case, prompts under 70 words. Test understanding and application, not recall of names or flags. Prefer concrete situations ("Your p99 TTFT doubles after...") over abstract definitions. Every question tests something different.

Formulas: where practitioners actually reason with a formula (memory math, throughput, queueing, scoring), write it in LaTeX inside \\( \\) for inline or \\[ \\] for display. Never use $ as a delimiter, because $ means dollars here. Plain numbers and units need no LaTeX.

Figures: 3 to 5 questions of a full bank include a diagram (fewer when adding to a bank), and only where the question is about something visual: an architecture, a request path, a scheduling layout, a timeline, a plot such as latency against batch size, a matrix. The prompt must refer to the diagram, and the diagram must be needed or clearly helpful, without giving away the answer. For every other question, figure and figure_alt are empty strings.
A figure is a complete <svg> element:
- viewBox="0 0 640 H" with H between 200 and 420. First child: a full-size rect with fill #FBFBFB.
- Only these elements: g, defs, marker, rect, circle, ellipse, line, polyline, polygon, path, text, tspan. No style elements, CSS, class, images, gradients, filters, foreignObject, scripts or links.
- Flat colours only from: #141414 (text, lines, outlines), #E65F2B, #F5D556, #469B5B, #5889F7, #904CF6, #E7A0EA (shape fills, with #141414 text on them), #FBFBFB.
- Text uses font-family="Inter Tight, Arial, sans-serif", font-size 14 to 18, and stays inside the viewBox with margins. Boxes have rounded corners (rx 8 to 14). Arrows use a marker defined in defs.
- Under 6000 characters.
- Write every attribute value in single quotes, like <rect x='10' y='20'/>, never double quotes. The figure sits inside a JSON string, and a double quote there ends the string and cuts the figure off.
figure_alt is one sentence describing what the diagram shows, without the answer.

Accuracy matters more than anything: these are graded automatically against your key. Avoid facts that change between versions unless you name the version, and anything you are not sure of.`;
const BANK_SYSTEM = `${BANK_INTRO}\n\n${BANK_SHAPE}\n${BANK_RULES}`;
const EXPAND_SYSTEM = `${BANK_INTRO}\n\n${EXPAND_SHAPE}\n${BANK_RULES}`;

const VERIFY_SYSTEM = `You are a senior practitioner reviewing a question bank before learners see it. Answers are graded automatically against the key, so a wrong key teaches people something false.

Check every question:
- mcq: is the marked option correct and the only defensible answer? Is any distractor arguably also correct? Is the reference accurate?
- short: is the reference accurate and complete enough to grade against? Can it be answered in 1 to 3 sentences without typing a formula or code?
- Is the prompt clear and unambiguous, and current as of 2026?
- If there is a figure (SVG source given), does it match the prompt, is its text legible and inside the canvas, and does it avoid giving away the answer?
- Formulas must use \\( \\) or \\[ \\] delimiters, never $.

Return only the questions that need a change, by index. Use "fix" when you can make it right: give the replacement prompt, options (all 4, same order, or an empty list to keep them), correct_index (-1 to keep it) and reference, using empty strings for fields you keep. Use "drop" when it can't be saved, including any figure that is broken or gives the answer away. Leave good questions out of the list. Be decisive but don't rewrite things that are already correct.`;

const outlineSchema = {
  type: "object",
  properties: {
    title: { type: "string" },
    summary: { type: "string" },
    prompt: { type: "string" },
    tags: { type: "array", items: { type: "string" } },
    modules: {
      type: "array",
      items: {
        type: "object",
        properties: { title: { type: "string" }, objective: { type: "string" }, concepts: { type: "array", items: { type: "string" } } },
        required: ["title", "objective", "concepts"],
        additionalProperties: false,
      },
    },
  },
  required: ["title", "summary", "prompt", "tags", "modules"],
  additionalProperties: false,
};

const bankSchema = (concepts) => ({
  type: "object",
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          tier: { type: "string", enum: ["core", "reserve"] },
          kind: { type: "string", enum: ["mcq", "short"] },
          difficulty: { type: "integer", enum: [1, 2, 3] },
          concept: { type: "string", enum: concepts },
          prompt: { type: "string" },
          options: { type: "array", items: { type: "string" } },
          correct_index: { type: "integer" },
          reference: { type: "string" },
          figure: { type: "string" },
          figure_alt: { type: "string" },
        },
        required: ["tier", "kind", "difficulty", "concept", "prompt", "options", "correct_index", "reference", "figure", "figure_alt"],
        additionalProperties: false,
      },
    },
  },
  required: ["questions"],
  additionalProperties: false,
});

const verifySchema = {
  type: "object",
  properties: {
    reviews: {
      type: "array",
      items: {
        type: "object",
        properties: {
          index: { type: "integer" },
          action: { type: "string", enum: ["fix", "drop"] },
          prompt: { type: "string" },
          options: { type: "array", items: { type: "string" } },
          correct_index: { type: "integer" },
          reference: { type: "string" },
          note: { type: "string" },
        },
        required: ["index", "action", "prompt", "options", "correct_index", "reference", "note"],
        additionalProperties: false,
      },
    },
  },
  required: ["reviews"],
  additionalProperties: false,
};

const params = (stage, system, user, schema) => ({
  model: MODEL,
  max_tokens: STAGES[stage].maxTokens,
  output_config: { effort: STAGES[stage].effort, format: { type: "json_schema", schema } },
  system,
  messages: [{ role: "user", content: user }],
});

/* Work for each stage */
function outlineWork(courses) {
  return courses.filter((c) => !c.outline).map((c) => {
    const siblings = allTopics().filter((t) => t.track === c.track && t.slug !== c.slug).map((t) => t.brief);
    return {
      id: `outline--${c.slug}`,
      params: params("outline", OUTLINE_SYSTEM, JSON.stringify({ track: TRACK_TITLES[c.track], level: c.level, brief: c.brief, sibling_courses: siblings }), outlineSchema),
      apply(result) {
        const course = load(c);
        const modules = result.modules.slice(0, 6).map((m) => ({
          title: m.title.trim(), objective: m.objective.trim(),
          concepts: [...new Set(m.concepts.map((x) => x.trim().toLowerCase()).filter(Boolean))].slice(0, 5),
        }));
        if (modules.length < 4 || modules.some((m) => m.concepts.length < 2)) throw new Error("outline too thin");
        course.outline = { title: result.title.trim(), summary: result.summary.trim(), prompt: result.prompt.trim(), tags: [...new Set(result.tags.map((t) => t.trim().toLowerCase()))].slice(0, 16) };
        course.modules = modules;
        save(course);
      },
    };
  });
}

function bankWork(courses) {
  return courses.filter((c) => c.outline).flatMap((c) =>
    c.modules.map((m, i) => ({ m, i })).filter(({ m }) => !m.bank).map(({ m, i }) => ({
      id: `bank--${c.slug}--${i}`,
      reserve: REVIEW_RESERVE.bank,
      params: params("bank", BANK_SYSTEM, JSON.stringify({
        course: c.outline.title, track: TRACK_TITLES[c.track], level: c.level, learner_goal: c.outline.prompt,
        all_modules: c.modules.map((x) => x.title), module: { title: m.title, objective: m.objective, concepts: m.concepts },
      }), bankSchema(m.concepts)),
      apply(result) {
        const course = load(c);
        const bank = cleanBank(result.questions, course.modules[i].concepts);
        if (bank.length < 10) throw new Error(`only ${bank.length} usable questions`);
        course.modules[i].bank = bank;
        delete course.modules[i].verified;
        save(course);
      },
    })),
  );
}

function verifyWork(courses) {
  return courses.filter((c) => c.outline).flatMap((c) =>
    c.modules.map((m, i) => ({ m, i })).filter(({ m }) => m.bank && !m.verified).map(({ m, i }) => ({
      id: `verify--${c.slug}--${i}`,
      params: params("verify", VERIFY_SYSTEM, JSON.stringify({
        course: c.outline.title, level: c.level, module: { title: m.title, objective: m.objective, concepts: m.concepts },
        questions: m.bank.map((q, index) => ({ index, ...q })),
      }), verifySchema),
      apply(result) {
        const course = load(c);
        const module = course.modules[i];
        const { bank, fixed, dropped } = applyReview(module.bank, result.reviews, module.concepts);
        module.bank = bank;
        module.verified = { fixed, dropped, at: new Date().toISOString() };
        save(course);
      },
    })),
  );
}

/**
 * Expansions add follow-up questions to modules that are already live. Work is ordered round-robin
 * (module 0 of every course, then module 1...) so a budget cut spreads across courses instead of
 * filling a few.
 */
function expandWork(courses) {
  const items = courses.filter((c) => c.outline).flatMap((c) =>
    c.modules.map((m, i) => ({ c, m, i })).filter(({ m }) => m.verified && m.bank && !m.expanded && !m.pending),
  );
  items.sort((a, b) => a.i - b.i || a.c.track.localeCompare(b.c.track) || a.c.position - b.c.position);
  return items.map(({ c, m, i }) => ({
    id: `expand--${c.slug}--${i}`,
    reserve: REVIEW_RESERVE.expand,
    params: params("expand", EXPAND_SYSTEM, JSON.stringify({
      course: c.outline.title, track: TRACK_TITLES[c.track], level: c.level, learner_goal: c.outline.prompt,
      module: { title: m.title, objective: m.objective, concepts: m.concepts },
      existing_questions: m.bank.map((q) => ({ concept: q.concept, kind: q.kind, prompt: q.prompt })),
    }), bankSchema(m.concepts)),
    apply(result) {
      const course = load(c);
      const module = course.modules[i];
      const known = new Set(module.bank.map((q) => q.prompt));
      const added = cleanBank(result.questions, module.concepts).filter((q) => !known.has(q.prompt)).map((q) => ({ ...q, tier: "reserve" }));
      if (added.length < 4) throw new Error(`only ${added.length} usable new questions`);
      module.pending = added;
      save(course);
    },
  }));
}

function verifyExpandWork(courses) {
  return courses.filter((c) => c.outline).flatMap((c) =>
    c.modules.map((m, i) => ({ m, i })).filter(({ m }) => m.pending?.length).map(({ m, i }) => ({
      id: `vexpand--${c.slug}--${i}`,
      params: params("verify-expand", VERIFY_SYSTEM, JSON.stringify({
        course: c.outline.title, level: c.level, module: { title: m.title, objective: m.objective, concepts: m.concepts },
        questions: m.pending.map((q, index) => ({ index, ...q })),
      }), verifySchema),
      apply(result) {
        const course = load(c);
        const module = course.modules[i];
        const { bank, fixed, dropped } = applyReview(module.pending, result.reviews, module.concepts);
        module.bank = [...module.bank, ...bank.map((q) => ({ ...q, tier: "reserve" }))];
        module.expanded = { added: bank.length, fixed, dropped, at: new Date().toISOString() };
        delete module.pending;
        save(course);
      },
    })),
  );
}

/* Cleaning */
// "chart" is left out on purpose: Helm charts are everywhere in the Kubernetes track.
const mentionsFigure = (text) => /\b(diagram|figure(?! out)|plot shown|the plot|graph shown|shown below|shown above|pictured)\b/i.test(text);

function cleanQuestion(q, concepts) {
  const concept = q.concept.trim().toLowerCase();
  if (!concepts.includes(concept) || !q.prompt.trim() || !q.reference.trim()) return null;
  // Dollar-delimited LaTeX slipped through; the client would show it raw. Plain prices like $2 are fine.
  if (/\$\$|\$\\[a-zA-Z]/.test([q.prompt, q.reference, ...(q.options ?? [])].join(" "))) return null;
  const out = {
    tier: q.tier, kind: q.kind, difficulty: q.difficulty, concept, prompt: q.prompt.trim(), reference: q.reference.trim(),
    options: null, correct_index: null, figure: null, figure_alt: null,
  };
  if (q.kind === "mcq") {
    const options = q.options.map((o) => o.trim());
    if (options.length !== 4 || new Set(options).size !== 4 || options.some((o) => !o)) return null;
    if (!Number.isInteger(q.correct_index) || q.correct_index < 0 || q.correct_index > 3) return null;
    out.options = options;
    out.correct_index = q.correct_index;
  }
  if (q.figure?.trim()) {
    out.figure = sanitizeSvg(q.figure);
    out.figure_alt = out.figure ? q.figure_alt.trim() || null : null;
  }
  // A question that talks about a diagram it doesn't have can't be answered.
  if (!out.figure && mentionsFigure(out.prompt)) return null;
  return out;
}

function cleanBank(questions, concepts) {
  const seen = new Set();
  const bank = [];
  for (const q of questions) {
    const clean = cleanQuestion(q, concepts);
    if (!clean || seen.has(clean.prompt)) continue;
    seen.add(clean.prompt);
    bank.push(clean);
  }
  return balanceTiers(bank, concepts);
}

/** Every concept needs a core question. Promote a reserve one where a core question was lost. */
function balanceTiers(bank, concepts) {
  for (const concept of concepts) {
    if (bank.some((q) => q.tier === "core" && q.concept === concept)) continue;
    const reserve = bank.find((q) => q.tier === "reserve" && q.concept === concept);
    if (reserve) reserve.tier = "core";
  }
  return bank;
}

function applyReview(bank, reviews, concepts) {
  let fixed = 0;
  let dropped = 0;
  const byIndex = new Map(reviews.map((r) => [r.index, r]));
  const out = [];
  bank.forEach((q, index) => {
    const review = byIndex.get(index);
    if (!review) return out.push(q);
    if (review.action === "drop") return dropped++;
    const candidate = {
      ...q,
      prompt: review.prompt.trim() || q.prompt,
      reference: review.reference.trim() || q.reference,
      options: q.kind === "mcq" ? (review.options.length === 4 ? review.options : q.options) : [],
      correct_index: q.kind === "mcq" ? (review.correct_index >= 0 ? review.correct_index : q.correct_index) : -1,
      figure: q.figure ?? "",
      figure_alt: q.figure_alt ?? "",
    };
    const clean = cleanQuestion(candidate, concepts);
    if (clean) {
      fixed++;
      out.push(clean);
    } else dropped++;
  });
  return { bank: balanceTiers(out, concepts), fixed, dropped };
}

/* Batches */
const readBatches = () => (existsSync(BATCHES) ? JSON.parse(readFileSync(BATCHES, "utf8")) : {});
const writeBatches = (b) => writeFileSync(BATCHES, JSON.stringify(b, null, 2) + "\n");
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const worstCase = (p) => (JSON.stringify(p).length / 3 * PRICE.input + p.max_tokens * PRICE.output) / 1e6;

async function runStage(client, stage, work) {
  const batches = readBatches();
  const pending = batches[stage];
  const byId = new Map(work.map((w) => [w.id, w]));

  let batchId = pending?.id;
  if (!batchId) {
    if (!work.length) return console.log(`[${stage}] nothing to do.`);
    const room = CAP - spent();
    const chosen = [];
    let worst = 0;
    // Money already promised to reviews of earlier stages' output, still to be sent.
    for (const w of work) {
      const cost = worstCase(w.params) + (w.reserve ?? 0);
      if (worst + cost > room) break;
      chosen.push(w);
      worst += cost;
    }
    if (!chosen.length) {
      console.log(`[${stage}] stopping: ${money(spent())} spent, and even one more request could pass the ${money(CAP)} cap.`);
      return false;
    }
    if (chosen.length < work.length) console.log(`[${stage}] the cap allows ${chosen.length} of ${work.length} requests this run.`);
    const batch = await client.messages.batches.create({ requests: chosen.map((w) => ({ custom_id: w.id, params: w.params })) });
    batchId = batch.id;
    batches[stage] = { id: batchId, ids: chosen.map((w) => w.id), created: new Date().toISOString(), worst };
    writeBatches(batches);
    console.log(`[${stage}] sent ${chosen.length} requests as ${batchId}. Worst case ${money(worst)}, spent so far ${money(spent())}.`);
  } else {
    console.log(`[${stage}] resuming ${batchId}.`);
  }

  const started = Date.now();
  let batch;
  while (true) {
    batch = await client.messages.batches.retrieve(batchId);
    const c = batch.request_counts;
    console.log(`[${stage}] ${batch.processing_status}: ${c.succeeded} done, ${c.processing} running, ${c.errored} errored (${Math.round((Date.now() - started) / 60000)} min)`);
    if (batch.processing_status === "ended") break;
    await pause(30_000);
  }

  let ok = 0;
  let failed = 0;
  let cost = 0;
  for await (const result of await client.messages.batches.results(batchId)) {
    if (result.result.type !== "succeeded") {
      failed++;
      console.log(`  ${result.custom_id}: ${result.result.type}`);
      continue;
    }
    const message = result.result.message;
    const row = { at: new Date().toISOString(), stage, id: result.custom_id, ...message.usage, cost: costOf(message.usage), stop: message.stop_reason };
    appendFileSync(LEDGER, JSON.stringify({
      at: row.at, stage, id: row.id, input_tokens: row.input_tokens ?? 0, output_tokens: row.output_tokens ?? 0,
      cache_read_input_tokens: row.cache_read_input_tokens ?? 0, cache_creation_input_tokens: row.cache_creation_input_tokens ?? 0,
      cost: row.cost, stop: row.stop,
    }) + "\n");
    cost += row.cost;
    try {
      if (message.stop_reason !== "end_turn") throw new Error(`stopped with ${message.stop_reason}`);
      const text = message.content.find((b) => b.type === "text")?.text;
      const item = byId.get(result.custom_id);
      if (!item) throw new Error("no longer needed");
      item.apply(JSON.parse(text));
      ok++;
    } catch (error) {
      failed++;
      console.log(`  ${result.custom_id}: ${error.message}`);
    }
  }
  delete batches[stage];
  writeBatches(batches);
  console.log(`[${stage}] ${ok} applied, ${failed} to retry. This batch cost ${money(cost)}; total ${money(spent())} of ${money(CAP)}.`);
  return true;
}

async function run() {
  const client = new Anthropic();
  const stages = [
    ["outline", () => outlineWork(selected())],
    ["bank", () => bankWork(selected())],
    ["verify", () => verifyWork(selected())],
    ["expand", () => expandWork(selected())],
    ["verify-expand", () => verifyExpandWork(selected())],
  ];
  for (const [stage, work] of stages) {
    if (ONLY_STAGE && ONLY_STAGE !== stage) continue;
    // A stage the cap stops still lets later stages run: reviews were budgeted when their input was sent.
    await runStage(client, stage, work());
  }
  status();
}

if (command === "run") await run();
else status();
