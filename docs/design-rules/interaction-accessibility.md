# Interaction, Layout and Accessibility

本文档负责 Portal 的共享**交互行为**、响应式与无障碍基线。

- **布局单位、栅格、sticky/fixed、溢出**：权威文档为
  [`layout-and-spacing.md`](layout-and-spacing.md)（本文件只保留与交互相关的摘要）。
- **动效、按压、反馈类型**：权威文档为
  [`motion-and-feedback.md`](motion-and-feedback.md)。
- **组件选型**：[`components-and-patterns.md`](components-and-patterns.md)。

## Interaction baseline

- Use `pressable` for controls and `pressable-soft` for cards and rows. Pair
  hover affordances with visible press feedback; do not rely on hover-only
  movement. Details: [`motion-and-feedback.md`](motion-and-feedback.md).
- Reuse Nuxt UI and existing domain components for menus, dialogs, drawers,
  forms, tables, and upload controls. New interaction patterns need a clear
  domain reason.
- Keep enter and leave paths coherent and avoid page-local spatial transitions.
  Route changes use the shared opacity transition.
- Use `loading` and disabled states to prevent duplicate actions. Dangerous
  actions use `color="error"` and state the consequence clearly.
- Motion is optional. Any new motion must be necessary, interruptible where
  applicable, and have a reduced-motion fallback limited to opacity, color,
  border, or background changes. Springs, haptics, and decorative entrance
  animations are never release requirements.

## Layout summary (see layout-and-spacing for full rules)

- Design for `320px` / ~`20rem` width first; prefer system breakpoints
  (`620` / `760` / `820` CSS px baselines, rem-equivalent allowed).
- Structural spacing and columns: prefer `rem`, `fr`, `minmax`, `clamp` —
  not hard-coded `px` stacks. Touch floor: `2.75rem` / `.hit-44`.
- Feature decision surfaces stay **in document flow** or **sticky**; do not
  use growing `position: fixed` action docks (review bars, expandable forms).
- Collapse grids to one full-width column on narrow screens; stacked cards
  share the same width (`width: 100%`, `min-width: 0`).
- Admin table and record-list actions must remain operable without bare text
  links.

## Accessibility baseline

- Use semantic headings, readable `aria-label` values for icon-only controls,
  visible focus states, and Nuxt UI focus management for dialogs and menus.
- Express loading, failure, empty, unavailable, and completed states with text
  or accessible status semantics; never use color, icon, or position alone.
- Preserve `prefers-reduced-motion`, `prefers-reduced-transparency`, and
  `prefers-contrast` behavior. Do not reintroduce component-local transforms
  without an explicit fallback (see motion doc).

## Responsive admin lists

- Ordinary server-paginated admin lists use **document-level vertical scrolling
  on desktop and mobile by default**. The page owns vertical scrolling; the
  list/table height is content-driven for the current page, and pagination
  follows the records in document flow. Do not place a server-paginated record
  list inside a bounded `max-height` region with its own vertical scrollbar.
- Filters, sorting, grouping, count, row actions, and loading/error/empty states
  remain part of the same workspace as the list and pagination. Changing page,
  filter, or sort should restore a useful workspace position, normally the list
  start, rather than an arbitrary global page top.
- Desktop table and mobile record-list presentations share records, loading and
  error states, filters, sorting, server pagination, permissions, actions, and
  stable identity. Shared behavior does not require identical markup.
- Preserve server pagination and make its controls naturally reachable after the
  current record list. Document scrolling is not infinite scrolling: the server
  page remains authoritative and pagination stays explicit.
- **Bounded internal vertical scrolling is opt-in, not a default.** It requires
  an explicit configuration and a concrete operational reason, such as
  virtualization that needs a stable scroll element, a real data matrix where
  persistent header/row context materially improves operation, a master/detail
  workspace that must keep both panes simultaneously operable, or another
  documented case where page-level scrolling causes an actual workflow
  regression. Visual compactness, viewport filling, and historical
  implementation are not sufficient reasons.
- Sticky filters and sticky headers are optional, not automatically required
  when a table uses document flow. Prefer the simplest continuous
  reading/operation model unless persistent controls materially improve the
  workflow.
- Prevent overall page horizontal overflow. Local horizontal containment is
  allowed only for a genuine data matrix and is separate from vertical scroll
  ownership: containing horizontal overflow must not create an internal vertical
  scrollbar. A horizontally scrolling mobile table is reserved for a matrix
  whose meaning or operability would be damaged by conversion to records.
- Mobile record actions use accessible touch targets and contextual menus. Nuxt
  UI menus, drawers, and dialogs must restore focus to the originating record or
  control when they close.
- Use stable record IDs for keys, disclosure state, selection, menu targets, and
  async operations. Sorting, filtering, refreshes, and pagination must not move
  state to a different record because it reused the same array index.
- Keep primary search and at most one primary action directly visible on narrow
  screens. Secondary filters, sorting, grouping, and low-frequency actions may
  move into menus or drawers without hiding the active state from assistive
  technology.
