# Page Archetypes

本文档负责 Portal 页面级结构和主要工作区范式。组件选型、表单细节和实现
工作流见 [`portal-ui-guidelines.md`](portal-ui-guidelines.md)。

## Public directory

- Page title and scope first, filters at the top of the directory, then
  loading/error/empty/content states in one `surface-card` region.
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
- `AdminDataTable` owns filters, table scrolling, pagination context, and row
  actions.
- Mobile may collapse secondary controls and scroll the table region
  horizontally.

## Admin master and detail

- Keep the selectable list and selected detail in a wide workspace.
- Use `AdminResponsiveDialog` for overlays and collapse the columns rather than
  shrinking data below operable sizes.

## Admin batch confirmation

- Show selection, affected count, consequence, and the confirm/cancel actions
  in that order.
- Reasons or notes may be optional audit data, never a prerequisite for an
  authorized decision.
