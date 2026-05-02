# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Electron desktop application for environmental data quality control (QC). Built with Electron + Vue 3 + TypeScript, with Python for ML/DL imputation and R for REddyProc flux processing. The app manages datasets organized by categories (project sites), supports outlier detection, missing value imputation, flux partitioning, and workflow automation.

## Build & Run

```bash
# Install all dependencies
pnpm install

# Development (frontend + electron concurrently)
pnpm run dev

# Full production build (frontend type-check + vite build → electron tsc → copy artifacts)
pnpm run build

# Electron only (after frontend is already built)
pnpm run build:electron && pnpm run copy-dist:electron

# Frontend linting & formatting
cd frontend && pnpm run lint && pnpm run format

# Python environment
cd python
pip install -r requirements.txt
```

## Architecture

### Process model (standard Electron)

- **Main process** (`electron/`): Node.js, file system, database (SQLite via better-sqlite3), IPC handlers, Python/R subprocess management
- **Renderer process** (`frontend/src/`): Vue 3 SPA with Vite, communicates with main via `window.electronAPI.invoke(channel, args)`
- **Preload** (`electron/preload.ts`): Exposes a single `invoke` bridge + `on`/`removeListener` for main→renderer events

### Backend layers (main process)

```
Controller (IPC handlers, request/response formatting)
  → Service (business logic)
    → Repository (SQLite data access via DatabaseManager singleton)
```

**Key classes:**
- `ControllerRegistry` (`electron/core/ControllerRegistry.ts`): Manual DI container — instantiates all Repository → Service → Controller chains, then registers IPC routes. This is effectively the wiring/bootstrapping of the backend.
- `IPCManager` (`electron/core/IPCManager.ts`): Static route registry. All IPC uses a single `"ipc-invoke"` channel; routing is by the `channel` string argument.
- `DatabaseManager` (`electron/core/DatabaseManager.ts`): Singleton wrapping better-sqlite3. Creates and migrates all tables on init. Tables use soft-delete (`is_del` flag).
- `BaseController` (`electron/controller/BaseController.ts`): Provides `this.success(data)` / `this.error(message)` / `this.handleAsync(fn)` helpers.
- `PythonBridgeService` (`electron/service/PythonBridgeService.ts`): Singleton that spawns Python scripts from `python/methods/`. Detects venv at `python/.venv/`. Used for ML/DL imputation (SAITS, iTransformer, TimeMixer, XGBoost, RandomForest, KNN) and REddyProc-based pipelines.

### Frontend structure

- **Layout**: `MainLayout.vue` wraps all routes
- **Router** (`frontend/src/router/index.ts`): Hash-based routing — Home, DataView, DataProcessing, DataSource, Workflow, BeonQC
- **State**: Pinia stores (`useCategoryStore`, `useDatasetStore`, `useGapFillingStore`, `useDataViewStore`, `useOutlierDetectionStore`, `useWorkflowStore`, `useSettingsStore`)
- **UI library**: Element Plus (primary), with some TailwindCSS

### Frontend UI standard

Before changing any file under `frontend/**`, read and follow `.github/instructions/eco-ui-style.instructions.md`. That file is the single source of truth for cross-agent UI design rules; do not duplicate its contents into this file.

### Shared types

`shared/types/` — TypeScript interfaces shared between electron and frontend. The `shared/types/index.ts` barrel re-exports all types. Path alias `@shared/*` maps to this directory in electron's tsconfig.

### IPC route naming

Two conventions coexist:
- **Old**: `"categories/get-all"`, `"datasets/import"`, `"outlier/execute-detection"`, etc. (dot-separated)
- **New**: `"imputation:getMethods"`, `"workflow:execute"`, `"fluxPartitioning:execute"` (colon-separated)

The `shared/constants/apiRoutes.ts` file defines route constants used by the frontend.

### Database

SQLite at `{projectsDir}/qc_metadata.db`. Key tables:
- `sys_category` / `sys_dataset` / `biz_dataset_version` — core data hierarchy
- `conf_column_setting` — per-column thresholds and metadata
- `conf_outlier_detection` / `biz_outlier_result` / `biz_outlier_detail` — outlier detection
- `conf_imputation_method` / `conf_imputation_method_params` / `biz_imputation_result` / `biz_imputation_model` — imputation
- `biz_flux_partitioning_result` — flux partitioning
- `biz_workflow` / `biz_workflow_node` / `biz_workflow_execution` — workflow automation
- `conf_db_connection_profile` / `conf_beon_site_rule` — external data source config

### Data versioning

Each dataset has versions (`biz_dataset_version`) with a `stage_type` (RAW → FILTERED → QC). Operations produce new versions linked via `parent_version_id`, forming a version tree.

## Key rules from .cursorrules

- **All user-facing text must be in Chinese** (UI labels, error messages, data version names, etc.). Code identifiers may be in English.
- **Prefer native CSS over TailwindCSS** for component styles. Follow the single frontend UI standard at `.github/instructions/eco-ui-style.instructions.md`.
- **KISS principle** — avoid over-engineering and premature abstractions.
- **Respect user column selection** — do not silently expand to all columns.
- **Follow the "Think → Plan → Code" workflow** for non-trivial changes.

## Git workflow

Branch `develop` is the active development branch; `main` is the release branch. Recent commits follow Chinese-language commit messages.
