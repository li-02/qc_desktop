# Repository Guidelines

## Project Structure & Module Organization

This is a desktop data-quality app built with Electron, Vue 3, TypeScript, Python, and bundled R support. Main-process code lives in `electron/`, organized by `controller/`, `service/`, `repository/`, `core/`, and `workers/`. Renderer code lives in `frontend/src/`, with views under `views/`, UI under `components/`, Pinia stores under `stores/`, and renderer types/utilities under `types/` and `utils/`. Python processing scripts and models are in `python/`; shared TypeScript constants and types are in `shared/`. Runtime assets and packaged output use `public/`, `data/`, `projects/`, `R-Portable/`, and `dist/`; avoid editing generated output unless packaging requires it.

## Build, Test, and Development Commands

- `pnpm install`: install Electron dependencies and native app setup.
- `pnpm run dev`: start Vite and Electron together for local development.
- `pnpm run build`: verify the environment, build frontend, compile Electron, and copy distributables.
- `pnpm run build:frontend`: run `vue-tsc` and Vite build in `frontend/`.
- `pnpm run build:electron`: compile `electron/tsconfig.json`.
- `pnpm --dir frontend run lint`: run ESLint with automatic fixes.
- `pnpm run format`: run Prettier over `electron/` and `frontend/`.
- `cd python; uv sync` or `pip install -r requirements.txt`: prepare Python dependencies.

## Coding Style & Naming Conventions

Use TypeScript for Electron and Vue integration code. Follow Prettier: 2-space indentation, semicolons, double quotes, trailing commas where valid, `printWidth: 120`, and `arrowParens: "avoid"`. Vue components use PascalCase filenames, `index.vue` for routed views, and `use*Store.ts` for Pinia stores. Electron classes follow domain suffixes such as `DatasetController`, `DatasetService`, and `DatasetDBRepository`. Python methods use snake_case filenames.

## Testing Guidelines

### Test Architecture Overview

This project uses a four-layer automated test architecture. Unit tests validate isolated frontend utilities, Pinia stores, Electron services, and pure functions. Integration tests validate boundaries between layers, especially IPC handlers, Python bridge calls, and repository/database behavior. E2E tests launch the Electron application and verify user workflows from the renderer through the main process. Python tests cover data processing functions and model helper algorithms under `python/`.

### Unit Tests

#### Frontend Unit Tests
- 工具：Vitest + @vue/test-utils + happy-dom
- 范围：Pinia stores、工具函数、composables
- 文件命名：`*.spec.ts`，放在被测试文件同级目录
- 运行命令：`pnpm test:frontend`

#### Main Process Unit Tests
- 工具：ts-jest
- 范围：Service 层、工具函数
- 文件命名：`*.spec.ts`
- 运行命令：`pnpm test:electron`
- Mock 策略：Mock Repository 层、文件系统和外部进程调用

### Integration Tests
- IPC 通信测试：验证 controller handler 的正确性
- Python 桥接测试：验证 Python 脚本调用和结果解析
- 数据库测试：使用 SQLite 内存模式进行 Repository 测试

### E2E Tests
- 工具：Playwright + Electron 插件
- 覆盖流程：应用启动、数据导入、异常检测、结果导出
- 运行命令：`pnpm test:e2e`
- 配置：超时 30s，失败时保存截图

### Python Tests
- 工具：pytest + pytest-cov
- 范围：数据处理函数、模型算法
- 运行命令：`pnpm test:python`

### Test Commands Reference

| 命令 | 说明 | 环境 |
|------|------|------|
| `pnpm test` | 运行所有测试 | CI/Local |
| `pnpm test:frontend` | 前端单元测试 | Node |
| `pnpm test:electron` | 主进程单元测试 | Node |
| `pnpm test:python` | Python 测试 | Python |
| `pnpm test:e2e` | 端到端测试 | Electron |
| `pnpm test:frontend:watch` | 前端测试监听模式 | 开发 |

### Coverage Targets

| 层级 | 目标覆盖率 | 优先级 |
|------|-----------|--------|
| 工具函数 (utils) | 90%+ | P0 |
| Pinia Stores | 85%+ | P0 |
| Service 层 | 80%+ | P1 |
| Controller 层 | 70%+ | P1 |
| Vue 组件 | 60%+ | P2 |
| Python 脚本 | 80%+ | P1 |

### Continuous Integration
- 使用 GitHub Actions
- 触发条件：push 到 main、PR 到 main
- 并行运行前端、主进程、Python 三套测试
- 失败时上传覆盖率报告

### Writing New Tests
- 在修改或新增模块时，必须同时编写对应的测试文件
- 测试文件遵循 `*.spec.ts` 命名，放在被测试文件同级目录
- 使用中文编写测试描述（`describe`/`it` 的字符串参数）
- Mock 所有外部依赖，确保测试独立可重复

## Commit & Pull Request Guidelines

Recent history uses Conventional Commit-style subjects such as `feat(workflow): ...` and `fix(outlier): ...`; keep using `<type>(<scope>): <summary>` with concise imperative summaries. PRs should describe the user-facing change, list verification commands run, link related issues, and include screenshots or short clips for UI changes.

## Security & Configuration Tips

Keep Electron `contextIsolation` enabled and expose renderer capabilities through `preload.ts` instead of direct Node access. Do not commit local datasets, generated projects, secrets, or machine-specific paths.
