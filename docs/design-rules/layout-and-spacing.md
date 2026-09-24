# Layout and Spacing

本文档负责 Portal 的布局单位、容器、栅格、定位、溢出和间距约定。
视觉 token 见 [`visual-foundation.md`](visual-foundation.md)；交互与动效见
[`interaction-accessibility.md`](interaction-accessibility.md)；CSS 归属见
[`css-ownership.md`](css-ownership.md)。

**规范优先于现状。** 仓库中仍存在大量固定 `px` 与局部 `position: fixed` 写法；
新改动与专门重构必须遵循本文，不得以「现有页面也这样写」为理由继续复制违规模式。

## Goals

1. Layout adapts to viewport width, text size, and safe areas without horizontal
   page overflow.
2. Spacing and touch targets scale with the root font size (`rem`) so Dynamic
   Type / browser zoom remains usable.
3. Primary decision surfaces stay inside the document flow or use sticky
   behavior that cannot grow past the viewport unnoticed.
4. Shared containers and gutters come from `main.css` / `page-shell`, not
   page-local max-width redefinitions.
5. A component looks and reads the same on desktop and mobile: it adapts to
   the width it is given, not to the device.

## Units (normative)

| Use | Prefer | Avoid |
| --- | --- | --- |
| Spacing (gap, padding, margin) | The `--space-*` ladder below | Hard-coded `px` stacks (`12px`, `14px`, `18px` …) and off-ladder rem values |
| Type | Shared type classes / rem tokens | One-off `font-size` + tracking pairs |
| Control height / touch targets | `--control-sm` / `--control-md` / `--control-lg`; `--control-lg` (2.75rem ≈ 44px) under `pointer: coarse` | `min-height: 36px` / bare text links on mobile primary actions |
| Column tracks | `minmax(0, 1fr)`, `minmax(min(100%, Nrem), 1fr)`, `auto-fit` / `auto-fill` | Fixed `minmax(300px, …)` that force overflow |
| Breakpoints | Two page breakpoints; container queries inside components (see below) | One-off pixel breakpoints; viewport media queries inside components |
| Hairlines, blur radii, elevation offsets | `px` is acceptable for 1px borders and shadow geometry | Using `px` for layout structure |
| Viewport-relative height | `dvh` / `%` when needed | Assuming `100vh` ignores mobile chrome |

Rules:

- Prefer **relative and fluid units** for anything that participates in layout
  structure (columns, gaps, sticky offsets, card padding, button min-height).
- Prefer **`rem` over `em`** for page-level spacing so nested components do not
  compound unexpectedly. Use `em` only when padding should track a local
  control’s font size.
- Prefer **`minmax(0, 1fr)`** (or `min-width: 0`) on grid/flex children that
  contain long text or media so they shrink instead of forcing overflow.
- Prefer **`repeat(auto-fit, minmax(min(100%, <track>), 1fr))`** for equal
  action groups that must collapse from N columns to one without a custom
  media query for every width.
- Do **not** invent a parallel spacing scale in a single component. If a
  repeated spacing pair appears three or more times, extract a shared variable
  or class into `main.css` (or an established domain component).

## Spacing scale (normative)

All gaps, paddings, and margins use one of these steps (4px base at a 16px root):

| Token | Value | Typical use |
| --- | --- | --- |
| `--space-1` | `0.25rem` | Icon-to-label gap, badge block padding |
| `--space-2` | `0.5rem` | Gap inside control groups, between badges/tags |
| `--space-3` | `0.75rem` | Detail row padding, `sm`/`md` button inline padding, stat gaps |
| `--space-4` | `1rem` | Card padding (compact), gap between buttons, grid gutter |
| `--space-5` | `1.25rem` | Card padding (regular), `lg` button inline padding |
| `--space-6` | `1.5rem` | Gap between cards in a stack, inner section spacing |
| `--space-8` | `2rem` | Between sections inside a page |
| `--space-12` | `3rem` | Between major page regions; desktop shell inset |
| `--space-16` | `4rem` | Directory page top padding (desktop) |

`clamp()` is allowed only between two ladder steps (e.g.
`clamp(var(--space-8), 6vw, var(--space-16))`).

Control heights: `--control-sm` `2rem` (pointer-fine devices only — admin
tables and dense toolbars), `--control-md` `2.5rem` (default), `--control-lg`
`2.75rem` (primary flow actions and every control under `pointer: coarse`).

## Containers and gutters

- Use `page-shell` (broad default workspaces), `page-shell--readable`
  (prose detail / reading surfaces), `page-shell--narrow` (forms / focused
  detail), `page-shell--wide` (admin data workspaces). Max widths use `rem`
  so they scale with the root font size: `90rem` (≈1440px), `68.75rem`
  (≈1100px), `47.5rem` (≈760px), `90rem` — these baselines live in
  `main.css`.
- Default to `page-shell` for card/grid directories, dashboards, editorial
  directories, and side-by-side detail workspaces; it sits just inside the
  global header measure. Reserve `page-shell--readable` for prose-heavy
  single-article pages and `page-shell--narrow` for focused forms. Do not
  compensate for the shared default with page-local widths.
- Horizontal gutters are owned by `page-shell` (`100% - 3rem` desktop,
  `100% - 1.5rem` mobile). Do not re-implement page margins with local
  `padding-inline: 0.75rem` on every card stack.
- Full-bleed chrome (header, fixed system bars) must still keep interactive
  content inside the same readable measure or document the exception.
- Cards and panels in a vertical stack must share **one column width**:
  `width: 100%`, `max-width: 100%`, `min-width: 0`, `box-sizing: border-box`.
  Uneven card widths on mobile are a defect.

