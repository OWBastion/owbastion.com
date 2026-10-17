# Components and Patterns

Selection, composition, and forbidden parallel systems. Layout: [layout-and-spacing.md](layout-and-spacing.md);
page structure: [page-archetypes.md](page-archetypes.md).

## Selection order

1. Domain components in `apps/portal/components/` (`AdminWorkspace`, `AdminDataTable`,
   `AdminResponsiveDialog`, `StatusBadge`, `SubmissionStatusBadge`, `PageSectionHeader`, player
   and catalog components; the `Player*` set are reference implementations of the direction).
2. Nuxt UI v4 primitives (`UButton`, `UCard`, `UAlert`, `UEmpty`, `UForm`/`UFormField`, `UInput`,
   `USelect`, `UTextarea`, `UCheckbox`, `UTabs`, `UPagination`, `USkeleton`, `UFileUpload`, menus).
3. Shared CSS from `main.css`: `page-shell`, `surface-card`, `card-heading`, `detail-grid`,
   `glass*`, `elevation-*`, `pressable*`, `hit-target-lg`, `scroll-edge*`, type classes.
4. Page-scoped composition only when 1-3 cannot express the layout (grid areas, sticky columns,
   structure-matched skeletons), never a new color, type, or radius system.

A new wrapper needs a real domain responsibility; no wrapper that renames one element or primitive,
and no abstraction used once.

## Nuxt UI and Tailwind

- Colors only via Nuxt UI color props and tokens. Prefer component APIs (`block`, `loading`,
  `disabled`, `color`, `variant`, `size`, `ui`) over deep selectors into internals.
- Admin edit, decision, and confirm overlays use `AdminResponsiveDialog` (modal at `48rem`+, bottom
  drawer below); `UPopover` only for a small contextual form next to its trigger. No second
  modal/drawer system.
- File picking uses `UFileUpload` only (no native file input or custom dropzone); validation stays
  in the feature composable/API boundary and the component exposes the `File` via `v-model`.
- Toasts, tooltips, and programmatic overlays need the existing `UApp` shell. `UDashboard*` is not
  the Portal shell; adopting it is an explicit project that updates this doc.
- Tailwind (via `@nuxt/ui`): utilities are fine for local composition (`w-full`, `min-w-0`, `grid`,
  themed `gap-*`). Not allowed: rebuilding type, brand colors, or glass with utilities; arbitrary
  values like `w-[347px]`; raw palette colors for state. Scoped CSS stays preferred for multi-rule
  grid areas and sticky behavior; do not restyle a page to utilities during an unrelated fix.

## Buttons

`UButton` is the only button: no CSS button classes (`primary-button`, `.submit-button`, ...) and
no styled native `<button>`. The theme lives once in `app.config.ts`.

| Role | Props | Use |
| --- | --- | --- |
| Primary | `color="primary"` | The one main action (`提交截图`, `保存`) |
| Secondary | `color="neutral" variant="outline"` | Beside a primary (`取消`, `编辑`) |
| Low emphasis | `color="neutral" variant="soft"` | Toolbar and row actions |
| Tertiary / icon | `color="neutral" variant="ghost"` | Tertiary, icon-only |
| Destructive | `color="error" variant="soft"` | `下线`, `结束`, `撤销`; state the consequence, confirm irreversible ones in `AdminResponsiveDialog` |

| Size | Height | Padding | Label | Use |
| --- | --- | --- | --- | --- |
| `sm` | `--control-sm` | `--space-3` | `0.8125rem`/600 | Admin rows, dense toolbars |
| `md` | `--control-md` | `--space-4` | `0.875rem`/600 | Default |
| `lg` | `--control-lg` | `--space-5` | `0.9375rem`/600 | Primary of a player flow |

- All sizes: `--radius-control`, 16px Lucide icon, `--space-2` icon gap. Icon-only is square with
  `aria-label` (row actions `sm`). Under `pointer: coarse` all sizes become `--control-lg`; no
  mobile-specific button CSS.
