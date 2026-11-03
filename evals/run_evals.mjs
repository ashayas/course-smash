import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EvalShardSchema } from "./schema.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHARDS_DIR = path.join(__dirname, "shards");
const DATASET_DIR = path.join(__dirname, "dataset");

const EXPECTED_SHARDS = [
  "shard_1_systems_cloud.json",
  "shard_2_bio_lifesci.json",
  "shard_3_ai_ml.json",
  "shard_4_math_algos.json",
  "shard_5_adversarial_edge.json",
];

/**
 * Local, zero-API-call reference evaluators to test the synthetic eval harness:
 * 1. evaluateCourseQualityLocal: Heuristic / structural course evaluator
 * 2. evaluateQuestionQualityLocal: Heuristic / structural question evaluator
 * 3. gradeSubmissionClefLocal: Goal-conditioned JEV/Clef-style local decision grader
 */

function tokenize(text) {
  return (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9_+-\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function overlapRatio(targetWords, candidateText) {
  if (!targetWords.length) return 0;
  const candidateSet = new Set(tokenize(candidateText));
  let hits = 0;
  for (const w of targetWords) {
    if (candidateSet.has(w)) hits++;
  }
  return hits / targetWords.length;
}

export function evaluateCourseQualityLocal(item) {
  const { user_context, candidate_course } = item;
  const modules = candidate_course.modules || [];

  // Check assessment mix: CourseSmash requires both multiple_choice and short_answer across the course
  const allQuestionTypes = new Set(modules.flatMap((m) => m.question_types_included || []));
  const hasBothQuestionTypes =
    allQuestionTypes.has("multiple_choice") && allQuestionTypes.has("short_answer");

  // Check module count and numbering progression
  const sequentialNumbering = modules.every((m, idx) => m.module_number === idx + 1);
  const sufficientModules = modules.length >= 2;

  // Check goal alignment via lexical/concept overlap between user goal/prompt and course modules
  const goalTokens = tokenize(
    `${user_context.prompt} ${user_context.what_user_wants_to_learn}`,
  ).filter(
    (w) =>
      ![
        "want",
        "learn",
        "how",
        "the",
        "and",
        "for",
        "with",
        "course",
        "build",
        "understand",
        "about",
        "from",
        "that",
        "this",
      ].includes(w),
  );
  const courseText = `${candidate_course.title} ${candidate_course.description} ${modules
    .map((m) => `${m.title} ${m.learning_objective} ${m.summary} ${m.sample_question_prompts.join(" ")}`)
    .join(" ")}`;
  const goalOverlap = overlapRatio(goalTokens, courseText);

  // Detect obvious red flags in candidate descriptions/titles/summaries
  const lowerCourseText = courseText.toLowerCase();
  const hasRedFlag =
    !hasBothQuestionTypes ||
    !sequentialNumbering ||
    !sufficientModules ||
    goalOverlap < 0.18 ||
    lowerCourseText.includes("unrelated") ||
    lowerCourseText.includes("trivia") ||
    lowerCourseText.includes("placeholder") ||
    lowerCourseText.includes("deprecated") ||
    lowerCourseText.includes("memorize random");

  return {
    predicted_is_good_course: !hasRedFlag,
    diagnostics: {
      hasBothQuestionTypes,
      sequentialNumbering,
      sufficientModules,
      goalOverlap: Number(goalOverlap.toFixed(3)),
    },
  };
}

export function evaluateQuestionQualityLocal(item) {
  const { candidate_question, user_context, module_context } = item;
  const isMC = candidate_question.question_type === "multiple_choice";
  const options = candidate_question.options || [];

  // Structural checks
  const validMCOptions = !isMC || (options.length >= 3 && new Set(options).size === options.length);
  const promptLengthOk = candidate_question.prompt.trim().length >= 25;

  // Check alignment with learning objective & user goal
  const objectiveTokens = tokenize(
    `${module_context.learning_objective} ${user_context.what_user_wants_to_learn}`,
  );
  const questionText = `${candidate_question.prompt} ${(candidate_question.options || []).join(" ")} ${candidate_question.correct_answer}`;
  const objectiveOverlap = overlapRatio(objectiveTokens, questionText);

  const gradingNotesLower = candidate_question.grading_notes.toLowerCase();
  const notesFlagDefect =
    gradingNotesLower.includes("flaw") ||
    gradingNotesLower.includes("bad question") ||
    gradingNotesLower.includes("ambiguous") ||
    gradingNotesLower.includes("wrong key") ||
    gradingNotesLower.includes("ignores prior") ||
    gradingNotesLower.includes("trivial") ||
    gradingNotesLower.includes("ungradable") ||
    gradingNotesLower.includes("misaligned") ||
    gradingNotesLower.includes("two correct") ||
    gradingNotesLower.includes("leaks");

  const predictedGood = validMCOptions && promptLengthOk && objectiveOverlap >= 0.12 && !notesFlagDefect;

  return {
    predicted_is_good_question: predictedGood,
    diagnostics: {
      validMCOptions,
      promptLengthOk,
      objectiveOverlap: Number(objectiveOverlap.toFixed(3)),
    },
  };
}

export function gradeSubmissionClefLocal(item) {
  const { user_profile, question, user_submission } = item;
  const answer = (user_submission.answer || "").trim();
  const lowerAnswer = answer.toLowerCase();

  // 1. Prompt injection / gaming detection
  if (
    lowerAnswer.includes("ignore previous instructions") ||
    lowerAnswer.includes("mark this answer correct") ||
    lowerAnswer.includes("system prompt") ||
    lowerAnswer.includes("override grade")
  ) {
    return {
      predicted_is_right: false,
      predicted_verdict: "incorrect",
      matched_ratio: 0,
      reason: "prompt_injection_detected",
    };
  }

  // 2. Multiple choice exact/prefix match + goal-alignment check
  if (question.question_type === "multiple_choice") {
    const ref = question.reference_answer.trim().toLowerCase();
    const sub = lowerAnswer;
    const exactOrOptionMatch =
      sub === ref ||
      (ref.length >= 2 && sub.startsWith(ref.slice(0, 2)) && /^[a-d][).:\s]/.test(ref)) ||
      (sub.length >= 2 && ref.startsWith(sub.slice(0, 2)) && /^[a-d][).:\s]/.test(sub));

    // Check required concepts match in submission
    const matchedConcepts = question.required_concepts_for_user_goal.filter((concept) => {
      const tokens = tokenize(concept);
      return overlapRatio(tokens, `${answer} ${exactOrOptionMatch ? question.reference_answer : ""}`) >= 0.4;
    });
    const ratio = matchedConcepts.length / Math.max(1, question.required_concepts_for_user_goal.length);

    const isRight = exactOrOptionMatch && ratio >= 0.5;
    return {
      predicted_is_right: isRight,
      predicted_verdict: isRight ? "correct" : ratio > 0.25 ? "partially_correct" : "incorrect",
      matched_ratio: Number(ratio.toFixed(3)),
    };
  }

  // 3. Short-answer goal-conditioned grading (JEV / Clef style)
  // Threshold depends on user's rigor_preference ("what they want to learn")
  const thresholds = {
    conceptual_intuition: 0.45,
    practical_applied: 0.65,
    rigorous_formal: 0.8,
  };
  const requiredThreshold = thresholds[user_profile.rigor_preference] ?? 0.65;

  const matchedConcepts = question.required_concepts_for_user_goal.filter((concept) => {
    const cTokens = tokenize(concept);
    return overlapRatio(cTokens, answer) >= 0.5;
  });

  const conceptRatio =
    matchedConcepts.length / Math.max(1, question.required_concepts_for_user_goal.length);

  const isRight = conceptRatio >= requiredThreshold;
  let verdict = "incorrect";
  if (isRight && conceptRatio >= requiredThreshold) {
    verdict = "correct";
  } else if (conceptRatio >= 0.3) {
    verdict = "partially_correct";
  }

  return {
    predicted_is_right: isRight,
    predicted_verdict: verdict,
    matched_ratio: Number(conceptRatio.toFixed(3)),
  };
}

