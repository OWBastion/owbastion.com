# Visual Foundation

Shared visual language, implemented in `apps/portal/assets/css/main.css`. Layout units:
[layout-and-spacing.md](layout-and-spacing.md); motion: [motion-and-feedback.md](motion-and-feedback.md).

## Color

- Use only semantic tokens: `--page`, `--surface`, `--surface-raised`, `--text`, `--muted`,
  `--quiet`, `--line`, `--line-strong`, `--accent`, `--accent-surface`, `--info(-surface)`,
  `--success(-surface)`, `--danger`, `--warning`, `--disabled-text`, `--disabled-surface`.
  No raw hex/oklch or Tailwind palette classes (`text-gray-500`) for meaning.
- Nuxt UI colors (`primary`, `neutral`, `info`, `success`, `warning`, `error`) stay aligned with
  the tokens through `app.config.ts`, not per-page overrides.
- Text on translucent chrome uses `--text-on-glass`, `-secondary`, `-quiet`.
- Orange accent is for primary action and active emphasis, never "done".
- Roles: `--text` headings and values; `--muted` body and labels; `--quiet` captions, counts,
  versions, timestamps only.
- Every text token passes 4.5:1 on `--page`, `--surface`, `--surface-raised` in both themes, and
  each status ink on its own surface. Hierarchy comes from size and weight, never fading below
  that floor.

| State | Tokens / Nuxt UI | Use |
| --- | --- | --- |
| Informational | `--info(-surface)` / `info` | neutral progress or guidance |
| Pending / warning | `--warning` / `warning` | waiting, attention, recoverable problem |
| Success | `--success(-surface)` / `success` | completed, accepted, confirmed |
| Error | `--danger` / `error` | failure or dangerous consequence |
| Disabled | `--disabled-*` | unavailable control, plus `disabled` semantics |

State color always accompanies text or accessible semantics.

## Typography

One role = size, weight, leading, tracking together. Weights are 400/500/600/700 only; no text
below `0.75rem`; negative tracking only on heading roles (CJK crowds); `tabular-nums` for stats,
tables, detail values; rem-based sizes; no page-local font families, sizes, or a second scale;
no decorative display fonts in operational UI. `eyebrow` only where the copy rules allow.

| Role | Size | Wt | Leading | Tracking | Use |
| --- | --- | --- | --- | --- | --- |
| `type-display` | `clamp(3.2rem, 8vw, 6.5rem)` | 700 | 0.94 | -0.04em | Hero only |
| `type-title` | `clamp(2rem, 4vw, 3.2rem)` | 700 | 1 | -0.03em | Page title |
| `type-headline` | `clamp(1.375rem, 3vw, 2.1rem)` | 600 | 1.15 | -0.02em | Section heading |
| `type-card-title` | `1.125rem` | 600 | 1.35 | -0.01em | Card/panel title |
| `type-body` | `1rem` | 400 | 1.6 | 0 | Prose |
| `type-body-sm` | `0.875rem` | 400 | 1.55 | 0 | Dense secondary |
| `type-label` | `0.9375rem` | 600 | 1.4 | 0 | Values, primary cells |
| `type-label-sm` | `0.8125rem` | 500 | 1.4 | 0 | Field/stat labels (`--muted`) |
| `type-caption` | `0.75rem` | 500 | 1.4 | 0 | Counts, versions, timestamps (`--quiet`) |

`UButton` `sm`/`md`/`lg` labels: `0.8125`/`0.875`/`0.9375rem` at 600; badges `0.75rem` at 600;
header nav `0.875rem` at 500 (active 600).

## Materials, depth, radius

- Materials: `glass`, `glass-heavy`, `glass-chip`, `glass-segment` (header/footer segments use
  `glass-segment`, no second blur). No one-off `backdrop-filter` stacks.
- Elevation: `elevation-1` sticky chrome; `-2` cards/menus; `-3` modals, drawers, floating
  decisions. No parallel shadow, blur, or radius system.
- Reduced transparency solidifies glass globally; extend, never bypass. Sticky chrome may use
  `scroll-edge`/`scroll-edge-sticky` instead of a hard divider.

| Radius token | Value | Use |
| --- | --- | --- |
| `--radius-control` | `0.625rem` | Buttons, inputs, selects, nav links, small tags |
| `--radius-card` | `1rem` | Cards, panels, floating header |
| `--radius-sheet` | `1.25rem` | Modals (drawers round top only) |
| `--radius-pill` | `999px` | Badges, pills |

`50%` only for circular marks. Nuxt UI `--ui-radius` is tuned so `UButton`/`UInput` render at
`--radius-control`.

## Containers, icons, density

- `page-shell` (`90rem`), `--readable` (`68.75rem`), `--narrow` (`47.5rem`), `--wide` (`90rem`)
  own measure and gutters; never redefine per page. `surface-card` and panel classes own
  surface fill and border.
- Icons: `i-{collection}-{name}` (Lucide default), one set per surface. Icon-only controls need
  `aria-label`; icons support status text, never replace it.
- Player UI may show identity and collection in game style from tokens only; admin UI may be
  denser on the same tokens, type, and materials (no separate admin theme). Decoration is
  token-only and capped at one accent radial gradient and one glow per page.

## Anti-patterns

Hard-coded status colors; weights outside 400-700 or text under `0.75rem`; radius literals;
fading text below 4.5:1; per-page glass/shadow/radius; accent as a "done" color; state shown by
color or icon alone.
