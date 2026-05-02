---
applyTo: "frontend/**"
description: "Frontend UI design standard for all coding agents: Codex, Claude Code, GitHub Copilot, Cursor, and other agentic tools."
---

# 前端 UI 设计规范（多 Agent 通用）

本文件是本仓库前端 UI 设计的唯一 Agent 规范源。所有 Agent 在修改 `frontend/**` 下的页面、组件、样式、交互和文案时，都必须先读取并遵守本文件。

适用对象：Codex、Claude Code、GitHub Copilot、Cursor、自定义代码 Agent，以及任何会自动读取仓库 Markdown 指令的工具。

## 读取约定

- GitHub Copilot 通过本文件的 `applyTo: "frontend/**"` frontmatter 自动应用。
- Claude Code 通过根目录 `CLAUDE.md` 引用本文件。
- Codex 通过根目录 `AGENTS.md` 引用本文件。
- 其他 Agent 若只支持单个规则文件，应优先读取本文件，而不是复制一份新规范。

重要原则：不要把本文件内容复制到其他 Agent 规则文件。其他入口文件只允许写“读取此文件”的短引用，避免多个规范互相冲突。

## 设计目标

本项目前端采用「生态监测网络」视觉语言：生态绿、数据监测仪表盘、自然生长感、专业科研工具感。

界面应当像一个长期使用的环境数据质控工作台，而不是营销页或装饰性展示页。优先保证信息密度、可扫描性、操作清晰度和稳定布局。

## 全局执行规则

- 所有用户可见文案使用中文。
- 前端样式优先使用原生 CSS、CSS 变量和现有组件样式；不要优先堆 Tailwind 工具类。
- 新增或重构前端页面时，先复用现有设计系统与局部组件模式。
- 页面第一屏必须直接呈现可用工作界面，不要做营销式 landing page。
- 布局不得出现文字遮挡、按钮文字溢出、表格列不稳定、卡片套卡片等问题。
- 修改 UI 后，应尽量运行前端校验或在浏览器中检查关键页面。

## 色彩令牌

所有生态主题颜色通过页面根容器或全局样式中的 CSS 变量引用。禁止在组件中随意硬编码十六进制颜色；只有第三方组件深度覆盖、图表色板、状态色等少数场景可以例外，并应保持与下列令牌一致。

```css
--eco-forest:        #0d2b1a;   /* 极深森林绿：最深文字、强调边框 */
--eco-forest-mid:    #1b4332;   /* 深森林绿：标题、深背景 */
--eco-pine:          #2d6a4f;   /* 松绿：次级文字、标签文字 */
--eco-moss:          #40916c;   /* 苔藓绿：主色、图标、边框 */
--eco-fern:          #52b788;   /* 蕨绿：悬停态、辅助色 */
--eco-spring:        #74c69d;   /* 春绿：分隔符、浅强调 */
--eco-leaf:          #95d5b2;   /* 嫩叶绿：轻强调、深色背景文字 */
--eco-mint:          #b7e4c7;   /* 薄荷绿：浅边框 */
--eco-mist:          #d8f3dc;   /* 绿雾：悬停背景 */
--eco-ice:           #ebfbf0;   /* 冰绿：极浅背景层 */
--eco-surface:       #f2fdf5;   /* 页面底色 */
--eco-white:         #f8fffe;   /* 绿白：卡片、表格行背景 */
--eco-border:        #74c69d;   /* 标准边框 */
--eco-border-light:  #b7e4c7;   /* 浅边框 */
--eco-text-dark:     #0d2b1a;   /* 深文字 */
--eco-text-mid:      #2d6a4f;   /* 中文字 */
--eco-text-muted:    #52b788;   /* 辅助文字 */
```

## 页面根容器

每个主页面根容器通常命名为 `.xxx-page`，应声明生态令牌并建立稳定的页面布局。

```css
.xxx-page {
  padding: 28px 32px;
  height: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
  background: var(--eco-surface);
  background-image:
    radial-gradient(ellipse at 15% 45%, rgba(64, 145, 108, 0.10) 0%, transparent 50%),
    radial-gradient(ellipse at 88% 12%, rgba(116, 198, 157, 0.12) 0%, transparent 45%),
    radial-gradient(ellipse at 55% 88%, rgba(27, 67, 50, 0.07) 0%, transparent 40%);
}
```

