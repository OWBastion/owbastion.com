# Interaction and Accessibility

Shared behavior and baseline. Motion: [motion-and-feedback.md](motion-and-feedback.md); layout:
[layout-and-spacing.md](layout-and-spacing.md); admin lists: [page-archetypes.md](page-archetypes.md).

## Interaction

- Controls use `pressable`, cards and rows `pressable-soft`; pair any hover affordance with visible
  press feedback, never hover-only movement.
- Reuse Nuxt UI and domain components for menus, dialogs, drawers, forms, tables, uploads; a new
  interaction pattern needs a domain reason.
- Enter and leave paths stay coherent; route changes use the shared opacity transition only.
- Prevent duplicate actions with `loading` and disabled states; dangerous actions use `color="error"`
  and state the consequence.
- Any new motion is necessary, interruptible where applicable, and has a reduced-motion fallback
  limited to opacity, color, border, or background.

## Accessibility baseline

- Semantic headings (h1-h3 by hierarchy; each major section has a heading or `aria-label`),
  readable `aria-label` on icon-only controls, visible focus, Nuxt UI focus management for dialogs,
  menus, forms (no hand-built session-style overlays).
- Loading, failure, empty, unavailable, and completed states have text or accessible status
  semantics, never color, icon, or position alone.
- Honor `prefers-reduced-motion`, `prefers-reduced-transparency`, `prefers-contrast`; extend the
  global policy in `main.css` rather than adding per-component strategies.
- Support `320px` first. Overlays and menus restore focus to the originating record or control on
  close. Admin record actions are operable by touch and menu, never bare text links.
- Search, filter, sort, grouping state stays visible to assistive technology even when moved into a
  menu or drawer on narrow screens.
