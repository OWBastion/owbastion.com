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

## Typography

- Use the shared type scale classes only: `type-display`, `type-title`
  (alias `page-title`), `type-headline`, `type-body` (alias `body-copy`),
  `type-caption`, and `type-kicker` (and `eyebrow` for section labels).
- Do not introduce one-off heading `letter-spacing`, page-local font families,
  or a second modular scale in scoped CSS.
- Tracking and leading are owned by the type classes in `main.css`. Large
  titles already tighten tracking; body stays near neutral — do not copy
  Apple-style tracking hacks into random headings.
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
  Radius for cards should follow shared patterns; layout doc allows
  `clamp()`-based local radius only when it still reads as the same family.
- `prefers-reduced-transparency: reduce` solidifies glass globally — extend
  that policy, do not bypass it with component-local frosted panels.
- Sticky chrome may use `scroll-edge` / `scroll-edge-sticky` for soft separation
  instead of only a hard 1px divider over scrolling content.

## Containers (visual role)

- `page-shell` / `page-shell--readable` / `page-shell--narrow` / `page-shell--wide`
  own readable measure and gutters (approx. max widths `1440` / `1100` / `760` /
  `1440` CSS px baselines in `main.css`). Do not redefine container width per page.
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
- Per-page glass/shadow/radius inventions.
- Using brand accent as a status color for “done.”
- Encoding state only with color or only with an icon.
