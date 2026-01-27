# OpenCode Streaming Migration Plan

## Overview

Migrate from PTY-based communication with OpenCode CLI to HTTP Server mode with SSE (Server-Sent Events) for **real-time text streaming**.

### Current Problem
- OpenCode CLI (`opencode run --format json`) outputs **complete text blocks** only
- Frontend fakes streaming with character-by-character animation (`StreamingText` component)
- This causes UX issues: "Completed" state appears before text finishes "typing"

### Solution
- Use `opencode serve` mode which provides SSE `/event` endpoint
- Real-time `message.part.updated` events stream text as it's generated
- Frontend renders text immediately as it arrives (no animation needed)

---

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Port Management** | Dynamic (portfinder) | Avoid conflicts with other services |
| **Server Lifecycle** | Always running | Fast first task, warm MCP servers |
| **Working Directory** | Temp dir | Safe, consistent with current behavior |
| **Fallback** | Silent to PTY | User gets working app either way |
| **Claude SDK** | Remove | Unused, serve mode replaces it |
| **SSE Client** | `eventsource` npm | Robust, handles reconnection |

---

## Phase 0: Cleanup & Dependencies

### Delete Unused Claude SDK

```
apps/desktop/src/main/claude-sdk/
├── adapter.ts      (DELETE)
├── types.ts        (DELETE)
└── index.ts        (DELETE if exists)
```

### Add Dependencies

```bash
pnpm -F @shopos/desktop add eventsource portfinder
pnpm -F @shopos/desktop add -D @types/eventsource
```

---

## Phase 1: Create OpenCodeServerAdapter

**New file:** `apps/desktop/src/main/opencode/server-adapter.ts`

### Class Design

```typescript
import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import EventSource from 'eventsource';
import portfinder from 'portfinder';
import { app } from 'electron';

interface ServerAdapterEvents {
  'text-delta': [{ sessionId: string; text: string }];
  'message-complete': [{ sessionId: string; text: string }];
  'tool-use': [{ sessionId: string; tool: string; input: unknown; status: string }];
  'tool-result': [{ sessionId: string; toolCallId: string; output: string; isError: boolean }];
  'session-status': [{ sessionId: string; status: string; message?: string }];
  'complete': [{ sessionId: string; result: TaskResult }];
  'error': [{ sessionId: string; error: string }];
  'server-error': [Error];
}

export class OpenCodeServerAdapter extends EventEmitter<ServerAdapterEvents> {
  private serverProcess: ChildProcess | null = null;
  private eventSource: EventSource | null = null;
  private serverPort: number | null = null;
  private serverUrl: string | null = null;
  private isStarting: boolean = false;
  private sessions: Map<string, { taskId: string; textBuffer: string }> = new Map();

  // Lifecycle
  async start(): Promise<void>;
  async stop(): Promise<void>;
  isRunning(): boolean;

  // Session management
  async createSession(taskId: string, config: TaskConfig): Promise<string>;
  async sendMessage(sessionId: string, text: string, attachments?: Attachment[]): Promise<void>;
  async continueSession(sessionId: string, text: string): Promise<void>;
  async interruptSession(sessionId: string): Promise<void>;

  // Internal
  private connectEventSource(): void;
  private handleEvent(event: SSEEvent): void;
  private buildEnvironment(): Promise<NodeJS.ProcessEnv>;
  private waitForServerReady(): Promise<void>;
}
```

### Key Implementation Details

#### Server Startup
```typescript
async start(): Promise<void> {
  if (this.serverProcess || this.isStarting) return;
  this.isStarting = true;
  
  try {
    // Find available port starting from 14100
    this.serverPort = await portfinder.getPortPromise({ port: 14100 });
    this.serverUrl = `http://127.0.0.1:${this.serverPort}`;
    
    // Build environment (copy API keys, paths, etc.)
    const env = await this.buildEnvironment();
    
    // Spawn opencode serve
    const { command, args } = getOpenCodeCliPath();
    this.serverProcess = spawn(
      command, 
      [...args, 'serve', '--port', String(this.serverPort)], 
      {
        env,
        cwd: app.getPath('temp'),
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );
    
    // Handle process errors
    this.serverProcess.on('error', (error) => {
      console.error('[ServerAdapter] Process error:', error);
      this.emit('server-error', error);
    });
    
    this.serverProcess.on('exit', (code) => {
      console.log('[ServerAdapter] Process exited with code:', code);
      this.serverProcess = null;
    });
    
    // Wait for server to be ready (poll /config endpoint)
    await this.waitForServerReady();
    
    // Connect to SSE endpoint
    this.connectEventSource();
    
    console.log(`[ServerAdapter] Started on port ${this.serverPort}`);
  } catch (error) {
    this.serverProcess?.kill();
    this.serverProcess = null;
    throw error;
  } finally {
    this.isStarting = false;
  }
}
```

#### SSE Event Handling
```typescript
private connectEventSource(): void {
  this.eventSource = new EventSource(`${this.serverUrl}/event`);
  
  this.eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      this.handleEvent(data);
    } catch (error) {
      console.error('[ServerAdapter] Failed to parse SSE event:', error);
    }
  };
  
  this.eventSource.onerror = (error) => {
    console.error('[ServerAdapter] SSE error:', error);
    // EventSource auto-reconnects by default
  };
}

