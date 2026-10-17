# CSS Ownership

One design system; ownership follows responsibility, not file size. Values: [layout-and-spacing.md](layout-and-spacing.md),
[visual-foundation.md](visual-foundation.md).

## Who owns what

1. `main.css`, Nuxt UI config (`app.config.ts`), and shared tokens: colors, type, materials,
   elevation, press feedback, touch targets, containers, focus, reduced-motion/transparency/contrast
   policy. `:root` holds `--space-1..16`, `--control-*`, `--radius-*`, and type role classes.
2. Shared domain components or classes: stable repeated patterns (`detail-grid`, action row), when
   they carry semantics or behavior.
3. A reusable component: scoped CSS for its internal layout and state.
4. A page: scoped CSS for its own composition (grid areas, region order, sticky `top` in rem/safe-area,
   natural-aspect evidence, structure-matched skeletons, collapse at `48rem`/`64rem`).

A pattern seen twice gets an extraction review; at three uses extract it or record why they differ.
Repeated pure visual pattern: shared class or domain component; repeated semantic structure: domain
component. Fewer files or less scoped CSS is not a goal.

## Never redefine locally

Color tokens or raw hex/oklch as state; type scale, tracking, font stacks; glass, elevation, radius;
press curves (`pressable`/`pressable-soft`); touch floors and control heights (`--control-*`);
`page-shell` widths and gutters; spacing off the `--space-*` ladder; weights outside 400-700; radius
literals; button styling outside `UButton`. Components respond through container queries (`24rem`),
never viewport queries. Exception: `AppHeader` (viewport-pinned chrome) collapses at `48rem` and
uses `cq-compact` for very narrow internal spacing.

## Guardrails

`pnpm lint:styles` (in `pnpm check` and the Portal workflow, rules in `stylelint.config.mjs`) errors on
hex colors and `border-radius` literals. Keep it limited to values the tokens own; do not grow it
into a style linter.

## Review-only rules

Raw `px` in `padding|margin|gap|inset` (1px allowed), width `@media` in component styles, weights
and radius are checked in review. Only `pages/`, `layouts/`, `main.css`, `AppHeader.vue`, and
`AdminWorkspace.vue` may use `48rem`/`64rem` (and `47.99rem`/`63.99rem`) queries.

Tailwind utilities and Nuxt UI `ui` slots/props are preferred over deep selectors
([components-and-patterns.md](components-and-patterns.md)).

## Scoped CSS review

- [ ] No new semantic colors or type scale; no local container widths competing with `page-shell`
- [ ] Spacing, radius, weight from tokens (raw `px` only for 1px hairlines and shadow geometry)
- [ ] No viewport `@media` in a component; no CSS button classes; no feature `position: fixed` docks
- [ ] `min-width: 0` and full-width stacks for multi-card columns
- [ ] Reduced-motion, transparency, and contrast policy not bypassed
