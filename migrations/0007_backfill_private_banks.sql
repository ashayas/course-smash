-- Courses planned before 0006 get the private bank they would have had, filled with the questions
-- already written for them, so their follow-ups can reuse those and new ones are saved alongside.
INSERT INTO catalog_courses (id, track, title, summary, prompt, level, tags, position, created_at, visibility, owner)
SELECT 'p-' || id, 'personal', COALESCE(title, prompt), COALESCE(summary, ''), prompt, 'intermediate', '[]', 0, created_at, 'private', owner
FROM courses WHERE catalog_id IS NULL AND title IS NOT NULL
ON CONFLICT (id) DO NOTHING;

INSERT INTO catalog_modules (id, catalog_course_id, position, title, objective, concepts)
SELECT 'p-' || m.course_id || '--m' || m.position, 'p-' || m.course_id, m.position, m.title, m.objective, m.concepts
FROM modules m JOIN courses c ON c.id = m.course_id
WHERE c.catalog_id IS NULL AND c.title IS NOT NULL AND m.catalog_module_id IS NULL
ON CONFLICT (id) DO NOTHING;

UPDATE modules SET catalog_module_id = 'p-' || course_id || '--m' || position
WHERE catalog_module_id IS NULL AND course_id IN (SELECT id FROM courses WHERE catalog_id IS NULL AND title IS NOT NULL);

INSERT INTO catalog_questions (id, catalog_module_id, position, tier, kind, prompt, options, correct_index, reference, concept, difficulty, figure, figure_alt, source)
SELECT 'p-' || q.id, m.catalog_module_id, ROW_NUMBER() OVER (PARTITION BY q.module_id ORDER BY q.round, q.position) - 1,
  'reserve', q.kind, q.prompt, q.options, q.correct_index, q.reference, q.concept, 2, q.figure, q.figure_alt, 'generated'
FROM questions q JOIN modules m ON m.id = q.module_id
WHERE q.bank_id IS NULL AND m.catalog_module_id LIKE 'p-%'
ON CONFLICT (id) DO NOTHING;

UPDATE questions SET bank_id = 'p-' || id
WHERE bank_id IS NULL AND module_id IN (SELECT id FROM modules WHERE catalog_module_id LIKE 'p-%');