private handleEvent(event: any): void {
  const sessionId = event.properties?.sessionID || 
                    event.properties?.info?.sessionID ||
                    event.properties?.part?.sessionID;
  
  if (!sessionId) return;
  
  switch (event.type) {
    case 'message.part.updated':
      // Real-time text streaming
      const part = event.properties?.part;
      if (part?.type === 'text') {
        this.emit('text-delta', { sessionId, text: part.text });
      } else if (part?.type === 'tool') {
        this.emit('tool-use', {
          sessionId,
          tool: part.tool,
          input: part.state?.input,
          status: part.state?.status,
        });
      }
      break;
      
    case 'session.status':
      const status = event.properties?.status;
      this.emit('session-status', {
        sessionId,
        status: status?.type,
        message: status?.message,
      });
      
      // Handle completion
      if (status?.type === 'idle') {
        this.emit('complete', {
          sessionId,
          result: { status: 'success', sessionId },
        });
      }
      break;
      
    case 'message.updated':
      // Message metadata updates (cost, tokens, etc.)
      // Can be used for progress indicators
      break;
      
    default:
      // Log unknown events in debug mode
      console.log('[ServerAdapter] Unknown event type:', event.type);
  }
}
```

#### Session Management
```typescript
async createSession(taskId: string, config: TaskConfig): Promise<string> {
  // Create new session
  const response = await fetch(`${this.serverUrl}/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      // Can specify agent, model here if needed
    }),
  });
  
  if (!response.ok) {
    throw new Error(`Failed to create session: ${response.statusText}`);
  }
  
  const session = await response.json();
  
  // Track session -> task mapping
  this.sessions.set(session.id, { taskId, textBuffer: '' });
  
  // Send initial message with prompt
  await this.sendMessage(session.id, config.prompt, config.attachments);
  
  return session.id;
}

async sendMessage(
  sessionId: string, 
  text: string, 
  attachments?: Attachment[]
): Promise<void> {
  const parts: any[] = [{ type: 'text', text }];
  
  // Add attachment parts (images, files)
  if (attachments?.length) {
    for (const attachment of attachments) {
      if (attachment.type === 'image') {
        parts.push({
          type: 'image',
          url: attachment.url,
        });
      }
      // Handle other attachment types
    }
  }
  
  const response = await fetch(`${this.serverUrl}/session/${sessionId}/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ parts }),
  });
  
  if (!response.ok) {
    throw new Error(`Failed to send message: ${response.statusText}`);
  }
}
```

### Singleton Export
```typescript
let serverAdapter: OpenCodeServerAdapter | null = null;

export function getServerAdapter(): OpenCodeServerAdapter {
  if (!serverAdapter) {
    serverAdapter = new OpenCodeServerAdapter();
  }
  return serverAdapter;
}

export async function disposeServerAdapter(): Promise<void> {
  if (serverAdapter) {
    await serverAdapter.stop();
    serverAdapter = null;
  }
}
```

---

## Phase 2: Update Task Manager

**Modify:** `apps/desktop/src/main/opencode/task-manager.ts`

### Key Changes

1. Import server adapter instead of PTY adapter
2. Initialize server on first task
3. Handle streaming events
4. Map sessions to tasks

```typescript
import { getServerAdapter, OpenCodeServerAdapter, disposeServerAdapter } from './server-adapter';
import { createAdapter as createPtyAdapter } from './adapter'; // Fallback

class TaskManager {
  private serverAdapter: OpenCodeServerAdapter | null = null;
  private useServerMode: boolean = true;
  private sessionToTaskId: Map<string, string> = new Map();
  private taskCallbacks: Map<string, TaskCallbacks> = new Map();