- Hover changes fill only. Press uses the shared scale. Disabled: `disabled` plus 0.5 opacity. Busy:
  `loading`, a label like `保存中…`, duplicate submits blocked. Navigate with `NuxtLink` or
  `UButton to`, never a click handler that only pushes a route.
- Group actions in one **action row**, primary first in DOM order, a container
  (`container-type: inline-size`): at `cq-compact` and up, inline right-aligned with primary
  rightmost (`row-reverse`), `md`; below it, stacked full-width `lg`, primary on top. In flow or
  sticky, never fixed.

## Cards, detail grid, directory cards

- Cards: `UCard` or `surface-card` (`--surface`, 1px `--line`, `--radius-card`, `elevation-2`);
  padding `--space-4` below `cq-compact`, `--space-5` above; header `card-heading`.
- Key-value: `<dl class="detail-grid">` with `<div class="detail-grid__row"><dt/><dd/></div>`. Label
  column `7.5rem`, value left-aligned, `--space-4` column gap, row padding `--space-3`, 1px `--line`
  dividers. Label `type-label-sm` `--muted`; value `type-label` `--text`, tabular,
  `overflow-wrap: anywhere`; optional `<small>` caption line. Below `cq-compact` rows stack, still
  left-aligned. Values are text, numbers, badges, or links (never buttons). Missing = `暂无记录` in
  `--quiet`, not an empty cell or `-`. Shorten labels instead of widening.
- Directory cards share one anatomy at every width (`MapCard` reference): media (cover 16:9, 2:1
  below `cq-compact`, fallback two-letter index on `--accent-surface`, `aria-hidden`); title row
  (name `type-card-title`, version `type-caption` `--quiet`); summary line (accent star, score,
  count, or `暂无评分`); at most three stats above a 1px line (gated values `暂无记录`/`登录后查看`/
  `读取中…` in `--quiet` 500); neutral tag pills. The whole card is one `<button>` or link with an
  `aria-label` (`查看<地图>详情`, `aria-haspopup="dialog"` if it opens one); hover/focus is
  `--line-strong` plus `elevation-1`, press `pressable-soft`, no lift. Nothing restacks across
  widths; a fourth stat belongs in the detail view.
- Cards without media or stats drop only the parts with no data. Event: title row (name, release
  badge), meta line (category, rarity), description (3-line clamp), review summary, effect tags.
  Achievement: icon (3.5rem, 2.5rem compact) beside one column of title, condition, status; selectable
  submission cards add a category/variant kicker and omit the icon. Selectable submission cards are
  the `<button>` themselves, so they keep one padding (`--space-4`) and no `cq-compact` variant.

## Forms, status, states

- `UForm` + `UFormField`; validation inline and actionable. Mark only required fields; never add
  `（可选）`/`optional` to labels or placeholders; optional controls must not block submit. Admin
  decisions never require an optional reason.
- Status uses `StatusBadge` before ad-hoc chips, attached to its object. Tones: `default`, `info`, `success`, `warning`, `error`, plus `accent` with `★` for a rating. Submission statuses map through `playerSubmissionStatusLabel`/`playerSubmissionStatusTone`, not a component.
- Ratings are one 5-star row with the average beside it; the decimal point is a solid dot at the number's size. No rating shows `暂无评分`; there is no low-sample state.
- A required `*` shares the label's line. A revoked grant is not undone in place; grant again manually.
- Every data region handles: loading (structure-matched `USkeleton` or `读取中…`, `role="status"`),
  read failure (`UAlert`/`role="alert"` naming the object and next step), empty (`UEmpty`, current
  condition only), unavailable (`未开放`, no fake action), in progress (loading plus disabled peers).

## Admin

`AdminWorkspace` for title, count, messages, toolbar; `AdminDataTable` for lists. Table and
page-structure rules: [page-archetypes.md](page-archetypes.md). Optional admin fields stay
unmarked; keep character limits out of the flow unless an error is imminent.

## Anti-patterns

New radius/shadow/success-green outside tokens; CSS button classes or styled native buttons; parts
that restack, reorder, or hide at a viewport breakpoint; fixed bottom bars for growing flows;
`display: contents` only to reorder; deep-styling Nuxt UI internals; copying legacy `px` CSS.
