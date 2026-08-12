# Portal UI/UX Independent Audit (2026-08-13)

> **Status:** executable remediation brief for agents
> **Scope:** `apps/portal` only (layouts, pages, components, `assets/css/main.css`)
> **Method:** source inspection only. **Did not** read prior audit files (including `audit-portal-uiux-2026-08.md` or any related notes).
> **Normative references for this audit (exclusive):**
>
> 1. Root [`DESIGN.md`](../../DESIGN.md) → charter [`docs/design-rules/DESIGN.md`](DESIGN.md) cross-cutting principles only (pillars: purpose, one system, adaptive layout, familiar controls, accessible state, permission-aware UI, motion optional).
> 2. Skill **apple-design** (response, interruptibility, spatial consistency, materials, reduced motion, wayfinding, simplicity, craft).
> 3. Skill **kill-ai-slop** (decide before decorate, hierarchy from scale/space, subtract first, kickers, pill spam, numbered section markers, decorative gradients, sparkles, glass as default decoration).
>
> Pillar detail docs (`visual-foundation.md`, `portal-ui-guidelines.md`, …) and product rules were **not** used as inputs. Product behavior is only cited when the UI itself exposes a broken path.

---

## 0. How agents should use this document

1. Treat each finding as a **work item** with ID `F-###`. Prefer one PR / commit stream per workstream (§5), not one mega-diff.
2. **Do not “de-slop” intentional system pieces** listed in §2 without an explicit product decision.
3. For every fix: preserve domain behavior and API contracts; change presentation, hierarchy, copy, focus, and composition only unless the finding explicitly requires IA/routing change.
4. Verify with: visual check of the affected surface + existing focused tests for that surface + keyboard path where a11y is named.
5. Acceptance is written per finding; do not mark done without the acceptance bullets.

Severity legend:

| Level | Meaning |
| --- | --- |
| **P0** | Blocks core task, lies about product state, or traps keyboard/focus |
| **P1** | Material hierarchy / wayfinding / feedback gap; users succeed but with friction or distrust |
| **P2** | Craft debt, consistency, density, or slop that erodes quality over time |
| **P3** | Polish / editorial / low-traffic admin ergonomics |

---

## 1. Executive summary

Portal already has a **coherent token layer** (`main.css`: surfaces, type scale, press, glass, reduced-motion/transparency/contrast hooks) and a **recognizable product shell** (floating header, directory cards, player center, submission detail). The foundation is closer to a designed product than to a default Nuxt/AI template.

What fails is not “missing tokens” but **product honesty, wayfinding, and density**:

1. **Navigation and home advertise destinations that are not real tasks** (天梯排名、轮换挑战、部分首页卡片).
2. **Primary player jobs** (submit evidence → confirm challenge → track status) are clear once found, but **entry points and secondary chrome compete** (玩家中心把「开发日志」与「提交截图」并列为同级主按钮).
3. **Status and metadata pills accumulate** on directory cards until hierarchy collapses into badge wallpaper.
4. **Kickers / numbered section markers** reappear on selection catalogs and multi-step forms without adding information.
5. **Mobile disclosure navigation** responds to Escape and outside click, but does not fully meet focus ownership expectations for an expanded menu.
6. **Admin surfaces** are powerful and dense; craft is uneven (mega-components, mixed spacing units, repeated local type rules) more than “AI gradient” slop.

**Remediation stance:** subtract false destinations and redundant chrome first; then unify directory/status density; then harden focus and feedback; leave the intentional material system intact.

---

## 2. Intentional system (do not strip by default)

These are **defended choices** aligned with DESIGN charter + apple materials. kill-ai-slop scanner hits here are **false positives** unless misused on content cards.

| Area | Location | Why keep |
| --- | --- | --- |
| Semantic OKLCH tokens + type scale | `assets/css/main.css` | One system; hierarchy from size/weight/tracking sets |
| Press scale on pointer-down | `.pressable*`, Nuxt UI base active | apple-design §1 Response |
| Glass classes on **chrome** only | `.glass*`, header, menus, event detail shell | Materials for floating structure, not page wallpaper |
| Scroll-edge soft shadow under sticky chrome | `.scroll-edge*` | Separation without hard 1px bar |
| Route opacity cross-fade + reduced-motion collapse | `main.css` | Motion optional; feedback kept |
| System UI font stack | `--font-ui` | Platform familiarity |
| `StatusBadge` as **status** chip | `StatusBadge.vue` | Status needs a compact, consistent label vehicle |
| Mono on codes / invite codes / spatial JSON | bind, login code, admin IDs | Domain codes, not “tasteful terminal UI” |
| Lucide icons (not invented SVG mascots) | throughout | Familiar control language |