响应式要求：

- 页面横向内边距在窄屏下降低，但不要让主要控件贴边。
- 固定格式元素，例如表格操作列、工具栏、图表容器、状态徽标，必须设置稳定尺寸或最小尺寸。
- 不使用随视口宽度线性缩放的字体。

## 页面头部

主页面头部使用 `page-header` 模式：左侧为品牌图标、标题、副标题；右侧为统计徽标和主要操作按钮。

```css
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 16px;
  margin-bottom: 20px;
  padding-bottom: 18px;
  border-bottom: 1.5px solid var(--eco-border-light);
  position: relative;
  z-index: 1;
}

.eco-brand-icon {
  width: 52px;
  height: 52px;
  background: linear-gradient(145deg, #ffffff, #e8f8f0);
  border-radius: 13px;
  border: 1.5px solid var(--eco-border);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 9px;
  box-shadow: 0 2px 8px rgba(45, 106, 79, 0.18), 0 0 0 4px rgba(64, 145, 108, 0.10);
}

.eco-network-stats {
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
  font-size: 12.5px;
  color: var(--eco-text-mid);
}

.stat-badge {
  background: rgba(64, 145, 108, 0.10);
  border: 1px solid rgba(64, 145, 108, 0.25);
  border-radius: 20px;
  padding: 3px 12px;
  font-size: 12px;
  color: var(--eco-pine);
}
```

## 背景装饰

主页面可以使用轻量生态背景装饰，但必须满足：

- `aria-hidden="true"`。
- `pointer-events: none`。
- 不遮挡内容，不参与布局，不影响键盘和屏幕阅读器。
- 装饰透明度低，不能抢夺表格、表单、图表的视觉优先级。

```html
<div class="eco-backdrop" aria-hidden="true">
  <svg class="eco-leaf eco-leaf--1" viewBox="0 0 200 200">...</svg>
  <svg class="eco-leaf eco-leaf--2" viewBox="0 0 130 130">...</svg>
  <svg class="eco-network-graph" viewBox="0 0 520 260">...</svg>
</div>
```

```css
.eco-backdrop {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
  z-index: 0;
}

.eco-leaf {
  position: absolute;
  color: var(--eco-moss);
}

.eco-leaf--1 {
  width: 200px;
  height: 200px;
  top: -50px;
  right: 220px;
  transform: rotate(-18deg);
  opacity: 0.09;
}

.eco-leaf--2 {
  width: 130px;
  height: 130px;
  bottom: 50px;
  left: 30px;
  transform: rotate(35deg);
  opacity: 0.07;
}

.eco-network-graph {
  position: absolute;
  width: 520px;
  height: 260px;
  top: -10px;
  right: -20px;
  color: var(--eco-moss);
  opacity: 0.55;
}
```

## 按钮

主操作按钮使用绿色渐变，次级按钮使用浅底和绿色边框。按钮文字必须完整显示，不能依赖过窄固定宽度。

```css
.btn-primary {
  background: linear-gradient(135deg, var(--eco-moss) 0%, var(--eco-forest-mid) 100%);
  border: none;
  box-shadow: 0 2px 10px rgba(45, 106, 79, 0.35);
  font-weight: 500;
  transition: background 0.25s ease, box-shadow 0.25s ease, transform 0.25s ease;
}

.btn-primary:hover {
  background: linear-gradient(135deg, var(--eco-fern) 0%, var(--eco-moss) 100%);
  box-shadow: 0 4px 14px rgba(45, 106, 79, 0.45);
  transform: translateY(-1px);
}

.btn-secondary {
  background: rgba(248, 255, 254, 0.95);
  border: 1.5px solid var(--eco-border);
  color: var(--eco-pine);
  font-weight: 500;
}

.btn-secondary:hover {
  background: var(--eco-mist);
  border-color: var(--eco-moss);
  color: var(--eco-forest-mid);
}
```

## 卡片、面板和表格容器

