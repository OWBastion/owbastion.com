# Design System v2 Migration

本文档负责把 Portal 从 v1 实现迁移到 v2 设计规则：token 对照、迁移顺序、
防回退规则和验收方式。规则本身以各支柱文档为准；本文只描述如何落地。迁移
已全部完成，本文仅作历史记录。

## Why

Measured in `apps/portal` at `5bd3083`:

- 17 different media-query widths in component and page CSS (the rules named 3).
- 15+ border-radius values, 53 font sizes, 12 font weights (500–800).
- ~620 raw-`px` `padding` / `margin` / `gap` declarations in Vue files.
- Two button systems: `UButton` in 51 files, `primary-button` /
  `secondary-button` in 4, plus page-local button classes.
- Components switch layout on the viewport, so the same card renders one way in
  a three-column desktop grid and another way on a phone.

v2 fixes this at the foundation: a spacing ladder, four weights, four role
radii, two page breakpoints, container queries inside components, one anatomy
per component, and a 4.5:1 contrast floor for every text token.

## v1 → v2 mapping

| v1 | v2 | Rule |
| --- | --- | --- |
| `--accent` light `oklch(59% 0.16 48)` | `oklch(55% 0.16 48)` | visual-foundation |
| `--quiet` `oklch(61% …)` / dark `oklch(51% …)` | `oklch(52% 0.018 55)` / dark `oklch(62% 0.014 48)` | visual-foundation |
| `--info` / `--success` / `--warning` light 55% / 53% / 58% L | 48% / 48% / 55% L | visual-foundation |
| Font weights 640, 650, 680, 690, 720, 750, 760, 800 | 500 labels/meta · 600 values/buttons/titles · 700 display/page title | visual-foundation |
| `type-caption` `.78rem`/650, `type-kicker` `.75rem`/650 | `type-caption` `.75rem`/500; kicker only where copy rules allow | visual-foundation |
| `card-heading` `1rem`/720, map title `1.32rem`/650 | `type-card-title` `1.125rem`/600 | visual-foundation |
| `.detail-list dt` `.8rem` `--quiet`, `dd` `.88rem`/650 right-aligned | `type-label-sm` `--muted`, `type-label` left-aligned | components-and-patterns |
| Radius 8, 9, 10, 11, 12, 14px, `.5rem`, `.5625rem`, `.8125rem`, `.875rem` | `--radius-control` `0.625rem` | visual-foundation |
| Radius 16, 17, 18, 20px, `.75rem` (header) | `--radius-card` `1rem` | visual-foundation |
| `999px` / `9999px` | `--radius-pill` | visual-foundation |
| `px` paddings/gaps (13, 14, 15, 17, 18px …) | Nearest `--space-*` step | layout-and-spacing |
| `.hit-44` / `min-height: 44px` on buttons | `.hit-target-lg` on `--control-lg`; `--control-lg` under `pointer: coarse` | layout-and-spacing |
| Breakpoints 360, 380, 430, 460, 480, 560, 620, 640, 760, 767, 820, 821, 900, 960px, `38.75rem`, `48rem`, `51.25rem` | Pages: `48rem`, `64rem`. Components: `@container` `24rem` | layout-and-spacing |
| `primary-button`, `secondary-button`, `.submit-button`, `.review-page-button`, … | `UButton` + action row | components-and-patterns |
| `.detail-list` | `.detail-grid` | components-and-patterns |
| `MapCard` restacking at 620px | One-anatomy directory card | components-and-patterns |
| `--ui-radius: 0.7rem` | Tuned so `UButton` / `UInput` render at `--radius-control` | visual-foundation |

## Order

Each step is one PR (or a small series), per the Refactor contract in
[`DESIGN.md`](DESIGN.md). Do not mix steps.

1. **Foundation.** Add `--space-*`, `--control-*`, `--radius-*` and the v2
   type role classes to `main.css`; change the five color values; set the
   `UButton` theme (variants, sizes, radius, weight) and Nuxt UI radius in
   `app.config.ts`; add the `detail-grid` and action-row classes. Keep v1
   classes working. No page changes beyond what the shared theme changes.
2. **Guardrails.** Add stylelint with the rules in
   [`css-ownership.md`](css-ownership.md#guardrails) as warnings; run it in CI.
3. **Buttons.** Replace `primary-button`, `secondary-button` and page-local
   button classes with `UButton`; introduce the action row on the submission
   flow, binding, and admin decision surfaces. Remove the v1 button classes.
4. **Detail lists.** Move every `.detail-list` use (admin submission review,
   admin mastery run detail, player map progress) to `.detail-grid`. Remove
   `.detail-list`.
5. **Directory cards and grids.** Rebuild `MapCard` on the one-anatomy pattern
   and switch `MapDirectory` to the fluid grid; then apply the same pattern to
   event and achievement cards.
6. **Breakpoints and spacing sweep.** Per directory (`components/admin`,
   `components/maps`, …): replace viewport media queries in components with
   container queries, off-ladder spacing with `--space-*`, radius literals and
   off-scale weights with tokens; flip that directory's stylelint rules to
   errors.
7. **Cleanup.** Remove v1-only tokens and classes from `main.css`, and remove
   its remaining v1 radius/breakpoint/weight literals. Not complete: #192
   removed `type-kicker` (unused), retokenized `hit-44` as `hit-target-lg` on
   `--control-lg`, moved `card-heading`/`eyebrow` onto the v2 type scale and
   radius tokens, and migrated `main.css`'s two self-contained `620px`
   breakpoints (`.page-shell`, `.directory-page`) to `48rem`. Still
   outstanding in `main.css`: the `900px` sticky-chrome breakpoint, which is
   coupled to `AppHeader.vue`'s own unmigrated collapse point and can't move
   without it (#191). Setting every stylelint rule to error and marking this
   document historical also depend on #190 (admin sweep) and #191
   (public/player sweep), both open. `errorDirectories` stays empty and this
   document stays active until those land.

## Acceptance for every migration PR

- Stylelint passes for the touched files with v2 rules at error level.
- Rendered-browser verification must cover the affected responsive behavior at representative narrow, tablet, and desktop widths. Screenshot artifacts are not required.
- No horizontal page overflow at 320px.
- Reduced motion, reduced transparency, and increased contrast still behave as
  [`motion-and-feedback.md`](motion-and-feedback.md) requires.
- Behavior, copy, and permissions unchanged unless the linked issue says
  otherwise.
