# Component Inventory

Index of `apps/portal/components/`. Use it to find the domain component before writing CSS
(reuse order: domain component, Nuxt UI, local composition). It lists ownership and purpose,
verified against the component source; props, states, and behavior live in the source and
[components-and-patterns.md](components-and-patterns.md). Add a row when you add a shared
component; delete it when the component goes.

## Shared (top level)

| Component | Purpose |
| --- | --- |
| `StatusBadge` | Status chip with `default`, `info`, `success`, `warning`, `error` tones; always carries text. |
| `FilterChip` | Pressable filter toggle with optional count. |
| `PageSectionHeader` | Section title row with count and actions slot; optional description and `size="card"` for card-level headings. |
| `AppHeader` | Sticky site header: brand, main and admin navigation, theme menu, account menu or sign-in, collapsing menu on narrow screens. |
| `AccountMenu` | Round avatar button opening the account dropdown (admin entry, sign out). |
| `ThemeMenu` | Icon button opening the light, dark, or system theme menu. |
| `PlayerBattleTag` | BattleTag name with `#ID`, inline or large identity form (wrap in `UCard variant="subtle"` for the identity card). |
| `EvidenceViewer` | Screenshot evidence viewer: fit, actual size, zoom, drag-pan, double-click toggle, fullscreen. |
| `AchievementCatalog` | Public achievement catalog grouped by category: icon, title, condition, status. |
| `MyAchievementOverview` | Signed-in player's achievements: general catalog with earned and equipped state, map progress, other map titles, recent gains. |

## Maps

| Component | Purpose |
| --- | --- |
| `MapDirectory` | Map card grid; opens the detail overlay and syncs `mapId` to the URL query. |
| `MapCard` | Catalog card: cover, title row, rating summary, stats, tags. |
| `MapDetailModal` | Map detail overlay (modal on desktop, bottom drawer on mobile): overview, challenges, special mechanics, player reviews. |
| `MapMasteryCard` | Per-map mastery card in `record`, `progress`, and `detail` variants; shell and stat rows implemented once. |
| `MasteryRunHistory` | Paginated list of verified clears for a map. |

## Player

| Component | Purpose |
| --- | --- |
| `ProfileHero` | Profile focal card: avatar, name, equipped titles, `StatSheet`. |
| `StatSheet` | Overview row of large numbers with labels. |
| `TitleMark` | Title icon square; border intensity states the slot. |
| `TitleBadge` | Clickable title badge (`slot` and `tile` variants). |
| `TitleShelf` | Titles grouped by series, collapsed beyond the first row. |
| `TitleInspectDialog` | Title detail dialog with tilting gloss badge, acquisition info, link to manage equipping. |
| `PlayerRecentSubmissions` | Recent screenshot submissions with map, time, outcome, status badge; empty state points to submitting. |
| `RunDayHeatmap` | Past-year daily clear heatmap (53 weeks by 7 days). |
| `ProfileVisibilityCard` | Settings card with a switch for showing the profile on the leaderboard. |
| `PasskeyManager` | Passkey list, add, and confirm-then-remove in settings. |

## Reviews

| Component | Purpose |
| --- | --- |
| `ReviewSummary` | Average score, 1 to 5 star distribution, and paginated written reviews. |
| `ReviewEditor` | Form to write, edit, or withdraw a review: stars, text, anonymous. |
| `PlayerReviewPanel` | Player-rating block in detail views: summary, sign-in prompt or editor, feedback message. |

## Submissions

| Component | Purpose |
| --- | --- |
| `SubmissionProgress` | Vertical timeline of the four-step flow: upload, recognition, confirm results, title earned. With a `status` it tracks a submission; without one it is the static title-flow guide. |
| `SubmissionRequirements` | Static list of what a screenshot must contain. |
| `OcrFeedbackPanel` | Card where players mark OCR results accurate or wrong. |

## Events and leaderboard

| Component | Purpose |
| --- | --- |
| `EventDirectory` | Random event catalog: search, filter, sort, grouped card grid; detail in modal (desktop) or drawer (mobile). |
| `EventProbabilityMeter` | Mini bar for appearance probability, length relative to the maximum, number absolute. |
| `EffectGlossaryTooltip` | Effect terms as badges with a glossary popover on hover or tap. |
| `PlayerSheet` | Leaderboard side sheet: rank, map title ladder, general achievements; restricted view for anonymous players. |

## Editorial content

| Component | Purpose |
| --- | --- |
| `EditorialArticle` | Renders a blog or changelog article: meta header, optional contents, MDC body. |
| `EditorialDetail` | Detail page frame: back link, share, loading, failure, and missing states, article, footer share and neighbors, side contents. |
| `EditorialEntryList` | Entry list: latest blog post featured, rest grouped by year; changelog grouped by year with latest marked. |
| `EditorialToc` | Article contents navigation with optional scroll-spy highlight. |
| `EditorialNeighbors` | Previous and next article cards. |
| `EditorialShare` | Copy-link and, when supported, system share buttons. |
| `ChangelogRelativeDay` | Appends the relative day after a release date, client-side only to avoid hydration mismatch. |

## Admin

Admin components follow [page-archetypes.md](page-archetypes.md) and share the same tokens.

### Shell and primitives

| Component | Purpose |
| --- | --- |
| `AdminWorkspace` | Page shell: title row, count, actions, message area, toolbar, main slot. |
| `AdminDataTable` | Shared table: sticky-header `UTable` on desktop, card record list below 23.99rem container width, built-in sort, group, and column visibility. |
| `AdminResponsiveDialog` | Centered `UModal` on desktop, bottom `UDrawer` on narrow screens. |
| `AdminDateTimePicker` | Date and time inputs over a millisecond timestamp, clearable. |
| `AdminSignalPanel` | Titled panel container for summary blocks. |

