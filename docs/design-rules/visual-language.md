# Visual Language

The Portal looks like a precise instrument panel: cool neutral surfaces, a faint grid, small radii,
and one green accent. The token values live in `apps/portal/assets/css/main.css`; this page records
what each token is for. `docs/prototype/shared.css` mirrors the tokens for prototypes. Update both
when a token changes.

## Color roles

- Neutrals are blue-gray (hue 255-265). `--page` is the canvas, `--surface` holds content,
  `--surface-raised` marks inset or secondary areas. Text uses `--text`, `--muted`, `--quiet`.
- `--accent` (green) marks actions and state only: primary buttons, active navigation, selected
  items, progress, earned states. Eyebrows, rules, quote borders, hover states, and stat numbers
  stay neutral.
- `--signal` (amber) marks a time-limited or attention-needed state. Text on it uses `--on-signal`.
- `--info`, `--success`, `--danger`, `--warning` carry status. Each has a matching `-surface` where
  a tinted background is needed.
- `--tier-0` to `--tier-5` (map difficulty) and `--medal-*` (podium) are the only fixed-color
  scales. They do not change with the theme. Their text is dark, so they stay readable.
- Write colors as `oklch`. Do not write hex or `rgb` values in components or prototypes. A new
  hue becomes a token first.

## Surface and shape

- The page canvas carries a 3rem grid drawn with `--grid-line`. Keep content surfaces flat on top
  of it.
- Radius follows role: `--radius-control` (buttons, inputs, chips), `--radius-card`,
  `--radius-sheet` (dialogs, sheets), `--radius-pill` (badges only).
- Depth comes from the `--elevation-*` ladder. Glass (`--glass-*`) is for the header and floating
  chrome, not for content cards.

## Type, space, motion

- UI and display text use `--font-ui` (Leon Sans for Latin, system CJK fonts for Chinese). Use the
  `--type-*` scale and the `.type-*` classes instead of one-off sizes and letter-spacing.
- Space uses the `--space-*` ladder (4px base). Control heights use `--control-*`.
- Motion uses `--dur-fast`, `--dur-base`, `--dur-slow` and `--ease-out`. `--ease-pop` is only for a
  newly earned title. Press feedback uses `--press-scale`.

## Prototypes

Prototypes under `docs/prototype/` and `designs/` copy the token names above, so a design review
sees the same color, radius, and font as the Portal.
