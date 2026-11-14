-- Semantic vectors for library courses and question banks (src/embeddings.ts).
-- Workers AI makes them; they are kept here and in the Vectorize index `coursesmash-embeddings`.
-- D1 is the source of truth: topics are clustered from these rows, and small comparisons
-- (one module's bank against a learner's misses) run straight from here. Vectorize answers
-- nearest-neighbour questions across the whole library.

-- A bank needs (re-)embedding when it changed after its vectors were made. Anything that adds or edits
-- a bank's questions bumps bank_changed_at; the queue consumer sets embedded_at to when it started.
ALTER TABLE catalog_courses ADD COLUMN bank_changed_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE catalog_courses ADD COLUMN embedded_at INTEGER;
CREATE INDEX catalog_courses_embedding ON catalog_courses(embedded_at, bank_changed_at);

-- Topics are clusters of public library courses, named by a model. Rebuilt whenever the library changes size.
CREATE TABLE topics (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  summary TEXT NOT NULL,
  centroid BLOB NOT NULL,        -- float32, unit length
  created_at INTEGER NOT NULL
);
CREATE TABLE topic_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  courses INTEGER NOT NULL,      -- public courses clustered
  created_at INTEGER NOT NULL
);

-- Vectors are float32, unit length. hash is of the embedded text, so unchanged items are never re-embedded.
CREATE TABLE course_embeddings (
  course_id TEXT PRIMARY KEY REFERENCES catalog_courses(id) ON DELETE CASCADE,
  hash TEXT NOT NULL,
  vector BLOB NOT NULL,
  topic_id INTEGER REFERENCES topics(id) ON DELETE SET NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX course_embeddings_topic ON course_embeddings(topic_id);

CREATE TABLE question_embeddings (
  question_id TEXT PRIMARY KEY REFERENCES catalog_questions(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL,       -- the catalog course, so a bank's vectors load in one query
  module_id TEXT NOT NULL,       -- the catalog module
  hash TEXT NOT NULL,
  vector BLOB NOT NULL,
  topic_id INTEGER REFERENCES topics(id) ON DELETE SET NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX question_embeddings_course ON question_embeddings(course_id);
CREATE INDEX question_embeddings_module ON question_embeddings(module_id);
CREATE INDEX question_embeddings_topic ON question_embeddings(topic_id);