**Rule for agents:** if a scanner flags glass/gradient/badge and the element is chrome, status, or a code value — re-read this section before deleting.

---

## 3. Strengths (preserve while fixing)

- **Accessible error/retry patterns** on `me.vue` (partial failure alerts with retry, skeleton vs empty vs session).
- **Submission detail live region discipline** (`status-live` for mutations only; steady status not live-polled into announcements) in `pages/submissions/[submissionId].vue`.
- **Event directory** uses desktop modal / mobile drawer split, reduced-motion aware drawer scaling, and solid filter controls with 44px targets.
- **Map/event directories** use shared interactive-card + press language rather than ad-hoc hover lifts.
- **Theme + account menus** use raised opaque menu surface over glass header (avoids stacked frosted layers).
- **Admin tables** already consider mobile column priority and bounded scroll — direction is right even if density is high.

---

## 4. Findings

### Workstream A — Honesty & wayfinding (Purpose / Agency / Wayfinding)

#### F-001 · P0 · Nav and home sell unfinished product surfaces

**Evidence**

- `AppHeader.vue`: public nav includes `/#rankings`（天梯排名）and `/#rotation`（轮换挑战）.
- `pages/index.vue`:
  - `#rotation` section copy: “首个轮换挑战当前未开放” with no action path.
  - `#rankings` is a **static** `article` (“公开记录”), not a ranking product.
  - `#events` is a **static** non-link card while header has a real `/events` route.
- `pages/me.vue` “更多功能 / 轮换挑战 / 未开放” is another dead product shelf.

**Why it fails**

- DESIGN **Purpose** and apple **Wayfinding**: every chrome item must answer “what’s there?”. Advertising rankings/rotation as peer destinations to 地图/成就 trains users into empty rooms.
- Agency suffers when primary IA is aspirational.

**Fix (agents)**

1. Remove or demote nav items that do not route to a working task:
   - Prefer: only link live routes (`/events`, `/maps`, `/achievements`, `/changelog`).
   - If product insists on “coming later”, use a single **non-nav** homepage callout with plain status copy — never a top-level nav peer.
2. On home:
   - Make “随机事件” a real `NuxtLink` to `/events` (parity with achievements/changelog).
   - Either remove “公开记录 / 天梯排名” card or relabel to honest content (“即将提供公开完成记录”) **without** a nav hash that implies readiness.
   - Rotation block: keep at most one compact status line; drop multi-bullet feature laundry list until the feature ships.
3. On `me.vue`: remove or collapse “更多功能” shelf until there is a real destination; do not reserve layout for vaporware.

**Acceptance**

- [ ] No header/mobile nav item lands on a non-interactive or “未开放” primary experience.
- [ ] Home cards that look interactive are interactive; static cards are visually distinct and not in the main task grid as peers of live links.
- [ ] Keyboard user can tab main nav and only reach live destinations.

---

#### F-002 · P0 · Account menu “设置” hash is a dead end

**Evidence**

- `AccountMenu.vue` item `to: "/me#appearance"` with label「设置」.
- `pages/me.vue` has no `#appearance` section (theme lives in `ThemeMenu` in the header).

**Why it fails**

- Wayfinding lie; wastes a menu slot; feels like unfinished scaffold.

**Fix**

- Remove the item, **or** point it to a real surface if one exists later.
- If the intent was theme: do not duplicate — theme is already in the header; menu should not restate it as “设置”.

**Acceptance**

- [ ] Every account menu destination resolves to visible, purposeful UI.
- [ ] No orphan hash targets from chrome.

---

#### F-003 · P1 · Player center primary actions mis-rank the job

**Evidence**

- `me.vue` intro actions: outline「开发日志」+ primary「提交截图」side by side, both `size="lg"`.

**Why it fails**

