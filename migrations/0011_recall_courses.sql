-- Choose which courses feed daily recall, and recall one course on its own (src/recall.ts).

-- 1 while the course's ideas can come up in daily recall. Every course starts in it.
ALTER TABLE courses ADD COLUMN in_recall INTEGER NOT NULL DEFAULT 1;

-- A "Recall this course" session: questions drawn from one course's passed modules, outside the day's set.
-- They are graded, scheduled and counted toward the day exactly like daily recall.
CREATE TABLE recall_sessions (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  day TEXT NOT NULL,             -- the learner's local day it was started on
  created_at INTEGER NOT NULL
);
CREATE INDEX recall_sessions_course ON recall_sessions(owner, course_id, created_at);

-- NULL for the day's set, otherwise the session the question belongs to.
ALTER TABLE recall_questions ADD COLUMN session_id TEXT REFERENCES recall_sessions(id) ON DELETE CASCADE;

-- The day's set keeps its one-set-per-day guard. A session numbers its own questions.
DROP INDEX recall_questions_day;
CREATE UNIQUE INDEX recall_questions_day ON recall_questions(owner, day, position) WHERE session_id IS NULL;
CREATE UNIQUE INDEX recall_questions_session ON recall_questions(session_id, position) WHERE session_id IS NOT NULL;

-- One open question per idea per day, across the day's set and every session, so two requests building sets at
-- the same moment can't ask the same idea twice. The losing request's batch fails as a whole.
CREATE UNIQUE INDEX recall_questions_open_item ON recall_questions(owner, day, item_id) WHERE status = 'set' AND item_id IS NOT NULL;
