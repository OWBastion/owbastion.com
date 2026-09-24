# CSS Ownership

本文档负责 Portal CSS 的职责边界、单位落地、共享模式抽取和页面级例外。
视觉 token 见 [`visual-foundation.md`](visual-foundation.md)；布局单位见
[`layout-and-spacing.md`](layout-and-spacing.md)。

## Ownership rules

The Portal has one design system. Ownership follows responsibility rather than
file size:

1. `main.css`, Nuxt UI configuration (`app.config.ts` / theme), and shared
   tokens own semantic colors, type scale, materials, elevation, interaction
   feedback, touch targets, containers, focus, and reduced-motion /
   transparency / contrast policy.
2. Shared domain components or classes own stable patterns repeated across
   pages, especially when they carry semantics or behavior.
3. A reusable component may keep scoped CSS for internal layout and state
   presentation.
4. A page may keep scoped CSS for its own composition: unique grids, sticky
   evidence/detail columns, responsive collapse, natural-aspect evidence, and
   structure-matched skeletons.

When a pattern appears twice, check whether it is stable; at three or more uses,
extract it or record why the instances are intentionally different. Do not
extract a one-off wrapper merely to reduce scoped CSS, and do not redefine
shared tokens, radii, elevations, materials, type, or container widths locally.

## What must not be redefined locally

Do not re-declare in page/component scoped CSS:

- Color tokens or ad-hoc hex/oklch used as semantic state
- Type scale, heading tracking systems, or alternate font stacks
- Glass / elevation / radius design language
- Press feedback scale curves (use `pressable` / `pressable-soft`)
- Touch target floors and control heights (use `--control-*`)
- `page-shell` max-width and page gutters
- Spacing values outside the `--space-*` ladder, font weights outside
  400/500/600/700, radius literals, or button styling outside `UButton`

Pages **may** own: grid-template areas, order of regions, sticky `top` offsets
using `rem` / safe-area, structure-matched skeleton geometry, and page-layout
collapse at the two page breakpoints (`48rem`, `64rem`). Components own their
responsive behavior through container queries (`cq-compact`, `24rem`), never
viewport media queries. Exception: `AppHeader` is global page chrome pinned to
the viewport (not a sized container), so its nav-to-drawer collapse uses the
`48rem` page breakpoint like a layout; its internal spacing at very narrow
widths still uses `cq-compact`.

## Units in CSS (implementation of layout-and-spacing)

| Property class | Ownership guidance |
| --- | --- |
| `gap`, `padding`, `margin` for structure | `var(--space-*)`; `clamp()` only between two ladder steps |
| `min-height` of controls | `var(--control-*)`; `--control-lg` under `pointer: coarse` |
| `border-radius` | `var(--radius-control|card|sheet|pill)`; `50%` only for circular marks |
| `font-weight` | 400 / 500 / 600 / 700 |
| Grid tracks | `minmax(0, 1fr)`, `minmax(min(100%, Nrem), 1fr)`, `auto-fit` |
| `border-width: 1px`, shadow blur/offset | `px` OK |
| Breakpoints | Pages: `48rem` / `64rem` only. Components: `@container` at `24rem` |

Normative unit policy lives in
[`layout-and-spacing.md`](layout-and-spacing.md). CSS ownership enforces
**where** styles live; layout doc enforces **what values mean**.

## Tailwind and Nuxt UI styles

- Tailwind utilities are allowed for local composition when they map cleanly to
  the design system (width, min-width, grid, gap from theme).
- Do not use Tailwind as a second token system for brand color, type, or glass.
- Prefer Nuxt UI props / `ui` slot overrides over deep selectors into generated
  classes.
- Full policy: [`components-and-patterns.md`](components-and-patterns.md).

## Scoped CSS review checklist

When reviewing a `<style scoped>` block:

- [ ] No new semantic colors or type scale
- [ ] No page-local container max-width competing with `page-shell`
- [ ] Spacing, radius, and weight values come from the tokens (no raw `px` except 1px hairlines / shadow geometry)
- [ ] No viewport `@media` inside a component; container query instead
- [ ] No CSS button classes; `UButton` only
- [ ] No `position: fixed` feature docks without layout-doc exception
- [ ] `min-width: 0` / full-width stack for multi-card columns
- [ ] Reduced-motion / transparency / contrast not bypassed

## Where the tokens live

`main.css` `:root` owns `--space-1` … `--space-16`, `--control-sm|md|lg`,
`--radius-control|card|sheet|pill`, and the type role classes, next to the
color tokens. `app.config.ts` owns the `UButton` variant/size theme and the
Nuxt UI radius tuning. Shared pattern classes (`detail-grid`, action row) live
in `main.css` or a domain component, not in page CSS.

## Guardrails

Stylelint enforces the rules above in CI: no raw `px` for
`padding|margin|gap|inset` (1px allowed), `font-weight` limited to
400/500/600/700, no `border-radius` literals, and no `@media` width queries in
component `<style>` blocks other than the two page breakpoints in page
components. Rules start as warnings and become errors directory by directory as
[`design-system-v2-migration.md`](design-system-v2-migration.md) completes.

Run `pnpm lint:styles`; it also runs in `pnpm check` and the Portal publish
workflow. Rules live in `stylelint.config.mjs`. Page files (`pages/`,
`layouts/`) may use only the `48rem` / `64rem` width queries and their
`47.99rem` / `63.99rem` complements; every other file may use none.

To flip a directory to errors, add its repository-relative path to
`errorDirectories` at the top of `stylelint.config.mjs`. Every rule in that
directory then fails `pnpm lint:styles`; all other directories stay warnings.
An entry may also name a single file (e.g. a shared component swept ahead of
the rest of its directory, or a page swept ahead of a directory like
`pages/admin` that has not); anything ending in a file extension is matched
as-is instead of treated as a directory prefix.

## Refactor extraction rule

Repeated pure visual patterns → shared class in `main.css` or domain component.
Repeated semantic structure → domain component. File-count reduction alone is
not a goal.