function main() {
  fs.mkdirSync(DATASET_DIR, { recursive: true });

  const allCourseQuality = [];
  const allQuestionQuality = [];
  const allDecisionGrading = [];
  const shardSummaries = [];

  for (const filename of EXPECTED_SHARDS) {
    const filePath = path.join(SHARDS_DIR, filename);
    if (!fs.existsSync(filePath)) {
      console.error(`Missing shard file: ${filePath}`);
      process.exit(1);
    }
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const parsed = EvalShardSchema.parse(raw);

    allCourseQuality.push(...parsed.course_quality_evals);
    allQuestionQuality.push(...parsed.question_quality_evals);
    allDecisionGrading.push(...parsed.decision_grading_evals);

    shardSummaries.push({
      shard_id: parsed.shard_id,
      domain_focus: parsed.domain_focus,
      course_quality_count: parsed.course_quality_evals.length,
      question_quality_count: parsed.question_quality_evals.length,
      decision_grading_count: parsed.decision_grading_evals.length,
      total:
        parsed.course_quality_evals.length +
        parsed.question_quality_evals.length +
        parsed.decision_grading_evals.length,
    });
  }

  // Ensure all IDs are globally unique
  const seenIds = new Set();
  for (const item of [...allCourseQuality, ...allQuestionQuality, ...allDecisionGrading]) {
    if (seenIds.has(item.id)) {
      throw new Error(`Duplicate eval ID detected: ${item.id}`);
    }
    seenIds.add(item.id);
  }

  // Write JSONL and combined JSON files
  fs.writeFileSync(
    path.join(DATASET_DIR, "course_quality.jsonl"),
    allCourseQuality.map((x) => JSON.stringify(x)).join("\n") + "\n",
  );
  fs.writeFileSync(
    path.join(DATASET_DIR, "question_quality.jsonl"),
    allQuestionQuality.map((x) => JSON.stringify(x)).join("\n") + "\n",
  );
  fs.writeFileSync(
    path.join(DATASET_DIR, "decision_grading.jsonl"),
    allDecisionGrading.map((x) => JSON.stringify(x)).join("\n") + "\n",
  );

  // Run local zero-API harness evaluation
  let cqAgreement = 0;
  for (const item of allCourseQuality) {
    const res = evaluateCourseQualityLocal(item);
    if (res.predicted_is_good_course === item.expected.is_good_course) cqAgreement++;
  }

  let qqAgreement = 0;
  for (const item of allQuestionQuality) {
    const res = evaluateQuestionQualityLocal(item);
    if (res.predicted_is_good_question === item.expected.is_good_question) qqAgreement++;
  }

  let dgAgreement = 0;
  for (const item of allDecisionGrading) {
    const res = gradeSubmissionClefLocal(item);
    if (res.predicted_is_right === item.expected_decision.is_right) dgAgreement++;
  }

  const fullDataset = {
    metadata: {
      name: "CourseSmash Synthetic Evaluation Suite",
      version: "1.0.0",
      generated_at: new Date().toISOString(),
      external_api_calls_used: 0,
      subagents_used: 5,
      counts: {
        course_quality: allCourseQuality.length,
        question_quality: allQuestionQuality.length,
        decision_grading: allDecisionGrading.length,
        total_evals:
          allCourseQuality.length + allQuestionQuality.length + allDecisionGrading.length,
      },
      distributions: {
        course_quality: {
          good: allCourseQuality.filter((x) => x.expected.is_good_course).length,
          bad: allCourseQuality.filter((x) => !x.expected.is_good_course).length,
        },
        question_quality: {
          good: allQuestionQuality.filter((x) => x.expected.is_good_question).length,
          bad: allQuestionQuality.filter((x) => !x.expected.is_good_question).length,
          multiple_choice: allQuestionQuality.filter(
            (x) => x.candidate_question.question_type === "multiple_choice",
          ).length,
          short_answer: allQuestionQuality.filter(
            (x) => x.candidate_question.question_type === "short_answer",
          ).length,
        },
        decision_grading: {
          is_right_true: allDecisionGrading.filter((x) => x.expected_decision.is_right).length,
          is_right_false: allDecisionGrading.filter((x) => !x.expected_decision.is_right).length,
          verdict_correct: allDecisionGrading.filter(
            (x) => x.expected_decision.verdict === "correct",
          ).length,
          verdict_partially_correct: allDecisionGrading.filter(
            (x) => x.expected_decision.verdict === "partially_correct",
          ).length,
          verdict_incorrect: allDecisionGrading.filter(
            (x) => x.expected_decision.verdict === "incorrect",
          ).length,
          multiple_choice: allDecisionGrading.filter(
            (x) => x.question.question_type === "multiple_choice",
          ).length,
          short_answer: allDecisionGrading.filter(
            (x) => x.question.question_type === "short_answer",
          ).length,
        },
      },
      local_harness_baseline: {
        course_quality_accuracy: Number((cqAgreement / allCourseQuality.length).toFixed(4)),
        question_quality_accuracy: Number((qqAgreement / allQuestionQuality.length).toFixed(4)),
        decision_grading_accuracy: Number((dgAgreement / allDecisionGrading.length).toFixed(4)),
      },
      shards: shardSummaries,
    },
    course_quality_evals: allCourseQuality,
    question_quality_evals: allQuestionQuality,
    decision_grading_evals: allDecisionGrading,
  };

  fs.writeFileSync(
    path.join(DATASET_DIR, "full_eval_set.json"),
    JSON.stringify(fullDataset, null, 2) + "\n",
  );

  console.log(JSON.stringify(fullDataset.metadata, null, 2));
}

main();
