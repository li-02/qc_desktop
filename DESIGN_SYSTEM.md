# QC Desktop 设计系统规范

**多源生态监测时序数据质控系统 · Design System v1.0**

> 本文档是项目 UI/UX 唯一标准来源。所有新增页面、组件的开发必须严格遵循以下规范。
> 所有设计令牌（CSS 变量）均定义在 `frontend/src/assets/design-system.css`。

---

## 目录

1. [设计原则](#设计原则)
2. [色彩系统](#色彩系统)
3. [字体排版](#字体排版)
4. [间距系统](#间距系统)
5. [圆角系统](#圆角系统)
6. [阴影系统](#阴影系统)
7. [布局规范](#布局规范)
8. [组件规范 — 按钮](#按钮)
9. [组件规范 — 卡片](#卡片)
10. [组件规范 — 表单控件](#表单控件)
11. [组件规范 — 标签/徽章](#标签徽章)
12. [组件规范 — 表格](#表格)
13. [组件规范 — 对话框](#对话框)
14. [组件规范 — 侧边栏](#侧边栏)
15. [数据可视化配色](#数据可视化配色)
16. [开发规则](#开发规则)

---

## 设计原则

| 原则         | 说明                                               |
| ------------ | -------------------------------------------------- |
| **数据优先** | 图表、数字是核心内容，界面为数据服务，不喧宾夺主   |
| **专业精准** | 面向科研人员，信息密度高，操作路径清晰             |
| **生态主题** | 以生态绿为品牌色，传递自然、科学的品牌调性         |
| **高度一致** | 同类元素在所有页面视觉行为完全相同                 |
| **令牌驱动** | 禁止在组件内写硬编码颜色/间距，所有值引用 CSS 变量 |

---

## 色彩系统

### 主色 — 生态绿 (Ecological Emerald)

| 变量                      | 值            | 用途                 |
| ------------------------- | ------------- | -------------------- |
| `--color-primary-50`      | `#ecfdf5`     | 极淡背景、悬停背景   |
| `--color-primary-100`     | `#d1fae5`     | 软背景               |
| `--color-primary-200`     | `#a7f3d0`     | 边框高亮             |
| `--color-primary-300`     | `#6ee7b7`     | 装饰                 |
| `--color-primary-400`     | `#34d399`     | Element Plus light-3 |
| **`--color-primary-500`** | **`#10b981`** | **★ 主品牌色**       |
| `--color-primary-600`     | `#059669`     | 悬停/深色            |
| `--color-primary-700`     | `#047857`     | 激活/按压            |
| `--color-primary-800`     | `#065f46`     | 深色文字             |
| `--color-primary-900`     | `#064e3b`     | 最深                 |

### 中性色 — 石板灰 (Slate)

| 变量                  | 值        | 用途               |
| --------------------- | --------- | ------------------ |
| `--color-neutral-0`   | `#ffffff` | 纯白背景           |
| `--color-neutral-50`  | `#f8fafc` | 页面背景           |
| `--color-neutral-100` | `#f1f5f9` | 应用背景、次要背景 |
| `--color-neutral-200` | `#e2e8f0` | 默认边框           |
| `--color-neutral-300` | `#cbd5e1` | 强边框、分割线     |
| `--color-neutral-400` | `#94a3b8` | 禁用文字           |
| `--color-neutral-500` | `#64748b` | 辅助文字           |
| `--color-neutral-600` | `#475569` | 次要文字           |
| `--color-neutral-700` | `#334155` | 正文               |
| `--color-neutral-800` | `#1e293b` | 主要正文           |
| `--color-neutral-900` | `#0f172a` | 标题               |

### 语义色

| 语义      | 颜色      | 变量          |
| --------- | --------- | ------------- |
| 成功      | `#22c55e` | `--c-success` |
| 警告      | `#f59e0b` | `--c-warning` |
| 危险/错误 | `#ef4444` | `--c-danger`  |
| 信息      | `#3b82f6` | `--c-info`    |

### 语义别名（推荐使用）

```css
/* 推荐：使用语义别名，不要直接用色阶变量 */
color: var(--c-brand); /* 品牌主色 */
color: var(--c-text-primary); /* 主标题文字 */
color: var(--c-text-base); /* 正文文字 */
color: var(--c-text-secondary); /* 次要文字 */
color: var(--c-text-muted); /* 辅助/灰色文字 */
background: var(--c-bg-surface); /* 卡片/面板背景 */
background: var(--c-bg-page); /* 页面内容背景 */
background: var(--c-bg-app); /* 应用最底层背景 */
border-color: var(--c-border); /* 默认边框色 */
```

---

## 字体排版

### 字体族

- 主字体：`Inter`（英文） + `Microsoft YaHei` / `PingFang SC`（中文）
- 代码字体：`JetBrains Mono` / `Consolas`
- 变量：`var(--font-sans)` / `var(--font-mono)`

### 字号阶梯

| 变量              | 大小     | 用途                      |
| ----------------- | -------- | ------------------------- |
| `--text-2xs`      | 10px     | 极小标注                  |
| `--text-xs`       | 11px     | 数据标签、表格辅助信息    |
| `--text-sm`       | 12px     | 次要说明、meta 信息、表头 |
| **`--text-base`** | **13px** | **界面默认正文 ★**        |
| `--text-md`       | 14px     | 表单标签、列表项、按钮    |
| `--text-lg`       | 15px     | 卡片标题                  |
| `--text-xl`       | 16px     | 区块标题                  |
| `--text-2xl`      | 18px     | 页面副标题                |
| `--text-3xl`      | 20px     | 页面主标题                |
| `--text-4xl`      | 24px     | 展示性大数字              |
| `--text-5xl`      | 30px     | KPI 数字                  |

### 字重规范

| 场景               | 字重 | 变量              |
| ------------------ | ---- | ----------------- |
| 普通正文           | 400  | `--font-normal`   |
| 表单标签、次级标题 | 500  | `--font-medium`   |
| 卡片标题、按钮     | 600  | `--font-semibold` |
| 大标题、KPI        | 700  | `--font-bold`     |

### 文字颜色规范

| 场景                     | 变量                 | 值        |
| ------------------------ | -------------------- | --------- |
| 页面/区块大标题          | `--c-text-primary`   | `#0f172a` |
| 卡片标题、正文、表单标签 | `--c-text-base`      | `#1e293b` |
| 次要描述、列表副文字     | `--c-text-secondary` | `#475569` |
| 提示、说明、占位符       | `--c-text-muted`     | `#64748b` |
| 禁用状态、极小标注       | `--c-text-disabled`  | `#94a3b8` |
| 深色/品牌背景上的文字    | `--c-text-inverse`   | `#ffffff` |
| 内联代码文字             | `--c-code-text`      | `#0d9488` |

### 行高与字间距

| 场景                 | 行高变量            | 值    |
| -------------------- | ------------------- | ----- |
| 大标题、KPI 数字     | `--leading-tight`   | 1.25  |
| 卡片标题、区块标题   | `--leading-snug`    | 1.375 |
| 默认正文、表单标签   | `--leading-normal`  | 1.5   |
| 长段落、帮助说明文字 | `--leading-relaxed` | 1.625 |

| 场景                       | 间距变量            | 值      |
| -------------------------- | ------------------- | ------- |
| 大号标题（20px+）          | `--tracking-tight`  | -0.02em |
| 默认正文                   | `--tracking-normal` | 0em     |
| 全大写标注、侧边栏分组标题 | `--tracking-wide`   | 0.04em  |
| 极小全大写说明             | `--tracking-wider`  | 0.08em  |

### 预设文字样式（Text Styles）

使用 `.qc-type-*` 工具类快速应用完整的排版组合，无需在组件内重复声明字号/字重/颜色。

| CSS 类                | 字号      | 字重       | 颜色                 | 行高       | 典型用途            |
| --------------------- | --------- | ---------- | -------------------- | ---------- | ------------------- |
| `.qc-type-heading`    | 20px      | 700 Bold   | `--c-text-primary`   | 1.25 tight | 页面主标题          |
| `.qc-type-subheading` | 16px      | 600 Semi   | `--c-text-primary`   | 1.375 snug | 区块标题            |
| `.qc-type-card-title` | 15px      | 600 Semi   | `--c-text-base`      | 1.375 snug | 卡片标题            |
| `.qc-type-label`      | 14px      | 500 Medium | `--c-text-base`      | 1.5 normal | 表单标签、列表项    |
| `.qc-type-body`       | 13px      | 400 Normal | `--c-text-base`      | 1.5 normal | 界面默认正文        |
| `.qc-type-secondary`  | 13px      | 400 Normal | `--c-text-secondary` | 1.5 normal | 次要说明            |
| `.qc-type-caption`    | 12px      | 400 Normal | `--c-text-muted`     | 1.5 normal | 提示文字、meta 信息 |
| `.qc-type-mini`       | 11px      | 500 Medium | `--c-text-secondary` | 1.25 tight | 数据标签、极小标注  |
| `.qc-type-code`       | 12px mono | —          | `--c-code-text`      | —          | 内联代码片段        |

---

## 间距系统

> 基准单位：**4px**。所有间距必须是 4px 的倍数。

| 变量         | 值   | 常用场景                   |
| ------------ | ---- | -------------------------- |
| `--space-1`  | 4px  | 图标与文字间距             |
| `--space-2`  | 8px  | 紧凑元素间距、tag 内边距   |
| `--space-3`  | 12px | 列表项间距、侧边栏项内边距 |
| `--space-4`  | 16px | 内容元素间距、卡片小内边距 |
| `--space-5`  | 20px | **卡片默认内边距 ★**       |
| `--space-6`  | 24px | **页面内边距、区块间距 ★** |
| `--space-8`  | 32px | 大间距                     |
| `--space-10` | 40px | 超大间距                   |

### 页面布局间距

```css
--page-padding-x: 24px /* 页面左右留白 */ --page-padding-y: 20px /* 页面上下留白 */ --section-gap: 24px
  /* 主要区块之间 */ --content-gap: 16px /* 内容元素之间 */ --item-gap: 12px /* 列表/网格项之间 */ --tight-gap: 8px
  /* 紧凑元素之间 */;
```

---

## 圆角系统

| 变量              | 值      | 用途                         |
| ----------------- | ------- | ---------------------------- |
| `--radius-xs`     | 2px     | 极小，很少使用               |
| `--radius-sm`     | 4px     | 小按钮、输入框(small)        |
| **`--radius-md`** | **6px** | **默认按钮、输入框、标签 ★** |
| **`--radius-lg`** | **8px** | **卡片、面板、表格容器 ★**   |
| `--radius-xl`     | 12px    | 大卡片、弹窗                 |
| `--radius-2xl`    | 16px    | 特大容器                     |
| `--radius-3xl`    | 20px    | Glassmorphism 消息框         |
| `--radius-full`   | 9999px  | 圆形头像、状态点、胶囊按钮   |

### 语义圆角别名

| 别名               | 指向          | 值   | 语义                                      |
| ------------------ | ------------- | ---- | ----------------------------------------- |
| `--radius-control` | `--radius-md` | 6px  | 交互控件（按钮/输入框/标签/Tab/侧边栏项） |
| `--radius-panel`   | `--radius-lg` | 8px  | 容器面板（卡片/列表/表格）                |
| `--radius-overlay` | `--radius-xl` | 12px | 浮层（对话框/下拉/Popover）               |

新组件优先使用语义别名，便于全局统一调整。

### 组件圆角统一规范

| 圆角值   | 基础变量        | 语义别名           | 适用组件                                    |
| -------- | --------------- | ------------------ | ------------------------------------------- |
| 2px      | `--radius-xs`   | —                  | tag 内圆角、极细分割条                      |
| 4px      | `--radius-sm`   | —                  | small 尺寸输入框、代码片段背景              |
| **6px**  | `--radius-md`   | `--radius-control` | 按钮、输入框(默认)、标签、侧边栏导航项、Tab |
| **8px**  | `--radius-lg`   | `--radius-panel`   | 卡片、面板、列表容器、表格容器、工具栏块    |
| **12px** | `--radius-xl`   | `--radius-overlay` | 对话框、大型弹窗、Drawer                    |
| 16px     | `--radius-2xl`  | —                  | 特大展示容器（慎用）                        |
| 9999px   | `--radius-full` | —                  | 圆形按钮、状态点、胶囊标签                  |

> **禁止在组件中使用上述 7 种值之外的 `border-radius`**。
> 若某组件有特殊需求，先在此表中新增条目并评审，再使用。

---

## 阴影系统

| 变量                | 用途               |
| ------------------- | ------------------ |
| `--shadow-xs`       | 极细，几乎不可见   |
| `--shadow-sm`       | **卡片默认阴影 ★** |
| `--shadow-md`       | 卡片悬停、下拉菜单 |
| `--shadow-lg`       | 浮层、气泡提示     |
| `--shadow-xl`       | 侧抽屉、模态遮罩   |
| `--shadow-2xl`      | 全屏对话框         |
| `--shadow-brand-sm` | 主色按钮默认       |
| `--shadow-brand-md` | 主色按钮悬停       |

---

## 布局规范

### 整体结构

```
┌─────────────────────────────────────────────────┐
│  侧边栏 220px  │         内容区                  │
│  --sb-width    │   padding: 20px 24px            │
│                │   background: --c-bg-page       │
└─────────────────────────────────────────────────┘
```

### 页面容器

每个页面视图必须使用 `.qc-page` 类或等效样式：

```vue
<template>
  <div class="qc-page">
    <!-- 页面头部 -->
    <div class="qc-page-header">
      <div>
        <h1 class="qc-page-title">页面标题</h1>
        <p class="qc-page-subtitle">页面说明文字</p>
      </div>
      <div class="qc-flex" style="gap: var(--content-gap)">
        <!-- 操作按钮 -->
      </div>
    </div>
    <!-- 内容区 -->
  </div>
</template>
```

---

## 按钮

### 尺寸规格

| 尺寸           | 高度     | 内边距     | 字号     | 场景           |
| -------------- | -------- | ---------- | -------- | -------------- |
| xs             | 24px     | 0 8px      | 11px     | 表格行内操作   |
| sm             | 28px     | 0 12px     | 12px     | 工具栏辅助操作 |
| **md（默认）** | **32px** | **0 16px** | **13px** | **主要操作 ★** |
| lg             | 36px     | 0 20px     | 14px     | 突出操作       |
| xl             | 40px     | 0 24px     | 14px     | 引导性操作     |

### 按钮变体

| 变体                | 使用场景         | CSS 类                                          |
| ------------------- | ---------------- | ----------------------------------------------- |
| **Primary（主要）** | 页面主操作、确认 | `.qc-btn--primary` / `el-button type="primary"` |
| **Default（默认）** | 次要操作         | `.qc-btn--default` / `el-button`                |
| **Ghost（幽灵）**   | 弱化操作         | `.qc-btn--ghost`                                |
| **Danger（危险）**  | 删除、清空       | `.qc-btn--danger` / `el-button type="danger"`   |
| **Text（文字）**    | 内联操作、链接   | `.qc-btn--text` / `el-button type="text"`       |

### 规则

- 同一行最多放 **3 个按钮**，优先级从右到左降低
- 危险操作按钮必须在最右侧或有确认弹窗保护
- 禁用状态透明度统一为 `0.45`
- 按钮内图标尺寸：**14px**（sm）、**16px**（md/lg）

---

## 卡片

### 标准卡片规格

```css
background: var(--card-bg); /* #ffffff */
border: 1px solid var(--card-border); /* #e2e8f0 */
border-radius: var(--card-radius); /* 8px */
box-shadow: var(--card-shadow); /* shadow-sm */
padding: var(--card-padding); /* 20px */
```

### 卡片变体

| 变体   | 说明                      | CSS 类                          |
| ------ | ------------------------- | ------------------------------- |
| 默认   | 标准白色卡片              | `.qc-card`                      |
| 小号   | padding 16px              | `.qc-card.qc-card--sm`          |
| 大号   | padding 24px，radius 12px | `.qc-card.qc-card--lg`          |
| 无阴影 | 扁平化                    | `.qc-card.qc-card--flat`        |
| 可交互 | 悬停上浮效果              | `.qc-card.qc-card--interactive` |

### 卡片头部

```html
<div class="qc-card">
  <div class="qc-card-header">
    <span class="qc-card-title">
      <el-icon class="qc-card-icon"><DataLine /></el-icon>
      卡片标题
    </span>
    <div><!-- 右侧操作 --></div>
  </div>
  <!-- 卡片内容 -->
</div>
```

---

## 表单控件

### 输入框高度

| 尺寸        | 高度     | Element Plus   |
| ----------- | -------- | -------------- |
| small       | 28px     | `size="small"` |
| **default** | **32px** | 不传 size ★    |
| large       | 36px     | `size="large"` |

### 圆角：统一 `6px`（`--radius-md`）

### 间距规范

- 表单项之间：`16px`（`--form-item-gap`）
- 表单区块之间：`24px`（`--form-section-gap`）
- 标签宽度：根据内容统一对齐，推荐 `80px` 或 `100px`

### Focus 状态

- 边框变为品牌绿 `#10b981`
- 出现 `3px` 品牌色光晕：`0 0 0 3px var(--color-primary-100)`

---

## 标签/徽章

### Tag 规格

| 尺寸           | 高度     | 内边距    | 字号       |
| -------------- | -------- | --------- | ---------- |
| sm             | 18px     | 0 6px     | 10px       |
| **md（默认）** | **22px** | **0 8px** | **11px ★** |
| lg             | 26px     | 0 12px    | 12px       |

### 语义色标签

```html
<span class="qc-tag qc-tag--brand">主要</span>
<span class="qc-tag qc-tag--success">成功</span>
<span class="qc-tag qc-tag--warning">警告</span>
<span class="qc-tag qc-tag--danger">错误</span>
<span class="qc-tag qc-tag--info">信息</span>
<span class="qc-tag qc-tag--neutral">中性</span>
```

---

## 表格

### 规格

| 元素           | 高度 | 字号             |
| -------------- | ---- | ---------------- |
| 表头行         | 36px | 12px，600 weight |
| 数据行（默认） | 40px | 13px             |
| 数据行（紧凑） | 32px | 13px             |
| 数据行（宽松） | 48px | 13px             |

### 样式规则

- 表头背景：`#f8fafc`（`--c-bg-muted`）
- 行悬停背景：`#ecfdf5`（`--c-brand-soft`，极淡绿）
- 斑马纹：奇数行白色，偶数行 `#f8fafc`
- 表格容器圆角：`8px`，带 `1px` 边框
- 单元格内边距：`0 12px`

---

## 对话框

### 尺寸规格

| 尺寸           | 宽度      | 场景             |
| -------------- | --------- | ---------------- |
| sm             | 480px     | 确认框、简单表单 |
| **md（默认）** | **600px** | **标准表单 ★**   |
| lg             | 800px     | 复杂表单、预览   |
| xl             | 1000px    | 数据表格、图表   |
| full           | 90vw      | 全屏编辑         |

### 结构规范

```
┌─────────────────────────────────┐
│ Header: 标题（bg: --c-bg-muted）│ padding: 20px 24px
├─────────────────────────────────┤
│                                 │
│ Body: 内容区                    │ padding: 24px
│                                 │
├─────────────────────────────────┤
│ Footer: 操作按钮（bg: muted）   │ padding: 16px 24px
└─────────────────────────────────┘
```

- 圆角：`12px`（`--radius-xl`）
- Footer 按钮靠右排列，间距 `12px`
- 按钮顺序：取消（左）→ 确认（右）

---

## 侧边栏

| 属性       | 值                  |
| ---------- | ------------------- |
| 宽度       | 220px               |
| 背景       | `#ffffff`           |
| 右边框     | `1px solid #e2e8f0` |
| 导航项高度 | 32px                |
| 导航项字号 | 13px                |
| 导航项圆角 | 6px                 |
| 激活色     | `#10b981`（品牌绿） |
| 激活背景   | `#ecfdf5`（极淡绿） |

---

## 数据可视化配色

ECharts 系列色彩按以下顺序使用：

| 序号 | 色值      | 色名   | 变量          |
| ---- | --------- | ------ | ------------- |
| 1    | `#10b981` | 品牌绿 | `--c-chart-1` |
| 2    | `#3b82f6` | 蓝     | `--c-chart-2` |
| 3    | `#f59e0b` | 琥珀   | `--c-chart-3` |
| 4    | `#a855f7` | 紫     | `--c-chart-4` |
| 5    | `#ef4444` | 红     | `--c-chart-5` |
| 6    | `#06b6d4` | 青     | `--c-chart-6` |
| 7    | `#84cc16` | 黄绿   | `--c-chart-7` |
| 8    | `#f97316` | 橙     | `--c-chart-8` |

ECharts 初始化配置参考：

```ts
const chartColors = [
  "var(--c-chart-1)",
  "var(--c-chart-2)",
  "var(--c-chart-3)",
  "var(--c-chart-4)",
  "var(--c-chart-5)",
  "var(--c-chart-6)",
];

const baseOption = {
  color: chartColors,
  backgroundColor: "transparent",
  textStyle: { fontFamily: 'Inter, "Microsoft YaHei", sans-serif', fontSize: 12 },
  grid: { top: 40, right: 16, bottom: 40, left: 16, containLabel: true },
};
```

---

## 开发规则

### 强制规则（必须遵守）

1. **禁止硬编码颜色**：所有颜色值必须引用 CSS 变量，例：

   ```css
   /* ✅ 正确 */
   color: var(--c-text-primary);
   background: var(--c-brand-soft);

   /* ❌ 禁止 */
   color: #1e293b;
   background: #ecfdf5;
   ```

2. **间距只用设计令牌**：

   ```css
   /* ✅ 正确 */
   padding: var(--space-5);
   gap: var(--content-gap);

   /* ❌ 禁止 */
   padding: 20px;
   gap: 16px;
   ```

3. **字号只用设计令牌**：

   ```css
   /* ✅ 正确 */
   font-size: var(--text-base);

   /* ❌ 禁止 */
   font-size: 13px;
   ```

4. **圆角只用设计令牌**：

   ```css
   /* ✅ 正确 */
   border-radius: var(--radius-panel);
   border-radius: var(--radius-control);

   /* ❌ 禁止 */
   border-radius: 8px;
   border-radius: 10px;
   ```

5. **新页面必须使用 `.qc-page` 容器**

6. **Element Plus 组件 size 属性**：默认不传（32px），小号传 `size="small"`，大号传 `size="large"`

### 推荐实践

- 优先使用 `.qc-card`、`.qc-btn`、`.qc-tag` 等设计系统工具类
- 区块标题使用 `.qc-section-title`（自带左侧绿色竖线装饰）
- 状态点使用 `.qc-status-dot--success/warning/danger`
- 空状态使用 `.qc-empty` 结构

### CSS 变量速查

完整变量表见 `frontend/src/assets/design-system.css`

---

_最后更新：2026-04-02 | 版本：v1.0_
