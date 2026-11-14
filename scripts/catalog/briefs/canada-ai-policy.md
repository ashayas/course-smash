# Brief: question banks for "Canadian AI Policy Essentials"

You are writing question banks for one course in Course Smash, a learning app. A learner answers a
round of questions per module; multiple choice is graded only by the answer key you write, so a wrong
key teaches a wrong fact. Accuracy beats volume.

Read `plan.json` in this folder for the course and the 12 modules. Write only the modules you were assigned.

## Ground every fact

- Research each module on the web before writing. Prefer primary sources: canada.ca, laws-lois.justice.gc.ca,
  parl.ca / LEGISinfo, priv.gc.ca (Office of the Privacy Commissioner), ised-isde.canada.ca, tbs-sct.canada.ca,
  osfi-bsif.gc.ca, ontario.ca / ola.org, legisquebec.gouv.qc.ca, oecd.ai, coe.int, cifar.ca.
- Every question carries `source_url`: the page that supports the answer. Open it; don't guess a URL.
- Policy changes fast. If a fact depends on a date (a bill's status, an institute's launch, a minister's
  title), put the date in the question or reference ("As of 2025, ...") and use the newest status you can confirm.
- If you can't confirm a fact from a source, don't write a question that depends on it.
- AIDA (Part 3 of Bill C-27) never became law. Never present it as in force.

## Go deep, not trivia

These learners already know the basics. Make questions hard in the right way:

- Most questions are applied scenarios: "A federal department wants to deploy X that decides Y. Which AIA
  impact level / which obligation / which regulator applies, and why?" The learner must reason with the rule.
- Test distinctions experts get wrong: binding vs voluntary, federal vs provincial jurisdiction, public vs
  private sector, what a directive actually requires vs what people assume, what a bill proposed vs what is law.
- Use specific details where they matter: section numbers, thresholds, penalty amounts, impact levels, dates,
  named bodies. Don't ask for a detail just to test memory; ask it when getting it wrong changes the answer.
- Difficulty: about 15% at 1, 45% at 2, 40% at 3. At least half the questions should need two facts combined.
- Distractors are real misconceptions (e.g. "PIPEDA applies to provincial hospitals"), similar in length and
  tone to the correct option. No "all of the above", no "none of the above", no joke options.
- Never refer to option letters or numbers; options are shuffled.
- The key must not give itself away by length or detail. It should be the longest option in at most about a
  quarter of questions; give distractors the same specificity (statute names, numbers, qualifiers). The checker enforces this.
- Short-answer questions ask for reasoning in 1 to 3 sentences ("Explain why...", "What should the
  department do first, and why?"). The `reference` lists what a good answer must include.

## Shape of each module

30 questions per module:

- `tier: "core"`: exactly 7 questions (5 mcq + 2 short), one or more per concept. These are the first round.
- `tier: "reserve"`: 23 questions (about 17 mcq + 6 short), spread across all concepts. Used for follow-ups,
  so each concept needs several reserve questions from different angles.
- `concept` must be exactly one of the module's concepts from `plan.json` (copy the string, including any odd characters).

## Output

One file per module: `modules/m<position>.json` (e.g. `modules/m6.json`), with this shape:

```json
{
  "position": 6,
  "title": "<exact title from plan.json>",
  "objective": "<exact objective from plan.json>",
  "concepts": ["<exact concepts from plan.json>"],
  "bank": [
    {
      "tier": "core",
      "kind": "mcq",
      "prompt": "...",
      "options": ["...", "...", "...", "..."],
      "correct_index": 2,
      "reference": "Why the right answer is right, naming the rule. 1 to 3 sentences.",
      "concept": "quebec law 25",
      "difficulty": 3,
      "source_url": "https://..."
    },
    {
      "tier": "reserve",
      "kind": "short",
      "prompt": "...",
      "options": null,
      "correct_index": null,
      "reference": "A good answer says ... and ...",
      "concept": "consent and meaningful purpose",
      "difficulty": 2,
      "source_url": "https://..."
    }
  ]
}
```

Plain text only: no Markdown, no LaTeX, no figures.

## Check your work

After writing each file, run:

    node scripts/catalog/check-draft.mjs catalog/.state/canada/modules/m6.json

from the repo root and fix everything it reports. Then reread your multiple-choice keys once more:
for each one, confirm the source supports the keyed option and that no other option is also defensible.

Write only inside `catalog/.state/canada/modules/`. Don't edit code, other files, or other agents' modules.
When done, reply with: the files you wrote, the question count per file, and any fact you deliberately left
out because you couldn't confirm it.
