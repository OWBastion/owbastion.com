# UI Stack

Portal (`apps/portal`) uses one library per UI capability. Reuse an installed library before you
write a component or behavior.

## Rule

Do not design or build a component or behavior yourself when an installed dependency can express it
correctly.

- This covers overlays, menus, selects, tabs, tables, date and time input, tooltips, toasts,
  resizable layout, focus management, keyboard navigation, virtual lists, carousels, animation
  sequencing, and icons.
- "Express correctly" means the library meets the [accessibility floors](interaction-accessibility.md)
  and the design need through props, slots, `ui` slot overrides, or theme tokens.
- Fix a style gap in theme tokens or `app.config.ts`. Do not replace or fork the component.
- Semantic native elements (`a`, `form`, `img`, `table` for static data) stay valid. Interactive
  widgets (`select`, dialogs, popovers, menus) come from the library.

## Designated libraries

| Capability | Library | Notes |
| --- | --- | --- |
| Components and behavior | Nuxt UI (`@nuxt/ui`, built on Reka UI) | All controls, overlays, menus, forms, toasts, tabs, pagination, tree, stepper, carousel |
| Styling | Tailwind CSS 4 | Theme tokens live in `assets/css/main.css`; component overrides in `app.config.ts` `ui` |
| Icons | Lucide through `@iconify-json/lucide` | Use `i-lucide-*`. No hand-drawn icon SVG. Brand and achievement artwork are assets, not icons |
| Data tables | Nuxt UI `UTable` | It wraps TanStack Table. Use `@tanstack/vue-table` directly only for a feature `UTable` does not expose |
| Resizable layout | Nuxt UI Dashboard components | `DashboardGroup`, `DashboardPanel`, `DashboardResizeHandle` |
| Dates | Nuxt UI `UCalendar` and `UInputDate` | Date values use `@internationalized/date` |
| Animation | Simple state change: CSS and Vue `<Transition>`. Gesture, spring, layout, sequence: `motion-v` | `motion-v` already ships with Nuxt UI. Add it to `apps/portal/package.json` at the first direct import |
| Utilities | VueUse | Check it before you write a composable |
| Theme mode | `@nuxtjs/color-mode` | |
| Client state | Nuxt `useState`, route, and server data | Pinia is not adopted. Add it only through an ADR |
| Editorial content | `@nuxtjs/mdc`, Shiki, KaTeX | Build-time rendering only |
| Drag and drop | Not designated | The first need chooses a library with keyboard operation and records it here in the same change |

## Add or replace a library

1. Check that no designated library covers the need. Read its documentation and types first.
2. Keep one library per capability. Do not add a second icon set, animation library, or table engine.
3. Update the table above in the same change that adds the dependency.
4. Remove the old library and its call sites when you replace one.

## Visual language

Color, type, radius, and layout stay open for experiment on `next`. Change them through theme tokens
and `ui` slot overrides, never through a parallel component.