- apple **Simplicity / Purpose**: the player center’s core loop is identity → submissions → mastery/titles. Editorial content is secondary.
- Equal visual weight forces a decision that should be automatic.

**Fix**

- Keep **one** primary CTA: 提交截图 (or 继续未完成提交 if last submission is actionable — optional enhancement).
- Move 开发日志 to text link / quieter tertiary, or drop from intro entirely (already in footer/home).

**Acceptance**

- [ ] At default viewport, the strongest button in the intro is the submission path.
- [ ] Editorial entry is available but not competing at the same level.

---

#### F-004 · P1 · Bare page titles without orientation on key directories

**Evidence**

- `maps.vue`, `events.vue`, `achievements.vue`: intro is essentially a lone `h1` (CSS still references unused `.eyebrow` on maps).
- Contrast with login/bind which explain the next step in body copy.

**Why it fails**

- New visitors land on “地图” with no sentence of what the directory is for (browse / mastery / reviews).
- Hierarchy is size-only; no supporting body — acceptable for experts, weak for first visit.

**Fix**

- Add **one** short body line under each directory `h1` (not a kicker): what you can do here + optional auth difference.
- Example pattern: “浏览已发布地图；登录后可查看个人精通与评价。”
- Delete dead CSS for unused eyebrows on those pages.

**Acceptance**

- [ ] Each public directory page has ≤2 lines of orienting copy under the title.
- [ ] No decorative eyebrow that restates the title.

---

### Workstream B — Hierarchy, density & anti-slop (subtract first)

#### F-005 · P1 · Directory cards overuse badges/pills

**Evidence**

- `EventDirectory.vue` event card: `UBadge` category + rarity text + `StatusBadge` + effect tags (`UBadge`/tooltips) + `ReviewSummaryBadge`.
- Map cards / achievement cards similarly layer status chips and tags.
- Skeleton states mimic full pill rows (`events.vue` / `maps.vue` skeletons with `border-radius: 999px` tags).

**Why it fails**

- kill-ai-slop: badge & pill spam; decoration without prioritization.
- DESIGN: color/icon alone must not carry meaning — text is present, but **everything** is “signal”, so nothing is.
- Craft: first read should be **name → one status → description**; metadata is secondary.

**Fix**

1. Define a **card content budget** (implement as shared guidance in component structure, not a new design system doc unless needed):
   - Line 1: title.
   - Line 2: ≤1 status vehicle (implemented / removed / sunsetting) **or** ≤1 category, not both as equal chips when status is the operational signal.
   - Body: description clamp.
   - Footer: tags max N visible + “+k”, reviews as text metric if space-constrained.
2. Prefer **text meta** (muted caption) over a second pill for rarity/version when status already occupies the chip slot.
3. Keep `StatusBadge` for true lifecycle state only.

**Acceptance**

- [ ] At 320–390px width, an event card’s primary name remains fully readable without competing chip wrap chaos.
- [ ] No card shows more than **two** pill-shaped elements above the title without wrapping into a single meta row of plain text.

---

#### F-006 · P1 · Kickers restating structure on achievement selection

**Evidence**

- `AchievementSubmissionCatalog.vue`:
  - Group: `card-kicker`「称号系列」+ `h3` that is already the category name.
  - Every selectable card: `card-kicker`「成就挑战」or「地图通关」before the real title.
  - Automatic cards: kicker = category again.
- `SubmissionSectionHeading.vue`: forced `number` prop (`1.`) beside the real title (slop “01/02/03 markers”).
- `PageSectionHeader` optional `eyebrow` still used in admin (`achievements.vue` “通用成就” / “称号目录”).
- `login/complete.vue`: eyebrow「登录确认」above title that already says 登录中/失败.

**Why it fails**

- kill-ai-slop kicker rule: labels that restate the heading add noise.
- Numbered steps on a **single** upload form imply a multi-step wizard that is not interactive.

**Fix**

1. Catalog cards: **title first**; put mode/category as muted caption under title only when it differs from section context.
2. Drop per-card「成就挑战」kicker inside a section that is already challenge selection.
3. `SubmissionSectionHeading`: remove mandatory numbers; if multi-section remains, rely on heading order and proximity (upload vs requirements), not “1.” / “2.”.
4. Admin `PageSectionHeader` eyebrows: keep only when they disambiguate two tables on one page **and** the title alone is ambiguous; otherwise delete.
5. Login complete: delete eyebrow.

