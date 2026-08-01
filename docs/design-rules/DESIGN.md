# OWBastion Design System

This is the authoritative design-rules document for `apps/portal`. It defines
the shared visual language, interaction baseline, responsive behavior,
accessibility requirements, and content boundaries. Supporting documents may
give implementation detail, but must not introduce a conflicting design
system.

## Design priorities

1. Make the current content, state, and next action obvious.
2. Reuse the existing Portal tokens and components before adding variation.
3. Keep motion, material, and decoration subordinate to content and operation.
4. Preserve permission boundaries and distinguish unavailable, in-progress,
   completed, and future states.

## Visual foundation

- Use semantic tokens from `apps/portal/assets/css/main.css`: `--page`,
  `--surface`, `--surface-raised`, `--text`, `--muted`, `--quiet`, `--line`,
  `--line-strong`, `--accent`, `--accent-surface`, `--danger`, and `--warning`.
- Use `page-shell` for page layout and `surface-card` for cards. The baseline
  is approximately `1100px` maximum width with `24–28px` horizontal padding.
- Use the shared type scale: `type-display`, `type-title`, `type-headline`,
  `type-body`, `type-caption`, and `type-kicker`. Do not introduce one-off
  heading tracking or a page-local font system.
- Use `glass`, `glass-heavy`, `glass-chip`, `glass-segment`, and
  `elevation-1/2/3` for materials and depth. Do not add isolated blur,
  shadow, or color vocabularies.

## Interaction baseline

- Use `pressable` for controls and `pressable-soft` for cards and rows. Pair
  hover affordances with visible press feedback; do not rely on hover-only
  movement.
- Reuse Nuxt UI and existing domain components for menus, dialogs, drawers,
  forms, tables, and upload controls. New interaction patterns need a clear
  domain reason.
- Keep enter and leave paths coherent and avoid page-local spatial transitions.
  Route changes use the shared opacity transition.
- Use `loading` and disabled states to prevent duplicate actions. Dangerous
  actions use `color="error"` and state the consequence clearly.
- Motion is optional. Any new motion must be necessary, interruptible where
  applicable, and have a reduced-motion fallback limited to opacity, color,
  border, or background changes. Springs, haptics, and decorative entrance
  animations are never release requirements.

## Layout and accessibility

- Design for `320px` width first; prefer the existing `620px`, `760px`, and
  `820px` breakpoints.
- Keep mobile primary controls at least `44px` high and icon controls at least
  `44×44px`. Admin table actions must remain operable without bare text links.
- Use semantic headings, readable `aria-label` values for icon-only controls,
  visible focus states, and Nuxt UI focus management for dialogs and menus.
- Express loading, failure, empty, unavailable, and completed states with text
  or accessible status semantics; never use color, icon, or position alone.
- Preserve `prefers-reduced-motion`, `prefers-reduced-transparency`, and
  `prefers-contrast` behavior. Do not reintroduce component-local transforms
  without an explicit fallback.

## Content and state language

- Player-facing copy uses concise, restrained, factual Chinese. Prefer short
  labels such as `暂无记录`, `未开放`, `读取中…`, and `提交中…`.
- Headings state what the content is; supporting text adds only a condition,
  scope, constraint, or executable next step.
- Do not describe future plans as available actions, repeat the state in a
  paragraph, or expose internal terms such as review, distribution, or OCR
  unless the user needs them to act.
- Public pages must not render QQ identifiers, private evidence, review notes,
  internal signals, or unapproved drafts. Player pages show only the current
  player's data; admin pages use the existing authenticated server proxy.

## Supporting documents

- [Design rules index](README.md) — document map and
  authority rules.
- [Portal UI guidelines](portal-ui-guidelines.md) — page skeletons, component
  selection, state handling, and implementation workflow.
- [Portal copy guidelines](portal-copy-guidelines.md) — Chinese copy, status
  vocabulary, empty states, and examples.
