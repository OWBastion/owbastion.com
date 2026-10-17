# Portal Copy

Applies to player pages, login, submission, status, empty states, and admin in `apps/portal`.
Every sentence must earn its place: short labels, direct titles, factual states. Check
[terminology.md](terminology.md) first and reuse its wording (title names, slots, display modes,
flow terms; API keys and DB enums stay as is). Changelog: [changelog-guidelines.md](changelog-guidelines.md).

## Rules

- Short phrases for content and state: `暂无记录`, `未开放`, `读取中…`, `提交中…`, `识别中…`,
  `上传中…`, `保存中…`. Headings say what it is; supporting text adds only a condition, scope, or
  limit. Chinese punctuation, restrained tone.
- Empty states show the current condition only; add an action only if explicit and executable.
- Errors name the object and next step: `无法读取挑战目录，请稍后重试。`
- Future features use facts like `未开放`, never dates, promises, or "will show here".
- Avoid internal terms for players (审核, 发放, 编排, 持久化, OCR) unless needed to act.
- Avoid patterns that restate the page: `这里……会……`, `开放后会在这里显示`, `正在……你的……`,
  `完成后会自动……`. Do not pad a state with an explanation that has no next step.
- Player projection never exposes internal workflow vocabulary or private data (QQ identifiers,
  review notes, risk signals, drafts).

## Self-explanatory UI

Let hierarchy, layout, labels, data, status, and actions explain the page. Order:
**object/field, value, real status, action, section heading, supporting copy.** Supporting copy never
rescues an ambiguous layout.

- **Deletion test**: if removing the sentence still lets the user identify the state and finish the
  task, delete it. **Duplicate test**: one fact, one primary representation (`QQ 已绑定`, `未开放`,
  submission status, page purpose) unless there is a concrete reason.
- Defaults (not absolute; accessibility text always stays): no page eyebrow/kicker, no page
  description (keep only for non-obvious scope, a constraint, or a required next step), no card
  kicker; card or section description only when heading and content cannot convey a key business
  distinction; helper text only for format, constraint, consequence, risk, or what is needed to
  continue; badges attach to their object and are not repeated in a separate status region;
  `UAlert` only for exception, risk, failure, or required action; tooltip for rare clarification, not
  to patch weak labels.
- Useful: `唯一 Key` + `创建后不可修改`; a destructive action with its consequence; an invalid
  screenshot with the missing requirement. Redundant: `玩家` + `查看和管理玩家信息`; an eyebrow plus
  title plus paragraph saying the same; an identity block repeating bound status; `未开放` on the
  section and every child.

### Display rules from the design prototype

- Never show program field names, enum keys, or internal IDs (`map_…`, `evt_…`, `kind`); show the
  name or Chinese label, and use a selector instead of asking people to type an ID.
- A BattleTag is always one unit, `名字#数字 ID`, with the number in `quiet`.
- Required `*` sits on the same line as its label, right after the text; mark only required fields.
- Do not write `证据`, `通关码`, or `样本不足`; see [terminology.md](terminology.md#不使用的词).
- Wording that only restates a UI label, status, or field is removed (examples: a description under
  an already named section, `公开结果` beside a visibility switch, a share slogan, a hint repeating a
  filled-in value). Abbreviate actions to `展开`/`收起`.
- A revoked title is not undone in place; re-granting is a new manual grant.

## Submission status

Player API exposes four states; `rejected` with `resubmissionRequired` shows "需重新提交".

| Key | Text |
| --- | --- |
| `processing` | 处理中 |
| `needs_review` | 等待核对 |
| `completed` | 已完成 |
| `rejected` | 未通过 |

Admin also shows `upload_pending` 上传中…, `ocr_pending` 等待识别, `ready_for_review` 等待核对,
`ocr_review_required` 等待处理, `approved` 已通过, `resubmission_required` 需重新提交.

## Preferred wording

| Case | Use | Avoid |
| --- | --- | --- |
| Empty | 暂无记录 | 还没有提交记录，新的进度会显示在这里 |
| Unavailable | 未开放 | 开放后会在这里显示 |
| Loading | 读取中… | 正在读取你的玩家中心…… |
| Choose target | 选择挑战 | 选择一个挑战目标开始后续流程 |
| Upload | 上传截图 | 上传一张完整截图，识别通过后进入人工核对 |
| Submitting | 提交中… | 正在上传，请耐心等待系统处理 |
| Read failure | 无法读取挑战目录，请稍后重试。 | 部分可提交内容暂时无法读取，请确认网络后重试 |
| Not found | 找不到这条提交记录。 | 暂时无法找到这条提交记录。 |

## Before editing copy

Match the tone of `pages/index.vue` and `pages/me.vue`; classify each sentence (content, state, error,
action); run the deletion and duplicate tests; reuse the status table; prefer a clearer heading,
label, grouping, or control over added text; after editing, search for `这里`, `开放后`, `正在`,
`完成后` and re-check empty, loading, and error states.