**Acceptance**

- [ ] No selectable achievement card shows a kicker whose text is constant for all cards in that list.
- [ ] Submit page has no decorative step indices.
- [ ] Visual scan of confirmation catalog shows challenge **names** as the first strong text in each card.

---

#### F-007 · P2 · Submit CTA uses sparkles icon (AI-default tell)

**Evidence**

- `pages/submissions/new.vue`: submit `UButton` `icon="i-lucide-sparkles"`.

**Why it fails**

- kill-ai-slop: sparkles as “magic AI” decoration on an upload/OCR action.
- Icon should match the job (upload / scan), not celebrate the model.

**Fix**

- Use `i-lucide-upload` or `i-lucide-scan-line` (already used in process stepper). Consistency with `SubmissionProcess` icons.

**Acceptance**

- [ ] Primary submit control icon denotes upload or recognition, not sparkles.

---

#### F-008 · P2 · Inconsistent card radii / local type forks

**Evidence**

- Radii in the wild: 8, 9, 11, 12, 14, 15, 16, 17, 18, 20px across cards, dialogs, skeletons.
- Catalog headings re-declare `letter-spacing: -.04em` / ad-hoc `font-size: 1.35rem` instead of `.type-headline` / tokens (`AchievementSubmissionCatalog`, map catalog, admin section headings).

**Why it fails**

- DESIGN **One system**.
- apple **Craft**: arbitrary values read as unfinished.

**Fix**

1. Map radii to a small ladder owned in `main.css` (example intent, names optional): control `0.5–0.7rem`, card `1rem`, sheet `1.25rem` — exact values should match existing `--ui-radius` / surface-card rather than inventing a fifth scale.
2. Replace one-off title CSS with `.type-headline` / `.page-title` / `.section-header__title` classes.
3. Prefer `rem` for structural spacing on new/edited rules; do not mass-convert unrelated pages in the same PR.

**Acceptance**

- [ ] Touched surfaces use shared type classes or CSS variables for title size/tracking.
- [ ] No new magic radius numbers outside the ladder.

---

#### F-009 · P3 · Editorial blog emoji headings

**Evidence**

- `content/blog/*.md` (scanner: many emoji heading prefixes).

**Why it fails**

- kill-ai-slop emoji-in-product-copy; weakens editorial tone next to a restrained app chrome.

**Fix**

- Separate track: strip decorative emoji from headings in blog/changelog content; keep meaning in words.
- Do not block product UI PRs on this.

**Acceptance**

- [ ] New editorial posts ship without emoji-as-bullet-in-heading; existing posts cleaned opportunistically.

---

### Workstream C — Interaction, focus, motion (apple-design)

#### F-010 · P1 · Mobile nav disclosure: incomplete focus ownership

**Evidence**

- `AppHeader.vue`: toggles `menuOpen`, Escape restores focus to trigger, outside pointerdown closes.
- Opening the menu does **not** move focus into `#mobile-nav`.
- No `inert` / aria-hidden on the rest of the page while open; Tab can leave the panel into page content under the overlay-less absolute menu.
- No focus trap within the panel.

**Why it fails**

- apple **Agency / safety**: expanded navigation should be operable as a unit.
- Keyboard users can “lose” the menu while it remains open visually.

**Fix**

1. On open: `nextTick` focus first focusable link/control in `#mobile-nav` (or the panel itself if using roving tabindex).
2. While open: trap Tab within panel **or** close on focus leaving (pick one model; prefer trap for menu).
3. Optional: `inert` on `main` content sibling while open (layout may need a content wrapper target).
4. Keep interruptible enter/leave (already noted in comments) — do not add `mode="out-in"` locks.

**Acceptance**

- [ ] Keyboard: open menu → focus inside → Tab cycles menu controls → Escape returns to toggle.
- [ ] Screen reader: `aria-expanded` already present; panel remains labelled.

---

#### F-011 · P2 · Press feedback vs table icon buttons already special-cased

**Evidence**

- Global active scale on `button[data-slot="base"]`.
- `.table-action` explicitly disables transform (good for dense admin tables).

**Why it fails**

