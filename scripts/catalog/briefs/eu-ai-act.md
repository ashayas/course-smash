# Brief: question banks for "The EU AI Act Essentials"

You are writing question banks for one course in Course Smash, a learning app. A learner answers a
round of questions per module; multiple choice is graded only by the answer key you write, so a wrong
key teaches a wrong fact. Accuracy beats volume.

Read `catalog/.state/eu-ai-act/plan.json` for the course and the 8 modules (`position` 0 to 7). Write only the modules you were assigned.

## Ground every fact in Regulation (EU) 2024/1689

- Primary sources to cite in `source_url`:
  - Official EUR-Lex text of Regulation (EU) 2024/1689: `https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024R1689`
  - European Commission AI Act Shaping Europe's Digital Future page: `https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai`
  - European Commission AI Office page: `https://digital-strategy.ec.europa.eu/en/policies/ai-office`
  - European Commission AI Pact page: `https://digital-strategy.ec.europa.eu/en/policies/ai-pact`
  - General-Purpose AI Code of Practice page: `https://digital-strategy.ec.europa.eu/en/policies/contents-code-practice-gpai`
  - Official article-by-article reference explorer: `https://artificialintelligenceact.eu/article/2/`, `https://artificialintelligenceact.eu/article/3/`, `https://artificialintelligenceact.eu/article/4/`, `https://artificialintelligenceact.eu/article/5/`, `https://artificialintelligenceact.eu/article/6/`, `https://artificialintelligenceact.eu/article/9/`, `https://artificialintelligenceact.eu/article/10/`, `https://artificialintelligenceact.eu/article/11/`, `https://artificialintelligenceact.eu/article/12/`, `https://artificialintelligenceact.eu/article/13/`, `https://artificialintelligenceact.eu/article/14/`, `https://artificialintelligenceact.eu/article/15/`, `https://artificialintelligenceact.eu/article/16/`, `https://artificialintelligenceact.eu/article/17/`, `https://artificialintelligenceact.eu/article/25/`, `https://artificialintelligenceact.eu/article/26/`, `https://artificialintelligenceact.eu/article/27/`, `https://artificialintelligenceact.eu/article/43/`, `https://artificialintelligenceact.eu/article/47/`, `https://artificialintelligenceact.eu/article/49/`, `https://artificialintelligenceact.eu/article/50/`, `https://artificialintelligenceact.eu/article/51/`, `https://artificialintelligenceact.eu/article/53/`, `https://artificialintelligenceact.eu/article/55/`, `https://artificialintelligenceact.eu/article/57/`, `https://artificialintelligenceact.eu/article/60/`, `https://artificialintelligenceact.eu/article/64/`, `https://artificialintelligenceact.eu/article/73/`, `https://artificialintelligenceact.eu/article/99/`, `https://artificialintelligenceact.eu/article/100/`, `https://artificialintelligenceact.eu/article/101/`, `https://artificialintelligenceact.eu/article/111/`, `https://artificialintelligenceact.eu/article/113/`, `https://artificialintelligenceact.eu/annex/1/`, `https://artificialintelligenceact.eu/annex/3/`.