  async initialize(): Promise<void> {
    if (this.useServerMode) {
      try {
        this.serverAdapter = getServerAdapter();
        await this.serverAdapter.start();
        this.setupServerEventHandlers();
        console.log('[TaskManager] Server mode initialized');
      } catch (error) {
        console.warn('[TaskManager] Server mode failed, will use PTY fallback:', error);
        this.useServerMode = false;
      }
    }
  }

  private setupServerEventHandlers(): void {
    if (!this.serverAdapter) return;

    // Real-time text streaming
    this.serverAdapter.on('text-delta', ({ sessionId, text }) => {
      const taskId = this.sessionToTaskId.get(sessionId);
      if (!taskId) return;
      
      const callbacks = this.taskCallbacks.get(taskId);
      callbacks?.onTextDelta?.(text);
    });

    // Tool usage
    this.serverAdapter.on('tool-use', ({ sessionId, tool, input, status }) => {
      const taskId = this.sessionToTaskId.get(sessionId);
      if (!taskId) return;
      
      const callbacks = this.taskCallbacks.get(taskId);
      if (status === 'running') {
        callbacks?.onToolUse?.(tool, input);
      }
    });

    // Session status changes
    this.serverAdapter.on('session-status', ({ sessionId, status, message }) => {
      const taskId = this.sessionToTaskId.get(sessionId);
      if (!taskId) return;
      
      const callbacks = this.taskCallbacks.get(taskId);
      callbacks?.onProgress?.({
        stage: status,
        message: message || status,
      });
    });

    // Completion
    this.serverAdapter.on('complete', ({ sessionId, result }) => {
      const taskId = this.sessionToTaskId.get(sessionId);
      if (!taskId) return;
      
      const callbacks = this.taskCallbacks.get(taskId);
      callbacks?.onComplete?.(result);
      
      // Cleanup
      this.sessionToTaskId.delete(sessionId);
    });

    // Errors
    this.serverAdapter.on('error', ({ sessionId, error }) => {
      const taskId = this.sessionToTaskId.get(sessionId);
      if (!taskId) return;
      
      const callbacks = this.taskCallbacks.get(taskId);
      callbacks?.onError?.(new Error(error));
    });
  }

  async startTask(taskId: string, config: TaskConfig, callbacks: TaskCallbacks): Promise<Task> {
    this.taskCallbacks.set(taskId, callbacks);

    if (this.useServerMode && this.serverAdapter?.isRunning()) {
      // Use server mode
      const sessionId = await this.serverAdapter.createSession(taskId, config);
      this.sessionToTaskId.set(sessionId, taskId);
      
      return {
        id: taskId,
        sessionId,
        status: 'running',
        // ... other task properties
      };
    } else {
      // Fallback to PTY mode
      console.log('[TaskManager] Using PTY fallback for task:', taskId);
      return this.startTaskWithPty(taskId, config, callbacks);
    }
  }

  private async startTaskWithPty(
    taskId: string, 
    config: TaskConfig, 
    callbacks: TaskCallbacks
  ): Promise<Task> {
    // Existing PTY adapter logic
    const adapter = createPtyAdapter(taskId);
    // ... setup and start
  }
}
```

### Add onTextDelta to TaskCallbacks
```typescript
export interface TaskCallbacks {
  onMessage: (message: OpenCodeMessage) => void;
  onTextDelta?: (text: string) => void;  // NEW
  onProgress: (progress: TaskProgress) => void;
  onToolUse?: (tool: string, input: unknown) => void;
  onComplete: (result: TaskResult) => void;
  onError: (error: Error) => void;
  // ... existing callbacks
}
```

---

## Phase 3: IPC & Frontend Updates

### 3.1 IPC Handlers

**Modify:** `apps/desktop/src/main/ipc/handlers.ts`

Add text delta callback in task callbacks:
```typescript
const callbacks: TaskCallbacks = {
  // ... existing callbacks
  
  onTextDelta: (text: string) => {
    forwardToRenderer('task:text-delta', {
      taskId,
      text,
    });
  },
  
  onMessage: (message: OpenCodeMessage) => {
    // Existing message handling for complete messages
    // This becomes the fallback for PTY mode
    queueMessage(taskId, transformMessage(message), forwardToRenderer, addTaskMessage);
  },
};
```

### 3.2 Preload

**Modify:** `apps/desktop/src/preload/index.ts`

Add new event listener:
```typescript
const accomplish = {
  // ... existing methods
  
  onTaskTextDelta: (callback: (event: { taskId: string; text: string }) => void) => {
    const listener = (_: IpcRendererEvent, event: { taskId: string; text: string }) => callback(event);
    ipcRenderer.on('task:text-delta', listener);
    return () => ipcRenderer.removeListener('task:text-delta', listener);
  },
};
```

### 3.3 Type Definitions

**Modify:** `apps/desktop/src/renderer/lib/accomplish.ts`

Add type for new method:
```typescript
export interface AccomplishAPI {
  // ... existing methods
  
