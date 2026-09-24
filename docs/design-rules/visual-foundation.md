# Visual Foundation

本文档负责 Portal 的共享**视觉语言**：语义 token、颜色状态、字体层级、图标、
材料和深度。实现来源是
[`apps/portal/assets/css/main.css`](../../apps/portal/assets/css/main.css)。
布局单位与栅格见 [`layout-and-spacing.md`](layout-and-spacing.md)；动效见
[`motion-and-feedback.md`](motion-and-feedback.md)。

## Design priorities

1. Make the current content, state, and next action obvious.
2. Reuse the existing Portal tokens and components before adding variation.
3. Keep motion, material, and decoration subordinate to content and operation.
4. Preserve permission boundaries and distinguish unavailable, in-progress,
   completed, and future states.

## Color and surfaces

- Use semantic tokens from `apps/portal/assets/css/main.css` only:
  `--page`, `--surface`, `--surface-raised`, `--text`, `--muted`, `--quiet`,
  `--line`, `--line-strong`, `--accent`, `--accent-surface`, `--info`,
  `--info-surface`, `--success`, `--success-surface`, `--danger`,
  `--warning`, `--disabled-text`, and `--disabled-surface`.
- Do not introduce raw hex/oklch/palette colors for meaning in page CSS or
  Tailwind palette classes (e.g. `text-gray-500`, `bg-orange-400`).
- Nuxt UI semantic colors (`primary`, `neutral`, `info`, `success`,
  `warning`, `error`) must stay aligned with the tokens above via
  `apps/portal/app.config.ts` and shared theme — not ad-hoc overrides per page.
- Glass text on translucent chrome uses `--text-on-glass` /
  `--text-on-glass-secondary` / `--text-on-glass-quiet` rather than flat
  `--muted` over blur.

### Semantic state mapping

State color communicates a state **in addition to** its text or accessible
semantics; it never carries the meaning alone.

| State | Tokens / Nuxt UI color | Use |
| --- | --- | --- |
| Informational | `--info`, `--info-surface` / `info` | neutral progress or contextual guidance |
| Pending / warning | `--warning` / `warning` | waiting, attention, or a recoverable problem |
| Completed / success | `--success`, `--success-surface` / `success` | completed, accepted, or confirmed |
| Error | `--danger` / `error` | failed operation or dangerous consequence |
| Disabled | `--disabled-text`, `--disabled-surface` | unavailable controls; pair with `disabled` semantics |

The orange **accent** is reserved for primary brand action and active emphasis;
it is not a generic success color. Do not use accent green/red forks outside
the token table.

### Token values and contrast floor

Every text token passes **4.5:1** on `--page`, `--surface`, and
`--surface-raised` in both themes, and every status ink passes 4.5:1 on its own
badge/alert surface. Hierarchy comes from size and weight, never from fading
text below legibility. The following values change from the v1 implementation
to meet that floor (hue and chroma unchanged); all other color tokens keep their
current values:

| Token | Light | Dark | Result |
| --- | --- | --- | --- |
| `--accent` | `oklch(55% 0.16 48)` | `oklch(74% 0.14 55)` | `--on-accent` label 5.0:1; accent text on `--page` 4.6:1 |
| `--quiet` | `oklch(52% 0.018 55)` | `oklch(62% 0.014 48)` | ≥4.5:1 on page/surface (light 4.9, dark 5.3) |
| `--info` | `oklch(48% 0.14 235)` | unchanged | 4.9:1 on `--info-surface` |
| `--success` | `oklch(48% 0.14 145)` | unchanged | 4.8:1 on `--success-surface` |
| `--warning` | `oklch(55% 0.15 75)` | unchanged | 4.8:1 on its tinted badge |

Text roles: `--text` for headings, values, and primary text; `--muted` for body
copy and field/stat labels; `--quiet` for captions, counts, versions, and
timestamps only.

## Typography

Use the shared type scale only. Sizes, weights, tracking, and leading travel
together as one role:

| Role | Size | Weight | Leading | Tracking | Use |
| --- | --- | --- | --- | --- | --- |
| `type-display` | `clamp(3.2rem, 8vw, 6.5rem)` | 700 | 0.94 | -0.04em | Hero only |
| `type-title` (`page-title`) | `clamp(2rem, 4vw, 3.2rem)` | 700 | 1 | -0.03em | Page title |
| `type-headline` | `clamp(1.375rem, 3vw, 2.1rem)` | 600 | 1.15 | -0.02em | Section heading (`PageSectionHeader`) |
| `type-card-title` | `1.125rem` | 600 | 1.35 | -0.01em | Card and panel titles, `card-heading` |
| `type-body` (`body-copy`) | `1rem` | 400 | 1.6 | 0 | Prose and descriptions |
| `type-body-sm` | `0.875rem` | 400 | 1.55 | 0 | Dense secondary text |
| `type-label` | `0.9375rem` | 600 | 1.4 | 0 | Values: detail values, stat values, primary table cells |
| `type-label-sm` | `0.8125rem` | 500 | 1.4 | 0 | Field and stat labels (`--muted`) |
| `type-caption` | `0.75rem` | 500 | 1.4 | 0 | Counts, versions, timestamps (`--quiet`) |