卡片只用于独立内容块、重复项、弹窗或明确需要边界的工具区域。不要把页面大区块全部做成漂浮卡片，也不要卡片套卡片。

```css
.card-container,
.table-panel {
  background: rgba(248, 255, 254, 0.95);
  border-radius: 8px;
  padding: 4px;
  border: 1px solid var(--eco-border-light);
  box-shadow: 0 2px 16px rgba(13, 43, 26, 0.08), 0 1px 4px rgba(64, 145, 108, 0.06);
  flex: 1;
  overflow: hidden;
  position: relative;
  z-index: 1;
}
```

## Element Plus 表格

表格是本项目的核心工作界面，应保持紧凑、清晰、可扫描。

```css
:deep(.el-table th.el-table__cell) {
  background-color: #c9edda !important;
  color: var(--eco-forest-mid);
  font-weight: 600;
  font-size: 13px;
}

:deep(.el-table__body td.el-table__cell) {
  color: var(--eco-text-dark);
}
```

树形表格分类行：

```css
:deep(.category-row > td) {
  background-color: #e8f5ee !important;
  border-top: 1px solid #c0e4ce;
  border-bottom: 1px solid #c0e4ce;
  padding: 14px 0;
}

:deep(.category-row > td:first-child) {
  border-left: 3px solid var(--eco-moss) !important;
}

:deep(.category-row:hover > td) {
  background-color: #d5ecde !important;
}

:deep(.category-row > td:first-child .cell) {
  display: flex;
  align-items: center;
  gap: 6px;
}

:deep(.el-table__expand-icon) {
  color: var(--eco-moss);
  font-size: 14px;
  margin-right: 0;
  flex-shrink: 0;
}
```

数据源行：

```css
:deep(.datasource-row > td) {
  background-color: var(--eco-white) !important;
  border-bottom: 1px dashed #c8e8d4;
}

:deep(.datasource-row:hover > td) {
  background-color: #f0fbf4 !important;
}
```

推荐列宽：

| 列 | 属性 | 推荐值 |
| --- | --- | --- |
| 名称（含树层级） | `min-width` | `260` |
| 类型 | `width` | `120` |
| 状态 | `width` | `130` |
| 最后同步时间 | `width` | `180` |
| 操作 | `width` | `230` |

## 分类名称和操作列

分类名称单元格使用站点图标、站点名称、运行数量徽标，同一行展示，不换行。

```html
<div class="category-name-cell">
  <div class="station-marker">
    <svg viewBox="0 0 18 18" fill="none">
      <circle cx="9" cy="9" r="8" fill="rgba(64,145,108,0.12)" stroke="rgba(64,145,108,0.55)" stroke-width="1"/>
      <path d="M9 3.5C9 3.5 6.2 5.8 6.2 8.4C6.2 10 7.3 11 9 11C10.7 11 11.8 10 11.8 8.4C11.8 5.8 9 3.5 9 3.5Z" fill="#40916c"/>
      <line x1="9" y1="14.5" x2="9" y2="10.8" stroke="#2d6a4f" stroke-width="1.1" stroke-linecap="round"/>
    </svg>
  </div>
  <span class="category-label">{{ row.name }}</span>
  <span class="count-badge">
    <span class="count-running">{{ runningN }}</span>
    <span class="count-sep">/</span>
    <span class="count-total">{{ totalN }}</span>
    <span class="count-unit">通道</span>
  </span>
</div>
```

```css
.category-name-cell {
  display: flex;
  align-items: center;
  gap: 9px;
  white-space: nowrap;
}

.station-marker {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.category-label {
  font-weight: 700;
  color: var(--eco-forest);
  font-size: 14.5px;
}

.count-badge {
  display: inline-flex;
  align-items: baseline;
  gap: 1.5px;
  background: rgba(45, 106, 79, 0.08);
  border: 1px solid rgba(64, 145, 108, 0.30);
  border-radius: 10px;
  padding: 2px 9px;
  line-height: 1;
}
```

分类操作列按钮间使用竖线分隔，不要塞入过多主按钮。

