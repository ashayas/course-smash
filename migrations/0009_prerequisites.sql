-- Learning paths through the library: course_id builds directly on requires_id.
-- Worked out by a model when topics are rebuilt (src/embeddings.ts), always acyclic.
CREATE TABLE course_prerequisites (
  course_id TEXT NOT NULL REFERENCES catalog_courses(id) ON DELETE CASCADE,
  requires_id TEXT NOT NULL REFERENCES catalog_courses(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (course_id, requires_id)
);
CREATE INDEX course_prerequisites_requires ON course_prerequisites(requires_id);
