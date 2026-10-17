# SubmissionProgress

以竖向时间线展示截图提交的四个步骤：上传截图 → 截图识别 → 核对结果 → 获得称号。合并了原 `SubmissionProcess`（提交前的流程说明）：没有 `status` 时是“获得称号流程”引导态，每步带一行说明、不显示状态词；有提交时显示实际进度。

**属性**：`status`（processing / needs_review / completed / rejected / 其他）、`resubmissionRequired`；`updatedAt` 已声明但模板未使用。

**状态词**：「已完成」「进行中」「待处理」「未通过」；识别失败且需重提时为「需重新提交」。

**映射**
- processing：完成、进行中、待处理、待处理（识别步说明「平台正在处理截图」）
- needs_review：完成、完成、进行中（「等待核对」）、待处理
- completed：全部「已完成」
- rejected：需重提时 [完成, 失败「请重新提交截图」, 待处理, 待处理]，否则 [完成, 完成, 失败「未通过」, 待处理]

**样式**：已完成用 --accent 描边与 --accent-surface；进行中为 --accent 实底、--on-accent 字；失败用 --warning；待处理为 --quiet / --surface-raised。标记 32px，过渡 160ms。

**无障碍**：每个标记 `role="img"`，aria-label「{步骤}：{状态}」；有序列表；卡片 `aria-labelledby`。

**合并建议稿（2026-10）**：`SubmissionProcess` 与 `SubmissionProgress` 讲的是同一条四步流程，只是一个静态说明、一个带状态。合并为 `SubmissionProgress`：
- 无 `status`（提交页）：标题「获得称号流程」，步骤名与说明沿用原 SubmissionProcess（上传截图 / 截图识别 / 核对结果 / 获得称号），无状态词。
- 有 `status`（提交详情页）：标题「提交进度」，同一组步骤加状态与说明。
- 第一步名称统一为「上传截图」（原进度里的「已提交」改为「上传截图」+ 状态「已完成」）。
- 删除组件 `SubmissionProcess`，使用处改用 `SubmissionProgress`（代码合并另做）。