  onTaskTextDelta?: (callback: (event: { taskId: string; text: string }) => void) => () => void;
}
```

### 3.4 Task Store

**Modify:** `apps/desktop/src/renderer/stores/taskStore.ts`

Add streaming message handling:
```typescript
// At module level, after store creation
if (typeof window !== 'undefined' && window.accomplish) {
  // ... existing subscriptions
  
  // Subscribe to text deltas (real-time streaming)
  window.accomplish.onTaskTextDelta?.((event) => {
    const state = useTaskStore.getState();
    if (state.currentTask?.id !== event.taskId) return;
    
    useTaskStore.setState((state) => {
      if (!state.currentTask) return state;
      
      const messages = [...state.currentTask.messages];
      const lastMsg = messages[messages.length - 1];
      
      // Check if we should append to existing streaming message
      if (lastMsg?.type === 'assistant' && lastMsg.isStreaming) {
        // Append text to existing message
        messages[messages.length - 1] = {
          ...lastMsg,
          content: lastMsg.content + event.text,
        };
      } else {
        // Create new streaming message
        messages.push({
          id: `msg_stream_${Date.now()}`,
          type: 'assistant',
          content: event.text,
          timestamp: new Date().toISOString(),
          isStreaming: true,
        });
      }
      
      return {
        currentTask: {
          ...state.currentTask,
          messages,
        },
      };
    });
  });
}
```

Add `isStreaming` to TaskMessage type:
```typescript
export interface TaskMessage {
  id: string;
  type: 'user' | 'assistant' | 'tool' | 'system';
  content: string;
  timestamp: string;
  isStreaming?: boolean;  // NEW
  // ... other fields
}
```

### 3.5 StreamingText Component

**Modify:** `apps/desktop/src/renderer/components/ui/streaming-text.tsx`

Simplify to just render with cursor (no animation):
```typescript
/**
 * StreamingText - Renders text with an optional streaming cursor
 * 
 * In serve mode, text arrives pre-streamed via SSE, so no animation is needed.
 * This component just renders the text and shows a cursor while streaming.
 */

import { cn } from '@/lib/utils';

interface StreamingTextProps {
  text: string;
  /** Whether content is still streaming */
  isStreaming?: boolean;
  /** Additional className */
  className?: string;
  /** Render function for the displayed text */
  children: (displayedText: string) => React.ReactNode;
}

export function StreamingText({
  text,
  isStreaming = false,
  className,
  children,
}: StreamingTextProps) {
  return (
    <div className={className}>
      {children(text)}
      {isStreaming && (
        <span 
          className="inline-block w-2 h-4 bg-foreground/60 animate-pulse ml-0.5 align-text-bottom" 
          aria-hidden="true"
        />
      )}
    </div>
  );
}

// Keep hook for backwards compatibility, but simplified
export function useStreamingState(
  messageId: string,
  isLatestAssistantMessage: boolean,
  isTaskRunning: boolean,
  isStreaming?: boolean
) {
  // If message has isStreaming flag, use it directly
  // Otherwise fall back to heuristic (latest message while task running)
  const shouldShowCursor = isStreaming ?? (isLatestAssistantMessage && isTaskRunning);
  
  return {
    shouldStream: false, // No animation needed
    isComplete: !shouldShowCursor,
    isStreaming: shouldShowCursor,
    onComplete: () => {}, // No-op
  };
}
```

### 3.6 Message Rendering

**Modify:** `apps/desktop/src/renderer/pages/Execution.tsx` (or wherever messages are rendered)

Pass `isStreaming` prop:
```typescript
{message.type === 'assistant' && (
  <StreamingText 
    text={message.content}
    isStreaming={message.isStreaming}
  >
    {(text) => <MarkdownRenderer content={text} />}
  </StreamingText>
)}
```

---

## Phase 4: App Initialization & Cleanup

### 4.1 Start Server on App Launch

**Modify:** `apps/desktop/src/main/index.ts`

```typescript
import { getServerAdapter, disposeServerAdapter } from './opencode/server-adapter';

