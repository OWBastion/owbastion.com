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
- Desktop uses the full table workspace and may keep bounded internal scrolling,
  sticky controls, sticky headers, column controls, and virtualization where
  they improve data-dense operation.
- Intermediate widths may reduce visible columns and move low-frequency actions
  into a contextual menu. Horizontal scrolling is reserved for data that still
  needs a matrix presentation.
- Mobile normally renders the same records as a semantic record list in normal
  document flow. Desktop and mobile share data, state, pagination, permission,
  and action contracts; they do not need identical table markup.
- Ordinary server-paginated mobile lists must not create a nested vertical
  scroller. The page scrolls continuously through the toolbar, current records,
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

## Admin content workspace

The content editor (`/admin/content`) embeds the third-party Studio editor
inside the Portal admin shell instead of overlaying a separate surface:

- Structure: `AdminWorkspace` title + `#actions` carrying the escape to the
  admin overview and the editor controls (open/close). The workspace itself is
  one `surface-card`; entering the page opens the editor automatically, so no
  redundant toolbar heading or status line is added around it.
- Loading, failure, and closed states render inside the card (short loading
  label with an ellipsis, an `UAlert` with a reload action, and a compact empty
  state) — the states that are not self-evident from the visible editor.
- The editor frame is a **bounded editing viewport** when open: natural content height up to
  a `max-height` in `clamp()` with internal scroll after the cap, so short
  directory views do not reserve empty space while long documents never push the
  toolbar out of reach. This bounded scroll is an explicit exception to the
  no-bounded-scroll rule, which targets server-paginated data lists.
- The embed mechanics (moving the `nuxt-studio` element into the frame,
  injecting the embedded shadow layout, session check and cleanup) live in
  `useStudioEditorWorkspace`; do not re-implement them per page.
- Opening a published content route while the workspace is active stays inside
  the admin: the route guard opens the document in the editor and reports it
  with visible feedback plus an explicit "preview in page" escape.

## Admin batch confirmation

- Show selection, affected count, consequence, and the confirm/cancel actions
  in that order.
- Reasons or notes may be optional audit data, never a prerequisite for an
  authorized decision.
