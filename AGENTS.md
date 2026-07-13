# AGENTS.md

> Ecosystem contract version: `1.0`
> Repository: `OWBastion/owbastion.codes`
> Role: Bastion web platform and operational control plane
> Status: target architecture for a new or newly imported repository

## 1. Mission

This repository is the central web platform for the Bastion ecosystem.

It serves three audiences:

1. **Players** — public data, title and event queries, personal progress, submission status, rankings, and appeals.
2. **Reviewers and administrators** — screenshot review, OCR correction, title grants, challenge operations, player support, and audit history.
3. **Developers and maintainers** — event and title data inspection, balance analysis, structured change drafts, validation, PR generation, release visibility, and rollback coordination.

The platform is a control plane. It may prepare and orchestrate changes, but released game source remains authoritative in `OWBastion/Bastion`.

## 2. Canonical Ecosystem Contract

This repository owns the canonical cross-repository architecture contract.

| Repository | Authoritative responsibility |
| --- | --- |
| `OWBastion/Bastion` | Released game code, content definitions, title source, builds, releases, public snapshots |
| `OWBastion/owbastion.codes` | Business data, public/admin web apps, review, grants, balance drafts, orchestration |
| `OWBastion/qqbot` | QQ ingress, deterministic command UX, user notifications |
| `OWBastion/ocrkit` | Stateless screenshot recognition and model lifecycle |

When boundaries change, update this document first and coordinate compatible updates in affected repositories.

## 3. Core Architectural Principles

1. **One owner per fact.** Do not create competing truth sources.
2. **Git remains authoritative for released game content.** D1 stores drafts and operational state, not silent release overrides.
3. **D1 is authoritative for platform business state.** KV and in-memory state are caches only.
4. **R2 stores private evidence and large artifacts.** Screenshots do not belong in Git.
5. **Queues isolate long-running and retryable work.** OCR, grants, snapshot import, and notifications are asynchronous.
6. **Every side effect is idempotent and auditable.**
7. **Public, player-private, reviewer, developer, and maintainer data are distinct security classes.**
8. **External contracts are versioned.**
9. **The first implementation should be a modular monolith, not an uncontrolled microservice fleet.**
10. **No web action bypasses validation, CI, human review, or release policy for Bastion source changes.**

## 4. Target Repository Shape

Use a TypeScript monorepo unless an imported framework requires a documented compatibility decision.

Conceptual structure:

```text
apps/
  portal/          public and player-facing web application
  admin/           reviewer, administrator, and developer interface
  api/             authenticated HTTP API
workers/
  ocr-worker/      screenshot persistence and OCR orchestration
  grant-worker/    title grant and Bastion PR orchestration
  sync-worker/     Bastion snapshot import and reconciliation
  notify-worker/   QQ and future channel notifications
packages/
  contracts/       API, event, and schema definitions
  domain/          platform business rules
  auth/            identity, sessions, RBAC, service authentication
  storage/         D1, R2, KV, Queue adapters
  challenge-rules/ deterministic title/challenge evaluation
  bastion-data/    snapshot parsing, diffing, and compatibility
  ui/              shared UI primitives
docs/
  architecture/
  adr/
  runbooks/
migrations/
```

Do not create separate deployable services without a demonstrated scaling, isolation, or security requirement.

## 5. Product Areas

### 5.1 Public portal

Public features may include:

- title, event, map, challenge, and glossary queries;
- released version and changelog information;
- public event-allocation reports;
- player-title lookup where privacy policy allows;
- public leaderboards and map mastery;
- service-status summaries.

Public pages must read released snapshot data, not unapproved drafts.

### 5.2 Player account area

Authenticated players may access:

- linked identities;
- owned titles and map progress;
- screenshot submissions and status;
- OCR-extracted details relevant to their own submission;
- rejection reasons and resubmission guidance;
- appeals and correction requests;
- mastery and ranking history.

Do not expose other players' private screenshots, QQ OpenIDs, review notes, or internal risk signals.

### 5.3 Review and administration

Reviewer capabilities may include:

- pending, failed, low-confidence, and appealed queues;
- original image and OCR fields side by side;
- rule-by-rule evaluation;
- field correction and OCR retry;
- approve, reject, request-resubmission, and escalate actions;
- duplicate and prior-grant checks;
- reviewer notes and immutable audit history;
- explicit promotion of corrected samples into training candidates.

### 5.4 Developer control plane

Developer features may include:

- released event/title/map data inspection;
- source-version and snapshot comparison;
- event weight and allocation simulation;
- structured balance drafts;
- schema validation and diff preview;
- creation of reviewable Bastion pull requests;
- CI/build result display;
- release and rollback visibility.