### Players and bindings

| Component | Purpose |
| --- | --- |
| `AdminPlayerList` | Account list with search, status filter, pagination, rows linking to detail. |
| `AdminPlayerDetail` | Player detail: header actions, warnings, titles, activity, and account tabs. |
| `AdminPlayerIdentityEditor` | Dialog to edit the player name (numeric ID fixed) with BattleTag preview. |
| `AdminPlayerTitles` | Global and map titles with revoke, manual grant, and equip repair. |
| `AdminPlayerRecovery` | Dialog issuing a one-time Passkey recovery link after identity check. |
| `BindingInvitePanel` | Generates QQ binding invites. 单个 mode takes one BattleTag and optionally authorizes one unlinked historical title holder; 批量 mode takes one BattleTag per line with per-line validation and no historical authorization. Copy per result row. |

### Reviews and verified runs

| Component | Purpose |
| --- | --- |
| `AdminReviewDetail` | Drawer view of one player review with submitter, audit trail, moderation actions. |
| `AdminSubmissionReviewDetail` | Submission review workbench: screenshot evidence, field check, challenge decision, approve, reject, or request resubmission. |
| `AdminSubmissionReviewFields` | OCRKit-recognized fields to confirm or correct, emitted as field corrections. |
| `AdminSubmissionReviewChallenges` | System-recognized candidate challenges to confirm, plus search to add others. |
| `AdminVerifiedRunDetail` | Verified run facts, source submission, mastery rules and profile, correction history, code conflicts, status records, with correct and void actions. |
| `AdminVerifiedRunCorrectionForm` | Form to correct a verified run's facts with an optional reason. |

### Maps

| Component | Purpose |
| --- | --- |
| `AdminMapMetadataForm` | Edit name, difficulty rating, mechanic tags, catalog version, cover and background URLs. |
| `AdminMapReadiness` | Status bar showing whether a revision can be promoted (spatial points complete, achievements linked) with the promote entry. |
| `AdminMapRevisionStrip` | Horizontally scrolling tablist to pick or create a revision. |
| `AdminMapNewRevisionDialog` | Create a revision: type, game version, note. |
| `AdminMapPromoteDialog` | Confirm promotion and choose what happens to the previous official revision (keep optional or archive). |
| `AdminMapAuditList` | Chronological map edit audit records. |
| `AdminMapHonors` | Achievements and titles linkable to a revision, grouped by title kind, with toggles and Pioneer open window. |
| `AdminMapAchievementWorkspace` | Map title rule workspace in rule and by-map views: rules, Pioneer open windows, map-level exceptions. |

### Achievements and titles

| Component | Purpose |
| --- | --- |
| `AdminAchievementNav` | Underlined navigation across title catalog, general challenges, map challenges. |
| `AdminAchievementCreateDialog` | Large form to create a challenge (title rule), including collect-maps progress rule and icon. |
| `AdminAchievementEditorDialog` | Edit a catalog entry, general challenge, or map challenge; fields follow entry type. |
| `AdminAchievementDialogs` | Dialog host for edit, end challenge, retire title confirmations, and create; state from the workspace composable. |
| `AdminSpatialConfigInput` | Segmented switch between single-map and multi-route spatial config. |
| `AdminCompositeSpatialConfigInput` | Top-level composite config editor: shared points and respawn axis, embedded stage editors, validation. |
| `AdminCompositeStagesInput` | Composite rules (pick count, first and later stage selection) and atomic stages. |
| `AdminSpatialCoordinatesInput` | Paste and parse Workshop/.opy point code, with parse badge, tidy, copy, clear. |
| `AdminSpatialCoordinatesSummary` | Parsed point summary: totals, category counts, expandable copyable coordinates. |
| `AdminTitleMigrationHolders` | Historical title holder list with search, status filter, selection, pagination. |
| `AdminTitleMigrationDetail` | Selected holder, target account search, link or revoke titles one by one or in batch. |

### Events

| Component | Purpose |
| --- | --- |
| `AdminEventTable` | Event table with multi-select, sort, inline staged edits, probability change visual. |
| `AdminEventFields` | Event field form; every change is emitted as a patch. |
| `AdminEventSheet` | Right-side sheet to view or edit one event, or create one, with previous and next and archive. |
| `AdminEventActionBar` | Sticky bar driven by `selectedCount` and `draftCount`: bulk actions for selected events (status, version, group, weight set, add, or multiply), unsaved-draft summary with discard / save all, or both with one discard / save-all pair; renders nothing when neither. |
| `AdminEventPoolSummary` | Candidate pool overview: implemented count, total weight, suspend or resume by version. |

## Pending consolidation

The [design prototype](../design-prototype/README.md) merges components that carry the same content. The tables above describe the code as it is; when an Issue lands, delete the merged-away rows here and above.

## Nuxt UI roles

Use Nuxt UI directly and theme it once in `app.config.ts`; do not wrap it without a reason.

| Need | Use |
| --- | --- |
| Button | `UButton` (`primary`, `neutral` outline, soft, ghost; `error` soft for danger) |
| Card | `UCard` or `surface-card` |
| Form | `UFormField`, `UInput`, `USelect`, `UTextarea`, `UCheckbox` |
| Feedback | `UAlert`, `UEmpty`, `USkeleton`, toast |
| Navigation | `UTabs`, `UPagination` |
| Overlay | `UModal`, `UDrawer`, `UTooltip` |
