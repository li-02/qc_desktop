# Vue 组件清单

本文档以 **TodoList** 形式列出生态监测桌面端应用中所有 Vue 组件。

**项目共有 28 个组件**

---

## 📋 组件 TodoList

### 一、核心应用组件（2个）

- [ ] `App.vue` - 应用根组件，包含全局对话框管理和路由视图
- [ ] `MainLayout.vue` - 主布局组件，包含侧边栏、项目管理、数据集管理和主内容区域

### 二、对话框组件（4个）

- [ ] `components/dialogs/index.vue` - 全局对话框管理器
- [✅ ] `components/dialogs/CreateProjectDialog.vue` - 创建项目对话框
- [✅ ] `components/dialogs/ImportDataDialog.vue` - 导入数据对话框
- [✅ ] `components/dialogs/SettingsDialog.vue` - 系统设置对话框

### 三、侧边栏组件（1个）

- [✅ ] `components/sidebar/DatasetVersionTree.vue` - 数据集版本树组件

### 四、页面视图组件（3个）

- [✅ ] `views/home-page/index.vue` - 首页主视图
- [ ] `views/data-view/index.vue` - 数据视图主页面
- [ ] `views/data-processing-page/index.vue` - 数据预处理页面

### 五、首页子组件（2个）

- [ ] `views/home-page/components/ProjectInfoCard.vue` - 项目信息卡片
- [ ] `views/home-page/components/DatasetInfoCard.vue` - 数据集信息卡片

### 六、数据视图核心组件（9个）

- [ ] `views/data-view/components/DataAnalysisTabs.vue` - 数据分析选项卡容器
- [ ] `views/data-view/components/VersionManager.vue` - 版本管理器
- [ ] `views/data-view/components/VersionNodeItem.vue` - 版本节点项
- [ ] `views/data-view/components/ActionButton.vue` - 操作按钮组件
- [ ] `views/data-view/components/DatasetCard.vue` - 数据集卡片
- [ ] `views/data-view/components/FunctionCard.vue` - 功能卡片
- [ ] `views/data-view/components/QuickOperation.vue` - 快速操作组件
- [ ] `views/data-view/components/charts/CorrelationAnalysisChart.vue` - 相关性分析图表
- [ ] `views/data-view/components/charts/DataVisualizationChart.vue` - 数据可视化图表
- [ ] `views/data-view/components/charts/OutlierChart.vue` - 异常值检测图表

### 七、数据分析面板组件（5个）

- [ ] `views/data-view/components/panels/DataOverviewPanel.vue` - 数据概览面板
- [ ] `views/data-view/components/panels/CorrelationAnalysisPanel.vue` - 相关性分析面板
- [ ] `views/data-view/components/panels/OutlierDetectionPanel.vue` - 异常值检测面板
- [ ] `views/data-view/components/panels/GapFillingPanel.vue` - 缺失值插补面板（Gap Filling）
- [ ] `views/data-view/components/panels/FluxPartitioningPanel.vue` - 通量分割面板（基于 REddyProc，支持碳通量/蒸散分割）

### 八、缺失值分析子组件（1个）

- [ ] `views/data-view/components/gapfilling/MissingAnalysisView.vue` - 缺失值可视化分析视图

---

## 组件分类统计

| 分类         | 数量   | 说明             |
| ------------ | ------ | ---------------- |
| 核心应用     | 2      | 根组件和主布局   |
| 对话框       | 4      | 全局弹窗功能     |
| 侧边栏       | 1      | 版本树导航       |
| 页面视图     | 3      | 主要页面路由     |
| 首页组件     | 2      | 首页信息展示     |
| 数据视图组件 | 9      | 数据分析核心UI   |
| 分析面板     | 5      | 数据处理功能面板 |
| 专项分析     | 1      | 缺失值深度分析   |
| **总计**     | **28** | -                |

---

## 组件层级关系

```
App.vue (根组件)
├── MainLayout.vue (主布局)
│   ├── DatasetVersionTree.vue (侧边栏)
│   └── router-view (路由出口)
│       ├── home-page/index.vue (首页)
│       │   ├── ProjectInfoCard.vue
│       │   └── DatasetInfoCard.vue
│       ├── data-view/index.vue (数据视图)
│       │   ├── DataAnalysisTabs.vue
│       │   │   ├── DataOverviewPanel.vue
│       │   │   │   ├── DataVisualizationChart.vue
│       │   │   │   └── VersionManager.vue
│       │   │   ├── CorrelationAnalysisPanel.vue
│       │   │   │   └── CorrelationAnalysisChart.vue
│       │   │   ├── OutlierDetectionPanel.vue
│       │   │   │   ├── OutlierChart.vue
│       │   │   │   └── VersionManager.vue
│       │   │   ├── GapFillingPanel.vue
│       │   │   │   └── MissingAnalysisView.vue
│       │   │   └── FluxPartitioningPanel.vue (通量分割)
│       │   ├── ActionButton.vue
│       │   ├── DatasetCard.vue
│       │   ├── FunctionCard.vue
│       │   ├── QuickOperation.vue
│       │   └── VersionNodeItem.vue
│       └── data-processing-page/index.vue (数据处理)
└── GlobalDialogs (全局对话框)
    ├── CreateProjectDialog.vue
    ├── ImportDataDialog.vue
    └── SettingsDialog.vue
```

---

## 设计风格说明

所有组件遵循统一的设计系统：

- **主题色**：Emerald Green (#10b981) - 生态环保主题
- **视觉风格**：Glassmorphism（毛玻璃效果）+ 柔和渐变
- **样式方案**：原生 CSS（非 TailwindCSS）
- **交互效果**：平滑过渡、悬停提升、缩放动画

---

## 备注

- 所有组件均使用 Vue 3 Composition API (`<script setup>`)
- UI 框架：Element Plus
- 图表库：ECharts
- 状态管理：Pinia stores
