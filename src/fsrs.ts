// FSRS-5, the spaced-repetition scheduler, with its published default weights.
// Each recall item keeps two numbers: stability (the gap, in days, after which recall drops to 90%)
// and difficulty (1 to 10). A review moves both, depending on the grade and on how long it really was
// since the last one, so late and early reviews are handled without special cases.

/** 1 again (a miss), 2 hard (partly right), 3 good (right). FSRS's "easy" is not used: the grade comes from the answer. */
export type Grade = 1 | 2 | 3;
export type Memory = { stability: number; difficulty: number };

const W = [0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192, 1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621] as const;
const DECAY = -0.5;
const FACTOR = 19 / 81;
const RETENTION = 0.9;
export const MIN_DAYS = 1;
export const MAX_DAYS = 180;

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
const firstDifficulty = (grade: number) => W[4] - Math.exp(W[5] * (grade - 1)) + 1;

/** The chance the learner still recalls it, `days` after the last review. */
export const retrievability = (days: number, stability: number) => (1 + (FACTOR * Math.max(0, days)) / stability) ** DECAY;

/** Memory after the first time the learner meets an idea. */
export function first(grade: Grade): Memory {
  return { stability: W[grade - 1]!, difficulty: clamp(firstDifficulty(grade), 1, 10) };
}

/** Memory after a review, `days` after the last one. */
export function review(memory: Memory, grade: Grade, days: number): Memory {
  const { stability: s, difficulty: d } = memory;
  // Difficulty moves toward 10 on a miss, less so the harder it already is, then drifts back to the default.
  const moved = d - W[6] * (grade - 3) * ((10 - d) / 9);
  const difficulty = clamp(W[7] * firstDifficulty(4) + (1 - W[7]) * moved, 1, 10);

  let stability: number;
  if (days < 1) {
    // A second look on the same day says little about long-term memory.
    stability = s * Math.exp(W[17] * (grade - 3 + W[18]));
  } else {
    const r = retrievability(days, s);
    stability = grade === 1
      ? Math.min(s, W[11] * d ** -W[12] * ((s + 1) ** W[13] - 1) * Math.exp(W[14] * (1 - r)))
      : s * (1 + Math.exp(W[8]) * (11 - d) * s ** -W[9] * (Math.exp(W[10] * (1 - r)) - 1) * (grade === 2 ? W[15] : 1));
  }
  return { stability: clamp(stability, 0.01, 36_500), difficulty };
}

/** Whole days until recall is expected to drop to 90%, kept between 1 and 180. */
export function intervalDays(stability: number) {
  return clamp(Math.round((stability / FACTOR) * (RETENTION ** (1 / DECAY) - 1)), MIN_DAYS, MAX_DAYS);
}
