# Components and Patterns

本文档负责 Portal 的组件选型、组合约定和禁止的平行系统。
页面骨架与管理台细则见 [`portal-ui-guidelines.md`](portal-ui-guidelines.md)；
布局单位与定位见 [`layout-and-spacing.md`](layout-and-spacing.md)；
文案与状态词见 [`portal-copy-guidelines.md`](portal-copy-guidelines.md) 与
[`terminology.md`](terminology.md)。

## Selection order (normative)

1. **Domain components** already in `apps/portal/components/` (and domain
   subfolders): e.g. `AdminWorkspace`, `AdminDataTable`,
   `AdminResponsiveDialog`, `StatusBadge`, `SubmissionStatusBadge`,
   `PageSectionHeader`, catalog and player identity components.
2. **Nuxt UI primitives** (`@nuxt/ui` v4): `UButton`, `UCard`, `UAlert`,
   `UEmpty`, `UForm` / `UFormField`, `UInput`, `USelect`, `UTextarea`,
   `UCheckbox`, `UTabs`, `UPagination`, `USkeleton`, `UFileUpload`, menus and
   focus-managed overlays.
3. **Shared CSS patterns** from `main.css`: `page-shell`, `surface-card`,
   `card-heading`, `detail-list`, `glass*`, `elevation-*`, `pressable*`,
   `hit-44`, `scroll-edge*`, type scale classes.
4. **Page- or feature-scoped composition** only when 1–3 cannot express the
   layout. Scoped CSS may own grid areas, sticky columns, and structure-matched
   skeletons — not a new color, type, or radius system.

New wrappers need a clear domain responsibility. Do not create a one-off
component that only renames a single HTML element or Nuxt UI primitive.

## Nuxt UI usage

- Semantic colors only via Nuxt UI color props and Portal tokens (`primary`,
  `neutral`, `info`, `success`, `warning`, `error`). Do not hard-code Tailwind
  palette classes such as `text-gray-500` or `bg-orange-500` for meaning.
- Prefer component APIs (`block`, `loading`, `disabled`, `color`, `variant`,
  `size`, `ui` slot overrides) over fighting internals with deep selectors.
- Overlays for admin edit/decision/confirm: **`AdminResponsiveDialog`**
  (modal ≥768px, drawer below). Do not introduce a second modal/drawer system
  on admin pages.
- File pickers: **`UFileUpload` only**. No native file inputs for new work.
- Toasts, tooltips, and programmatic overlays require the app `UApp` shell
  already used by Portal.

Nuxt UI does **not** own page grid composition. Dashboard layout primitives
(`UDashboard*`) are not the current Portal shell; do not adopt them in a
drive-by change. A future shell migration must be an explicit project and
update this document.

## Tailwind CSS usage

Portal ships Tailwind via `@nuxt/ui`. Policy:

| Allowed | Not allowed as a parallel system |
| --- | --- |
| Utility classes for **local composition** when clearer than scoped CSS (e.g. `w-full`, `min-w-0`, `grid`, `gap-*` with theme spacing) | Rebuilding the type scale, brand colors, or glass materials only with ad-hoc utilities |
| Responding with standard breakpoints when they match system breakpoints | One-off arbitrary values that reintroduce hard-coded layout debt (`w-[347px]`, `top-[13px]`) without cause |
| `ui` prop / theme overrides documented by Nuxt UI | Raw palette colors for semantic state |

Scoped CSS remains valid and preferred for multi-rule grid areas and
page-specific sticky behavior. Do not rewrite an entire page to utilities
solely for style preference during an unrelated fix.

## Control patterns

### Buttons and actions

- One primary action per decision surface (`primary` / default brand).
- Secondary: `color="neutral"` + `outline` or `soft`.
- Destructive: `color="error"`; state the consequence in nearby copy when the
  result is irreversible.
- Use `block` (or full-width grid tracks) for primary mobile actions so hit
  targets fill the column.
- Navigation uses `NuxtLink` or `UButton to`, not click handlers that only
  push routes.
- Loading states disable duplicate submits; show loading on the control that
  was activated when multiple peers exist.

### Cards and panels

- Prefer `UCard` or `surface-card` / established panel classes for grouped
  content.
- Headers use `card-heading` (title + optional quiet meta). Do not invent a
  second header row pattern per page.
- Stacked cards on narrow viewports must share full column width (see layout
  doc). Uneven widths are defects.

### Forms

- `UForm` + `UFormField` for labeled fields and validation display.
- Required fields only are marked required; never append “（可选）” to optional
  labels (see portal UI guidelines).
- Validation is inline and actionable; do not block admin decisions on optional
  reason fields (product rule).

### Status

- Domain badges (`StatusBadge`, `SubmissionStatusBadge`) before ad-hoc chips.
- Color never carries meaning alone — pair with text or accessible semantics.

### Empty / loading / error

| State | Pattern |
| --- | --- |
| Loading | Structure-matched `USkeleton` or concise `读取中…` with `role="status"` |
| Error | `UAlert` / `role="alert"` with object + next step |
| Empty | `UEmpty` with current condition only |
| Unavailable | `未开放` — no fake primary action |

## Admin-specific patterns

- Lists: `AdminDataTable` by default (desktop table + mobile record list).
- Workspace chrome: `AdminWorkspace` for title, count, messages, toolbar.
- Detail review and similar operational pages: claim → decide → evidence /
  verify order on narrow screens; decisions stay in-flow or sticky, not fixed
  docks (see [`layout-and-spacing.md`](layout-and-spacing.md)).

## Anti-patterns

- Parallel design systems (new radius scale, new shadow language, new success
  green outside tokens).
- Fixed bottom action bars for feature flows that expand with optional panels.
- `display: contents` used only to reorder, when it breaks width consistency.
- Deep-styling Nuxt UI internals instead of `ui` / props / wrapping layout.
- Copying legacy `px`-heavy scoped CSS into new surfaces.

## Future refactors

Component refactors should move repeated structure into domain components or
shared CSS only when the pattern is stable (rule of three). Prefer improving
the existing primitive map over introducing Nuxt UI Dashboard or a second
component library.