- Not a bug; risk when agents “unify press” and reintroduce layout thrash in tables.

**Fix**

- Document in PR discipline: **never** re-enable scale on `.table-action` / row action clusters.
- When adding admin row actions, use `.table-action` pattern.

**Acceptance**

- [ ] No regression of row-action hover size/transform in admin tables.

---

#### F-012 · P2 · OCR waiting state is poll-only; feedback could be clearer

**Evidence**

- `[submissionId].vue`: 2s interval refresh while `ocr_pending`.
- Status via badge/progress (partial read); limited continuous “still working” affordance beyond badge.

**Why it fails**

- apple **Response / multimodal feedback utility**: long waits need calm, continuous status without noise.
- Avoid live-region spam (current live discipline is good — keep it).

**Fix**

- Visible indeterminate progress or last-updated caption near status when `ocr_pending` (visual only, not `aria-live` every poll).
- Stop polling on unmount (already) and when tab hidden (`document.visibilityState`) to reduce jank — optional craft.

**Acceptance**

- [ ] User can tell OCR is in progress without opening devtools.
- [ ] No polite live region fires on every successful poll.

---

#### F-013 · P2 · Gesture/drawer stack is good; keep spatial rules when editing

**Evidence**

- Event detail: modal desktop / drawer mobile; `transform-origin` not custom but drawer from bottom is consistent.
- Mobile nav leaves/enters along vertical axis with mirrored easing comments.

**Guidance (not a defect)**

- When agents touch overlays: enter/exit same path; no “slide in bottom / fade only out” asymmetry.
- Prefer opacity for reduced motion (already partially handled).

---

### Workstream D — Forms & player task flows

#### F-014 · P1 · Submit flow chrome vs requirements: cognitive split

**Evidence**

- `submissions/new.vue`: left upload + privacy note; right `SubmissionRequirements`; below, disabled `UStepper` process card.
- Challenge selection happens **after** upload on detail page (by design of OCR pipeline).

**Why it fails**

- Purpose is mostly clear, but the page presents three parallel “systems of explanation” (requirements list, privacy box, stepper) before the single action “choose file”.
- Disabled stepper looks interactive (stepper component affordance) but is `disabled` — fake control.

**Fix**

1. Collapse process into a short ordered list (non-interactive) **or** a single sentence under the title; avoid disabled interactive widgets as decoration.
2. Keep requirements adjacent to upload; ensure privacy is caption-level, not a second card competing with the form.
3. Primary column order on mobile: title → upload → submit → requirements → process (verify DOM order matches).

**Acceptance**

- [ ] No disabled stepper/tabs used as illustration.
- [ ] One obvious primary action above the fold on mobile.

---

#### F-015 · P1 · Empty states lack next action

**Evidence**

- `PlayerRecentSubmissions.vue`: `UEmpty` “暂无记录” with no CTA.
- Event/map `UEmpty` sometimes only title.
- Achievement empty paths vary.

**Why it fails**

- Wayfinding: empty is a state that should point to the next legal action (提交截图 / 浏览地图 / 调整筛选).

**Fix**

- Pair empty with one action when the user is authenticated and a route exists.
- For filter empties: “清除筛选” beats a dead end.

**Acceptance**

- [ ] Authenticated empty submission list offers navigation to `/submissions/new`.
- [ ] Filter empty states explain “no matches” and how to reset when filters exist.

---

#### F-016 · P2 · Login challenge label styling mimics kicker/all-caps product pattern

**Evidence**

- `login/index.vue`: `.challenge-label` small, heavy tracking, accent color (“群内验证”).

**Why it fails**

- Mild kicker pattern; acceptable if unique in a high-stakes panel, but should not proliferate.

**Fix**

- Prefer normal `font-weight` + muted color section label, or make it a proper `h2` visually aligned with body hierarchy.
- Keep the mono code as the hero of the panel (already correct).

**Acceptance**

- [ ] Countdown + code remain the visual focus; labels do not out-shout the code.

---

### Workstream E — Admin craft & complexity

#### F-017 · P1 · Mega-components harm craft and reviewability

**Evidence (line counts approximate)**

- `AdminPlayerDetail.vue` ~666, `AdminSubmissionReviewDetail.vue` ~640, `admin/achievements.vue` ~621, `AdminDataTable.vue` ~457, `submissions/[submissionId].vue` ~538.

