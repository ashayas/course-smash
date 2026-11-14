-- Every course draws from a question bank, and every question the agent writes is saved back into it.
-- A course the learner planned themselves gets a private bank (visibility 'private', owned by them),
-- which never shows in the library.
ALTER TABLE catalog_courses ADD COLUMN visibility TEXT NOT NULL DEFAULT 'public';
ALTER TABLE catalog_courses ADD COLUMN owner TEXT;
-- 'library': written and reviewed offline (scripts/catalog). 'generated': written by the agent during a course, not reviewed.
-- Reviewed questions are always drawn first.
ALTER TABLE catalog_questions ADD COLUMN source TEXT NOT NULL DEFAULT 'library';
-- A page that backs the answer, shown to the learner after they answer.
ALTER TABLE catalog_questions ADD COLUMN source_url TEXT;
ALTER TABLE questions ADD COLUMN source_url TEXT;
