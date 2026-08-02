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
