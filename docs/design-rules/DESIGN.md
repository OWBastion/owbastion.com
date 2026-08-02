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
  `--line-strong`, `--accent`, `--accent-surface`, `--info`, `--info-surface`,
  `--success`, `--success-surface`, `--danger`, `--warning`,
  `--disabled-text`, and `--disabled-surface`.
- Use `page-shell` for readable page content, `page-shell--narrow` for compact
  forms/detail views, and `page-shell--wide` for data-dense admin workspaces.
  Their shared maximum widths are approximately `1100px`, `760px`, and
  `1440px`; use the existing shared gutters rather than redefining a container
  in a page or component.
- Use the shared type scale: `type-display`, `type-title`, `type-headline`,
  `type-body`, `type-caption`, and `type-kicker`. Do not introduce one-off
  heading tracking or a page-local font system.
- Use `glass`, `glass-heavy`, `glass-chip`, `glass-segment`, and
  `elevation-1/2/3` for materials and depth. Do not add isolated blur,
  shadow, or color vocabularies.

### Semantic state mapping

State color communicates a state in addition to its text or accessible
semantics; it never carries the meaning alone.

| State | Tokens / Nuxt UI color | Use |
| --- | --- | --- |
| Informational | `--info`, `--info-surface` / `info` | neutral progress or contextual guidance |
| Pending / warning | `--warning` / `warning` | waiting, attention, or a recoverable problem |
| Completed / success | `--success`, `--success-surface` / `success` | completed, accepted, or confirmed |
| Error | `--danger` / `error` | failed operation or dangerous consequence |
| Disabled | `--disabled-text`, `--disabled-surface` | unavailable controls; pair with `disabled` semantics |

The orange accent is reserved for primary brand action and active emphasis; it
is not a generic success color.

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

## Page archetypes

- **Public directory:** page title and scope first, filters at the top of the
  directory, then loading/error/empty/content states in one `surface-card`
  region. Use the directory components and `UEmpty`.
- **Player center:** identity and current-player facts first, then recent
  records and available actions. Use `PlayerIdentityCard`, `PageSectionHeader`,
  `TitleCollection`, and `PlayerRecentSubmissions`; collapse to one column on
  narrow screens.
- **Screenshot upload:** one primary upload action in a `UCard`, requirements
  beside it on wide screens and below it on narrow screens, with `UFileUpload`
  and explicit disabled/loading feedback.
- **Submission detail/status:** status and next action first, evidence in its
  natural aspect ratio, then recognition/result details. Keep evidence sticky
  only where the desktop detail layout benefits; collapse it above details on
  mobile.
- **Admin list/table:** `AdminWorkspace` owns title, count, messages, and
  toolbar; `AdminDataTable` owns filters, table scrolling, pagination context,
  and row actions. Mobile may collapse secondary controls and scroll the table
  region horizontally.
- **Admin master/detail:** keep the selectable list and selected detail in a
  wide workspace; use `AdminResponsiveDialog` for overlays and collapse the
  columns rather than shrinking data below operable sizes.
- **Admin batch confirmation:** show selection, affected count, consequence,
  and the confirm/cancel actions in that order. Reasons or notes may be
  optional audit data, never a prerequisite for an authorized decision.

## CSS ownership

The Portal has one design system. Ownership follows responsibility rather than
file size:

1. `main.css`, Nuxt UI configuration, and shared tokens own semantic colors,
   type scale, materials, elevation, interaction feedback, touch targets,
   containers, focus, and reduced-motion/transparency/contrast policy.
2. Shared domain components or classes own stable patterns repeated across
   pages, especially when they carry semantics or behavior.
3. A reusable component may keep scoped CSS for its internal layout and state
   presentation.
4. A page may keep scoped CSS for its own composition: unique grids, sticky
   evidence/detail columns, responsive collapse, natural-aspect evidence, and
   structure-matched skeletons.

When a pattern appears twice, check whether it is stable; at three or more uses,
extract it or record why the instances are intentionally different. Do not
extract a one-off wrapper merely to reduce scoped CSS, and do not redefine
shared tokens, radii, elevations, materials, type, or container widths locally.

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
