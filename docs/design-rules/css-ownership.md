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
- Touch target floors (use `.hit-44` / `2.75rem` policy)
- `page-shell` max-width and page gutters

Pages **may** own: grid-template areas, order of regions, sticky `top` offsets
using `rem` / safe-area, structure-matched skeleton geometry, and media-query
collapse that follows system breakpoints.

## Units in CSS (implementation of layout-and-spacing)

| Property class | Ownership guidance |
| --- | --- |
| `gap`, `padding`, `margin` for structure | `rem` / `clamp` / component CSS variables |
| `min-height` of primary controls | ≥ `2.75rem` on mobile primary actions |
| Grid tracks | `minmax(0, 1fr)`, `minmax(min(100%, Nrem), 1fr)`, `auto-fit` |
| `border-width: 1px`, shadow blur/offset | `px` OK |
| Breakpoints | Prefer shared 620 / 760 / 820 family (px or rem equivalent) |

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
- [ ] Structural spacing not a pile of unexplained `px` if `rem`/`clamp` works
- [ ] No `position: fixed` feature docks without layout-doc exception
- [ ] `min-width: 0` / full-width stack for multi-card columns
- [ ] Reduced-motion / transparency / contrast not bypassed

## Refactor extraction rule

Repeated pure visual patterns → shared class in `main.css` or domain component.
Repeated semantic structure → domain component. File-count reduction alone is
not a goal.
