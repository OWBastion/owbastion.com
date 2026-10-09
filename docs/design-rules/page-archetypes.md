# Page Archetypes

本文档负责 Portal 页面级结构和主要工作区范式。整体取向、信息层级和新旧页面的演进见
[`design-direction.md`](design-direction.md)；本文把其中已落地的方向写成可复用的页面范式。组件选型、表单细节和实现
工作流见 [`portal-ui-guidelines.md`](portal-ui-guidelines.md)；布局单位与
定位见 [`layout-and-spacing.md`](layout-and-spacing.md)；组件库边界见
[`components-and-patterns.md`](components-and-patterns.md)。

## Public directory

- Page title and, only when not self-evident, a scope sentence or required next
  action come first; filters at the top of the directory, then
  loading/error/empty/content states in one `surface-card` region.
- No page eyebrow/kicker or page description by default; keep them only when the
  heading and visible content cannot communicate scope, a constraint, or the
  required next action (see [`content-and-state.md`](content-and-state.md)).
- Use the directory components and `UEmpty`.

## Editorial article (开发日志 and 版本更新)

- A page for reading and passing on, not a card: one centered column about
  44rem wide on the page background, nothing boxed around the text.
- Order: back link with 复制链接 / 分享 (native share where the browser has it), a
  kicker (kind or version, date, reading time), the title balanced across lines,
  the summary as a lead (development logs only; a release note's summary is a
  fixed sentence and stays in the list and the share preview), tags, then the body.
- A contents list (headings level 2–3, three or more) floats in the right gutter
  with the section being read highlighted when the frame is wide enough, and folds
  into an inline "本文目录" otherwise.
- The body is set for reading (about 1.85 leading, level-2 headings with a rule above,
  an opening quote rendered as a note). A release note is the same page with tighter
  spacing, because it is scanned.
- The end of the page repeats the share action and links to the previous and next
  entry (the older and newer version for a release note).
- Every article carries a canonical URL and Open Graph / Twitter metadata so a
  shared link previews with its title and summary.

## Event directory

- Search, then combinable chips with live counts: 事件组 and 常见效果 first (effects
  are the most common ones and must all match; groups are any-of), then 类别 and
  稀有度, with 版本 and 状态 as selects. Active conditions and the result count sit
  above the list with one "清除条件".
- Order and grouping are the player's choice (latest version, name, or
  probability; none, by 事件组, version, or category); the default is no
  grouping. A group heading appears only when a grouping is chosen.
- A card carries the group, category, rarity and version, the description, a
  probability bar relative to the most likely event, the facts (duration,
  cooldown, weight), and effects. Status is shown only when it is not
  "已实装". The detail leads with the probability and what it means in draws.
- On narrow screens everything except search folds behind one "筛选与排序" control
  that shows how many conditions are active.

## Player center

- Answer "what should I do next": greeting and the primary upload action
  first, a warning only when a submission needs the player (a rejection that
  asks for a new upload), one summary row (`PlayerStatSheet`), the unfinished
  map goals the player is already on (`PlayerNextGoals`), recent submissions,
  recently earned titles, then map progress.
- Map progress lists started maps and collapses the rest behind one control
  (`PlayerMapProgressSection`); it never renders a wall of empty cards.
- Use `PageSectionHeader`, `PlayerRecentSubmissions`, `PlayerTitleBadge`.
- Collapse to one column on narrow screens; on a phone the primary action leads
  and the secondary links share one row.

## Player profile

- A player-facing page that shows identity and collection may use a game-style
  presentation (see [`design-direction.md`](design-direction.md)), still on
  Portal tokens: a profile card (avatar, 战网 ID, 佩戴称号 as `PlayerTitleBadge`
  slots, one summary row of four facts), then 战绩, then the 称号收藏 beside the
  活跃日历 and 最近通关, then 地图进度.
- Title tier is shown by frame intensity on the existing `slot`
  (开拓者 < 征服者 < 主宰) in addition to the title text and the "槽位" line in
  the detail dialog; there is no separate rank, level, or rarity.
- Collections group by series, collapse long series, and open a detail dialog
  per title. Only data the platform already returns is shown; a missing fact is
  omitted or shown as "—", never invented.
- Maps without a record are collapsed behind one control rather than listed as
  empty cards.
- Pointer tilt on title icons is the only decorative motion (see
  [`motion-and-feedback.md`](motion-and-feedback.md)); there is no entrance,
  floating, sweep, or pulse animation.

## Screenshot upload

- One primary upload action in a `UCard`.
- Requirements sit beside it on wide screens and below it on narrow screens,
  with `UFileUpload` and explicit disabled/loading feedback.

## Submission detail and status

- Status and next action first, evidence in its natural aspect ratio, then
  recognition/result details.
- Keep evidence sticky only where the desktop detail layout benefits; collapse
  it above details on mobile.

## Admin list and table

