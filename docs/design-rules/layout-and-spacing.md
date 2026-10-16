# Layout and Spacing

Units, containers, grids, positioning, overflow. Tokens: [visual-foundation.md](visual-foundation.md);
where styles live: [css-ownership.md](css-ownership.md). Docs win over legacy `px` and
fixed-dock code; do not copy it.

Goals: no horizontal page overflow; spacing and touch targets scale with root font size;
decision surfaces stay in flow or sticky; shared containers come from `main.css`; a component
reads the same on desktop and mobile because it adapts to its own width.

## Units

| Use | Prefer | Avoid |
| --- | --- | --- |
| Gap, padding, margin | `--space-*` ladder | hard-coded `px`, off-ladder rem |
| Control height / touch | `--control-sm|md|lg`; `--control-lg` under `pointer: coarse` | `min-height: 36px`, bare text links on mobile actions |
| Column tracks | `minmax(0, 1fr)`, `minmax(min(100%, Nrem), 1fr)`, `auto-fit/fill` | fixed `minmax(300px, ...)` |
| Breakpoints | two page breakpoints; container queries in components | one-off widths, viewport queries in components |
| Hairlines, blur, shadow offsets | `px` fine | `px` for layout structure |
| Viewport height | `dvh` or `%` | `100vh` on mobile |

- Prefer rem over em for page spacing; `min-width: 0` on grid/flex children with long text.
- Use `repeat(auto-fit, minmax(min(100%, <track>), 1fr))` for equal action groups.
- No parallel spacing scale in a component; a pair used three times becomes a shared variable.

| Token | Value | Typical use |
| --- | --- | --- |
| `--space-1` | `0.25rem` | icon-label gap, badge padding |
| `--space-2` | `0.5rem` | control-group gap, tags |
| `--space-3` | `0.75rem` | detail row padding, `sm`/`md` button inline padding |
| `--space-4` | `1rem` | compact card padding, button gap, grid gutter |
| `--space-5` | `1.25rem` | regular card padding, `lg` button padding |
| `--space-6` | `1.5rem` | gap between stacked cards |
| `--space-8` | `2rem` | between page sections |
| `--space-12` | `3rem` | major regions; desktop shell inset |
| `--space-16` | `4rem` | directory page top (desktop) |

`clamp()` only between two ladder steps. Controls: `--control-sm` `2rem` (fine pointers: dense
tables, toolbars), `--control-md` `2.5rem` (default), `--control-lg` `2.75rem` (primary flow
actions, every control under `pointer: coarse`).

## Containers and grids

- Shell tier by page: `page-shell` (directories, dashboards, editorial lists, side-by-side
  workspaces), `--readable` (prose articles), `--narrow` (forms), `--wide` (admin data).
  `page-shell` owns gutters (`100% - 3rem` desktop, `- 1.5rem` mobile); no local margins or
  max-widths. Full-bleed chrome keeps interactive content in the same measure.
- Stacked cards share one column width (`width: 100%; max-width: 100%; min-width: 0;
  box-sizing: border-box`); uneven widths on mobile are a defect.
- Narrow default is one column; do not shrink two operable columns below usable width. Reorder
  with named grid areas or `order`, not `display: contents`. Master/detail stays side by side
  only while both are operable, else stack or use `AdminResponsiveDialog`.
- Evidence and media keep natural aspect (`width: 100%; height: auto`), never cropped into a
  fixed-height frame unless a product rule says so.
- Directory grids: `repeat(auto-fill, minmax(min(100%, 17rem), 1fr))` with `gap: var(--space-4)`
  (`auto-fit` to stretch a short row).

## Sticky and fixed

- `sticky` in the page column is fine (evidence rail, decision rail, table chrome) if it does not
  trap focus or cover content without reserved space.
- `fixed` is for global app chrome only (header, system toasts). Feature action bars (review,
  approve, form footers that grow with optional panels) are in flow, or sticky if they must stay
  visible. A rare fixed surface must be single-purpose, reserve real-height scroll padding (not a
  guessed value), honor safe-area insets, and be justified in the PR.

## Overflow and safe areas

- No horizontal page scroll down to `320px`. The page owns vertical scroll for ordinary
  server-paginated lists; internal vertical scroll is opt-in with a documented operational reason
  ([interaction-accessibility.md](interaction-accessibility.md)). Horizontal containment for a true
  data matrix must not create a nested vertical scrollbar.
- Long identifiers use `overflow-wrap: anywhere` and `min-width: 0`; never truncate primary
  identity without access to the full text. Sticky/fixed layers never cover the only path to
  primary content or pagination.
- Honor `env(safe-area-inset-*)` on edge chrome; use `dvh`; never pin critical controls under the
  software keyboard without a tested scroll path.

## Breakpoints

Pages use exactly two, for page layout only; media queries cannot read variables, so write
literals (`@media (max-width: 47.99rem)`, `(min-width: 64rem)`).

| Width | Use |
| --- | --- |
| `48rem` | Below: one-column pages, header collapses to menu, `AdminResponsiveDialog` becomes a drawer |
| `64rem` | At and above: side rails, evidence/decision side by side, wide admin workspaces |

Components never use viewport queries. A component that adapts sets `container-type: inline-size`
and switches once at `24rem` (`cq-compact`: stacked rows and full-width action row, tighter card
padding). Across widths it may change column count, padding (within the ladder), media ratio,
and control size, never part order, alignment, shown information, or label/value hierarchy. If
narrow needs different content, it is a different component.
