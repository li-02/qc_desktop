---
applyTo: "frontend/**"
description: "生态监测网络 UI 风格规范 — 纯绿色系设计系统，适用于本项目所有前端 Vue 组件"
---

# 生态监测网络 UI 风格规范

本项目前端所有页面/组件均采用「生态监测网络」视觉语言：纯绿色光谱、自然生长感、数据监测仪表盘质感。

---

## 1. 色彩令牌（CSS 自定义属性）

所有颜色通过定义在页面根容器（通常是 `.xxx-page`）上的 CSS 变量引用，**禁止在组件中硬编码十六进制颜色**（表格行背景等极少数无法用变量的情况除外）。

```css
/* 17 个标准色彩令牌，必须完整声明在每个页面的根类中 */
--eco-forest:        #0d2b1a;   /* 极深森林绿 — 最深文字、强调边框 */
--eco-forest-mid:    #1b4332;   /* 深森林绿 — 标题、深背景 */
--eco-pine:          #2d6a4f;   /* 松绿 — 次级文字、标签文字 */
--eco-moss:          #40916c;   /* 苔藓绿 — 主色调、图标、边框 */
--eco-fern:          #52b788;   /* 蕨绿 — 悬停态、辅助色 */
--eco-spring:        #74c69d;   /* 春绿 — 分隔符、边框 */
--eco-leaf:          #95d5b2;   /* 嫩叶绿 — 日志终端标题色 */
--eco-mint:          #b7e4c7;   /* 薄荷绿 — 浅边框 */
--eco-mist:          #d8f3dc;   /* 绿雾 — 悬停背景 */
--eco-ice:           #ebfbf0;   /* 冰绿 — 极浅背景层 */
--eco-surface:       #f2fdf5;   /* 页面底色 */
--eco-white:         #f8fffe;   /* 绿白 — 卡片 / 行背景 */
--eco-border:        #74c69d;   /* 标准边框色 */
--eco-border-light:  #b7e4c7;   /* 浅边框色 */
--eco-text-dark:     #0d2b1a;   /* 深文字 */
--eco-text-mid:      #2d6a4f;   /* 中文字 */
--eco-text-muted:    #52b788;   /* 淡文字 / 辅助说明 */
```

---

## 2. 页面根容器

每个页面 `.xxx-page` 须包含：

```css
.xxx-page {
  /* 上方色彩令牌完整声明 */
  padding: 28px 32px;
  height: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
  background: var(--eco-surface);
  /* 三个径向渐变光晕，营造生态空间感 */
  background-image:
    radial-gradient(ellipse at 15% 45%, rgba(64, 145, 108, 0.10) 0%, transparent 50%),
    radial-gradient(ellipse at 88% 12%, rgba(116, 198, 157, 0.12) 0%, transparent 45%),
    radial-gradient(ellipse at 55% 88%, rgba(27, 67, 50, 0.07)  0%, transparent 40%);
}
```

---

## 3. 生态背景装饰（eco-backdrop）

每个主页面模板顶层须添加装饰层，**aria-hidden="true"**，不影响交互：

```html
<div class="eco-backdrop" aria-hidden="true">
  <!-- 大叶片 — 右上角 -->
  <svg class="eco-leaf eco-leaf--1" viewBox="0 0 200 200" ...><!-- 叶形路径 --></svg>
  <!-- 小叶片 — 左下 -->
  <svg class="eco-leaf eco-leaf--2" viewBox="0 0 130 130" ...></svg>
  <!-- 微叶 — 左中 -->
  <svg class="eco-leaf eco-leaf--3" viewBox="0 0 90 90"  ...></svg>
  <!-- 监测站网络图 — 右上，9节点网状 -->
  <svg class="eco-network-graph" viewBox="0 0 520 260" ...></svg>
</div>
```

CSS 规则：

```css
.eco-backdrop { position: absolute; inset: 0; pointer-events: none; overflow: hidden; z-index: 0; }
.eco-leaf     { position: absolute; color: var(--eco-moss); }
.eco-leaf--1  { width: 200px; height: 200px; top: -50px; right: 220px; transform: rotate(-18deg); opacity: 0.09; }
.eco-leaf--2  { width: 130px; height: 130px; bottom: 50px; left: 30px;  transform: rotate(35deg);  opacity: 0.07; }
.eco-leaf--3  { width: 90px;  height: 90px;  top: 120px;  left: 260px; transform: rotate(-8deg);  opacity: 0.05; }
.eco-network-graph { position: absolute; width: 520px; height: 260px; top: -10px; right: -20px; color: var(--eco-moss); opacity: 0.55; }
```

---

## 4. 页面头部（page-header）

结构：品牌图标 + 标题/副标题 + 统计徽标（右） + 操作按钮（右下）。

