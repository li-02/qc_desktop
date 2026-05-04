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

默认不进行详细测试。只有当用户明确指出需要测试、运行测试、补充测试用例，或任务本身直接要求测试时，才执行测试相关工作。

未被明确要求时：
- 不主动运行 `pnpm test`、`pnpm test:frontend`、`pnpm test:electron`、`pnpm test:python`、`pnpm test:e2e` 等测试命令。
- 不因修改或新增模块而默认编写新的测试文件。
- 可以做轻量级静态检查、阅读代码、人工核对或说明未运行测试，但不要把它升级为详细测试流程。

被明确要求测试时，按变更范围选择最小必要测试集；只有在用户要求完整验证或改动风险较高时，才运行完整测试套件。

### Test Commands Reference

| 命令 | 说明 | 环境 |
|------|------|------|
| `pnpm test` | 运行所有测试 | CI/Local |
| `pnpm test:frontend` | 前端单元测试 | Node |
| `pnpm test:electron` | 主进程单元测试 | Node |
| `pnpm test:python` | Python 测试 | Python |
| `pnpm test:e2e` | 端到端测试 | Electron |
| `pnpm test:frontend:watch` | 前端测试监听模式 | 开发 |

### Continuous Integration

CI 仍可按项目配置运行测试；本地代理执行任务时遵循上面的默认测试策略。

## Commit & Pull Request Guidelines

Recent history uses Conventional Commit-style subjects such as `feat(workflow): ...` and `fix(outlier): ...`; keep using `<type>(<scope>): <summary>` with concise imperative summaries. PRs should describe the user-facing change, list verification commands run, link related issues, and include screenshots or short clips for UI changes.

## Security & Configuration Tips

Keep Electron `contextIsolation` enabled and expose renderer capabilities through `preload.ts` instead of direct Node access. Do not commit local datasets, generated projects, secrets, or machine-specific paths.
