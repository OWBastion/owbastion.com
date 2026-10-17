# Portal design prototype

Static reference previews for every Portal component, exported from the Claude design-system artifact (token CSS variables only; light and dark via tokens). Rules below apply to the prototype and the code. `components/<Name>/preview.html` is the target look; `README.md` beside it is the anatomy, states, and accessibility contract. Where a preview differs from `apps/portal`, the preview is the proposed design and the code change is tracked in an Issue. Components absorbed by a merge are described in the surviving component's README.

玩家端有游戏质感，管理端讲工作效率，二者共用同一套令牌、圆角、字体和按压反馈。先回答用户为什么来，再展示其余。

## 颜色

- 只使用语义令牌：`page`、`surface`、`surface-raised`、`text`、`muted`、`quiet`、`line`、`line-strong`、`accent`、`accent-surface`、`on-accent`、`info`、`success`、`danger`、`warning`。不写原始 hex、oklch 或 Tailwind 调色板类（如 `text-gray-500`）来表达含义。
- 标题和数值用 `text`；正文和标签用 `muted`；说明、计数、版本号、时间戳才用 `quiet`。每个文字令牌在 `page`、`surface`、`surface-raised` 上都达到 4.5:1，层级靠字号和字重，不靠再变淡。
- `accent`（橙）只用于主操作和当前强调，不表示“已完成”。完成用 `success`。
- 状态色必须配文字或可访问语义，不能只靠颜色或图标。
- 文字压在 `accent` 填充上用 `on-accent`（深色主题里是深字，不要写死白色）。

## 字体

- 一个角色等于字号、字重、行高、字距的整体。只用 400、500、600、700 四种字重；文字不小于 `0.75rem`；仅标题角色使用负字距（中文会挤）。
- 统计、表格和详情值使用等宽数字（`tabular-nums`）。字号用 rem。
- 不写页面私有的字体族、字号或第二套字阶；运营界面不用装饰性展示字体。
- 字体栈为系统无衬线（`-apple-system`、`SF Pro Display`、`PingFang SC`、`Noto Sans CJK SC`、`Segoe UI`）。

## 间距、控件与圆角

- 间距只走 `space-1` 到 `space-16` 的梯度，不写梯度外的 rem，不写布局用 px（1px 分隔线除外）。
- 控件高度：`control-sm`（密集表格）、`control-md`（默认）、`control-lg`（玩家主操作，粗指针下所有控件）。
- 圆角按角色：控件 `radius-control`，卡片和页头 `radius-card`，模态框 `radius-sheet`，徽章 `radius-pill`。圆形标记才用 50%。
- 布局宽度由 `page-shell`（`shell-wide`、`shell-readable`、`shell-narrow`）决定，不在页面里重定义。组件用容器查询（24rem）响应，不用视口查询。

## 材质与层级

- 半透明材质只用 `glass`、`glass-heavy`、`glass-chip`、`glass-segment`，不另写 `backdrop-filter`。页头和页脚的分段用 `glass-segment`。
- 层级：`elevation-1` 吸顶页头，`elevation-2` 卡片和菜单，`elevation-3` 模态框、抽屉、浮动决策条。不并行造第二套阴影。
- 减少透明度偏好下玻璃改为实色；扩展它，不要绕开它。

## 动效

- 只允许对操作的响应：按压（`press-scale`、`press-scale-soft`）、主题切换（`theme-transition`）、指针跟随的图标倾斜、系统浮层。不做循环、入场编排、漂浮、扫光和脉冲。
- 减少动态效果偏好下不做缩放、滑动和弹簧，只保留透明度、颜色、边框、背景变化。

## 组件与页面

- 选用顺序：领域组件、Nuxt UI、本地组合。不引入第二套组件库。
- 页面以一个焦点开头，分三个层级：焦点、支撑块、详情。同一屏最多两组同等权重的卡片。
- 数字要可比较：概览行、分段进度、概率条、换算（“约每 N 次触发一次”）。缺失显示“—”或省略，不编造等级或排名。
- 可逆操作立即生效并给“撤销”；只有不可逆或危险操作才确认，并写明后果。管理员的决定从不要求填写原因。
- 每个数据区域处理加载、读取失败、空、不可用、进行中、成功和权限状态。

## 说明文字

- 由层级、布局、标签、数据、状态和操作来解释页面；说明文字不能去拯救含糊的布局。
- 删除测试：删掉这句话，用户仍能识别状态并完成任务，就删掉它。重复测试：同一个事实只用一种主要表达。
- 帮助文字只用于格式、约束、后果、风险，或继续所需的条件；徽标贴在对象上，不在另一处重复；`UAlert` 只用于异常、风险、失败或必需的操作。

## 表单

- 必填标记 `*` 与字段标签在同一行，紧跟标签文字，不单独占一行；只标必填字段。
- 界面不显示程序字段名、枚举键和内部 ID（如 `map_…`、`evt_…`、`kind`）：显示名称或中文标签；需要选择时用选择器，不让人手输 ID。
- 战网 ID 一律写作“名字#数字 ID”（如 `夜枭#1234`，ID 用 `quiet` 色），不写“战网 ID：1234”，也不拆成两列。
- 不用“证据”一词（它是内部 evidence 的外泄）：直接说“截图”“识别结果”，状态说“满足条件”“需人工确认”。
- 统一称“对局码”，不用“通关码”。

## 反模式

写死状态色；字重超出 400 到 700 或文字小于 `0.75rem`；圆角写死；文字淡到 4.5:1 以下；页面私有的玻璃、阴影、圆角；用 `accent` 表示“已完成”；只用颜色或图标表达状态；在视口断点重排或隐藏组件的结构；页面级固定底栏。