```css
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 20px;
  padding-bottom: 18px;
  border-bottom: 1.5px solid var(--eco-border-light);
  position: relative;
  z-index: 1;
}

/* 品牌图标容器 */
.eco-brand-icon {
  width: 52px; height: 52px;
  background: linear-gradient(145deg, #ffffff, #e8f8f0);
  border-radius: 13px;
  border: 1.5px solid var(--eco-border);
  display: flex; align-items: center; justify-content: center;
  padding: 9px;
  box-shadow: 0 2px 8px rgba(45,106,79,0.18), 0 0 0 4px rgba(64,145,108,0.10);
}

/* 统计徽标区 */
.eco-network-stats {
  display: flex;
  gap: 6px;
  align-items: center;
  font-size: 12.5px;
  color: var(--eco-text-mid);
}
.stat-badge {
  background: rgba(64,145,108,0.10);
  border: 1px solid rgba(64,145,108,0.25);
  border-radius: 20px;
  padding: 3px 12px;
  font-size: 12px;
  color: var(--eco-pine);
}
.stat-badge strong { color: var(--eco-forest-mid); font-size: 14px; }
.stat-dot { width: 4px; height: 4px; border-radius: 50%; background: var(--eco-spring); }
```

---

## 5. 按钮规范

### Primary 按钮
```css
.btn-primary {
  background: linear-gradient(135deg, var(--eco-moss) 0%, var(--eco-forest-mid) 100%);
  border: none;
  box-shadow: 0 2px 10px rgba(45,106,79,0.35);
  font-weight: 500;
  transition: all 0.25s ease;
}
.btn-primary:hover {
  background: linear-gradient(135deg, var(--eco-fern) 0%, var(--eco-moss) 100%);
  box-shadow: 0 4px 14px rgba(45,106,79,0.45);
  transform: translateY(-1px);
}
```

### Secondary 按钮
```css
.btn-secondary {
  background: rgba(248,255,254,0.95);
  border: 1.5px solid var(--eco-border);
  color: var(--eco-pine);
  font-weight: 500;
}
.btn-secondary:hover { background: var(--eco-mist); border-color: var(--eco-moss); color: var(--eco-forest-mid); }
```

---

## 6. 卡片 / 表格容器

```css
.channel-list  /* 或 .card-container */  {
  background: rgba(248,255,254,0.95);
  border-radius: 12px;
  padding: 4px;
  border: 1px solid var(--eco-border-light);
  box-shadow: 0 2px 16px rgba(13,43,26,0.08), 0 1px 4px rgba(64,145,108,0.06);
  flex: 1;
  overflow: hidden;
  position: relative;
  z-index: 1;
}
```

---

## 7. 树形表格行样式（El-Table tree 模式）

### 分类行（category-row）

- 背景：`#e8f5ee`，左侧 `3px solid var(--eco-moss)` 强调条
- 第一列 `.cell` 改为 flex，展开箭头与内容同行

```css
:deep(.category-row > td)            { background-color: #e8f5ee !important; border-top: 1px solid #c0e4ce; border-bottom: 1px solid #c0e4ce; padding: 14px 0; }
:deep(.category-row > td:first-child) { border-left: 3px solid var(--eco-moss) !important; }
:deep(.category-row:hover > td)       { background-color: #d5ecde !important; }
:deep(.category-row > td:first-child .cell) { display: flex; align-items: center; gap: 6px; }
:deep(.el-table__expand-icon)         { color: var(--eco-moss); font-size: 14px; margin-right: 0; flex-shrink: 0; }
```

### 分类名称单元格（.category-name-cell）

结构：`站点图标(SVG) + 站点名称 + 运行/总数徽标`，同一行，`white-space: nowrap`

```html
<div class="category-name-cell">
  <div class="station-marker">
    <!-- 18×18 leaf-in-circle SVG -->
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
.category-name-cell { display: flex; align-items: center; gap: 9px; white-space: nowrap; }
.station-marker     { width: 20px; height: 20px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
.category-label     { font-weight: 700; color: var(--eco-forest); font-size: 14.5px; letter-spacing: 0.25px; }
.count-badge        { display: inline-flex; align-items: baseline; gap: 1.5px; background: rgba(45,106,79,0.08); border: 1px solid rgba(64,145,108,0.30); border-radius: 10px; padding: 2px 9px; line-height: 1; }
.count-running      { font-size: 13px; font-weight: 700; color: var(--eco-moss); }
.count-sep          { font-size: 11px; color: var(--eco-spring); margin: 0 1px; }
.count-total        { font-size: 13px; font-weight: 500; color: var(--eco-pine); }
.count-unit         { font-size: 11px; color: var(--eco-text-muted); margin-left: 3px; }
```

### 分类状态列（.category-status-summary）

文字不换行，状态点 + 文字，同行显示：

```css
.category-status-summary { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--eco-forest-mid); white-space: nowrap; }
```

### 分类操作列（.category-ops）

按钮间用竖线 `|` 分隔：

```html
<div class="category-ops">
  <el-button link type="primary" @click="...">+ 新增数据源</el-button>
  <span class="ops-divider">|</span>
  <el-button link type="primary" @click="...">重命名</el-button>
  <span class="ops-divider">|</span>
  <el-button link type="danger"  @click="...">删除</el-button>
</div>
```

