-- Courses the agent has built. `prompt` is what the learner wants to learn.
CREATE TABLE courses (
  id TEXT PRIMARY KEY,
  prompt TEXT NOT NULL,
  title TEXT,
  summary TEXT,
  status TEXT NOT NULL DEFAULT 'building' CHECK (status IN ('building', 'active', 'complete')),
  lease_until INTEGER NOT NULL DEFAULT 0, -- the agent holds this while working, so two runs can't collide
  last_error TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE modules (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  title TEXT NOT NULL,
  objective TEXT NOT NULL,
  concepts TEXT NOT NULL, -- JSON array of concept names
  status TEXT NOT NULL DEFAULT 'locked' CHECK (status IN ('locked', 'active', 'passed')),
  UNIQUE (course_id, position)
);

-- Round 1 is a module's first set. Later rounds are follow-ups written from the learner's state.
CREATE TABLE questions (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  module_id TEXT NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  round INTEGER NOT NULL,
  position INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('mcq', 'short')),
  prompt TEXT NOT NULL,
  options TEXT, -- JSON array, MCQ only
  correct_index INTEGER, -- MCQ only; never sent to the client before an answer exists
  reference TEXT NOT NULL, -- model answer or explanation; same rule
  concept TEXT NOT NULL,
  why TEXT, -- why the agent asked this, for follow-ups
  UNIQUE (module_id, round, position)
);
CREATE INDEX questions_course ON questions(course_id);

-- The learner state the agent reads. One graded answer per question.
CREATE TABLE answers (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL UNIQUE REFERENCES questions(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  concept TEXT NOT NULL,
  response TEXT NOT NULL,
  verdict TEXT NOT NULL CHECK (verdict IN ('correct', 'partial', 'incorrect')),
  score REAL NOT NULL,
  confidence REAL,
  error_type TEXT,
  feedback TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX answers_course ON answers(course_id, created_at);

-- What the agent decided and why, shown to the learner.
CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX events_course ON events(course_id, id);
