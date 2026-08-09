# Portal editorial content migration

This record covers the real-content migration required by issue #70. The
source material was read from the Feishu workspace supplied for this task;
this repository intentionally records source titles and dates, not private
Feishu document identifiers or expiring links.

## Migrated entries

| Collection | Portal entry | Source meaning preserved | Media treatment |
| --- | --- | --- | --- |
| Blog | `开发日志 #1：随机系统底层重构——从“随机”到“算法加权”` (`2025-12-25`) | The article retains its in-development status and describes rarity tiers, weighted rejection sampling, and the fallback draw. | No media was selected; no Feishu attachment URL was copied. |
| Blog | `开发日志 #2：4.0 事件预览与 SSR 获取期望` (`2026-01-05`) | The article retains the 4.0 event preview and the category and intra-group probability discussion. | No media was selected; no Feishu attachment URL was copied. |
| Blog | `开发日志 #3：老事件的“新生”——权重系统下的再平衡 🎮` (`2026-01-06`) | The article retains the legacy-event rebalance and performance direction. | No media was selected; no Feishu attachment URL was copied. |
| Blog | `开发日志 #4：称号系统重构计划` (`2026-01-16`) | The article retains the title-system maintenance window and its effect on challenges and existing titles. | No media was selected; no Feishu attachment URL was copied. |
| Blog | `开发日志 #5：技术层的优化与改进` (`2026-01-16`) | The article retains the technical optimization, state cleanup, and health-pool direction. | No media was selected; no Feishu attachment URL was copied. |
| Blog | `开发日志 #6：事件抽取算法的优化与改进` (`2026-02-15`) | The article retains event de-duplication, probability rebalance, and event-pool rotation plans. | No media was selected; no Feishu attachment URL was copied. |
| Blog | `开发日志 #7：成就挑战系统的优化改进与周年庆` (`2026-07-17`) | The article retains the post-5.0 optimization, achievement, screenshot workflow, and anniversary DLC direction. | No media was selected; no Feishu attachment URL was copied. |
| Blog | `开发日志 #8：轮换挑战与地图精通` (`2026-08-09`) | The article remains explicitly in development. It records the five-slot rotation model, activity priority, the temporary rotation-out of 「钢门」, and the still-designed map-mastery and leaderboard direction. | No media was selected for this pilot; no Feishu attachment URL was copied. |
| Changelog | `26.0801.1` — `随机事件调整` | The released version identifier and source theme are retained as historical facts. The migration does not invent unverified event rules. | No media was selected for this pilot; no Feishu attachment URL was copied. |

The entries use the typed collections under `apps/portal/content/`. The Blog
entries keep their source in-progress warnings. The dates for the downloaded
historical entries use the dates shown in the source folder because the
exported Markdown does not contain a publication field.

## Local verification

The editorial-content gate checks that all migrated files exist, retain their
source identifiers/themes, use typed metadata, and contain no Feishu download
URL. Portal UI tests, typecheck, and build cover the typed collection queries
and public list and detail surfaces. The Feature Status Matrix remains `coded`
because local verification does not demonstrate a deployed business path.

## Production evidence to record

Use a fresh, safe request identifier and retain only status, immutable
revision, public URL, and workflow run references. Never record cookies, Git
credentials, private identifiers, full article payloads, or Feishu download
URLs.

| Check | Required evidence | Current state |
| --- | --- | --- |
| Anonymous Blog list/detail | Public list and one detail URL return the pilot entry | Not run; no deployment performed |
| Anonymous Changelog list/detail | Public list and one released-version detail URL return the pilot entry | Not run; no deployment performed |
| Non-admin and expired session | `/studio`, `/_studio`, and Studio write routes deny access | Local auth tests only; production not run |
| Admin entry | Existing platform Admin session reaches Studio without GitHub OAuth | Production not run |
| Pilot edit and publish | Studio edit creates the intended content-only Git commit on `main` | Not run; requires an authorized production session and server token |
| CI and deploy | Existing Portal checks, image publication, and immutable deployment complete | Not run; push and deployment intentionally skipped |
| Public reflection | Deployed public page shows the published change | Not run; deployment intentionally skipped |
| Credential boundary | Token absent from browser output, public content, logs, and repository files | Local bundle/config checks pass |
