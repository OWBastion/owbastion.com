# ReviewEditor

玩家撰写、编辑、撤回评价的表单（星级、文字、匿名）。

**属性**：`currentReview`、`rating`（1–5）、`comment`、`anonymous`、`saving`、`error`；事件 `update:rating`、`update:comment`、`update:anonymous`、`save`、`withdraw`。

**结构**
- 标题：已有评价为「编辑评价」，否则「写下评价」；右侧字数「{n}/500」。
- 「评分」fieldset：五颗星一行（只有「★」，无“N 星”文字）：不高于所选分数的星为 `accent` 色，其余为描边灰；右侧小字“{n} / 5”。悬停预览分数，点击所选的星可取消。
- 「评价内容」文本域（最多 500 字，4 行，占位「分享你的实际体验」）。
- 复选框「匿名展示」，说明「匿名展示只对其他玩家隐藏身份，维护人员仍可追溯。」
- 错误提示（`role="alert"`）。
- 操作：提交按钮「提交评价」/「保存修改」/「保存中…」；已有评价时另有「撤回评价」。

**状态**：saving 时全部控件 disabled、提交按钮 loading；超过 500 字时提交 disabled。

**无障碍**：星级按钮 `aria-pressed` + aria-label「{n} 星」；fieldset/legend；文本域 `aria-describedby="review-anonymous-note"`；focus-visible 2px --accent 描边。

**建议稿（2026-10）**：评分改为更简单的星级——一行五颗星，不再用五个带文字的按钮；每颗星命中区域仍为 `control-md`，`aria-label` 保持「{n} 星」。
