# QC Studio

基于 Electron + Vue 3 + TypeScript 构建的智能数据质量控制桌面应用，集成 Python 科学计算与 R 语言生态，提供从数据导入、质量分析、缺失值插补到可视化报告的全流程解决方案。

## 功能特性

- **数据管理** — 项目化组织数据，支持 CSV / Excel / MySQL 多源导入，数据集版本管理
- **数据质量分析** — 缺失值检测、异常值识别、数据完整性评估、通量数据分割
- **缺失值插补**
  - 传统方法：线性插值、样条插值、均值 / 中位数填充
  - 高级方法：ARIMA 时间序列插补（基于 Python statsmodels）
  - 自定义模型支持
- **异常值检测** — 基于统计规则与算法的异常值识别与标记
- **数据可视化** — 时间序列图、相关性分析、统计分布图、通量分割图
- **工作流引擎** — 可视化拖拽编排数据处理流程，保存与复用模板
- **批处理与导出** — 支持大数据集批量处理，结果导出为 CSV / Excel

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面框架 | Electron 35 |
| 前端 | Vue 3 + TypeScript + Element Plus + Pinia + Vue Router + ECharts |
| 主进程 | Node.js + TypeScript + better-sqlite3 + mysql2 |
| 科学计算 | Python 3.12 + pandas + numpy + statsmodels + scipy |
| 统计建模 | R（便携版） |
| 构建工具 | Vite + electron-builder + TypeScript |
| 包管理 | pnpm |
| 测试 | Vitest + Jest + Playwright + pytest |

## 快速开始

### 前置条件

- Node.js >= 18
- pnpm
- Python 3.12（可选，用于 ARIMA 插补）
- Git

### 安装

```bash
# 克隆仓库
git clone https://github.com/li-02/qc_desktop.git
cd qc_desktop

# 安装 Node 依赖
pnpm install

# 安装前端依赖
cd frontend && pnpm install && cd ..

# 安装 Python 依赖（可选）
cd python
pip install -r requirements.txt
cd ..
```

### 开发

```bash
# 启动开发模式（前端热更新 + Electron）
pnpm dev
```

前端开发服务器运行在 `http://localhost:5173`，Electron 窗口会在 Vite 就绪后自动启动。

### 构建

```bash
# 构建生产版本
pnpm build
```

构建产物输出至 `release/` 目录，支持 Windows（NSIS 安装包）、macOS、Linux（AppImage）。

## 项目结构

```
qc-studio/
├── electron/                # Electron 主进程
│   ├── main.ts              # 应用入口，窗口管理
│   ├── preload.ts           # contextBridge 预加载脚本
│   ├── core/                # IPC 通信与业务控制器
│   └── jest.config.js       # 主进程测试配置
├── frontend/                # Vue 3 前端
│   ├── src/
│   │   ├── views/           # 页面视图
│   │   │   ├── home-page/   # 首页与项目概览
│   │   │   ├── data-view/   # 数据浏览与质量控制
│   │   │   ├── workflow/    # 工作流编辑器
│   │   │   └── ...          # 其他页面
│   │   ├── components/      # 通用组件
│   │   ├── stores/          # Pinia 状态管理
│   │   ├── router/          # 路由配置
│   │   └── utils/           # 工具函数
│   └── package.json
├── python/                  # Python 科学计算后端
│   ├── main.py              # Python 入口，处理来自 Electron 的请求
│   ├── requirements.txt     # Python 依赖
│   └── pyproject.toml
├── scripts/                 # 构建辅助脚本
├── e2e/                     # Playwright 端到端测试
└── electron-builder.json    # 打包配置
```

## 通信架构

```
渲染进程 (Vue 3)
    ↕ contextBridge (preload.ts)
主进程 (Electron / Node.js)
    ↕ child_process
Python 计算引擎 / R 脚本
```

渲染进程通过安全的 `contextBridge` 与主进程通信，主进程通过子进程调用 Python 进行科学计算。

## 测试

```bash
# 运行所有测试
pnpm test

# 仅前端测试
pnpm test:frontend

# 仅 Electron 主进程测试
pnpm test:electron

# 仅 Python 测试
pnpm test:python

# 端到端测试
pnpm test:e2e
```

## 许可证

[MIT](LICENSE)

