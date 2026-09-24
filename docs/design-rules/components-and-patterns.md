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
   `card-heading`, `detail-grid`, `glass*`, `elevation-*`, `pressable*`,
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

**`UButton` is the only button.** Do not add CSS button classes
(`primary-button`, `secondary-button`, `.submit-button`, …) or style native
`<button>` elements as buttons. The variant/size theme lives once in
`app.config.ts`.

| Role | `UButton` props | Use |
| --- | --- | --- |
| Primary | `color="primary"` (solid) | The one main action of a decision surface (`提交截图`, `保存`) |
| Secondary | `color="neutral" variant="outline"` | The action beside a primary (`取消`, `编辑`) |
| Low emphasis | `color="neutral" variant="soft"` | Toolbar and row actions |
| Tertiary / icon | `color="neutral" variant="ghost"` | Tertiary actions and icon-only buttons |
| Destructive | `color="error" variant="soft"` | `下线`, `结束`, `撤销`; state the consequence nearby, confirm irreversible actions in `AdminResponsiveDialog` |

| Size | Height | Inline padding | Label | Use |
| --- | --- | --- | --- | --- |
| `sm` | `--control-sm` | `--space-3` | `0.8125rem` / 600 | Admin table rows and dense toolbars |
| `md` (default) | `--control-md` | `--space-4` | `0.875rem` / 600 | Everything else |
| `lg` | `--control-lg` | `--space-5` | `0.9375rem` / 600 | Primary action of a player-facing flow |

- All sizes use `--radius-control`, a 16px Lucide icon, and `--space-2`
  between icon and label. Icon-only buttons are square and require
  `aria-label`.
- Under `pointer: coarse` every size renders at `--control-lg`; do not write
  separate mobile button styles.
- Hover changes fill only (no lift, no scale). Press uses the shared press
  scale. Disabled: `disabled` + 0.5 opacity. Busy: the `loading` prop, a
  loading label (`保存中…`), and duplicate submits blocked.
- Navigation uses `NuxtLink` or `UButton to`, never a click handler that only
  pushes a route.

#### Action row

A surface's actions are grouped in one action row, **primary first in DOM
order**. The row is a container (`container-type: inline-size`):

- at or above `cq-compact`: inline, right-aligned, primary rightmost
  (`flex-direction: row-reverse`), `md` size;
- below `cq-compact`: stacked, full-width `lg` buttons, primary on top.

The row reads its own width, so a narrow desktop dialog and a phone screen
behave the same. Action rows stay in document flow or `sticky`; never a
`position: fixed` dock.

### Cards and panels

- Prefer `UCard` or `surface-card` / established panel classes for grouped
  content (`--surface`, 1px `--line`, `--radius-card`, `elevation-2`).
- Card padding is `--space-4` below `cq-compact` and `--space-5` above.
- Headers use `card-heading` (`type-card-title` + optional `--quiet` meta). Do
  not invent a second header row pattern per page.
- Stacked cards on narrow viewports must share full column width (see layout
  doc). Uneven widths are defects.

### Detail lists (key–value)

Key–value details use the `detail-grid` pattern, replacing the v1
`detail-list` (right-aligned values, `space-between`):

```html
<dl class="detail-grid">
  <div class="detail-grid__row"><dt>BattleTag</dt><dd>Teakowa#51234</dd></div>
  <div class="detail-grid__row"><dt>当前称号</dt><dd>先驱者<small>全局展示</small></dd></div>
</dl>
```

- Two columns: label column `7.5rem`, value left-aligned beside it,
  `--space-4` column gap; rows padded `--space-3`, divided by 1px `--line`.
- Label `type-label-sm` in `--muted`; value `type-label` in `--text`,
  tabular numbers, `overflow-wrap: anywhere`; optional `<small>` secondary
  line in `type-caption` / `--quiet`.
- Below `cq-compact` each row stacks (label above value), both still
  left-aligned. Order and alignment never change.
- Values may be text, numbers, a status badge, or a link — not buttons;
  actions belong in the card's action row.
- Missing values render `暂无记录` in `--quiet`, never an empty cell or `-`.
- Keep labels short; shorten a label rather than widening the column.

### Directory cards

Directory cards (maps first, then events and achievements) share one anatomy
at every width. `MapCard` is the reference:

1. **Media** — cover image, `object-fit: cover`, 16:9 (2:1 below
   `cq-compact`); fallback is the two-letter index on `--accent-surface`.
   Decorative (`aria-hidden`).
2. **Title row** — name in `type-card-title`, version on the right in
   `type-caption` / `--quiet`, tabular.
3. **Summary line** — e.g. the review summary: `--accent` star, score in
   `--text` 600, count or `样本不足` in `--muted`.
4. **Stats** — at most three equal columns above a 1px `--line`: label
   `type-label-sm` / `--muted`, value `type-label` / `--text`. Empty or gated
   values (`暂无记录`, `登录后查看`, `读取中…`) use `--quiet` at 500.
5. **Tags** — neutral pills (`--surface-raised`, badge type).

- The whole card is one `<button>` (or link) with an `aria-label` naming the
  target (`查看<地图>详情`) and `aria-haspopup="dialog"` when it opens one.
- Hover/focus: `--line-strong` border + `elevation-1`; press via
  `pressable-soft`; no hover lift.
- Nothing restacks or reorders across widths; only media ratio and padding
  change (container query).
- Grids follow the fluid grid recipe in the layout doc (`17rem` minimum track).
- A fourth stat belongs in the detail view, not on the card.

#### Cards without media or stats

Event and achievement cards keep the same rules — one anatomy at every width,
`type-card-title` / `type-label` / `type-label-sm`, `.directory-grid`, container
query at `24rem` — but drop the parts they have no data for:

- **Event card** — title row (name in `type-card-title`, release status badge on
  the right) → meta line (category · rarity, `type-label-sm` / `--muted`) →
  description (3-line clamp) → review summary → effect tags. No media, no stats.
  The title, meta and description are the `<button aria-haspopup="dialog">`.
- **Achievement card** — icon (fixed square, 3.5rem; 2.5rem below `cq-compact`)
  left of one text column: title in `type-card-title`, condition in
  `type-label-sm` / `--muted`, then status (`未开放`, `即将结束` + version).
  Selectable submission cards add the category/variant kicker between title and
  condition; the icon is omitted there and nothing else moves.
- **Exception:** selectable submission cards are themselves the `<button>`, so
  they cannot switch their own padding in a container query. They keep one
  padding (`--space-4`) at every width and define no `cq-compact` variant.

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
- CSS button classes or styled native buttons instead of `UButton`.
- Components that restack, reorder, or hide information at a viewport
  breakpoint.
- Fixed bottom action bars for feature flows that expand with optional panels.
- `display: contents` used only to reorder, when it breaks width consistency.
- Deep-styling Nuxt UI internals instead of `ui` / props / wrapping layout.
- Copying legacy `px`-heavy scoped CSS into new surfaces.

## Future refactors

Component refactors should move repeated structure into domain components or
shared CSS only when the pattern is stable (rule of three). Prefer improving
the existing primitive map over introducing Nuxt UI Dashboard or a second
component library.
