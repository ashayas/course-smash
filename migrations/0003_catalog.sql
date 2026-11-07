-- The course library: pre-built courses with a question bank, shared by every account.
-- Learners start a copy of a library course; their copy lives in courses/modules/questions as usual.
CREATE TABLE catalog_courses (
  id TEXT PRIMARY KEY,           -- the slug, e.g. "k8s-scheduling"
  track TEXT NOT NULL,           -- e.g. "kubernetes"
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  prompt TEXT NOT NULL,          -- the learner goal the course was written for
  level TEXT NOT NULL,           -- intro | intermediate | advanced
  tags TEXT NOT NULL,            -- JSON array of keywords, for search later
  position INTEGER NOT NULL,     -- order within the track
  created_at INTEGER NOT NULL
);
CREATE INDEX catalog_courses_track ON catalog_courses(track, position);

CREATE TABLE catalog_modules (
  id TEXT PRIMARY KEY,
  catalog_course_id TEXT NOT NULL REFERENCES catalog_courses(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  title TEXT NOT NULL,
  objective TEXT NOT NULL,
  concepts TEXT NOT NULL,        -- JSON array of concept names
  UNIQUE (catalog_course_id, position)
);

-- tier 'core' questions make up a module's first round; 'reserve' ones are used for follow-ups.
CREATE TABLE catalog_questions (
  id TEXT PRIMARY KEY,
  catalog_module_id TEXT NOT NULL REFERENCES catalog_modules(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN ('core', 'reserve')),
  kind TEXT NOT NULL CHECK (kind IN ('mcq', 'short')),
  prompt TEXT NOT NULL,
  options TEXT,
  correct_index INTEGER,
  reference TEXT NOT NULL,
  concept TEXT NOT NULL,
  difficulty INTEGER NOT NULL DEFAULT 2, -- 1 to 3
  figure TEXT,                   -- sanitized SVG markup
  figure_alt TEXT
);
CREATE INDEX catalog_questions_module ON catalog_questions(catalog_module_id, tier, position);

-- Learner copies remember where they came from. No foreign keys, so re-seeding the library never touches learner data.
ALTER TABLE courses ADD COLUMN catalog_id TEXT;
ALTER TABLE modules ADD COLUMN catalog_module_id TEXT;
-- How well this learner needs to know the module before moving on, set by the decision model from their goal.
ALTER TABLE modules ADD COLUMN importance TEXT;
ALTER TABLE modules ADD COLUMN mastery_target REAL;
ALTER TABLE modules ADD COLUMN max_follow_ups INTEGER;
ALTER TABLE questions ADD COLUMN figure TEXT;
ALTER TABLE questions ADD COLUMN figure_alt TEXT;
ALTER TABLE questions ADD COLUMN bank_id TEXT;