app.whenReady().then(async () => {
  // ... existing initialization
  
  // Initialize OpenCode server adapter
  try {
    const adapter = getServerAdapter();
    await adapter.start();
    console.log('[Main] OpenCode server started successfully');
  } catch (error) {
    console.warn('[Main] OpenCode server failed to start, PTY fallback will be used:', error);
    // Don't throw - app continues with PTY fallback
  }
  
  // ... create windows, etc.
});

// Cleanup on quit
app.on('will-quit', async (event) => {
  event.preventDefault();
  
  try {
    await disposeServerAdapter();
    console.log('[Main] OpenCode server stopped');
  } catch (error) {
    console.error('[Main] Error stopping OpenCode server:', error);
  }
  
  app.exit();
});
```

### 4.2 Handle App Focus/Blur (Optional)

Could pause/resume SSE connection when app is backgrounded to save resources:
```typescript
app.on('browser-window-blur', () => {
  // Optionally pause SSE when app loses focus
});

app.on('browser-window-focus', () => {
  // Resume SSE when app gains focus
});
```

---

## Phase 5: Testing Checklist

### Functional Tests

- [ ] Server starts on app launch
- [ ] Dynamic port allocation works (no conflicts)
- [ ] Text streams in real-time (character by character from model)
- [ ] Cursor shows while streaming, disappears when done
- [ ] Multiple messages in a session work
- [ ] Session continuation works (follow-up questions)

### MCP Tools Tests

- [ ] Browser automation works (navigate, click, screenshot)
- [ ] Shopify tools work (get products, update, etc.)
- [ ] Space tools work (image generation)
- [ ] File permission requests work
- [ ] AskUserQuestion works

### Error Handling Tests

- [ ] Rate limit errors visible in UI
- [ ] Network errors handled gracefully
- [ ] Server crash triggers PTY fallback
- [ ] Graceful shutdown on app quit

### Model Tests

- [ ] Gemini models work
- [ ] Claude models work (if API key set)
- [ ] Kimi/Moonshot works
- [ ] Model switching works

### Edge Cases

- [ ] Very long responses stream correctly
- [ ] Concurrent tasks (if supported)
- [ ] Interrupting a running task
- [ ] Attachments (images) sent correctly
- [ ] Session state preserved across follow-ups

---

## Files Summary

| Action | File | Description |
|--------|------|-------------|
| **DELETE** | `apps/desktop/src/main/claude-sdk/*` | Remove unused SDK code |
| **CREATE** | `apps/desktop/src/main/opencode/server-adapter.ts` | New serve mode adapter |
| **MODIFY** | `apps/desktop/src/main/opencode/task-manager.ts` | Use server adapter, handle streaming |
| **MODIFY** | `apps/desktop/src/main/ipc/handlers.ts` | Add text-delta forwarding |
| **MODIFY** | `apps/desktop/src/preload/index.ts` | Expose onTaskTextDelta |
| **MODIFY** | `apps/desktop/src/renderer/lib/accomplish.ts` | Add type for new method |
| **MODIFY** | `apps/desktop/src/renderer/stores/taskStore.ts` | Handle streaming text |
| **MODIFY** | `apps/desktop/src/renderer/components/ui/streaming-text.tsx` | Simplify to cursor-only |
| **MODIFY** | `apps/desktop/src/renderer/pages/Execution.tsx` | Pass isStreaming prop |
| **MODIFY** | `apps/desktop/src/main/index.ts` | Start/stop server on app lifecycle |
| **KEEP** | `apps/desktop/src/main/opencode/adapter.ts` | PTY fallback |
| **KEEP** | `apps/desktop/src/main/opencode/stream-parser.ts` | Used by PTY fallback |

---

## Rollback Plan

If serve mode has critical issues:

1. Set `useServerMode = false` in TaskManager (single line change)
2. App immediately uses PTY fallback
3. No code deletion needed - PTY adapter is preserved

---

## Future Improvements

After this migration is stable:

1. **Remove PTY adapter** once serve mode is proven reliable
2. **Add retry UI** showing countdown for rate limits
3. **Add token streaming metrics** (tokens/sec display)
4. **Multi-session support** for parallel tasks
5. **Server health monitoring** with automatic restart