- `AdminWorkspace` owns title, count, messages, and toolbar.
- `AdminDataTable` owns filters, sorting, grouping, table/list presentation,
  pagination context, stable row identity, and row actions.
- Ordinary server-paginated admin lists are **document-flow by default on
  desktop and mobile**: the page owns vertical scrolling, the list/table height
  is content-driven for the current page, and pagination follows the records in
  document flow. Changing page, filter, or sort should restore the
  list/workspace start rather than an arbitrary global page top.
- Bounded internal vertical scrolling is **opt-in**: enable it only with an
  explicit configuration and a concrete operational reason, such as
  virtualization needing a stable scroll element, a real data matrix whose
  persistent header/row context materially improves operation, or a
  master/detail workspace that must keep both panes operable. Visual
  compactness or viewport filling is not a reason. Sticky controls/headers are
  likewise optional and justified by workflow need, not assumed.
- Intermediate widths may reduce visible columns and move low-frequency actions
  into a contextual menu. Horizontal scrolling is reserved for data that still
  needs a matrix presentation and does not imply a nested vertical scroller.
- Mobile normally renders the same records as a semantic record list in normal
  document flow. Desktop and mobile share data, state, pagination, permission,
  and action contracts; they do not need identical table markup.
- Ordinary server-paginated lists must not create a nested vertical scroller on
  any width. The page scrolls continuously through the toolbar, current records,
  and pagination controls.
- Continuous document scrolling does not replace server pagination and must not
  become infinite scrolling.
- Mobile records prioritize status and primary identity, then the two or three
  facts needed for the next decision, compact metadata, and an accessible
  overflow action. Do not mechanically render every desktop column as a repeated
  label/value block.
- Keep primary search and at most one primary page action visible on mobile.
  Move secondary filters, sorting, and grouping into an appropriate Nuxt UI menu
  or drawer; hide desktop-only column controls when they do not affect the mobile
  record presentation.
- Prefer the record body as the detail/navigation target. Move low-frequency row
  actions into a contextual menu and use `AdminResponsiveDialog` for edit,
  decision, and confirmation surfaces.
- Expansion, selection, menu targets, and async actions use stable record IDs,
  never array indexes.
- A horizontally scrolling mobile table is an explicit exception for a genuine
  data matrix that cannot be converted into actionable records without losing
  meaning or operability.

## Admin workbench (editable catalog)

For a catalog the maintainers tune rather than only browse (random events are the
reference), the table is the workbench and every change goes through one draft.

- **Pool strip first**: what the catalog currently produces (for events: how many
  are in the candidate pool and their total weight) and the operational switches
  (version availability) as small toggles with an undo toast.
- **One toolbar line**: search, the status as chips with counts, and the few
  filters that narrow the list. Page-level actions (新建, 导入) sit on the title row.
- **Edit in the row**: the values that are tuned (weight, group, version, status)
  are native controls in the table; derived values recompute for every row as they
  change and show their delta, so one edit shows what it displaces.
- **One draft, one commit**: every edit, bulk action and sheet edit is staged. A
  band above the table says how many changes are unsaved and what moved most, with
  "放弃" and "保存全部". Saving is one batch request (all or nothing, one audit
  record); the toast offers "撤销", which writes the previous values back. Nothing
  is saved while typing, and leaving with a draft asks first.
- **Selection band**: choosing rows adds a band for bulk status, version, group and
  weight (set, add, multiply). Bulk actions stage into the same draft.
- **Details on demand**: the name opens a slide-over sheet with every field, the
  derived value and previous/next; it edits the same draft. A new record is created
  from the sheet with its own action. Nothing is docked beside the table.
- Narrow screens keep the compared columns (weight, probability) and edit the rest
  in the sheet; the draft and selection bands stay in flow above the table.
- Archiving is irreversible through the API, so it keeps a confirming second click.

## Admin review workspace

- The screenshot is the primary evidence and `EvidenceViewer` (wheel zoom, drag
  to pan, double-click fit/original size, fullscreen) shows it, never a
  fixed-size image. The check of the recognized fields sits directly under it,
  where the maintainer compares them, as one summary line and a chip per field;
  a chip opens that field's editor, and the first field a Challenge waits for
  opens by itself. The rail beside is two blocks: one card with the outcome and
  the decision, and the Challenge match as a divided list with its search kept
  behind one control until nothing was proposed. The recognition model version
  is named wherever recognition results are shown, to maintainers and players.
- The decision rail leads with what approval will produce, then the decision
  controls, pinned in view on wide layouts. Secondary maintenance actions
  (resend recognition, accuracy mark) stay collapsed until needed or until they
  report an error.
- Narrow layouts read in one column: outcome, decision, evidence, field check,
  Challenge match; the decision is not pinned there.
- After a decision on the default queue the next waiting submission opens;
  a filtered queue view returns to that view instead.

## Admin batch confirmation

- Show selection, affected count, consequence, and the confirm/cancel actions
  in that order.
- Reasons or notes may be optional audit data, never a prerequisite for an
  authorized decision.
