# Component Inventory

Index of `apps/portal/components/`. Use it to find the domain component before writing CSS
(reuse order: domain component, Nuxt UI, local composition). It lists ownership and purpose;
props, states, and behavior live in the component source and
[components-and-patterns.md](components-and-patterns.md). Add a row when you add a shared
component; delete it when the component goes.

## Shared (top level)

| Component | Purpose |
| --- | --- |
| `StatusBadge` | Status chip with `default`, `info`, `success`, `warning`, `error` tones; always carries text. |
| `SubmissionStatusBadge` | Maps a submission status to `StatusBadge` wording and tone. |
| `FilterChip` | Pressable filter toggle with optional count. |
| `PageSectionHeader` | Section title row with count and actions slot. |
| `AppHeader` | Floating site header and navigation. |
| `AccountMenu` | Signed-in account menu. |
| `ThemeMenu` | Light, dark, and system theme switch. |
| `PlayerBattleTag` | Player BattleTag display. |
| `EvidenceViewer` | Viewer for submission evidence. |
| `AchievementCatalog` | Public achievement catalog. |
| `MyAchievementOverview` | Signed-in player's achievement overview. |

## Maps

| Component | Purpose |
| --- | --- |
| `MapDirectory` | Map catalog page body with filters. |
| `MapCard` | Catalog card: cover, title row, rating summary, stats, tags. |
| `MapDetailModal` | Map detail modal. |
| `MapMasteryProfile` | Player mastery profile for a map. |
| `MasteryRunHistory` | Run history for a mastery profile. |

## Player

| Component | Purpose |
| --- | --- |
| `ProfileHero` | Profile focal card: avatar, name, equipped titles, `StatSheet`. |
| `StatSheet` | Overview row of large numbers with labels. |
| `TitleMark` | Title icon square; border intensity states the slot. |
| `TitleBadge` | Clickable title badge (`slot` and `tile` variants). |
| `TitleShelf` | Titles grouped by series, collapsed beyond the first row. |
| `TitleInspectDialog` | Title detail dialog. |
| `NextGoals` | Next-goal cards with segmented progress. |
| `MapProgressOverview` | Per-map progress summary. |
| `MapRecords` | Player's map records. |
| `PlayerRecentSubmissions` | Recent submissions list. |
| `RunDayHeatmap` | Run activity heatmap by day. |
| `PlayerIdentityCard` | Identity and binding card. |
| `ProfileVisibilityCard` | Profile visibility setting. |
| `PasskeyManager` | Passkey management. |

## Reviews

| Component | Purpose |
| --- | --- |
| `ReviewSummaryBadge` | Map rating capsule with sample-size and unavailable states. |
| `ReviewSummary` | Rating summary block. |
| `ReviewEditor` | Rating and review editor. |
| `PlayerReviewPanel` | Player's review panel on a map. |

## Submissions

| Component | Purpose |
| --- | --- |
| `SubmissionProcess` | Submission flow explanation. |
| `SubmissionProgress` | Progress of a submission through its states. |
| `SubmissionRequirements` | Requirements for a submission. |
| `SubmissionSectionHeading` | Heading inside submission sections. |
| `OcrFeedbackPanel` | OCR recognition feedback and correction. |

## Events and leaderboard

| Component | Purpose |
| --- | --- |
| `EventDirectory` | Event catalog. |
| `EventProbabilityMeter` | Probability bar with conversion wording. |
| `EffectGlossaryTooltip` | Effect glossary tooltip. |
| `PlayerSheet` | Leaderboard player sheet. |

## Editorial content

| Component | Purpose |
| --- | --- |
| `EditorialArticle`, `EditorialDetail` | Rendered Markdown article and detail layout. |
| `EditorialEntryList` | Entry list for changelog and articles. |
| `EditorialToc`, `EditorialNeighbors`, `EditorialShare` | Table of contents, previous/next links, share action. |
| `ChangelogRelativeDay` | Relative-day label for changelog entries. |

## Admin

Admin components follow [page-archetypes.md](page-archetypes.md) and share the same tokens.

| Group | Components |
| --- | --- |
| Shell and primitives | `AdminWorkspace`, `AdminDataTable`, `AdminResponsiveDialog`, `AdminDateTimePicker`, `AdminSignalPanel` |
| Players | `AdminPlayerList`, `AdminPlayerDetail`, `AdminPlayerIdentityEditor`, `AdminPlayerTitles`, `AdminPlayerRecovery`, `BindingInvitePanel`, `BindingInviteBatchPanel` |
| Reviews and runs | `AdminReviewDetail`, `AdminSubmissionReviewDetail`, `AdminSubmissionReviewFields`, `AdminSubmissionReviewChallenges`, `AdminVerifiedRunDetail`, `AdminVerifiedRunCorrectionForm` |
| Maps | `AdminMapMetadataForm`, `AdminMapReadiness`, `AdminMapRevisionStrip`, `AdminMapNewRevisionDialog`, `AdminMapPromoteDialog`, `AdminMapAuditList`, `AdminMapHonors`, `AdminMapAchievementWorkspace` |
| Achievements and titles | `AdminAchievementNav`, `AdminAchievementCreateDialog`, `AdminAchievementEditorDialog`, `AdminAchievementDialogs`, `AdminCompositeStagesInput`, `AdminCompositeSpatialConfigInput`, `AdminSpatialConfigInput`, `AdminSpatialCoordinatesInput`, `AdminSpatialCoordinatesSummary`, `AdminTitleMigrationDetail`, `AdminTitleMigrationHolders` |
| Events | `AdminEventTable`, `AdminEventFields`, `AdminEventSheet`, `AdminEventDraftBar`, `AdminEventSelectionBar`, `AdminEventPoolSummary` |

## Nuxt UI roles

Use Nuxt UI directly and theme it once in `app.config.ts`; do not wrap it without a reason.

| Need | Use |
| --- | --- |
| Button | `UButton` (`primary`, `neutral` outline, soft, ghost; `error` soft for danger) |
| Card | `UCard` or `surface-card` |
| Form | `UFormField`, `UInput`, `USelect`, `UTextarea`, `UCheckbox` |
| Feedback | `UAlert`, `UEmpty`, `USkeleton`, toast |
| Navigation | `UTabs`, `UPagination` |
