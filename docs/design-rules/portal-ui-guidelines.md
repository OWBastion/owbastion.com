# Portal UI Guidelines

This document is for AI agents and developers modifying `apps/portal`. It turns the Portal's existing layout, component, state, and business-boundary conventions into executable rules. Before adding a page or component, check whether an existing pattern can express the requirement. Add a new variation only when the existing patterns cannot.

Shared visual foundation, interaction and accessibility, page archetypes, CSS
ownership, and content/state boundaries are indexed in
[`DESIGN.md`](DESIGN.md). This document owns the Portal-specific implementation
details and workflow for applying those rules.

## Goals and boundaries

- The Portal is an API rendering layer. Do not duplicate business rules in components or access D1, R2, OCRKit, or Bastion directly.
- Pages show only facts the current user is allowed to see. Keep unavailable, in-progress, and future functionality distinct.
- Player-facing UI uses concise, restrained, factual Chinese. Admin UI may describe operations and data fields more precisely.
- Optimize for clear hierarchy, operability, and mobile usability. Do not add a separate visual system for decoration.

## Choose the page skeleton first

### Public directory pages

Use this pattern for public events, maps, achievements, and similar content:

```vue
<main class="<page-name>-page page-shell">
  <section class="page-intro" aria-labelledby="<title-id>">
    <h1 id="<title-id>" class="page-title">Page title</h1>
    <p class="body-copy">Only add scope or purpose.</p>
  </section>
  <section class="<directory>-panel surface-card" aria-label="Content list">
    <!-- loading / error / directory component -->
  </section>
</main>
```

Loading, error, and empty states must switch within the same content region. Put filters at the top of the directory component. When there are no results, use `UEmpty` instead of replacing the empty state with an explanatory paragraph.

### Player center

Use this pattern for `/me` and player-private data:

- Use identity/login status and `page-title` at the top of the page.
- Prefer `PlayerIdentityCard`, `PlayerBattleTag`, and `StatusBadge` for identity facts.
- Use `PageSectionHeader` for sections with a title and action; put actions in its `actions` slot.
- Use existing domain components for recent records, such as `TitleCollection` and `PlayerRecentSubmissions`.
- Use `UEmpty` for no records, with short titles such as `暂无称号` or `暂无记录`.
- Use `未开放` for unimplemented content. Do not present future plans as executable actions.

### Submission flow

Use this pattern for screenshot uploads, submission status, and result pages:

- Use `UCard` as the upload form container, `UFormField` for fields, and `UFileUpload` for files.
- The submit button is the form's only primary action. During submission, use `loading` and disable inputs/actions that could cause duplicate submissions.
- Reuse `SubmissionCatalog`, `MapSubmissionCatalog`, or `AchievementSubmissionCatalog` for challenge selection. Do not copy directory grouping rules into a page.
- Reuse `SubmissionStatusBadge` for status display. Status wording comes from `docs/design-rules/portal-copy-guidelines.md`.
- Submission details may be organized as overview → screenshot evidence → recognition result. Private evidence and internal recognition fields may only appear on authorized pages.
- Screenshot evidence in submission details must use the source image's natural aspect ratio (`width: 100%; height: auto`); do not impose a fixed-height frame or crop the evidence with `object-fit`.

### Admin panels

Use this pattern for `/admin`:

- Use `AdminWorkspace` as the page root. Put the page title, count, messages, and toolbar in its corresponding props/slots.
- **Every admin data table must use `AdminDataTable` by default.** This includes searchable, filterable, paginated, and column-configurable admin tables. Put filters in its `filters` slot and row/column actions in table slots.
- Do not replace `AdminDataTable` with a raw `UTable`, custom HTML table, or one-off list that is functionally a table. If a table genuinely cannot use `AdminDataTable`, document the reason in the change description before introducing the exception.
- Server-paginated data must retain pagination controls and current-page state. Do not turn server pagination into infinite scrolling.
- Use `UAlert` or the `AdminWorkspace` messages area for feedback. Do not communicate success, errors, or dangerous actions through color alone.
- Use `AdminResponsiveDialog` for every admin detail, edit, and confirmation overlay: it renders a centered `UModal` at `768px` and above and a bottom `UDrawer` below that breakpoint. `UPopover` is only for a small, contextual form that remains next to its trigger, such as a one-field scheduling action.
- Use `color="error"` for dangerous actions and state the consequence clearly. Save, retire, ban, and similar actions need loading and disabled states.
- Admin copy should prioritize labels, values, statuses, and actions. Do not add explanatory paragraphs for facts an administrator already understands, such as what a grant or map scope is. Keep helper text only when it states a constraint, a consequence, or the next action needed to continue.
- Optional admin fields are unmarked by default; do not append “（可选）” to labels. Keep limits such as character counts out of the primary flow unless they prevent an imminent validation error.