```html
<div class="category-ops">
  <el-button link type="primary" @click="...">新增数据源</el-button>
  <span class="ops-divider">|</span>
  <el-button link type="primary" @click="...">重命名</el-button>
  <span class="ops-divider">|</span>
  <el-button link type="danger" @click="...">删除</el-button>
</div>
```

```css
.category-ops {
  display: flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}

.ops-divider {
  color: var(--eco-spring);
  font-size: 12px;
  user-select: none;
}
```

## 状态指示器

```css
@keyframes eco-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(64, 145, 108, 0.6); }
  50% { box-shadow: 0 0 0 5px rgba(64, 145, 108, 0); }
}

.status-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.status-dot.running {
  background: var(--eco-moss);
  animation: eco-pulse 2s infinite;
}

.status-dot.stopped {
  background: var(--eco-spring);
  opacity: 0.55;
}

.status-dot.error {
  background: #e07a5f;
}
```

## Element Plus 覆盖

```css
:deep(.el-tag--success) {
  background-color: rgba(64, 145, 108, 0.12);
  color: var(--eco-pine);
  border-color: rgba(64, 145, 108, 0.28);
}

:deep(.el-tag--primary) {
  background-color: rgba(116, 198, 157, 0.16);
  color: var(--eco-forest-mid);
  border-color: rgba(116, 198, 157, 0.35);
}

:deep(.el-button.is-link.el-button--primary) {
  color: var(--eco-forest-mid);
}

:deep(.el-button.is-link.el-button--primary:hover) {
  color: var(--eco-forest);
}

:deep(.el-button.is-link.el-button--danger) {
  color: #b44b38;
}

:deep(.el-button.is-link.el-button--danger:hover) {
  color: #902f20;
}
```

## 对话框

普通弹窗使用浅绿色头部，日志弹窗使用深色森林背景。对话框标题、按钮和输入提示必须使用中文。

```css
.data-source-dialog .el-dialog__header {
  background: linear-gradient(135deg, #e8f8ee 0%, #d5eddc 100%);
  border-bottom: 1px solid #9fd6b4;
  padding: 16px 20px;
  border-radius: 8px 8px 0 0;
}

.data-source-dialog .el-dialog__title {
  color: var(--eco-forest-mid);
  font-weight: 600;
  font-size: 15px;
}

.logs-dialog .el-dialog__header {
  background: #1a2a1e;
  border-bottom: 1px solid #2d4a35;
  padding: 14px 20px;
  border-radius: 8px 8px 0 0;
}

.logs-dialog .el-dialog__title {
  color: #95d5b2;
  font-weight: 600;
}

.logs-container {
  background: #1a2a1e;
  border-radius: 6px;
  padding: 16px;
  font-family: Consolas, "SF Mono", monospace;
  font-size: 12.5px;
  max-height: 400px;
  overflow-y: auto;
}
```

## 禁止事项

- 禁止把蓝色主题或 Element Plus 默认蓝色 `#409eff` 当作主色。
- 禁止使用大面积棕色、黄褐色、橙土色、米色作为主视觉。
- 禁止使用 `#c4a068`、`#d4b483`、`#f0e3c6`、`#faf4e4` 等暖色作为主题色。
- 禁止直接用 `<el-icon><Folder /></el-icon>` 作为分类图标；分类图标应使用生态站点标识。
- 禁止在分类行名称和状态列使用会导致换行混乱的 `white-space: normal`。
- 禁止为了装饰增加无业务意义的大面积渐变、漂浮圆球、过度阴影或营销式 hero。
- 禁止新增和现有设计系统冲突的第二套主题。

## 新建或重构页面 Checklist

1. 页面根容器使用生态色彩令牌。
2. 页面背景、表格、卡片和弹窗保持生态绿色工作台风格。
3. Header 包含清晰标题、必要统计和主要操作。
4. 表格列宽、操作列、状态列在桌面和窄屏下不挤压错位。
5. Element Plus 表头、Tag、Link Button、Dialog 有必要的主题覆盖。
6. 状态指示器使用 `.status-dot` 和一致状态色。
7. 所有用户可见文案为中文。
8. 修改后检查无文字溢出、遮挡、卡片套卡片、颜色偏离主题。