```css
.category-ops  { display: flex; align-items: center; gap: 4px; }
.ops-divider   { color: var(--eco-spring); font-size: 12px; user-select: none; }
```

### 数据源行（datasource-row）

```css
:deep(.datasource-row > td)       { background-color: var(--eco-white) !important; border-bottom: 1px dashed #c8e8d4; }
:deep(.datasource-row:hover > td) { background-color: #f0fbf4 !important; }
:deep(.el-table__placeholder)     { width: 25px; }
```

---

## 8. 状态指示器

**运行中** — 绿色脉冲动画；**已停止** — 半透明春绿；**异常** — 红/橙。

```css
@keyframes eco-pulse {
  0%, 100% { box-shadow: 0 0 0 0   rgba(64,145,108,0.6); }
  50%       { box-shadow: 0 0 0 5px rgba(64,145,108,0);   }
}
.status-dot {
  display: inline-block;
  width: 8px; height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.status-dot.running { background: var(--eco-moss); animation: eco-pulse 2s infinite; }
.status-dot.stopped { background: var(--eco-spring); opacity: 0.55; }
.status-dot.error   { background: #e07a5f; }
```

---

## 9. El-Plus 标签（Tag）覆盖

```css
:deep(.el-tag--success) { background-color: rgba(64,145,108,0.12); color: var(--eco-pine); border-color: rgba(64,145,108,0.28); }
:deep(.el-tag--primary) { background-color: rgba(116,198,157,0.16); color: var(--eco-forest-mid); border-color: rgba(116,198,157,0.35); }
```

---

## 10. El-Plus 链接按钮覆盖

```css
:deep(.el-button.is-link.el-button--primary)        { color: var(--eco-forest-mid); }
:deep(.el-button.is-link.el-button--primary:hover)  { color: var(--eco-forest); }
:deep(.el-button.is-link.el-button--danger)         { color: #b44b38; }
:deep(.el-button.is-link.el-button--danger:hover)   { color: #902f20; }
```

---

## 11. 对话框（Dialog）头部

普通弹窗（`.data-source-dialog`）：

```css
/* <style> 非 scoped */
.data-source-dialog .el-dialog__header {
  background: linear-gradient(135deg, #e8f8ee 0%, #d5eddc 100%);
  border-bottom: 1px solid #9fd6b4;
  padding: 16px 20px;
  border-radius: 8px 8px 0 0;
}
.data-source-dialog .el-dialog__title { color: var(--eco-forest-mid); font-weight: 600; font-size: 15px; }
```

日志弹窗（`.logs-dialog`）— 深色森林背景：

```css
.logs-dialog .el-dialog__header { background: #1a2a1e; border-bottom: 1px solid #2d4a35; padding: 14px 20px; border-radius: 8px 8px 0 0; }
.logs-dialog .el-dialog__title  { color: #95d5b2; font-weight: 600; }
```

日志终端区域：

```css
.logs-container {
  background: #1a2a1e;
  border-radius: 6px;
  padding: 16px;
  font-family: 'Consolas', 'SF Mono', monospace;
  font-size: 12.5px;
  max-height: 400px;
  overflow-y: auto;
}
.log-time    { color: #52b788; margin-right: 8px; }
.log-level   { margin-right: 8px; font-weight: 600; }
.log-level.info  { color: #74c69d; }
.log-level.warn  { color: #e9c46a; }
.log-level.error { color: #e07a5f; }
.log-message { color: #c8e8d4; }
```

---

## 12. 表格头部

```css
:deep(.el-table th.el-table__cell) {
  background-color: #c9edda !important;
  color: var(--eco-forest-mid);
  font-weight: 600;
  font-size: 13px;
}
```

---

## 13. 列宽建议（El-Table 树形表格）

| 列 | 属性 | 推荐值 |
|---|---|---|
| 名称（含树层级） | `min-width` | `260` |
| 类型 | `width` | `120` |
| 状态 | `width` | `130` |
| 最后同步时间 | `width` | `180` |
| 操作 | `width` | `230` |

---

## 14. 禁止事项

- ❌ 禁止使用大地色系（棕色、黄褐色、橙土色）
- ❌ 禁止使用 `#c4a068`、`#d4b483`、`#f0e3c6`、`#faf4e4` 等暖色
- ❌ 禁止使用蓝色主题或默认 Element Plus 蓝色 `#409eff`
- ❌ 禁止直接使用 `<el-icon><Folder /></el-icon>` 作为分类图标，使用 station-marker SVG 替代
- ❌ 禁止在分类行名称/状态列使用 `white-space: normal`（会导致换行）

---

## 15. 新建页面 Checklist

1. 根类声明 17 个 CSS 变量
2. 添加 3 个径向渐变背景
3. 添加 `<div class="eco-backdrop">` 装饰层
4. Header 包含品牌图标 + 统计徽标 + 操作按钮
5. 覆盖 El-Plus 表头、Tag、Button Link 样式
6. 状态指示器使用 `.status-dot` + `eco-pulse` 动画
7. 弹窗使用绿色渐变头部