**Why it fails**

- apple **Craft / Simplicity**: hard to keep spacing, focus, and feedback consistent inside thousand-line SFC.
- Agents fixing “one button” risk regressions.

**Fix (process + structure)**

1. New admin UI: extract presentational sections before adding features.
2. Remediation PRs may split detail panes into named subcomponents **without** behavior change (mechanical extract) when touching those files.
3. Do not rewrite AdminDataTable API in the same PR as visual polish.

**Acceptance**

- [ ] Any PR that edits a >400 line SFC for UI either keeps diff local or extracts a pure presentational child with tests still green.

---

#### F-018 · P2 · Admin eyebrow dual-headers on achievements workspace

**Evidence**

- `pages/admin/achievements.vue` uses `PageSectionHeader` with eyebrows “通用成就” / “称号目录” over titles “称号挑战” / “称号定义”.

**Why it fails**

- Dual labeling; jargon stack for operators who already chose the page.

**Fix**

- One title that matches the table content; move disambiguation into tab/segment control labels if needed.

**Acceptance**

- [ ] Section headers on that page use a single heading line unless two tables share an identical title.

---

#### F-019 · P2 · Admin metric “dashboard” tone

**Evidence**

- `AdminDashboardMetrics` + overview metrics with multiple accent-toned tiles.

**Guidance**

- Keep operational (counts + destination), avoid inventing decorative stat storytelling.
- Loading string “读取中…” inside metric value is OK; ensure tiles remain links only when destination is valid (already).

**Acceptance**

- [ ] No non-navigable metric tiles that look clickable; no sparkline/gradient decoration added.

---

### Workstream F — Accessibility & inclusive state

#### F-020 · P1 · Status meaning is text-backed (good) — keep contrast discipline

**Evidence**

- `StatusBadge` uses label + tone colors; not icon-only.
- `prefers-contrast: more` hardens borders on some surfaces in `main.css`.

**Risk**

- Warning/success mixes on dark mode need recheck when badges stack on accent-tinted cards (`content-card-emphasis` on home).

**Fix**

- When changing card backgrounds, re-verify badge contrast.
- Avoid placing `StatusBadge--warning` on `accent-surface` without a stronger border (token already mixes — spot-check).

**Acceptance**

- [ ] Spot-check light/dark: status chips on event cards and submission rows remain readable.

---

#### F-021 · P2 · Effect glossary term is keyboard focusable (good); ensure dismiss is predictable

**Evidence**

- `EffectGlossaryTooltip.vue`: `tabindex="0"` with focusin/out show/hide.

**Fix when touching**

- Escape should close tooltip if it becomes a rich popover; currently hover/focus pattern — document behavior in component if extended.

---

#### F-022 · P2 · Reduced transparency / motion coverage is strong on globals; component exceptions need the same hooks

**Evidence**

- Global media queries cover `.glass*`, header, event detail, admin dialog.
- Local surfaces (privacy-note, challenge-panel) are solid — good.

**Rule for agents**

- New `backdrop-filter` must use `.glass*` classes or register in the reduced-transparency block.
- New transitions that move large surfaces must respect reduced-motion (opacity fallback).

---

### Workstream G — CSS ownership & system drift

#### F-023 · P2 · Page-local shells re-declare the same page padding recipe

**Evidence**

- Repeated `padding-block: clamp(64px, 9vh, 104px) 72px` across maps/events/achievements/me variants.

**Why it fails**

- One system: drift when one page updates and others do not (already slightly different clamps on home/submit).

**Fix**

- Optional utility in `main.css`, e.g. `.page-block` / `.directory-page`, applied by directory archetypes.
- Only convert pages you touch.

**Acceptance**

- [ ] Touched directory pages share one padding recipe class or variable.

---

#### F-024 · P3 · Brand mark “O” is generic

**Evidence**

- `AppHeader.vue` brand-mark letter “O”.

**Why it fails**

- Mild placeholder feel; not slop, but weak craft for a named product「躲避堡垒 3」.

**Fix**

- Product/design asset decision (logo SVG) — out of scope for pure CSS agents unless asset provided.

---

## 5. Recommended execution order

Execute in this sequence so early wins remove false affordances before polishing pixels.