The platform must not execute arbitrary untrusted OverPy or shell code in the primary API runtime.

## 6. Data Ownership

### D1 — business truth

D1 owns:

- users and external identities;
- player profiles and QQ bindings;
- roles and permissions;
- screenshot submissions;
- attachment metadata;
- OCR runs and corrected fields;
- review decisions and audits;
- title grant tasks and outcomes;
- player mastery and progression;
- balance drafts and change sets;
- GitHub PR/release linkage;
- notification delivery state.

### R2 — private evidence and artifacts

R2 owns:

- original screenshots;
- OCR crops and debug artifacts;
- approved training candidates and exported datasets;
- large reports and generated artifacts where appropriate.

Use immutable, namespaced object keys and preserve content hashes.

### KV — cache only

KV may cache:

- public snapshot data;
- sessions where revocation and truth remain backed elsewhere;
- rate-limit counters;
- short-lived derived query results.

KV must not be the sole source of review status, grants, identity, or player assets.

### Bastion Git and snapshots — released content

Released titles, events, maps, challenges, and game versions come from versioned Bastion snapshots. Draft database records never override released data in public views.

## 7. Submission and Review State Machine

Use explicit states. A target lifecycle is:

```text
received
→ evidence_pending
→ ocr_pending
→ ocr_processing
→ ready_for_review
→ approved | rejected | resubmission_required
→ grant_pending
→ pr_created
→ granted
→ released
```

Failure states may include:

```text
evidence_failed
ocr_failed
grant_failed
notification_failed
```

Use normalized identifiers without spaces in implementation. Every transition must define:

- allowed previous states;
- actor or service authority;
- timestamp;
- idempotency behavior;
- audit record;
- retry or rollback path.

Do not collapse “review approved,” “grant committed,” and “released in game” into one status.

## 8. OCR Orchestration

The platform, not QQBot, orchestrates OCR:

```text
submission created
→ retrieve temporary source attachment
→ validate and persist original bytes to R2
→ compute SHA-256 and perceptual hash
→ enqueue OCR job
→ call OCRKit by private object key
→ store raw response, schema version, model version, warnings, and timing
→ evaluate challenge rules
→ route to review
```

OCR results are evidence, not final truth. Human corrections must be stored separately from raw OCR output.

Never overwrite an OCR run. Create a new run for each retry or model version.

## 9. Challenge Rule Engine

Challenge rules should be deterministic, versioned, testable, and data-driven.

Each rule definition should identify:

- stable `challenge_key` or `title_key`;
- compatible game versions;
- required OCR fields or telemetry;
- completion conditions;
- automatic-processing level;
- missing-field behavior;
- rejection versus manual-review behavior;
- release and retirement window.

Suggested automation levels:

- `manual_only`;
- `ocr_assisted`;
- `auto_eligible`;
- `telemetry_required`.

Do not allow a model confidence score alone to grant a title. Automatic approval requires an explicit policy and measured false-positive gate.

## 10. Bastion Integration

All released-content changes follow:

```text
platform change set
→ validate against imported Bastion schema
→ produce deterministic patch/request
→ create branch and pull request
→ run Bastion CI and OverPy build
→ human review and merge
→ release
→ import new versioned snapshot
→ reconcile platform state
```

Required properties:

- stable external request ID;
- idempotent retries;
- no duplicate title grants;
- readable PR body with evidence and audit linkage;
- least-privilege GitHub App or token;
- no direct push to protected release branches;
- reconciliation when GitHub succeeds but the platform callback fails.

## 11. QQBot Integration

QQBot is a channel adapter. The platform API must support:

- binding or updating a QQ identity;
- creating a submission using stable QQ message metadata;
- querying player-visible status;
- producing notification jobs;
- idempotent command retries.

Do not require QQBot to understand OCR, review rules, title slots, or GitHub workflows.

External QQ identifiers are private. Public pages must use platform-safe player identifiers or display names.

## 12. Authentication and Authorization

Use explicit identities and role-based authorization.

Target roles:

| Role | Scope |
| --- | --- |
| visitor | public released data |
| player | own profile, submissions, progress, appeals |
| reviewer | screenshot review and field correction |
| content_admin | challenges, titles, activities, operational grants |
| developer | balance drafts, simulations, PR preparation |
| maintainer | release approval, rollback, role management |

Requirements:

- protect admin surfaces with strong authentication, preferably Cloudflare Access or equivalent;
- enforce authorization in APIs, not only in UI;
- use service-to-service credentials for QQBot and workers;
- record privileged actions in immutable audit logs;
- require re-authentication or stronger confirmation for destructive actions;
- never expose secrets to frontend bundles.

