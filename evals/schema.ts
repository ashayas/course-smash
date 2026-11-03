import { z } from "zod";

export const CourseModuleSchema = z.object({
  module_number: z.number().int().positive(),
  title: z.string().min(1),
  learning_objective: z.string().min(1),
  summary: z.string().min(1),
  question_types_included: z.array(z.enum(["multiple_choice", "short_answer"])),
  sample_question_prompts: z.array(z.string()),
});

export const CourseQualityEvalSchema = z.object({
  id: z.string().min(1),
  eval_type: z.literal("course_quality"),
  domain: z.string().min(1),
  user_context: z.object({
    prompt: z.string().min(1),
    what_user_wants_to_learn: z.string().min(1),
    background_level: z.enum(["beginner", "intermediate", "advanced"]),
    time_budget_minutes: z.number().int().positive(),
  }),
  candidate_course: z.object({
    title: z.string().min(1),
    description: z.string().min(1),
    target_audience: z.string().min(1),
    modules: z.array(CourseModuleSchema).min(1),
  }),
  expected: z.object({
    is_good_course: z.boolean(),
    quality_score: z.number().int().min(1).max(5),
    rubric_breakdown: z.object({
      alignment_with_goal: z.number().int().min(1).max(5),
      pedagogical_progression: z.number().int().min(1).max(5),
      module_coherence: z.number().int().min(1).max(5),
      depth_and_accuracy: z.number().int().min(1).max(5),
      assessment_mix: z.number().int().min(1).max(5),
    }),
    failure_modes: z.array(z.string()),
    rationale: z.string().min(10),
  }),
});

export const QuestionQualityEvalSchema = z.object({
  id: z.string().min(1),
  eval_type: z.literal("question_quality"),
  domain: z.string().min(1),
  user_context: z.object({
    what_user_wants_to_learn: z.string().min(1),
    background_level: z.enum(["beginner", "intermediate", "advanced"]),
    prior_feedback_summary: z.string().min(1),
  }),
  module_context: z.object({
    course_title: z.string().min(1),
    module_title: z.string().min(1),
    learning_objective: z.string().min(1),
  }),
  candidate_question: z.object({
    question_type: z.enum(["multiple_choice", "short_answer"]),
    prompt: z.string().min(1),
    options: z.array(z.string()).optional(),
    correct_answer: z.string().min(1),
    grading_notes: z.string().min(1),
  }),
  expected: z.object({
    is_good_question: z.boolean(),
    quality_score: z.number().int().min(1).max(5),
    rubric_breakdown: z.object({
      clarity_and_unambiguity: z.number().int().min(1).max(5),
      alignment_with_user_goal: z.number().int().min(1).max(5),
      distractor_or_rubric_quality: z.number().int().min(1).max(5),
      adaptive_feedback_fit: z.number().int().min(1).max(5),
      difficulty_calibration: z.number().int().min(1).max(5),
    }),
    failure_modes: z.array(z.string()),
    rationale: z.string().min(10),
  }),
});

export const DecisionGradingEvalSchema = z.object({
  id: z.string().min(1),
  eval_type: z.literal("decision_grading"),
  domain: z.string().min(1),
  user_profile: z.object({
    what_user_wants_to_learn: z.string().min(1),
    background_level: z.enum(["beginner", "intermediate", "advanced"]),
    rigor_preference: z.enum(["conceptual_intuition", "practical_applied", "rigorous_formal"]),
  }),
  module_context: z.object({
    course_title: z.string().min(1),
    module_title: z.string().min(1),
    learning_objective: z.string().min(1),
  }),
  learner_state: z.object({
    attempt_number: z.number().int().positive(),
    recent_accuracy: z.number().min(0).max(1),
    prior_misconceptions: z.array(z.string()),
  }),
  question: z.object({
    question_type: z.enum(["multiple_choice", "short_answer"]),
    prompt: z.string().min(1),
    options: z.array(z.string()).optional(),
    reference_answer: z.string().min(1),
    required_concepts_for_user_goal: z.array(z.string()).min(1),
    grading_rubric: z.string().min(1),
  }),
  user_submission: z.object({
    answer: z.string(),
    response_time_seconds: z.number().nonnegative().optional(),
  }),
  expected_decision: z.object({
    is_right: z.boolean(),
    verdict: z.enum(["correct", "partially_correct", "incorrect"]),
    score: z.number().min(0).max(1),
    matched_concepts: z.array(z.string()),
    missed_concepts: z.array(z.string()),
    detected_misconception: z.string().nullable(),
    next_action: z.enum([
      "advance_to_next_module",
      "ask_followup_short_answer",
      "ask_remedial_multiple_choice",
      "ask_harder_challenge",
      "re_explain_concept",
    ]),
    feedback_focus: z.string().min(1),
    rationale: z.string().min(10),
  }),
});

export const EvalShardSchema = z.object({
  shard_id: z.string().min(1),
  domain_focus: z.string().min(1),
  course_quality_evals: z.array(CourseQualityEvalSchema),
  question_quality_evals: z.array(QuestionQualityEvalSchema),
  decision_grading_evals: z.array(DecisionGradingEvalSchema),
});

export type CourseQualityEval = z.infer<typeof CourseQualityEvalSchema>;
export type QuestionQualityEval = z.infer<typeof QuestionQualityEvalSchema>;
export type DecisionGradingEval = z.infer<typeof DecisionGradingEvalSchema>;
export type EvalShard = z.infer<typeof EvalShardSchema>;