| Phase | Findings | Goal |
| --- | --- | --- |
| **1. Honesty** | F-001, F-002, F-003 | Stop lying in nav/account/home/me |
| **2. Directory clarity** | F-004, F-005, F-015 | Orient + reduce pill noise + empty CTAs |
| **3. Submit / confirm** | F-006, F-007, F-014, F-012 | Cleaner task chrome + honest icons + wait state |
| **4. Focus & a11y** | F-010, F-020, F-022 | Mobile nav focus model; contrast/motion hooks |
| **5. System craft** | F-008, F-023, F-016 | Radii/type/padding convergence on touched files |
| **6. Admin** | F-017, F-018, F-019, F-011 | Density, headers, no table press regression |
| **7. Editorial** | F-009, F-024 | Content emoji; brand asset when available |

Parallelization: Phase 1 and Phase 3 can run in parallel if different owners; **do not** parallel-edit `AppHeader.vue` and home without coordination.

---

## 6. Out of scope for this audit

- API contracts, OCR accuracy, review policy, permission model correctness (except UI that pretends a capability exists).
- Studio (`nuxt-studio`) chrome beyond route entry links.
- Sibling repos (Bastion client, QQBot).
- Replacing Nuxt UI or inventing a second component library.
- Full visual redesign / new color brand (tokens are already deliberate orange/stone).

---

## 7. Verification checklist (release gate for UI fix batches)

After each phase:

1. **Keyboard:** Tab through header (public + logged-in), open mobile menu, complete Escape path.
2. **Home honesty:** every nav target and home “card button” does a real job.
3. **Player loop:** login → me → submit → detail (pending/confirm/resubmit states if fixtures exist).
4. **Directory:** events/maps/achievements at 375px and 1280px — title hierarchy, chip wrap, empty states.
5. **Prefs:** flash `prefers-reduced-motion` and `prefers-reduced-transparency` — no stuck transforms; glass becomes solid.
6. **Admin smoke:** open reviews table + one detail drawer/dialog; row actions do not scale.
7. **Regressions:** run portal unit tests for touched components (`pnpm` filter portal test as available).

---

## 8. Finding index

| ID | Sev | Workstream | Summary |
| --- | --- | --- | --- |
| F-001 | P0 | A | Nav/home advertise unfinished rankings/rotation; static peers |
| F-002 | P0 | A | Account「设置」→ `/me#appearance` dead |
| F-003 | P1 | A | me intro dual primary (blog vs submit) |
| F-004 | P1 | A | Directory pages lack orienting body copy |
| F-005 | P1 | B | Event/map card pill overload |
| F-006 | P1 | B | Kickers + step numbers on catalogs/forms |
| F-007 | P2 | B | Sparkles on submit CTA |
| F-008 | P2 | B | Radius/type local forks |
| F-009 | P3 | B | Blog emoji headings |
| F-010 | P1 | C | Mobile nav focus ownership |
| F-011 | P2 | C | Protect table-action no-scale |
| F-012 | P2 | C | OCR wait visual continuity |
| F-013 | P2 | C | Overlay spatial consistency guidance |
| F-014 | P1 | D | Submit page decorative stepper / chrome weight |
| F-015 | P1 | D | Empty states without next action |
| F-016 | P2 | D | Login kicker-like labels |
| F-017 | P1 | E | Admin mega-SFC craft risk |
| F-018 | P2 | E | Admin dual eyebrows |
| F-019 | P2 | E | Dashboard metrics restraint |
| F-020 | P1 | F | Status contrast on tinted surfaces |
| F-021 | P2 | F | Glossary tooltip keyboard follow-through |
| F-022 | P2 | F | New glass/motion must hook system prefs |
| F-023 | P2 | G | Repeated page padding recipes |
| F-024 | P3 | G | Placeholder brand mark |

---

## 9. Document control

| Field | Value |
| --- | --- |
| Created | 2026-08-13 |
| Authoring mode | Independent; no prior audit consultation |
| Supersedes for agent work | Use this file as the fix backlog unless product explicitly re-prioritizes |
| Update rule | When a finding is fixed, mark acceptance checkboxes in the PR description and add `Fixes audit F-###` in the PR body (not necessarily GitHub issues) |

**End of audit.**
