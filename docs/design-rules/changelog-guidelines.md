# Changelog Guidelines

Rules for `apps/portal/content/changelog/YY.MMDD.V.md` ("版本更新"). It holds **released** changes only;
in-progress or planned work goes in `blog`. The filename date and sequence match the real release.

## Frontmatter

```yaml
---
title: "本次更新主题"            # <= 160 chars, names the core modules
description: "一两句话概括正文里最主要的具体改动。"   # <= 320 chars
releasedAt: YYYY-MM-DD           # matches the version's date
version: "YY.MMDD.V"
tags:
  - "版本更新"                   # always exactly this
---
```

`description` summarizes the body: name the concrete heroes, events, maps, or numbers. It must not
repeat or paraphrase `title`, and must not use a fixed sentence pattern.

## Markdown

- No H1 (the page renders `title`); start at H2; use only H2-H4 with no skipped level.
- Lists use `- `, sublists indent 4 spaces. No backslash escapes (`\(`, `\*`). No placeholders (`xx`,
  empty sections, drafts).

## Sections

Order is free; omit sections with no content.

| Section | Heading | Contents |
| --- | --- | --- |
| Hero | `## 🕛 英雄更新` / `### [英雄]` | `- **技能（键位）：** 由旧调整为新`; one-line `> 背景` only if the reason needs explaining |
| Map | `## 🗺 全新地图：[名]` or `## 🗺 [名] 重制版` | Only confirmed region, fortress count and distribution; a timed challenge as `### [名]限时挑战（MM.DD）` with the real conditions, window, rewards; omit if none |
| Events | `## 🔃 随机事件调整` | `### 增益类事件 （好运降临）`, `### 减益类事件 （厄运缠身）`, `### [机制类别]`, `### 赌徒事件组机制改动`; events as `#### [名]` (`（重做）` if reworked); facts and numbers from this release, no fixed ratios |
| General | `## 🕹 综合更新` | Global mechanics, settings, lobby rules not tied to one hero or event |
| Fixes | `## 🐛 错误修复` | `### 英雄` / `### 随机事件` / `### 地图`; `- **[对象]：** 修复了……的问题` |

## Event history

Event changes become entries in each event's balance history on the Events page, and a `####`
event heading gets a hover card. Fixes are not part of it. The build resolves every `####` heading
through `apps/portal/content/event-lineage.ts` and fails on an unknown name.

- Sources: `#### [名]` sections, and list items that start with a bold `**[名]：**` or a quoted
  `「[名]」` under `## 🔃 随机事件调整`, `## 🌟 新增…事件` (adds the 新增 tag), or `## 🃏 …事件回归`
  (each `###` is one event, 回归 tag). A list item that names no known event is ignored.
- Limited-time scope: only for a limited-time activity (镜中回响, 鸿运当头). Put
  `> 以下调整仅适用于「[活动名]」。` as the first line under the `##` heading. The history shows the
  activity as a label. Event changes inside an activity `##` section go under a `### …随机事件调整`
  heading. Other changes are not scoped.
- A change identical to the previous one for the same event is shown once.
- New event, rename, or merge: add or extend its entry in the lineage before publishing. List a name
  once per event, oldest first; give a reused name `until`. A heading that names no event goes in
  `ignoredEventHeadings`.

## Style

- State facts directly; no mechanical bold-prefix formulas (`**触发条件放宽：**`) and no filler or
  verdicts ("旨在提升……体验", "大幅减少极端负面情况"). Write the mechanism and numbers.
- Use `由 A 降低/增加/调整至 B`, no long transitions.
- Follow [terminology.md](terminology.md); no internal player-facing words (审核, 发放, OCR, 持久化,
  编排). Use 获得称号, 成就挑战, 地图限定称号.