### Admin master/detail and batch actions

- Master/detail workspaces keep selection and detail visible together on wide
  screens; on narrow screens, stack the detail below the list or open it with
  `AdminResponsiveDialog` when the detail is an edit/decision surface.
- Batch confirmation shows the selected scope, affected count, current status,
  consequence, and actions. Put the confirm action after the consequence and
  keep cancel available without making an optional reason mandatory.

### Page-scoped CSS ownership

Use the following ownership boundary when reviewing a `<style scoped>` block:

- `main.css`, Nuxt UI configuration, or an established shared component owns
  tokens, type scale, materials, elevation, press feedback, touch targets,
  focus behavior, containers, and reduced-motion/transparency/contrast policy.
- A shared domain component owns repeated semantic structure or behavior, such
  as a status presentation, key-value list, or action group. A shared class is
  appropriate only for a stable purely visual pattern.
- A reusable component may keep scoped CSS for internal layout and state
  presentation. A page may keep scoped CSS for its own grid, sticky evidence,
  natural image aspect ratio, responsive collapse, and structure-matched
  skeleton.
- A pattern used twice deserves an extraction review; at three or more uses,
  extract it or record why the instances are intentionally distinct. File-count
  reduction and eliminating scoped CSS are not goals.

Do not locally redefine shared colors, typography, radius, elevation, material,
interaction, touch-target, or container systems. Preserve legitimate local
composition even when it is larger than a shared utility would be.

### List and detail route files

When a list and a dynamic detail page share a route prefix, keep the list in the
directory's `index.vue` file:

~~~text
pages/admin/reviews/index.vue
pages/admin/reviews/[submissionId].vue
~~~

Do not place the list in `pages/admin/reviews.vue` beside the detail directory
unless the parent page deliberately renders `<NuxtPage />`. Nuxt treats that
file as the parent route for the dynamic child, so the URL can change while the
parent list remains visible. After adding or moving a detail route, verify both
the generated route shape and a direct browser load of the detail URL.

### Form field requiredness

- Mark a field only when it is required. An unmarked field is optional by default.
- Never add `（可选）`, `(可选)`, `optional`, or equivalent text to an optional field label or placeholder.
- Keep requiredness consistent between the UI and behavior: required controls use the component's required indicator and validation; optional controls must not block submission when empty.
- When generating, writing, or visually testing Portal UI, check that optional fields have no optional marker and that required fields are the only fields presented as required. Do not add extra copy merely to explain the default.

## Component selection order

1. Reuse domain components first: `PageSectionHeader`, `StatusBadge`, `SubmissionStatusBadge`, `AdminWorkspace`, `AdminDataTable`, and components under `components/<domain>/`.
2. Then use Nuxt UI primitives: `UButton`, `UCard`, `UAlert`, `UEmpty`, `UFormField`, `UInput`, `USelect`, `UTabs`, `UPopover`, and `UPagination`; use `AdminResponsiveDialog` rather than directly adding a management Modal, Slideover, or Drawer.
3. Add page-scoped CSS only when the existing primitives cannot express page-specific layout.
4. New components must have a clear domain responsibility. Do not create a wrapper around one HTML element or a generic abstraction used once.

### File selection and upload

- All Portal file selection and upload UI must use Nuxt UI's `UFileUpload` component. See the [FileUpload documentation](https://ui.nuxt.com/docs/components/file-upload).
- Do not add native `<input type="file">`, custom dropzones, or another file-picker component for new or changed Portal flows.
- Keep file validation and submission behavior in the existing feature composable/API boundary; `UFileUpload` owns the selection interaction and exposes the selected `File` through `v-model`.

