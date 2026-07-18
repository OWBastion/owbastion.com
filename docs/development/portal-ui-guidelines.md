# Portal UI Guidelines

This document is for AI agents and developers modifying `apps/portal`. It turns the Portal's existing layout, component, state, and business-boundary conventions into executable rules. Before adding a page or component, check whether an existing pattern can express the requirement. Add a new variation only when the existing patterns cannot.

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
- Reuse `SubmissionStatusBadge` for status display. Status wording comes from `docs/development/portal-copy-guidelines.md`.
- Submission details may be organized as overview → screenshot evidence → recognition result. Private evidence and internal recognition fields may only appear on authorized pages.

### Admin panels

Use this pattern for `/admin`:

- Use `AdminWorkspace` as the page root. Put the page title, count, messages, and toolbar in its corresponding props/slots.
- **Every admin data table must use `AdminDataTable` by default.** This includes searchable, filterable, paginated, and column-configurable admin tables. Put filters in its `filters` slot and row/column actions in table slots.
- Do not replace `AdminDataTable` with a raw `UTable`, custom HTML table, or one-off list that is functionally a table. If a table genuinely cannot use `AdminDataTable`, document the reason in the change description before introducing the exception.
- Server-paginated data must retain pagination controls and current-page state. Do not turn server pagination into infinite scrolling.
- Use `UAlert` or the `AdminWorkspace` messages area for feedback. Do not communicate success, errors, or dangerous actions through color alone.
- Use `UModal`, `UPopover`, or `USlideover` for editing and confirmation. Choose by content: short confirmation → Modal; small contextual form → Popover; detail/review workspace → Slideover.
- Use `color="error"` for dangerous actions and state the consequence clearly. Save, retire, ban, and similar actions need loading and disabled states.

## Component selection order

1. Reuse domain components first: `PageSectionHeader`, `StatusBadge`, `SubmissionStatusBadge`, `AdminWorkspace`, `AdminDataTable`, and components under `components/<domain>/`.
2. Then use Nuxt UI primitives: `UButton`, `UCard`, `UAlert`, `UEmpty`, `UFormField`, `UInput`, `USelect`, `UTabs`, `UModal`, `USlideover`, `UPopover`, and `UPagination`.
3. Add page-scoped CSS only when the existing primitives cannot express page-specific layout.
4. New components must have a clear domain responsibility. Do not create a wrapper around one HTML element or a generic abstraction used once.

Button rules: use the default/primary button for the primary action; use `color="neutral"` with `outline` or `soft` for secondary actions; use `color="error"` for dangerous actions; prefer `variant="link"` or a compact button with an explicit `aria-label` for table-row view/edit actions. Use `NuxtLink` or `UButton to` for navigation; do not simulate navigation with click handlers.

## Visual tokens and layout

Use the semantic tokens in `apps/portal/assets/css/main.css` instead of introducing raw colors:

- Page background: `var(--page)`; regular surface: `var(--surface)`; raised surface: `var(--surface-raised)`.
- Primary text: `var(--text)`; supporting text: `var(--muted)`; quiet text: `var(--quiet)`.
- Divider: `var(--line)`; emphasized border: `var(--line-strong)`.
- Brand action: `var(--accent)` / `var(--accent-surface)`; error and warning: `var(--danger)` / `var(--warning)`.
- Use `page-shell` for regular pages and `surface-card` for cards. Do not redefine container width, radius, button height, or the font system per page.

Current baselines are approximately `1100px` maximum page width, `24–28px` horizontal page padding, and `44px` minimum height for primary buttons. These are system baselines; do not drift from them in a single page. If a global rule needs to change, update the token or shared component and describe the impact.

## State, permission, and data presentation

Every data-requesting region must consider these states:

| State | UI | Rule |
| --- | --- | --- |
| Initial loading | `读取中…` or component loading state | Do not show an empty state that could be mistaken for real data |
| Read failure | `UAlert` / `role="alert"` | Name the object and the smallest useful next step, such as `无法读取地图，请稍后重试。` |
| Successful but empty | `UEmpty` | State the current condition only; add an action only when it is explicit and executable |
| Available | Normal content or submit control | Do not add an unnecessary “available” explanation |
| Unavailable/future | `未开放` | Do not show an unavailable submit or admin action |
| In progress | Component loading + disabled duplicate actions | Do not hide the real operation state behind static copy |
| Completed | Short feedback or refreshed state | Do not repeat the entire workflow |

Permission boundary: public pages must not render QQ OpenIDs, private screenshots, review notes, internal risk signals, or unapproved drafts. Player pages render only the current player's data. Admin pages access admin APIs through the existing server-side proxy and session. Do not hide data that should not be returned by using CSS alone.

## Responsive behavior and accessibility

- Support `320px` width first. Existing mobile breakpoints are mainly `620px`, `760px`, and `820px`; prefer those breakpoints.
- Collapse grids to one column on narrow screens. Admin tables may scroll horizontally inside their table container, but the overall page must not overflow horizontally.
- Use native buttons, links, or Nuxt UI components for interactive elements. Icon-only buttons must have readable `aria-label` values.
- Use `h1`, `h2`, and `h3` according to page hierarchy. Every major section needs a heading or `aria-label`.
- Use Nuxt UI focus management for dialogs, menus, and forms. Do not implement session-style overlays manually.
- Provide text for states and errors; never rely on color, icons, or position alone.
- Preserve `prefers-reduced-transparency`, `prefers-contrast`, and `prefers-reduced-motion` behavior. New animation must be necessary and have a reduced-motion/static fallback.

## Agent workflow

Before modifying Portal UI:

1. Read this document, `portal-copy-guidelines.md`, and the neighboring pages/shared components.
2. Identify whether the page is a public directory, player center, submission flow, or admin panel, and confirm its data/permission boundary.
3. Search for reusable domain or Nuxt UI components. Do not start by creating a new CSS system.
4. Preserve loading, failure, empty, in-progress, success, and permission-restricted states. If a state does not apply, explain why in the change description.
5. For admin tables, verify that `AdminDataTable` is used. Any exception must be explicit and justified.
6. Check mobile layout, keyboard behavior, ARIA, private fields, and status wording.
7. Run affected Portal tests and `pnpm --dir apps/portal exec nuxt typecheck`; run the Portal build when shared styles or build-sensitive code changes.

## Completion checklist

- [ ] Page structure matches the business scenario and has clear heading/section hierarchy.
- [ ] Existing domain components and semantic tokens are reused; no one-off generic abstraction was added.
- [ ] Admin data tables use `AdminDataTable`, or an explicit documented exception exists.
- [ ] Loading, failure, empty, permission, and in-progress states have clear UI.
- [ ] Copy follows the Portal copy guidelines and does not present future capability as current capability.
- [ ] Mobile, keyboard, focus, ARIA, and non-color state expression were checked.
- [ ] Private evidence, QQ identifiers, and internal fields are not exposed to unauthorized users.
- [ ] Affected tests and Portal typecheck were run, and any unavailable validation is recorded.
