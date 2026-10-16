# Page Archetypes

Page-level structure. Direction: [design-direction.md](design-direction.md); components:
[components-and-patterns.md](components-and-patterns.md). Pick the shell tier first
([layout-and-spacing.md](layout-and-spacing.md)); no page-local max-widths.

## Public directory

Title, then a scope sentence or required next action only if not self-evident; no eyebrow or
description by default. Filters at the top of the directory component; loading, error, empty, and
content switch inside one `surface-card` region with `UEmpty` for no results.

```vue
<main class="<name>-page page-shell">
  <section class="page-intro" aria-labelledby="<id>"><h1 id="<id>" class="page-title">Title</h1></section>
  <section class="<directory>-panel surface-card" aria-label="Content list"><!-- states / directory --></section>
</main>
```

## Editorial list and article

- **List**: no card; one column about `48rem` under the title and a one-line lead, grouped by year
  with a quiet rule. Dev logs feature the newest (date, title, summary, tags, "阅读全文") then rows
  (date, title, two-line summary, tags; the shared 开发日志 tag is omitted). Release notes are rows of
  version pill, date, title, newest marked "最新", fixed summary not repeated. A row is one link with
  a hover surface; on narrow screens the date sits above the title. The list is a light projection
  (title, path, date, version, tags).
- **Article**: no card; one centered column about `44rem`. Order: back link with 复制链接/分享 (native
  share if available), kicker (kind or version, date, reading time), balanced title, summary lead
  (dev logs only), tags, body. Contents (h2-h3, three or more) floats in the right gutter with the
  current section highlighted when wide, else an inline "本文目录". Body set for reading (leading
  about 1.85, h2 with a rule above, opening quote as a note); release notes are tighter. The end
  repeats share and links previous/next. Every article carries canonical URL and Open Graph/Twitter
  metadata.

## Event directory

- Search, then combinable chips with live counts: 事件组 and 常见效果 first (effects: all must match;
  groups: any-of), then 类别 and 稀有度, with 版本 and 状态 as selects. Active conditions and result
  count sit above the list with one "清除条件".
- Order and grouping are the player's choice (latest version, name, probability; none, 事件组, version,
  category); default no grouping, headings only when grouped.
- A card shows group, category, rarity, version, description, a probability bar relative to the most
  likely event, facts (duration, cooldown, weight), effects; status only if not "已实装". Detail leads
  with probability and what it means in draws. On narrow screens everything but search folds behind
  one "筛选与排序" control showing the active count.

## Player center and profile

- **Center** answers "what next": greeting and the primary upload action; a warning only when a
  submission needs the player; one summary row (`PlayerStatSheet`); unfinished goals
  (`PlayerNextGoals`); recent submissions; recent titles; map progress. One column on narrow screens,
  primary action leading, secondary links on one row. Use `PageSectionHeader`, `UEmpty` (`暂无称号`,
  `暂无记录`), `未开放` for unbuilt content.
- **Profile** may use game style on tokens: profile card (avatar, 战网 ID, equipped titles as
  `PlayerTitleBadge`, four-fact summary row), 战绩, then 称号收藏 beside 活跃日历 and 最近通关, then
  地图进度. Title tier is frame intensity on `slot` (开拓者 < 征服者 < 主宰) plus text and the "槽位"
  line; no separate rank or rarity. Collections group by series, fold long series, open a detail
  dialog per title. Only platform data; missing is omitted or "—". Maps without records fold behind
  one control. Pointer tilt is the only decorative motion.

## Submission flow

- **Upload**: one primary action in a `UCard` with `UFormField` and `UFileUpload`; requirements
  beside it on wide screens, below on narrow; explicit loading and disabled feedback (disable inputs
  during submit). The upload accepts evidence only; the platform matches Challenges.
- **Detail and status**: status and next action first, then screenshot in natural aspect ratio
  (`width: 100%; height: auto`, no crop), then recognition and result. Reuse `SubmissionStatusBadge`
  (wording in the copy guide). Evidence is sticky only where the desktop layout benefits and
  collapses above details on mobile. Show the unlisted screenshot only in the owner's or
  maintainer's detail.