- Key verified statutory facts from Regulation (EU) 2024/1689:
  - Published in the Official Journal on 12 July 2024; entered into force on 1 August 2024 (Article 113).
  - Phased application under Article 113:
    - 2 February 2025 (6 months): Chapters I (General provisions, including Article 4 AI literacy) and II (Article 5 prohibited AI practices).
    - 2 August 2025 (12 months): Chapter III Section 4 (notifying authorities and notified bodies), Chapter V (General-purpose AI models, Articles 51 to 56), Chapter VII (Governance: AI Office, European Artificial Intelligence Board, Advisory Forum, Scientific Panel), Chapter XII (Penalties, Articles 99 to 101, except Article 101 fines on GPAI providers have transition rules), and Article 78 (confidentiality).
    - 2 August 2026 (24 months): General date of application, including Annex III high-risk AI systems (Article 6(2)), Article 50 transparency obligations, Article 27 Fundamental Rights Impact Assessment, and the requirement under Article 57(1) for each Member State to establish at least one operational national AI regulatory sandbox.
    - 2 August 2027 (36 months, Article 113(c)): Article 6(1) high-risk AI systems that are safety components of products (or are products themselves) covered by Union harmonisation legislation in Annex I. Also under Article 111(3), providers of GPAI models placed on the market before 2 August 2025 have until 2 August 2027 to comply. Under Article 111(1), components of large-scale IT systems in Annex X placed on the market before 2 August 2027 must comply by 31 December 2030.
  - Exclusions under Article 2: military, defence or national security purposes (Article 2(3)); AI systems or models specifically developed and put into service for the sole purpose of scientific research and development (Article 2(6)); research, testing and development activity prior to being placed on the market or put into service, excluding testing in real world conditions (Article 2(8)); natural persons using AI in the course of a purely personal non-professional activity (Article 2(10)); free and open-source AI systems (Article 2(12)) UNLESS they are high-risk, fall under Article 5 prohibited practices, or trigger Article 50 transparency rules.
  - High-risk classification (Article 6):
    - Article 6(1): AI system is a safety component of a product, or is itself a product, covered by Union harmonisation legislation in Annex I, AND the product is required to undergo a third-party conformity assessment under that Annex I legislation.
    - Article 6(2): AI systems referred to in Annex III (8 domains: biometrics; critical infrastructure; education and vocational training; employment, workers management and access to self-employment; access to and enjoyment of essential private services and essential public services and benefits; law enforcement; migration, asylum and border control management; administration of justice and democratic processes).
    - Article 6(3) derogation: An Annex III system is not considered high-risk if it does not pose a significant risk of harm to health, safety or fundamental rights by fulfilling one of four narrow conditions (narrow procedural task; improving the result of a previously completed human activity; detecting decision-making patterns without replacing human assessment; preparatory task to an assessment), EXCEPT an Annex III system is ALWAYS considered high-risk if it performs profiling of natural persons. Even when claiming the Article 6(3) derogation, the provider must document the assessment before placing the system on the market and register in the EU database under Article 49(2).
  - Value chain & FRIA:
    - Article 25(1): Any distributor, importer, deployer or other third party is considered a provider of a high-risk AI system (and subject to Article 16 provider duties) if they put their name or trademark on an already-placed high-risk system, make a substantial modification to a high-risk system, or modify the intended purpose of a non-high-risk system so that it becomes high-risk.
    - Article 27: Bodies governed by public law, private entities providing public services, and deployers of Annex III point 5(b) (creditworthiness/credit scoring) and 5(c) (life and health insurance risk and pricing) high-risk systems must perform a Fundamental Rights Impact Assessment (FRIA) prior to first use and notify the market surveillance authority.
  - GPAI Models (Articles 51 to 56):
    - Article 51: A GPAI model is classified as having systemic risk if it has high-impact capabilities evaluated via technical benchmarks or if the cumulative amount of computation used for its training measured in floating-point operations is greater than 10^25 FLOPs (Article 51(2)).
    - Article 53: All GPAI model providers must draw up technical documentation (Annex XI), provide information and documentation to downstream AI system providers (Annex XII), put in place a policy to comply with Union copyright law (including text and data mining opt-outs under Article 4(3) of Directive (EU) 2019/790), and draw up and make publicly available a sufficiently detailed summary about the content used for training using the AI Office template.
    - Open-source GPAI exemption (Article 53(2)): Free and open-source GPAI models whose parameters (weights, architecture, usage info) are publicly available are exempt from the documentation (Art 53(1)(a) and (b)) and authorised representative (Art 54) requirements, UNLESS they are GPAI models with systemic risk; however, open-source GPAI providers must STILL comply with the copyright policy (Art 53(1)(c)) and public training-data summary (Art 53(1)(d)) obligations!
    - Article 55: Systemic-risk GPAI providers must additionally perform model evaluation including adversarial testing, assess and mitigate possible systemic risks, track and report serious incidents to the AI Office and national authorities without undue delay, and ensure an adequate level of cybersecurity protection for the model and its physical infrastructure.
  - Incident reporting (Article 73):
    - General serious incident report deadline: immediately after establishing a causal link (or reasonable likelihood) and in any event not later than 15 days after the provider or deployer becomes aware of the serious incident.
    - Widespread infringement or serious and irreversible disruption of critical infrastructure: not later than 2 days.
    - Death of a person: immediately and not later than 10 days.
  - Administrative Fines (Articles 99 to 101):
    - Article 99(3) Prohibited practices (Article 5): up to 35 000 000 EUR or up to 7% of total worldwide annual turnover, whichever is higher.
    - Article 99(4) Other obligations (high-risk provider/deployer/importer/distributor duties, notified bodies, Article 50 transparency): up to 15 000 000 EUR or up to 3% of total worldwide annual turnover, whichever is higher.
    - Article 99(5) Supplying incorrect, incomplete or misleading information to notified bodies or national competent authorities: up to 7 500 000 EUR or up to 1% of total worldwide annual turnover, whichever is higher.
    - Article 99(6) SME and startup rule: for SMEs including start-ups, each fine is up to the percentages or amounts above, WHICHEVER IS LOWER.
    - Article 100 EU institutions, agencies and bodies: up to 1 500 000 EUR for Article 5 violations and up to 750 000 EUR for other infringements, imposed by the European Data Protection Supervisor (EDPS).
    - Article 101 GPAI model providers: Commission may impose fines up to 3% of total worldwide annual turnover or 15 000 000 EUR, whichever is higher.

