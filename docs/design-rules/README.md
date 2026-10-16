# Design Rules

Portal (`apps/portal`) UI rules. Docs win over legacy code; legacy is never a precedent.
Read this index, then only the documents your change touches.

| Change | Read |
| --- | --- |
| Page orientation, hierarchy, old vs new | [design-direction.md](design-direction.md) |
| Color, type, radius, material, elevation | [visual-foundation.md](visual-foundation.md) |
| Grid, spacing, breakpoints, sticky/fixed, overflow | [layout-and-spacing.md](layout-and-spacing.md) |
| New component, Nuxt UI, Tailwind, buttons, cards, admin patterns | [components-and-patterns.md](components-and-patterns.md) |
| Page structure, admin tables, workbench, review | [page-archetypes.md](page-archetypes.md) |
| Scoped CSS, `main.css`, stylelint | [css-ownership.md](css-ownership.md) |
| Press, motion, toasts, loading | [motion-and-feedback.md](motion-and-feedback.md) |
| Responsive behavior, a11y, admin lists | [interaction-accessibility.md](interaction-accessibility.md) |
| Copy, states, explanatory text | [portal-copy-guidelines.md](portal-copy-guidelines.md) |
| Titles, challenges, statuses wording | [terminology.md](terminology.md) |
| Changelog Markdown | [changelog-guidelines.md](changelog-guidelines.md) |

## Principles

1. Make content, state, and next action obvious; omit decoration that does not aid operation.
2. One system: tokens, type, materials, elevation, press, and containers live in `main.css`,
   Nuxt UI config, or shared components, never in page-local forks.
3. Adaptive layout: `--space-*` ladder, `fr`/`minmax`, container queries; one anatomy at every
   width; no growing `position: fixed` docks.
4. Reuse in order: domain component, Nuxt UI, local composition. No second component library.
5. Color, icon, or position alone never carries meaning; honor reduced motion, transparency,
   and contrast.
6. The API decides what renders for public, player, and admin; CSS is not access control.
7. Feedback is mandatory, spectacle is not.
8. Every change moves its surface toward the direction; never regress to legacy.

## Before changing UI

1. Classify the page (directory, player center, submission flow, admin) and its data and
   permission boundary.
2. Search for a reusable component before writing CSS.
3. Keep loading, failure, empty, in-progress, success, and permission states (explain any
   that do not apply in the PR).
4. Check 320px layout, keyboard, ARIA, private fields, status wording, and that only
   required fields are marked.
5. Run affected Portal tests and `pnpm --dir apps/portal exec nuxt typecheck`; build when
   shared styles change.
6. Realign one pillar or surface per refactor PR; fill a doc gap before spreading code.
   Behavior and copy changes still follow `docs/product-rules/` and the terminology.
