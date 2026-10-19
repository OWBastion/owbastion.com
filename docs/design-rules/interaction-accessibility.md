# Interaction and Accessibility

Shared behavior and baseline.

## Interaction

- Never make an action reachable by hover alone; touch and keyboard reach everything.
- Prevent duplicate actions with `loading` and disabled states; dangerous actions use `color="error"`
  and state the consequence.
- Motion is free to explore but must stay interruptible and turn off under reduced motion.

## Accessibility baseline

- Semantic headings (h1-h3 by hierarchy; each major section has a heading or `aria-label`),
  readable `aria-label` on icon-only controls, visible focus, Nuxt UI focus management for dialogs,
  menus, forms (no hand-built session-style overlays).
- Loading, failure, empty, unavailable, and completed states have text or accessible status
  semantics, never color, icon, or position alone.
- Honor `prefers-reduced-motion`, `prefers-reduced-transparency`, `prefers-contrast`.
- Support `320px` first. Overlays and menus restore focus to the originating record or control on
  close. Admin record actions are operable by touch and menu, never bare text links.
- Search, filter, sort, grouping state stays visible to assistive technology even when moved into a
  menu or drawer on narrow screens.
