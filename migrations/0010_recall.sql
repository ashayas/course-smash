-- Daily recall, the streak and per-learner settings (src/recall.ts, src/days.ts, src/fsrs.ts).
-- In these tables `owner` is the username, and '' is the admin account (owner NULL in courses),
-- because a key column can't be NULL.

CREATE TABLE learners (
  owner TEXT PRIMARY KEY,
  time_zone TEXT NOT NULL DEFAULT 'UTC',   -- IANA name, sent by the client in X-Time-Zone
  daily_goal INTEGER NOT NULL DEFAULT 10,  -- questions in a day's recall set
  short_answers INTEGER NOT NULL DEFAULT 1,
  rest_days INTEGER NOT NULL DEFAULT 0,    -- banked, at most 2
  longest_streak INTEGER NOT NULL DEFAULT 0,
  last_seen_at INTEGER,
  created_at INTEGER NOT NULL
);

-- What gets scheduled: one subtopic of one passed module of a learner's course.
CREATE TABLE recall_items (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  module_id TEXT NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  concept TEXT NOT NULL,
  stability REAL NOT NULL,       -- FSRS memory state
  difficulty REAL NOT NULL,
  due_at INTEGER NOT NULL,
  last_reviewed_at INTEGER,
  last_verdict TEXT,             -- how the last answer on it went, in the course or in recall
  reviews INTEGER NOT NULL DEFAULT 0,
  lapses INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  UNIQUE (module_id, concept)
);
CREATE INDEX recall_items_due ON recall_items(owner, due_at);

-- The questions of a day's set. origin: 'bank' is a bank question the learner hasn't had, 'repeat' is one
-- they have, 'course' is an unanswered question of a course in progress (answered in `answers`, so it has
-- no key here), and 'generated' is kept for questions written ahead of time.
CREATE TABLE recall_questions (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  item_id TEXT REFERENCES recall_items(id) ON DELETE CASCADE,
  course_question_id TEXT REFERENCES questions(id) ON DELETE CASCADE,
  bank_id TEXT,                  -- catalog_questions.id, so a learner never gets the same bank question twice
  origin TEXT NOT NULL CHECK (origin IN ('bank', 'repeat', 'course', 'generated')),
  kind TEXT NOT NULL CHECK (kind IN ('mcq', 'short')),
  prompt TEXT NOT NULL,
  options TEXT,
  correct_index INTEGER,         -- never sent to the client before an attempt exists
  reference TEXT,
  concept TEXT NOT NULL,
  why TEXT,
  figure TEXT,
  figure_alt TEXT,
  source_url TEXT,
  status TEXT NOT NULL DEFAULT 'set' CHECK (status IN ('ready', 'set', 'answered', 'skipped')),
  day TEXT,                      -- the learner's local day this question belongs to
  position INTEGER,
  created_at INTEGER NOT NULL
);
-- Also the guard against two requests building the same day's set: the second batch fails as a whole.
CREATE UNIQUE INDEX recall_questions_day ON recall_questions(owner, day, position);
CREATE INDEX recall_questions_item ON recall_questions(item_id);

-- Every answer to a recall question. Never updated.
CREATE TABLE recall_attempts (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  question_id TEXT NOT NULL UNIQUE REFERENCES recall_questions(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  concept TEXT NOT NULL,
  day TEXT NOT NULL,
  response TEXT NOT NULL,
  verdict TEXT NOT NULL CHECK (verdict IN ('correct', 'partial', 'incorrect')),
  score REAL NOT NULL,
  confidence REAL,
  error_type TEXT,
  feedback TEXT NOT NULL,
  days_since_last REAL,          -- kept so the schedule can be fitted to real attempts later
  stability_before REAL,
  stability_after REAL,
  due_in_days INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX recall_attempts_owner ON recall_attempts(owner, created_at);

-- One row per learner per local day with activity. The streak is read from here.
CREATE TABLE learner_days (
  owner TEXT NOT NULL,
  day TEXT NOT NULL,
  recall_answered INTEGER NOT NULL DEFAULT 0,
  course_answered INTEGER NOT NULL DEFAULT 0,
  counted INTEGER NOT NULL DEFAULT 0,        -- 1 once the day met the goal
  rest INTEGER NOT NULL DEFAULT 0,           -- 1 when a banked rest day covered it
  recall_skipped INTEGER NOT NULL DEFAULT 0, -- the learner hid recall for the day
  PRIMARY KEY (owner, day)
);

-- Days answered before this migration, by UTC day since no time zone was recorded. They all count:
-- the rule then was any answer in a day.
INSERT INTO learner_days (owner, day, course_answered, counted)
SELECT COALESCE(c.owner, ''), date(a.created_at / 1000, 'unixepoch'), COUNT(*), 1
FROM answers a JOIN courses c ON c.id = a.course_id
GROUP BY 1, 2;
