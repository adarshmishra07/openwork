# AGENTS.md - BrandWork (OpenWork Fork)

This file provides guidance to AI coding agents working in this repository.

## Project Overview

**BrandWork** is an AI work companion for e-commerce brands, forked from [OpenWork](https://github.com/accomplish-ai/openwork). It's a desktop app that learns brand voice/style and performs real commerce tasks (product descriptions, Shopify updates, competitor research).

### Tech Stack
- **Frontend**: React 19 + TypeScript + Vite + Zustand + Tailwind CSS + shadcn/ui
- **Desktop Shell**: Electron (via Tauri patterns)
- **Agent Runtime**: OpenCode CLI (spawned via `node-pty`)
- **Database**: SQLite (brand memory) + electron-store (settings)
- **Secure Storage**: OS keychain via `keytar`
- **External APIs**: Shopify Admin API, AI providers (Anthropic, OpenAI, Google, xAI)
- **Package Manager**: pnpm 9+ (monorepo with workspaces)

---

## Build/Lint/Test Commands

### Quick Reference

```bash
# Development
pnpm install                          # Install all dependencies
pnpm dev                              # Run desktop app in dev mode
pnpm dev:clean                        # Dev mode with clean state (CLEAN_START=1)

# Building
pnpm build                            # Build all workspaces
pnpm build:desktop                    # Build desktop app only
pnpm -F @accomplish/desktop package   # Package for distribution

# Code Quality
pnpm lint                             # TypeScript checks
pnpm typecheck                        # Type validation only

# Testing
pnpm -F @accomplish/desktop test              # Run all tests (Vitest)
pnpm -F @accomplish/desktop test:unit         # Unit tests only
pnpm -F @accomplish/desktop test:integration  # Integration tests only
pnpm -F @accomplish/desktop test:watch        # Watch mode
pnpm -F @accomplish/desktop test:coverage     # With coverage report

# E2E Testing (Playwright)
pnpm -F @accomplish/desktop test:e2e          # Run E2E tests in Docker
pnpm -F @accomplish/desktop test:e2e:native   # Run E2E tests natively
pnpm -F @accomplish/desktop test:e2e:native:ui    # E2E with Playwright UI
pnpm -F @accomplish/desktop test:e2e:native:debug # E2E in debug mode

# Cleanup
pnpm clean                            # Remove dist, node_modules
```

### Running a Single Test

```bash
# Unit/Integration test by file
pnpm -F @accomplish/desktop test src/path/to/file.test.ts

# Unit/Integration test by name pattern
pnpm -F @accomplish/desktop test -t "test name pattern"

# E2E test by file (native)
pnpm -F @accomplish/desktop test:e2e:native e2e/tests/specific.spec.ts

# E2E test by name pattern
pnpm -F @accomplish/desktop test:e2e:native -g "test name"
```

---

## Monorepo Structure

```
apps/
  desktop/              # Electron app (main entry)
    src/
      main/             # Electron main process
        index.ts        # Bootstrap, single-instance, protocol handler
        ipc/handlers.ts # IPC handlers for tasks, settings, API keys
        opencode/       # OpenCode CLI adapter (node-pty wrapper)
        spaces/         # Space runtime integration
          space-registry.ts      # Local space definitions
          space-selector.ts      # Prompt-to-space matching
          space-runtime-client.ts # Lambda API client
        store/          # Persistence (keytar, electron-store)
      preload/          # contextBridge IPC exposure
        index.ts        # window.accomplish API
      renderer/         # React frontend
        main.tsx        # React entry with HashRouter
        App.tsx         # Main routing + onboarding
        pages/          # Page components
        components/     # UI components (shadcn-based)
        stores/         # Zustand stores
        lib/            # Utilities and typed IPC wrapper
    e2e/                # Playwright E2E tests
    skills/             # MCP server skills (dev-browser, file-permission)
packages/
  shared/               # Shared TypeScript types
    src/types/          # Shared interfaces and types
services/
  space-runtime/        # Python Lambda service for AI spaces
    spaces/             # Space workflow implementations
    shared_libs/        # Shared utilities (Gemini, OpenAI, S3)
    handler.py          # FastAPI Lambda handler
    serverless.yml      # AWS deployment config
docs/                   # Documentation and PRD
  SPACES.md             # Spaces system documentation
```

---

## Code Style Guidelines

### TypeScript

- **Strict mode enabled** - No `any` types without explicit justification
- **Target**: ES2022, Module: ESNext
- **Path aliases**: Use `@/*` for renderer, `@main/*` for main, `@shared/*` for shared
- **No JavaScript** for application logic (TypeScript only)

### Imports

```typescript
// Order: external packages -> internal aliases -> relative imports
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { taskStore } from '@/stores/taskStore';
import { formatDate } from './utils';

// Use path aliases, not deep relative paths
import { TaskType } from '@shared/types';  // GOOD
import { TaskType } from '../../../packages/shared/src/types';  // BAD
```

### Naming Conventions

```typescript
// Components: PascalCase
export function BrandOnboarding() { ... }
export const PermissionModal: React.FC<Props> = () => { ... }

// Files: kebab-case for components, camelCase for utilities
// components/brand-onboarding.tsx
// lib/formatDate.ts
// stores/taskStore.ts

// Types/Interfaces: PascalCase with descriptive names
interface BrandVoiceConfig { ... }
type PermissionLevel = 'low' | 'medium' | 'high' | 'critical';

// Constants: SCREAMING_SNAKE_CASE
const MAX_RETRY_ATTEMPTS = 3;
const API_BASE_URL = 'https://api.shopify.com';

// Zustand stores: camelCase with 'Store' suffix
export const useTaskStore = create<TaskStore>((set) => ({ ... }));
```

### React Components

```typescript
// Prefer function declarations for components
export function ComponentName({ prop1, prop2 }: Props) {
  // Hooks at top
  const [state, setState] = useState(initialValue);
  const store = useTaskStore();
  
  // Early returns for loading/error states
  if (loading) return <Skeleton />;
  if (error) return <ErrorDisplay error={error} />;
  
  // Main render
  return ( ... );
}

// Props interface above component
interface Props {
  prop1: string;
  prop2?: number;
  onAction: (id: string) => void;
}
```

### Error Handling

```typescript
// Use try-catch with specific error types
try {
  await shopifyApi.updateProduct(productId, changes);
} catch (error) {
  if (error instanceof ShopifyRateLimitError) {
    await delay(error.retryAfter);
    return retry();
  }
  logger.error('Failed to update product', { productId, error });
  throw new ProductUpdateError(productId, error);
}

// IPC handlers must always return { success, data?, error? }
ipcMain.handle('task:start', async (_, taskData) => {
  try {
    const result = await startTask(taskData);
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
```

### State Management (Zustand)

```typescript
// Define store with typed actions
interface TaskStore {
  tasks: Task[];
  currentTask: Task | null;
  addTask: (task: Task) => void;
  setCurrentTask: (task: Task | null) => void;
}

export const useTaskStore = create<TaskStore>((set) => ({
  tasks: [],
  currentTask: null,
  addTask: (task) => set((state) => ({ 
    tasks: [...state.tasks, task] 
  })),
  setCurrentTask: (task) => set({ currentTask: task }),
}));
```

---

## IPC Communication Pattern

```
Renderer (React)
    | window.accomplish.* calls
Preload (contextBridge)
    | ipcRenderer.invoke
Main Process
    | Native APIs (keytar, node-pty, electron-store, Shopify)
    ^ IPC events (task:update, permission:request)
Preload
    ^ ipcRenderer.on callbacks
Renderer
```

When adding new IPC methods:
1. Add handler in `src/main/ipc/handlers.ts`
2. Expose in `src/preload/index.ts`
3. Add typed wrapper in `src/renderer/lib/accomplish.ts`

---

## Image Assets (CRITICAL)

**Always use ES module imports for images in renderer:**

```typescript
// CORRECT - Works in dev and packaged app
import logoImage from '/assets/logo.png';
<img src={logoImage} alt="Logo" />

// WRONG - Breaks in packaged Electron app
<img src="/assets/logo.png" alt="Logo" />
```

Static assets go in `apps/desktop/public/assets/`.

---

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `CLEAN_START=1` | Clear all stored data on app start |
| `E2E_SKIP_AUTH=1` | Skip onboarding flow (for testing) |
| `SHOPIFY_API_KEY` | Shopify app API key |
| `SHOPIFY_API_SECRET` | Shopify app secret |

---

## BrandWork-Specific Patterns

### Brand Memory (SQLite)
- Store brand voice, style rules, learned patterns
- Inject brand context into every agent prompt
- Location: User's app data directory

### Permission System
- Risk levels: `low` (auto-approve), `medium` (ask once), `high` (always ask), `critical` (always ask + confirm)
- Bridge OpenCode permissions to UI via `permission:request` / `permission:respond` IPC

### Shopify Integration
- OAuth flow handled in main process
- API wrapper in `src/main/shopify/`
- Always respect rate limits (exponential backoff)

### Spaces (MCP Tools)
Spaces are pre-built workflows exposed as MCP tools:
- **Product Photography**: AI image generation with brand style
- **Competitor Research**: Web browsing via `dev-browser` skill
- **Catalog Generator**: Bulk product copy with brand voice
- **Shopify CRUD**: Read/write products, inventory, orders

---

## Commit Message Format

```
type: short description

Types: feat, fix, docs, refactor, test, chore, style
Examples:
  feat: add brand voice onboarding wizard
  fix: resolve Shopify OAuth token refresh
  refactor: extract permission logic to separate module
```

---

## Prerequisites

- Node.js 20+
- pnpm 9+
- macOS (Apple Silicon) for full functionality
- Rust toolchain (if modifying Tauri components)