Control labels: `UButton` `sm` / `md` / `lg` use `0.8125rem` / `0.875rem` /
`0.9375rem` at 600; badges `0.75rem` at 600; header navigation `0.875rem` at 500
(active 600).

- **Four weights only: 400, 500, 600, 700.** The v1 in-between weights (640,
  650, 680, 690, 720, 750, 760) are retired; at UI sizes they read as one
  undifferentiated bold.
- Negative tracking is limited to the heading roles above. Everything at body
  size and below uses 0 — tight tracking crowds CJK glyphs.
- No text below `0.75rem`.
- Numbers in stats, tables, and detail values use
  `font-variant-numeric: tabular-nums`.
- `eyebrow` stays available only for the rare case the copy rules allow an
  eyebrow; do not add it by default.
- Do not introduce one-off `font-size`, `font-weight`, `letter-spacing`,
  page-local font families, or a second scale in scoped CSS.
- Prefer system / configured UI font stack from the global stylesheet; do not
  load decorative display fonts for operational admin UI.
- Respect user font scaling: structural type stays on rem-based tokens, not
  fixed `px` font sizes for primary content.

## Materials and depth

- Materials: `glass`, `glass-heavy`, `glass-chip`, `glass-segment`. Prefer
  these over one-off `backdrop-filter` stacks. Header/footer segments on glass
  shells use `glass-segment` (no second blur layer).
- Elevation: `elevation-1` (sticky chrome), `elevation-2` (cards/menus),
  `elevation-3` (modals/drawers/floating decision emphasis) — maps to
  `--elevation-1/2/3`.
- Do not invent parallel shadow, blur, or border-radius systems in a page.

### Radius by role

Radius is chosen by role, never per component. Four values:

| Token | Value | Use |
| --- | --- | --- |
| `--radius-control` | `0.625rem` | Buttons, inputs, selects, icon buttons, nav links, small tags inside cards |
| `--radius-card` | `1rem` | Cards, panels, directory cards, the floating app header |
| `--radius-sheet` | `1.25rem` | Modals; drawers round the top corners only |
| `--radius-pill` | `999px` | Badges and pills |

`50%` is allowed only for circular marks (brand mark, avatars). Nuxt UI's
`--ui-radius` is tuned so `UButton` / `UInput` render at `--radius-control`.
- `prefers-reduced-transparency: reduce` solidifies glass globally — extend
  that policy, do not bypass it with component-local frosted panels.
- Sticky chrome may use `scroll-edge` / `scroll-edge-sticky` for soft separation
  instead of only a hard 1px divider over scrolling content.

## Containers (visual role)

- `page-shell` / `page-shell--readable` / `page-shell--narrow` / `page-shell--wide`
  own readable measure and gutters (max widths `90rem` / `68.75rem` / `47.5rem` /
  `90rem`, ≈`1440` / `1100` / `760` / `1440` CSS px at 16px root, in `main.css`).
  Do not redefine container width per page.
- `surface-card` and established panel/card classes own default surface fill
  and border language. Layout structure of multi-card pages is governed by
  [`layout-and-spacing.md`](layout-and-spacing.md).

## Iconography

- Icons use Iconify-style `i-{collection}-{name}` (default Lucide via Nuxt UI).
- Icon-only controls require a readable `aria-label` (or visible text).
- Do not mix multiple icon sets on one surface without reason.
- Icons support meaning; they do not replace status text.

## Density and chrome

- Player-facing UI: restrained, editorial, low chrome noise.
- Admin UI: higher information density is allowed, but still uses the same
  tokens, type scale, and materials — not a separate “admin theme.”
- Decorative gradients, atmospheric blobs, and marketing flourishes are out of
  scope for operational Portal surfaces unless a product page explicitly
  requires them and still reuses tokens.

## Anti-patterns

- Hard-coded success/error colors that bypass semantic tokens.
- Font weights other than 400 / 500 / 600 / 700, or text below `0.75rem`.
- Radius literals instead of the four role tokens.
- Fading text (`--quiet`, opacity) below the 4.5:1 floor to create hierarchy.
- Per-page glass/shadow/radius inventions.
- Using brand accent as a status color for “done.”
- Encoding state only with color or only with an icon.