## Grid and composition

- Default narrow layout is **one column**. Multi-column grids collapse at the
  system breakpoints; do not shrink two operable columns below usable width.
- Prefer **named grid areas** or explicit `order` on a single grid for
  responsive reordering. Avoid `display: contents` for reordering when it
  causes width or accessibility instability.
- Master/detail admin workspaces: keep list + detail side by side only when
  both remain operable; otherwise stack or open detail in
  `AdminResponsiveDialog`.
- Evidence / media: natural aspect ratio (`width: 100%; height: auto`). Do not
  crop submission screenshots into a fixed-height frame unless the product rule
  explicitly requires a crop.

## Positioning: sticky vs fixed

| Pattern | Allowed | Forbidden |
| --- | --- | --- |
| `position: sticky` within the page column | Yes — evidence rail, decision rail, table chrome | Sticky that traps focus or covers content without reserved space |
| `position: fixed` for **global** app chrome | Yes — site header / system toasts owned by app shell | Page-local fixed “mini toolbars” for feature actions |
| `position: fixed` for **feature decision bars** | No by default | Fixed review/approve docks, form footers that grow with optional panels |

Normative rule for **decision and action surfaces** (review decisions, batch
confirm, multi-step submit):

1. Keep actions in **document flow** by default.
2. Use **`position: sticky`** when they should remain visible while scrolling
   related content.
3. Do **not** use `position: fixed` for surfaces whose height can grow
   (spot-check panels, errors, secondary utilities). Fixed + dynamic height is
   a known overflow failure mode.
4. If a fixed surface is ever justified, it must: (a) be single-purpose global
   chrome, (b) reserve scroll padding with a mechanism that tracks real height
   (not a guessed `padding-bottom: 200px`), (c) honor safe-area insets, and
   (d) be documented as an exception in the change description.

## Overflow

- The **page** must not scroll horizontally at supported widths (`320px` first).
- **Vertical scroll ownership**: the page/document owns vertical scrolling for
  ordinary server-paginated admin lists on desktop and mobile; the list/table
  height is content-driven for the current page. Internal vertical scrolling is
  opt-in, requires explicit configuration, and needs a documented operational
  reason (see
  [`interaction-accessibility.md`](interaction-accessibility.md)).
- **Horizontal and vertical scroll are separate**: local horizontal containment
  for a genuine data matrix must not create a nested vertical scrollbar, and is
  not permission for internal vertical scrolling.
- Long identifiers and titles use `overflow-wrap: anywhere` / `min-width: 0`,
  not forced single-line truncation of primary identity without access to full
  text.
- Sticky/fixed layers must not permanently cover the only path to primary
  content or pagination.

## Breakpoints and container queries

### Page breakpoints

Pages use exactly two breakpoints, for page layout only (columns, rails, shell
chrome):

| Token (conceptual) | Width | Use |
| --- | --- | --- |
| `bp-md` | `48rem` (768px) | Below: one-column pages, app header collapses to the menu, `AdminResponsiveDialog` becomes a drawer |
| `bp-lg` | `64rem` (1024px) | At and above: side rails, evidence/decision side-by-side, wide admin workspaces |

Media queries cannot read CSS variables, so write the rem literal
(`@media (max-width: 47.99rem)`, `@media (min-width: 64rem)`). No other widths —
v1 widths (`360`, `430`, `620`, `760`, `820`, `900`, …) are retired.

### Components respond to their own width

Components never use viewport media queries. A component whose layout changes
sets `container-type: inline-size` on its root (or a wrapper) and switches at
one threshold:

| Token (conceptual) | Width | Use |
| --- | --- | --- |
| `cq-compact` | `24rem` (384px) | Below: the component's compact variant (stacked detail rows, stacked full-width action row, tighter card padding) |

A card in a three-column desktop grid and the same card on a phone receive a
similar width, so they render the same way. This is the primary mechanism for
desktop/mobile consistency.

### One anatomy per component

Across widths a component may change: column count, padding (within the ladder),
media aspect ratio, and control size. It must not change: the order of its
parts, text alignment, which information is shown, or the hierarchy between
label and value. If a narrow context needs different content, that is a
different component, not a breakpoint.

### Fluid grids

Directory and card grids size themselves without media queries:

```css
grid-template-columns: repeat(auto-fill, minmax(min(100%, 17rem), 1fr));
gap: var(--space-4);
```

Use `auto-fit` when items should stretch to fill a short row. Choose the
minimum track (`17rem` for directory cards) so the desired column counts fall
out at desktop, tablet, and phone widths.

## Safe areas and keyboard

- Honor `env(safe-area-inset-*)` for any edge-adjacent chrome.
- Prefer `dvh` over `vh` when sizing to the visual viewport on mobile.
- Do not pin critical controls under the software keyboard without a tested
  scroll-into-view path.

## Refactor backlog (non-blocking)

Existing scoped CSS that hard-codes spacing and fixed docks is **technical
debt**, not a template. Dedicated layout refactors should:

1. Replace structural `px` with `--space-*` / `--control-*` / shared variables.
2. Remove page-local fixed action docks in favor of sticky/in-flow patterns.
3. Align card stacks to full-width single columns on narrow viewports.
4. Leave 1px borders and elevation geometry in `px` unless a token exists.
5. Replace viewport media queries inside components with container queries.

The ordered plan lives in [`design-system-v2-migration.md`](design-system-v2-migration.md).

Do not mix a large opportunistic restyle into an unrelated feature PR unless
the feature touches that surface and the change stays local.
