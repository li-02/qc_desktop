---
id: qc-desktop-uiux-standards
title: QC Desktop UI/UX Standards
version: 1.0.0
last_updated: 2026-02-15
language: zh-CN
scope:
  - frontend/src/layouts/MainLayout.vue
  - frontend/src/components/dialogs/CreateProjectDialog.vue
  - frontend/src/components/dialogs/ImportDataDialog.vue
for_tools:
  - codex
  - windsurf
---

# UI/UX 统一规范（可执行）

本规范用于约束当前项目的桌面端界面风格与交互行为，后续新增/改造页面默认遵循此文档。

## 1. 视觉基线（Design Tokens）

### 1.1 颜色

- `--surface`: `#f8fafc`（页面/弹窗浅底）
- `--surface-elevated`: `#ffffff`（卡片/输入框底）
- `--border`: `#e2e8f0`（默认边框）
- `--text`: `#1e293b`（主文本）
- `--muted`: `#64748b`（次级文本）
- `--accent`: `#10b981`（主品牌色）
- `--accent-hover`: `#059669`（主按钮 hover）
- `--accent-soft`: `#ecfdf5`（弱强调背景）
- `--accent-border`: `#86efac`（选中态边框）
- `--danger-bg`: `#fef2f2`
- `--danger-border`: `#fecaca`

### 1.2 圆角与阴影

- 圆角：
  - `6px`：小按钮/小控件
  - `8px`：输入框/普通按钮
  - `10px`：卡片
  - `12px`：对话框外层
- 阴影：
  - 卡片 hover：`0 2px 8px rgba(15, 23, 42, 0.06)`
  - 弹窗：`0 16px 40px rgba(15, 23, 42, 0.18)`

### 1.3 间距（Spacing Scale）

- 使用固定节奏：`4, 6, 8, 10, 12, 16, 20`（px）
- 优先使用 8 的倍数系（8/12/16/20）。

## 2. 组件级规范

### 2.1 按钮

- 对话框 footer 按钮统一：
  - 高度 `36px`
  - 最小宽度 `110px`（表单弹窗可用 `120px`）
  - 圆角 `8px`
  - 字重 `600`
- 主按钮：
  - 默认：`--accent`
  - hover：`--accent-hover`
  - disabled：`#9ca3af`
- 次按钮：
  - 白底 + `--border`
  - hover：`--accent-soft` + 绿色描边

### 2.2 输入框

- 外观：
  - 白底
  - `1px` 内阴影边框（`--border`）
  - 圆角 `8px`
- 状态：
  - hover：边框 `#cbd5e1`
  - focus：边框 `--accent`

### 2.3 卡片

- 默认白底 + `1px --border` + `10px` 圆角。
- 选中态使用：
  - 背景 `#f8fffb`
  - 边框 `--accent-border`
- 禁止重玻璃拟态、强渐变、过重光晕阴影。

### 2.4 对话框

- 结构：
  - Header（标题+副标题）
  - Steps/说明（若是多步骤）
  - Body
  - Footer（统一按钮）
- 推荐内边距：
  - Header：`16px 20px`
  - Body：`14px 20px 8px`
  - Footer：`12px 20px 16px`

### 2.5 全高度面板布局（侧边栏 + 主内容区）

适用于异常检测、缺失值处理、通量分割等带侧边栏的功能面板。

- **父容器（外层 panel）**：
  - `display: flex`
  - `padding: 8px`，`gap: 8px`
  - `background: --surface`（`#f8fafc`）
  - `box-sizing: border-box`
- **侧边栏**：
  - 宽度 `280px`（响应式 `240px`）
  - 白底 + `1px --border` + `10px` 圆角（玻璃面板模式）
  - `overflow: hidden`
- **主内容区**：
  - `flex: 1`，`min-width: 0`
  - 白底 + `1px --border` + `10px` 圆角（玻璃面板模式）
  - 内部内容区域 padding: `24px`
- **在 DataAnalysisTabs 中挂载**：
  - tab-panel 必须使用 `full-height-panel` class
  - panel-wrapper 必须使用 `full-height-wrapper` class
  - 这确保面板与顶部选项卡栏之间无额外间距（`padding: 0`）

## 3. 交互与流程规范（UX）

### 3.1 分步流程

- 进入下一步前必须满足本步必填条件。
- 不满足时给出明确、单一的提示信息（不要泛化报错）。
- 最后一步提交按钮必须由条件控制可用性。

### 3.2 长任务防误操作

- 当 `loading` 或 `processing` 时：
  - 禁止关闭弹窗（遮罩点击/ESC/关闭按钮）
  - 禁止重复提交

### 3.3 表单校验

- 校验尽量“即时+失焦”结合（`change + blur`）。
- 数值输入使用严格解析，不使用宽松容错（如 `parseFloat("12abc")`）。
- 文案优先明确范围与格式，例如：
  - “经度范围应在 -180 到 180 之间”

### 3.4 自动化辅助

- 能自动推断的信息默认自动填充（例如：上传文件后自动填充数据集名称）。
- 自动填充不应覆盖用户已输入值。

## 4. 当前已落地模式（参考实现）

- 侧边栏统一风格：
  - `frontend/src/layouts/MainLayout.vue`
- 新建站点弹窗标准：
  - `frontend/src/components/dialogs/CreateProjectDialog.vue`
- 导入数据弹窗标准：
  - `frontend/src/components/dialogs/ImportDataDialog.vue`

## 5. 禁止项（Do Not）

- 不要使用重玻璃拟态、强 blur、夸张渐变背景。
- 不要出现同一 footer 内按钮高度/宽度不一致。
- 不要让用户走到最后一步才发现前置项缺失。
- 不要在处理过程中允许关闭弹窗导致中断。

## 6. 新页面/新弹窗验收清单（Checklist）

- [ ] 使用统一 token（颜色/圆角/边框/阴影）。
- [ ] 主次按钮尺寸、状态、文案一致。
- [ ] 输入框 focus/hover 状态统一。
- [ ] 必填项有前置校验，下一步/提交受条件约束。
- [ ] loading/processing 时防误关闭、防重复触发。
- [ ] 关键信息有简明提示（步骤说明、错误原因、成功反馈）。
- [ ] 移动/小窗口下布局不破坏（至少可滚动可操作）。

## 7. 给 AI/IDE 的执行指令（Windsurf/Codex）

当修改 UI 时默认执行：

1. 优先复用本规范 token，不新增无必要颜色。
2. 优先保证信息层级和操作确定性，再做视觉微调。
3. 所有对话框 footer 按钮统一 `36px` 高度和最小宽度。
4. 多步骤流程必须实现“步骤门禁 + 可理解错误提示”。
5. 提交前置条件统一封装为 `computed`（如 `canSubmit` / `canImport`）。

如果需求与本规范冲突，以用户最新明确要求为准，并更新本文件版本号与变更记录。

## 8. 变更记录

- `1.0.0`（2026-02-15）
  - 首次整理侧边栏、新建站点、导入数据弹窗的统一 UI/UX 标准。
- `1.1.0`（2026-02-15）
  - 新增 2.5 全高度面板布局规范：统一侧边栏+主内容区的 padding/gap/圆角/边框，并要求 tab-panel 使用 `full-height-panel` class 消除顶部间距。
