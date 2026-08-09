# Page Archetypes

本文档负责 Portal 页面级结构和主要工作区范式。组件选型、表单细节和实现
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

## Player center

- Identity and current-player facts first, then recent records and available
  actions.
- Use `PlayerIdentityCard`, `PageSectionHeader`, `TitleCollection`, and
  `PlayerRecentSubmissions`.
- Collapse to one column on narrow screens.

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

## Admin master and detail

- Keep the selectable list and selected detail in a wide workspace.
- Use `AdminResponsiveDialog` for overlays and collapse the columns rather than
  shrinking data below operable sizes.

## Admin Studio navigation entry

The management navigation launches third-party Studio as a standalone
same-origin workspace:

- The **内容编辑** item is a normal new-context link to the server-side Studio
  bridge. The current admin page remains available while the new context enters
  the same-origin `/studio` route and Studio's native full-screen layout.
- There is no intermediate `/admin/content` page or reserved editor viewport;
  the navigation item is the single entry point.
- Studio owns its own navigation, review, editor, and responsive layout. Portal
  must not reparent `<nuxt-studio>`, inject Shadow DOM CSS, depend on Studio
  internal Tailwind selectors/body attributes/sidebar state, or intercept Studio
  document routing to preserve an embedded presentation.
- The standalone route remains same-origin and server-protected by the existing
  platform Admin → Studio session bridge. The browser entry is an affordance,
  not the authorization boundary.

## Admin batch confirmation

- Show selection, affected count, consequence, and the confirm/cancel actions
  in that order.
- Reasons or notes may be optional audit data, never a prerequisite for an
  authorized decision.
