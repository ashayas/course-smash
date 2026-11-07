-- The building that stands for a course on the learner's city map, as JSON from src/icon.ts. NULL means pick one from the topic.
ALTER TABLE courses ADD COLUMN icon TEXT;