Button rules: use the default/primary button for the primary action; use `color="neutral"` with `outline` or `soft` for secondary actions; use `color="error"` for dangerous actions; prefer `variant="link"` or a compact button with an explicit `aria-label` for table-row view/edit actions. Use `NuxtLink` or `UButton to` for navigation; do not simulate navigation with click handlers.

## Visual tokens and layout

Use the semantic tokens in `apps/portal/assets/css/main.css` instead of introducing raw colors:

- Page background: `var(--page)`; regular surface: `var(--surface)`; raised surface: `var(--surface-raised)`.
- Primary text: `var(--text)`; supporting text: `var(--muted)`; quiet text: `var(--quiet)`.
- Divider: `var(--line)`; emphasized border: `var(--line-strong)`.
- Brand action and successful/completed states: `var(--accent)` / `var(--accent-surface)`; error and warning: `var(--danger)` / `var(--warning)`. Keep one semantic color per state across Portal components; do not reintroduce hardcoded success colors.
- Glass materials: `glass` (chrome), `glass-heavy` (modals/drawers/menus), `glass-chip` (small badges). Prefer these classes over one-off `backdrop-filter`. Header/footer segments on glass shells use `glass-segment` (no second blur). `prefers-reduced-transparency` solidifies all glass classes globally.
- Elevation: `elevation-1` (sticky chrome), `elevation-2` (cards/menus), `elevation-3` (modals/drawers) — maps to `--elevation-1/2/3`.
- Theme: page background/text ease over `--theme-transition` (~200ms); disabled under reduced-motion.
- Type scale: prefer `type-display` / `type-title` (alias `page-title`) / `type-headline` / `type-body` (alias `body-copy`) / `type-caption` / `type-kicker` (and `eyebrow` for section labels). Do not invent new letter-spacing per heading.
- Glass text: interactive chrome uses `var(--text-on-glass)` / `--text-on-glass-secondary` rather than flat `--muted` over blur.
- Sticky chrome: add `scroll-edge` under floating sticky bars, or `scroll-edge-sticky` for sticky control chips sitting over scrolling content (soft bottom fade, not a hard divider alone).
- Route changes use the shared Nuxt `page` opacity transition; do not add per-page slide/parallax transitions.
- Interactive cards: `interactive-card` + `pressable-soft` for hover border/elevation and press scale; static placeholders use `interactive-card--static` (no hover lift).
- Use `page-shell` for regular pages and `surface-card` for cards. Do not redefine container width, radius, button height, or the font system per page.
- Press feedback: add `pressable` (controls, scale `0.97`) or `pressable-soft` (cards/rows, scale `0.985`) from `main.css` instead of one-off `:active { transform }` rules. `primary-button` / `secondary-button` and Nuxt UI `UButton` roots already press. Prefer hover border/shadow over hover-only translate; always pair interactive cards with active press. Under `prefers-reduced-motion: reduce`, spatial press and enter/leave transforms are suppressed globally—do not reintroduce component-local scale/slide transitions without a reduce fallback that is opacity/color only.
- Touch targets: icon controls use `hit-44` (min 44×44). Desktop nav and primary login actions use min-height ≥40; mobile primary chrome uses ≥44. Admin table row actions use `.table-actions` / `.table-action` (min 40) or `UButton` `size="sm"` outline—not bare text links or `size="xs"` in data tables.

Current baselines are approximately `1100px` maximum page width, `24–28px` horizontal page padding, and `44px` minimum height for primary buttons. These are system baselines; do not drift from them in a single page. If a global rule needs to change, update the token or shared component and describe the impact.

## Interaction and motion baseline

These are durable behavior rules, not a task checklist:

- Give feedback at the start of an interaction. Use `pressable` for controls and `pressable-soft` for cards or rows; do not add hover-only lifts or one-off active transforms.
- Enter and leave along the same spatial path. Menus, drawers, and dialogs should remain interruptible through the existing Nuxt UI primitives; do not add page-local spatial transitions.
- Use custom Pointer Events, momentum, rubber-banding, or a spring dependency only when a surface genuinely requires direct manipulation. A gesture surface must track the grab point, hand off release velocity, and have a reduced-motion fallback. Haptics are optional and never a release requirement.
- Keep decoration subordinate to content. Static cards do not receive entrance or looping motion merely to make the page feel animated.
- Treat `elevation-1/2/3`, `glass`/`glass-heavy`, and semantic tokens as the complete material system. New surfaces must reuse those tokens instead of introducing a parallel shadow, blur, or color vocabulary.

