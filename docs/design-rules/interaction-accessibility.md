# Interaction, Layout and Accessibility

本文档负责 Portal 的共享交互反馈、动效边界、响应式布局和无障碍基线。

## Interaction baseline

- Use `pressable` for controls and `pressable-soft` for cards and rows. Pair
  hover affordances with visible press feedback; do not rely on hover-only
  movement.
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

## Layout and accessibility

- Design for `320px` width first; prefer the existing `620px`, `760px`, and
  `820px` breakpoints.
- Keep mobile primary controls at least `44px` high and icon controls at least
  `44×44px`. Admin table and record-list actions must remain operable without
  bare text links.
- Use semantic headings, readable `aria-label` values for icon-only controls,
  visible focus states, and Nuxt UI focus management for dialogs and menus.
- Express loading, failure, empty, unavailable, and completed states with text
  or accessible status semantics; never use color, icon, or position alone.
- Preserve `prefers-reduced-motion`, `prefers-reduced-transparency`, and
  `prefers-contrast` behavior. Do not reintroduce component-local transforms
  without an explicit fallback.

## Responsive admin lists

- Ordinary mobile admin lists use document-level vertical scrolling. Do not
  place a server-paginated record list inside a bounded `max-height` region with
  its own vertical scrollbar.
- Desktop may retain bounded table scrolling, sticky controls, sticky headers,
  and virtualization where the data-dense workspace benefits from them. These
  desktop behaviors must not constrain the mobile document-flow renderer.
- Desktop table and mobile record-list presentations share records, loading and
  error states, filters, sorting, server pagination, permissions, actions, and
  stable identity. Shared behavior does not require identical markup.
- Preserve server pagination and make its controls naturally reachable after the
  current mobile record list. Do not reinterpret continuous page scrolling as
  infinite scrolling.
- Prevent overall page horizontal overflow. Use a horizontally scrolling mobile
  table only for a genuine matrix whose meaning or operability would be damaged
  by conversion to records.
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