## Go deep, not trivia

These learners are public policy and legal/technical compliance professionals. Make questions hard in the right way:
- Most questions are applied scenarios ("A Vancouver health-tech firm...", "A Berlin municipal agency...", "A Toronto foundation-model developer...").
- Difficulty: about 15% at 1, 45% at 2, 40% at 3 (at least 30% of questions in each module MUST have `difficulty: 3`, and aim for 12 out of 30 at `difficulty: 3`).
- Distractors must be real misconceptions, similar in length and tone to the correct option. No "all of the above", no "none of the above", no joke options.
- Never refer to option letters or numbers (such as "Option A" or "(a)"); options are shuffled.
- CRITICAL CHECKER RULES (`scripts/catalog/check-draft.mjs`):
  - Plain text only: NO `$`, NO `\(` or LaTeX, NO `**` Markdown, NO backticks `` ` ``! Write `EUR` instead of `$` or euro symbols if needed (or `EUR 35 million`), and write `10^25` or `10 to the power of 25` without `$` or LaTeX.
  - Spread `correct_index` across `0, 1, 2, 3` (e.g., 5 or 6 of each across the 22 MCQs).
  - The correct option MUST NOT be the longest option in more than 35% of MCQs (at most 7 out of 22 MCQs!), and in NO question may the correct option be more than 30% longer than the longest distractor! Make distractors at least as long and detailed as the correct option!
  - Exactly 30 questions per module:
    - `tier: "core"`: exactly 7 questions (5 `"mcq"` + 2 `"short"`), covering every concept in the module at least once.
    - `tier: "reserve"`: 23 questions (17 `"mcq"` + 6 `"short"`), with at least 4 to 6 reserve questions per concept!
  - `concept` must match one of the module's 4 concepts in `plan.json` character-for-character.
  - Short-answer questions have `"options": null` and `"correct_index": null`.

## Check your work

After writing each module file (`catalog/.state/eu-ai-act/modules/m<position>.json`), run:

```sh
node scripts/catalog/check-draft.mjs catalog/.state/eu-ai-act/modules/m<position>.json catalog/.state/eu-ai-act/plan.json
```

and fix any reported issue until it prints `OK`.
