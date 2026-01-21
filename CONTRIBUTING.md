# Contributing to BrandWork

Thank you for your interest in contributing! This guide will help you get started.

## Development Setup

### Prerequisites

- Node.js 20+
- pnpm 9+
- macOS (Apple Silicon recommended)

### Getting Started

```bash
# Clone the repo
git clone https://github.com/accomplish-ai/openwork.git
cd openwork

# Install dependencies
pnpm install

# Start development
pnpm dev
```

### Environment Setup

Create `apps/desktop/.env`:

```bash
# Development flags
CLEAN_START=1              # Reset app state on each run
E2E_SKIP_AUTH=1           # Skip onboarding (for testing)

# Space Runtime (optional - for image workflows)
SPACE_RUNTIME_URL=http://localhost:8765
GEMINI_API_KEY=your-key
```

---

## Project Structure

```
apps/desktop/
├── src/
│   ├── main/                 # Electron main process
│   │   ├── ipc/handlers.ts   # All IPC handlers
│   │   ├── opencode/         # AI agent (OpenCode CLI wrapper)
│   │   │   ├── adapter.ts    # Spawns CLI, parses output
│   │   │   ├── config-generator.ts  # Generates opencode.json
│   │   │   └── task-manager.ts      # Task queue management
│   │   ├── shopify/          # Shopify API client
│   │   ├── spaces/           # Space workflow orchestration
│   │   └── store/            # Persistence (keychain, electron-store)
│   ├── preload/              # Electron preload (contextBridge)
│   └── renderer/             # React frontend
│       ├── components/       # UI components
│       ├── pages/            # Page components
│       ├── stores/           # Zustand state stores
│       └── lib/              # Utilities
├── skills/                   # MCP tool servers
│   ├── shopify/              # Shopify integration
│   ├── space-runtime/        # AI image workflows
│   ├── dev-browser/          # Web browsing
│   └── ...
└── e2e/                      # Playwright E2E tests
```

---

## Adding a New Feature

### 1. IPC Handlers (Main Process)

Add handlers in `apps/desktop/src/main/ipc/handlers.ts`:

```typescript
handle('my-feature:action', async (_event, params: MyParams) => {
  // Implementation
  return { success: true, data: result };
});
```

### 2. Preload Exposure

Expose to renderer in `apps/desktop/src/preload/index.ts`:

```typescript
myFeatureAction: (params: MyParams): Promise<MyResult> =>
  ipcRenderer.invoke('my-feature:action', params),
```

### 3. Renderer API

Add types in `apps/desktop/src/renderer/lib/accomplish.ts`:

```typescript
interface AccomplishAPI {
  // ...existing
  myFeatureAction(params: MyParams): Promise<MyResult>;
}
```

### 4. UI Component

Use in React components:

```typescript
const accomplish = getAccomplish();
const result = await accomplish.myFeatureAction({ ... });
```

---

## Adding MCP Skills (Tools for AI Agent)

MCP skills expose tools that the AI agent can use. Each skill is a standalone Node.js server.

### Skill Template

Create `apps/desktop/skills/my-skill/package.json`:

```json
{
  "name": "@brandwork/skill-my-skill",
  "version": "1.0.0",
  "type": "module",
  "main": "src/index.ts",
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0"
  }
}
```

Create `apps/desktop/skills/my-skill/src/index.ts`:

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

const server = new Server(
  { name: 'my-skill', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

// Define available tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'my_tool',
      description: 'Does something useful',
      inputSchema: {
        type: 'object',
        properties: {
          input: { type: 'string', description: 'Input value' },
        },
        required: ['input'],
      },
    },
  ],
}));

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  if (name === 'my_tool') {
    const result = await myImplementation(args.input);
    return {
      content: [{ type: 'text', text: JSON.stringify(result) }],
    };
  }
  
  return { content: [{ type: 'text', text: 'Unknown tool' }], isError: true };
});

// Start server
const transport = new StdioServerTransport();
await server.connect(transport);
```

### Register the Skill

Add to `apps/desktop/src/main/opencode/config-generator.ts`:

```typescript
// In the generateOpenCodeConfig function, add to the mcp section:
config.mcp['my-skill'] = {
  type: 'local',
  command: ['npx', 'tsx', path.join(skillsPath, 'my-skill', 'src', 'index.ts')],
  enabled: true,
  environment: {
    MY_API_KEY: process.env.MY_API_KEY || '',
  },
  timeout: 15000,
};
```

### Document in System Prompt (Optional)

If you want the AI to know about your skill's capabilities, add documentation to the system prompt in `config-generator.ts`.

---

## Adding Spaces (AI Image Workflows)

Spaces are Python workflows running on AWS Lambda. See [docs/SPACES.md](docs/SPACES.md) for detailed instructions.

Quick overview:

1. Create workflow in `services/space-runtime/spaces/my_space.py`
2. Add to `services/space-runtime/spaces/registry.json`
3. Register in `services/space-runtime/handler.py`
4. Deploy: `npx serverless deploy --stage dev`

---

## Testing

### Unit Tests

```bash
pnpm -F @brandwork/desktop test:unit
pnpm -F @brandwork/desktop test:unit src/path/to/file.test.ts
```

### E2E Tests

```bash
pnpm -F @brandwork/desktop test:e2e:native
pnpm -F @brandwork/desktop test:e2e:native:ui  # With Playwright UI
```

---

## Code Style

### TypeScript

- Strict mode enabled
- No `any` without justification
- Use path aliases: `@/`, `@main/`, `@shared/`

### Naming Conventions

- Components: `PascalCase`
- Files: `kebab-case.tsx` for components, `camelCase.ts` for utilities
- Constants: `SCREAMING_SNAKE_CASE`

### Imports Order

```typescript
// 1. External packages
import { useState } from 'react';

// 2. Internal aliases
import { Button } from '@/components/ui/button';
import { TaskType } from '@shared/types';

// 3. Relative imports
import { formatDate } from './utils';
```

---

## Commit Messages

```
type: short description

Types:
- feat: New feature
- fix: Bug fix
- docs: Documentation
- refactor: Code refactoring
- test: Tests
- chore: Maintenance

Examples:
- feat: add Shopify inventory management
- fix: resolve OAuth token refresh issue
- docs: update README with env variables
```

---

## Pull Request Process

1. Fork and create a feature branch
2. Make your changes
3. Run tests: `pnpm test`
4. Run typecheck: `pnpm typecheck`
5. Commit with descriptive message
6. Open PR with description of changes

---

## Reporting Issues

When reporting issues, please include:
- OS and version
- Steps to reproduce
- Expected vs actual behavior
- Any error messages or logs

---

## Security

If you discover a security vulnerability, please see [SECURITY.md](SECURITY.md) for responsible disclosure guidelines.

---

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
