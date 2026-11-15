import assert from "node:assert/strict";
import { test } from "node:test";
import { type Memory, first, intervalDays, retrievability, review } from "../src/fsrs";

test("a right first answer comes back in about three days, a miss the next day", () => {
  assert.equal(intervalDays(first(3).stability), 3);
  assert.equal(intervalDays(first(2).stability), 1);
  assert.equal(intervalDays(first(1).stability), 1);
});

test("right answers on time push the next review further out each time", () => {
  let memory: Memory = first(3);
  const intervals = [intervalDays(memory.stability)];
  for (let i = 0; i < 3; i++) {
    memory = review(memory, 3, intervals.at(-1)!);
    intervals.push(intervalDays(memory.stability));
  }
  assert.deepEqual(intervals.map((d, i) => i === 0 || d > intervals[i - 1]!), [true, true, true, true]);
  // Roughly 3 days, then about 10, a month, three months.
  assert.ok(intervals[1]! >= 8 && intervals[1]! <= 14, `second interval ${intervals[1]}`);
  assert.ok(intervals[2]! >= 25 && intervals[2]! <= 45, `third interval ${intervals[2]}`);
  assert.ok(intervals[3]! >= 70 && intervals[3]! <= 130, `fourth interval ${intervals[3]}`);
});

test("a miss cuts stability without resetting it, and makes the item harder", () => {
  const before = review(first(3), 3, 3);
  const after = review(before, 1, intervalDays(before.stability));
  assert.ok(after.stability < before.stability);
  assert.ok(after.stability > first(1).stability);
  assert.ok(after.difficulty > before.difficulty);
  assert.ok(intervalDays(after.stability) <= 3);
});

test("a partly right answer grows the interval less than a right one", () => {
  const start = first(3);
  assert.ok(review(start, 2, 3).stability < review(start, 3, 3).stability);
  assert.ok(review(start, 2, 3).stability > start.stability);
});

test("a late right answer earns more than one on time, and an early one earns less", () => {
  const start = first(3);
  assert.ok(review(start, 3, 9).stability > review(start, 3, 3).stability);
  assert.ok(review(start, 3, 1).stability < review(start, 3, 3).stability);
});

test("intervals stay between 1 and 180 days, and difficulty between 1 and 10", () => {
  assert.equal(intervalDays(0.01), 1);
  assert.equal(intervalDays(5000), 180);
  let memory: Memory = first(1);
  for (let i = 0; i < 30; i++) memory = review(memory, 1, 2);
  assert.ok(memory.difficulty <= 10 && memory.difficulty >= 1);
  for (let i = 0; i < 60; i++) memory = review(memory, 3, intervalDays(memory.stability));
  assert.ok(memory.difficulty >= 1);
});

test("recall is 90% likely after exactly one stability's worth of days", () => {
  assert.ok(Math.abs(retrievability(10, 10) - 0.9) < 1e-9);
  assert.equal(retrievability(0, 10), 1);
});