## Admin list and table

- `AdminWorkspace` is the page root (title, count, messages, toolbar). Every admin table uses
  `AdminDataTable` (filters slot, sorting, grouping, pagination, stable row identity, row actions);
  do not substitute raw `UTable` or custom tables without a PR-stated reason.
- Server-paginated lists scroll with the page on all widths: height follows the current page,
  pagination follows the records, no nested Y-scroller; changing page, filter, or sort restores the
  list start. Server pagination stays explicit (never infinite scroll).
- Bounded internal scrolling or virtualization is opt-in with explicit configuration and an
  operational reason (stable virtualization element, a true data matrix needing persistent
  header/row context, master/detail needing both panes). Compactness or filling the viewport is not
  a reason. Sticky filters or headers likewise need a workflow reason.
- Intermediate widths may drop low-frequency columns into a contextual menu. Horizontal scroll only
  for a genuine matrix and never with a nested vertical scroller.
- Mobile renders the same records as a semantic record list: status and identity first, two or three
  decision facts, compact metadata, an accessible overflow action (not every column as label/value).
  Keep primary search and at most one primary action visible; move other filters, sorting, grouping
  into a menu or drawer. The record body is the detail target; use `AdminResponsiveDialog` for edit,
  decision, and confirmation. Keys, selection, expansion, menus, and async actions use stable record
  IDs, never array indexes.
- Feedback uses `UAlert` or the workspace messages area; admin copy prioritizes labels, values,
  statuses, actions (scan, locate, judge, act). Add no overview or summary layer that does not
  improve a decision.
- Batch confirmation shows selection, affected count, status, consequence, then confirm and cancel;
  a note or reason is optional audit data, never a prerequisite.

## Admin workbench (editable catalog)

For catalogs maintainers tune (random events are the reference), the table is the workbench and
every change goes through one draft.

- **Pool strip first**: what the catalog currently produces (events: candidate count and total
  weight) and operational switches (version availability) as toggles with an undo toast.
- **One toolbar line**: search, status chips with counts, the few narrowing filters; page actions
  (新建, 导入) on the title row.
- **Edit in the row**: tuned values (weight, group, version, status) are native controls; derived
  values recompute per row with their delta so an edit shows what it displaces.
- **One draft, one commit**: edits, bulk actions, and sheet edits are staged. A band says how many
  changes are unsaved and what moved most, with "放弃" and "保存全部". Saving is one batch (all or
  nothing, one audit record) and the toast offers "撤销" restoring previous values. Nothing saves
  while typing; leaving with a draft asks first.
- **Selection band**: bulk status, version, group, weight (set, add, multiply), staged into the draft.
- **Details on demand**: the name opens a slide-over sheet with every field, derived value, and
  previous/next, editing the same draft; new records are created from the sheet. Nothing is docked
  beside the table.
- Narrow screens keep compared columns (weight, probability) and edit the rest in the sheet; bands
  stay in flow above the table. Archiving is irreversible via the API, so it keeps a second click.

## Admin review workspace

- The screenshot is primary evidence in `EvidenceViewer` (wheel zoom, drag pan, double-click
  fit/original, fullscreen), never a fixed-size image. The recognized-field check sits directly under
  it as one summary line plus a chip per field; a chip opens that field's editor and the first field a
  Challenge waits for opens itself. The recognition model version is named wherever results show.
- The rail beside has two blocks: one card with the outcome and decision, and the Challenge match as
  a divided list with its search behind one control until nothing is proposed. It leads with what
  approval will produce, then decision controls, pinned on wide layouts. Secondary maintenance
  actions (resend recognition, accuracy mark) stay collapsed until needed or erroring.
- Narrow layouts are one column: outcome, decision, evidence, field check, Challenge match; the
  decision is not pinned. After a decision on the default queue the next waiting submission opens; a
  filtered queue returns to that view.
