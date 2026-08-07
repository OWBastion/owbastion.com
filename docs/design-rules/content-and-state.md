# Content and State Language

本文档负责内容层级、状态表达、权限边界和公开/私有展示规则。具体中文写法
和状态词见 [`portal-copy-guidelines.md`](portal-copy-guidelines.md)；术语见
[`terminology.md`](terminology.md)。

## Content hierarchy

- Player-facing copy uses concise, restrained, factual Chinese. Prefer short
  labels such as `暂无记录`, `未开放`, `读取中…`, and `提交中…`.
- Headings state what the content is; supporting text adds only a condition,
  scope, constraint, or executable next step.
- Do not describe future plans as available actions, repeat the state in a
  paragraph, or expose internal terms such as review, distribution, or OCR
  unless the user needs them to act.

## Self-explanatory UI

The interface should explain itself through hierarchy, layout, labels, data,
status, and actions. Supporting copy is retained only when it adds information
that cannot be inferred from the UI itself.

Default information hierarchy:

**object/field → value/data → real status → action → section heading → supporting copy**

Supporting copy must not become the primary mechanism for making an otherwise
ambiguous layout understandable.

### Deletion test and duplicate-fact test

Before keeping a visible supporting sentence, apply the deletion test:

> If this text is removed, can the intended user still correctly identify the
> content/state and complete the current task?

If yes, remove it. A second check rejects duplicate facts: one fact normally has
one primary visible representation. Repeating `QQ 已绑定`, `未开放`, a submission
status, or the page purpose across multiple hierarchy levels requires a concrete
reason.

### Defaults for explanatory elements

These are defaults, not absolute bans. Accessibility text and hidden semantic
labels remain valid even when visible explanatory copy is removed.

| Element | Default |
| --- | --- |
| Page eyebrow / kicker | Do not add by default. |
| Page description / subtitle | Do not add by default; retain only for non-obvious scope, a constraint, or a required next action. |
| Card kicker | Do not add by default. |
| Card / section description | Retain only when the heading and visible content cannot communicate an important business distinction. |
| Helper text | Use only for format requirements, constraints, consequences, risk, or information required to continue. |
| Badge / status | Attach it to the object it describes; do not duplicate the same status in a separate "status" region without a distinct purpose. |
| `UAlert` | Reserve for exceptional state, risk, failure, or action-required information; do not use it as routine descriptive copy. |
| Tooltip / popover help | Use for low-frequency clarification, not to compensate for weak labels or layout. |

## State presentation

- Express loading, failure, empty, unavailable, and completed states with
  factual text or accessible status semantics.
- The visual state color must be paired with text or an equivalent accessible
  semantic; color, icon, or position alone is insufficient.
- Keep unavailable, in-progress, completed, and future states distinct.

## Permission boundary

- Public pages must not render QQ identifiers, private evidence, review notes,
  internal signals, or unapproved drafts.
- Player pages show only the current player's data.
- Admin pages use the existing authenticated server proxy.