## State, permission, and data presentation

Every data-requesting region must consider these states:

| State | UI | Rule |
| --- | --- | --- |
| Initial loading | `读取中…`, a structure-matched `USkeleton`, or a component loading state | Do not show an empty state that could be mistaken for real data |
| Read failure | `UAlert` / `role="alert"` | Name the object and the smallest useful next step, such as `无法读取地图，请稍后重试。` |
| Successful but empty | `UEmpty` | State the current condition only; add an action only when it is explicit and executable |
| Available | Normal content or submit control | Do not add an unnecessary “available” explanation |
| Unavailable/future | `未开放` | Do not show an unavailable submit or admin action |
| In progress | Component loading + disabled duplicate actions | Do not hide the real operation state behind static copy |
| Completed | Short feedback or refreshed state | Do not repeat the entire workflow |

When the shape of a directory or detail view is known, prefer a structure-matched `USkeleton` while retaining `role="status"` and an accessible loading label. Text-only loading remains valid for small or indeterminate regions.

Permission boundary: public pages must not render QQ OpenIDs, private screenshots, review notes, internal risk signals, or unapproved drafts. Player pages render only the current player's data. Admin pages access admin APIs through the existing server-side proxy and session. Do not hide data that should not be returned by using CSS alone.

## Responsive behavior and accessibility

- Support `320px` width first. Existing mobile breakpoints are mainly `620px`, `760px`, and `820px`; prefer those breakpoints.
- Collapse grids to one column on narrow screens. Admin tables may scroll horizontally inside their table container, but the overall page must not overflow horizontally.
- Use native buttons, links, or Nuxt UI components for interactive elements. Icon-only buttons must have readable `aria-label` values.
- Use `h1`, `h2`, and `h3` according to page hierarchy. Every major section needs a heading or `aria-label`.
- Use Nuxt UI focus management for dialogs, menus, and forms. Do not implement session-style overlays manually.
- Provide text for states and errors; never rely on color, icons, or position alone.
- Preserve `prefers-reduced-transparency`, `prefers-contrast`, and `prefers-reduced-motion` behavior. New animation must be necessary and have a reduced-motion/static fallback. Global reduce policy (in `main.css`) limits transitions to opacity/color/border/background and disables interactive transforms and Vue enter/leave spatial motion—extend that policy rather than inventing a second reduce strategy per component.

## Agent workflow

Before modifying Portal UI:

1. Read [`DESIGN.md`](DESIGN.md), the relevant topic documents, this document,
   `portal-copy-guidelines.md`, and the neighboring pages/shared components.
2. Identify whether the page is a public directory, player center, submission flow, or admin panel, and confirm its data/permission boundary.
3. Search for reusable domain or Nuxt UI components. Do not start by creating a new CSS system.
4. Preserve loading, failure, empty, in-progress, success, and permission-restricted states. If a state does not apply, explain why in the change description.
5. For admin tables, verify that `AdminDataTable` is used. Any exception must be explicit and justified.
6. Check mobile layout, keyboard behavior, ARIA, private fields, and status wording.
7. Check every form label: required fields are explicitly marked; optional fields have no optional marker or explanatory suffix.
8. Run affected Portal tests and `pnpm --dir apps/portal exec nuxt typecheck`; run the Portal build when shared styles or build-sensitive code changes.

## Completion checklist

- [ ] Page structure matches the business scenario and has clear heading/section hierarchy.
- [ ] Existing domain components and semantic tokens are reused; no one-off generic abstraction was added.
- [ ] Admin data tables use `AdminDataTable`, or an explicit documented exception exists.
- [ ] Loading, failure, empty, permission, and in-progress states have clear UI.
- [ ] Copy follows the Portal copy guidelines and does not present future capability as current capability.
- [ ] Form labels mark required fields only; optional fields do not contain `（可选）` or equivalent text.
- [ ] Mobile, keyboard, focus, ARIA, and non-color state expression were checked.
- [ ] Private evidence, QQ identifiers, and internal fields are not exposed to unauthorized users.
- [ ] Affected tests and Portal typecheck were run, and any unavailable validation is recorded.