## 13. Contract and Schema Governance

`packages/contracts` is the canonical home for:

- API schemas;
- domain events;
- queue payloads;
- imported Bastion snapshot schemas;
- OCRKit response compatibility types;
- QQ channel request types.

Rules:

- use explicit schema versions;
- generate clients or validators where possible;
- do not hand-copy types between repositories without a synchronization mechanism;
- breaking changes require compatibility analysis and coordinated rollout;
- database migrations must be forward-safe and have rollback or repair guidance;
- queue consumers must tolerate redelivery and older compatible payload versions.

## 14. Observability and Audit

Every request and asynchronous job should carry:

- correlation ID;
- actor or service identity;
- operation name;
- contract version;
- submission/change-set ID where relevant.

Track:

- queue delay and retry counts;
- OCR success, warning, latency, and model-version metrics;
- review throughput and disagreement rate;
- grant and PR failure rates;
- notification delivery failures;
- snapshot freshness;
- privileged action audit coverage.

Logs must not contain screenshot bytes, secrets, signed URLs, or unnecessary private identifiers.

## 15. Security and Abuse Controls

- Treat screenshots and review data as private.
- Validate content type, file size, dimensions, and object prefixes.
- Apply rate limits and duplicate detection.
- Use Turnstile or equivalent abuse controls on public write flows when needed.
- Separate public R2 delivery from private evidence storage.
- Use signed, short-lived access for reviewer image display.
- Prevent SSRF when retrieving QQ or external attachment URLs.
- Do not execute arbitrary source code supplied through the web UI.
- Use least-privilege bindings and service tokens.
- Define retention and deletion policies for screenshots and training samples.

## 16. Development Standards

Before implementation:

1. identify the product area and data owner;
2. identify API, queue, database, and external-system impact;
3. define idempotency, retries, and state transitions;
4. state security classification and authorization;
5. define rollback and reconciliation.

Implementation rules:

- prefer typed, small, responsibility-based modules;
- keep domain logic independent of HTTP and storage adapters;
- keep raw OCR output separate from corrected values;
- keep released data separate from drafts;
- avoid broad framework rewrites without an ADR;
- add migrations, tests, and runbooks with operational features;
- preserve mobile usability for player-facing pages;
- prioritize reviewer efficiency and clear risk signals in admin UI.

## 17. Testing Strategy

Use layered tests:

- unit tests for rules, transitions, and authorization;
- contract tests for QQBot, OCRKit, Bastion snapshots, and GitHub requests;
- D1 migration and repository tests;
- queue redelivery and idempotency tests;
- integration tests with fake R2/OCR/GitHub/QQ clients;
- end-to-end tests for player submission and reviewer approval;
- security tests for privilege escalation, SSRF, file validation, and private-data exposure;
- snapshot compatibility tests across supported game versions.

Production correctness must not depend on live external services during the normal unit test suite.

## 18. Change and Release Policy

Every significant change should include:

- scope and owner;
- affected contracts and migrations;
- risk analysis;
- rollback or reconciliation plan;
- tests and operational verification;
- documentation updates.

Features that mutate Bastion content should launch in stages:

```text
read-only
→ draft generation
→ dry-run validation
→ PR creation
→ controlled production use
```

OCR automation should launch in stages:

```text
manual baseline
→ shadow OCR
→ reviewer assistance
→ limited auto-eligibility
→ measured expansion
```

## 19. Definition of Done

A platform change is complete when:

- one source of truth is identified for every new field;
- state transitions and idempotency are explicit;
- authorization is enforced server-side;
- private/public data boundaries are tested;
- migrations and contract changes are documented;
- external failures have retry and reconciliation behavior;
- audit records are produced for privileged actions;
- relevant unit, contract, and integration tests pass;
- deployment and rollback steps are known;
- no direct bypass of Bastion Git/CI was introduced.

## 20. Initial Delivery Order

Unless a task explicitly changes priorities, agents should prefer this sequence:

1. establish repository structure, contracts, authentication, and D1 migrations;
2. migrate the existing read-only title/event query UI;
3. import versioned Bastion snapshots;
4. implement QQBot identity and submission APIs;
5. persist screenshots to R2 and integrate OCRKit in shadow mode;
6. build the reviewer workbench and audit model;
7. implement grant tasks and Bastion PR orchestration;
8. add player progress, mastery, and rankings;
9. add read-only balance analysis;
10. add structured balance drafts and PR creation.

Do not begin with arbitrary code editing, fully automatic title grants, or a generic visual OverPy editor.
