import { ipcMain, BrowserWindow, shell, app } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import { URL } from 'url';
import {
  isOpenCodeCliInstalled,
  getOpenCodeCliVersion,
} from '../opencode/adapter';
import {
  getTaskManager,
  disposeTaskManager,
  isServerModeActive,
  type TaskCallbacks,
} from '../opencode/task-manager';
import {
  getTasks,
  getTask,
  saveTask,
  updateTaskStatus,
  updateTaskSessionId,
  updateTaskSummary,
  addTaskMessage,
  getKeyAssets,
  addKeyAsset,
  deleteTask,
  clearHistory,
  setMaxHistoryItems,
  flushPendingTasks, // Import flushPendingTasks
} from '../store/taskHistory';
import { generateTaskSummary } from '../services/summarizer';
import {
  storeApiKey,
  getApiKey,
  deleteApiKey,
  getAllApiKeys,
  hasAnyApiKey,
  listStoredCredentials,
} from '../store/secureStorage';
import {
  getDebugMode,
  setDebugMode,
  getAppSettings,
  getOnboardingComplete,
  setOnboardingComplete,
  getSelectedModel,
  setSelectedModel,
  getOllamaConfig,
  setOllamaConfig,
  getLiteLLMConfig,
  setLiteLLMConfig,
} from '../store/appSettings';
import {
  getProviderSettings,
  setActiveProvider,
  getConnectedProvider,
  setConnectedProvider,
  removeConnectedProvider,
  updateProviderModel,
  setProviderDebugMode,
  getProviderDebugMode,
  hasReadyProvider,
} from '../store/providerSettings';
import type { ProviderId, ConnectedProvider } from '@shopos/shared';
import { getDesktopConfig } from '../config';
import {
  startPermissionApiServer,
  startQuestionApiServer,
  startShopifyPermissionApiServer,
  initPermissionApi,
  resolvePermission,
  resolveQuestion,
  resolveShopifyPermission,
  isFilePermissionRequest,
  isQuestionRequest,
  isShopifyPermissionRequest,
  type QuestionResolveResult,
} from '../permission-api';
import type {
  TaskConfig,
  PermissionResponse,
  OpenCodeMessage,
  TaskMessage,
  TaskResult,
  TaskStatus,
  SelectedModel,
  OllamaConfig,
  LiteLLMConfig,
} from '@shopos/shared';
import { DEFAULT_PROVIDERS } from '@shopos/shared';
import {
  normalizeIpcError,
  permissionResponseSchema,
  resumeSessionSchema,
  taskConfigSchema,
  validate,
} from './validation';

import {
  isMockTaskEventsEnabled,
  createMockTask,
  executeMockTaskFlow,
  detectScenarioFromPrompt,
} from '../test-utils/mock-task-flow';
import { uploadGeneratedImage } from '../spaces/space-runtime-client';
import * as fs from 'fs';
import * as path from 'path';

const MAX_TEXT_LENGTH = 8000;
const ALLOWED_API_KEY_PROVIDERS = new Set(['anthropic', 'openai', 'openrouter', 'google', 'xai', 'deepseek', 'zai', 'custom', 'kimi', 'litellm']);
const API_KEY_VALIDATION_TIMEOUT_MS = 15000;

interface OllamaModel {
  id: string;
  displayName: string;
  size: number;
}

/**
 * Fetch with timeout using AbortController
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

// Message batching configuration
const MESSAGE_BATCH_DELAY_MS = 50;

// Per-task message batching state
interface MessageBatcher {
  pendingMessages: TaskMessage[];
  timeout: NodeJS.Timeout | null;
  taskId: string;
  flush: () => void;
}

const messageBatchers = new Map<string, MessageBatcher>();

// Track streaming text deltas to persist them when complete
// Map: taskId -> { messageId -> accumulatedText }
const streamingTextMap = new Map<string, Map<string, string>>();

function createMessageBatcher(
  taskId: string,
  forwardToRenderer: (channel: string, data: unknown) => void,
  addTaskMessage: (taskId: string, message: TaskMessage) => void
): MessageBatcher {
  const batcher: MessageBatcher = {
    pendingMessages: [],
    timeout: null,
    taskId,
    flush: () => {
      if (batcher.pendingMessages.length === 0) return;

      // Send all pending messages in one IPC call
      forwardToRenderer('task:update:batch', {
        taskId,
        messages: batcher.pendingMessages,
      });

      // Also persist each message to history
      for (const msg of batcher.pendingMessages) {
        addTaskMessage(taskId, msg);
      }

      batcher.pendingMessages = [];
      if (batcher.timeout) {
        clearTimeout(batcher.timeout);
        batcher.timeout = null;
      }
    },
  };

  messageBatchers.set(taskId, batcher);
  return batcher;
}

function queueMessage(
  taskId: string,
  message: TaskMessage,
  forwardToRenderer: (channel: string, data: unknown) => void,
  addTaskMessage: (taskId: string, message: TaskMessage) => void
): void {
  let batcher = messageBatchers.get(taskId);
  if (!batcher) {
    batcher = createMessageBatcher(taskId, forwardToRenderer, addTaskMessage);
  }

  batcher.pendingMessages.push(message);

  // Set up or reset the batch timer
  if (batcher.timeout) {
    clearTimeout(batcher.timeout);
  }

  batcher.timeout = setTimeout(() => {
    batcher.flush();
  }, MESSAGE_BATCH_DELAY_MS);
}

function flushAndCleanupBatcher(taskId: string): void {
  const batcher = messageBatchers.get(taskId);
  if (batcher) {
    batcher.flush();
    messageBatchers.delete(taskId);
  }
}

function assertTrustedWindow(window: BrowserWindow | null): BrowserWindow {
  if (!window || window.isDestroyed()) {
    throw new Error('Untrusted window');
  }

  const focused = BrowserWindow.getFocusedWindow();
  if (BrowserWindow.getAllWindows().length > 1 && focused && focused.id !== window.id) {
    throw new Error('IPC request must originate from the focused window');
  }

  return window;
}

function sanitizeString(input: unknown, field: string, maxLength = MAX_TEXT_LENGTH): string {
  if (typeof input !== 'string') {
    throw new Error(`${field} must be a string`);
  }
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error(`${field} is required`);
  }
  if (trimmed.length > maxLength) {
    throw new Error(`${field} exceeds maximum length`);
  }
  return trimmed;
}

function validateTaskConfig(config: TaskConfig): TaskConfig {
  const prompt = sanitizeString(config.prompt, 'prompt');
  const validated: TaskConfig = { prompt };

  if (config.taskId) {
    validated.taskId = sanitizeString(config.taskId, 'taskId', 128);
  }
  if (config.sessionId) {
    validated.sessionId = sanitizeString(config.sessionId, 'sessionId', 128);
  }
  if (config.workingDirectory) {
    validated.workingDirectory = sanitizeString(config.workingDirectory, 'workingDirectory', 1024);
  }
  if (Array.isArray(config.allowedTools)) {
    validated.allowedTools = config.allowedTools
      .filter((tool): tool is string => typeof tool === 'string')
      .map((tool) => sanitizeString(tool, 'allowedTools', 64))
      .slice(0, 20);
  }
  if (config.systemPromptAppend) {
    validated.systemPromptAppend = sanitizeString(
      config.systemPromptAppend,
      'systemPromptAppend',
      MAX_TEXT_LENGTH
    );
  }
  if (config.outputSchema && typeof config.outputSchema === 'object') {
    validated.outputSchema = config.outputSchema;
  }
  // Pass through attachments (already validated during upload)
  if (Array.isArray(config.attachments) && config.attachments.length > 0) {
    validated.attachments = config.attachments;
  }

  return validated;
}

/**
 * Check if E2E auth bypass is enabled via global flag, command-line argument, or environment variable
 * Global flag is set by Playwright's app.evaluate() and is most reliable across platforms
 */
function isE2ESkipAuthEnabled(): boolean {
  return (
    (global as Record<string, unknown>).E2E_SKIP_AUTH === true ||
    process.argv.includes('--e2e-skip-auth') ||
    process.env.E2E_SKIP_AUTH === '1'
  );
}

function handle<Args extends unknown[], ReturnType = unknown>(
  channel: string,
  handler: (event: IpcMainInvokeEvent, ...args: Args) => ReturnType
): void {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      return await handler(event, ...(args as Args));
    } catch (error) {
      console.error(`IPC handler ${channel} failed`, error);
      throw normalizeIpcError(error);
    }
  });
}

/**
 * Register all IPC handlers
 */
export function registerIPCHandlers(): void {
  const taskManager = getTaskManager();

  // Start the permission API server for file-permission MCP
  // Initialize when we have a window (deferred until first task:start)
  let permissionApiInitialized = false;

  // Task: Start a new task
  handle('task:start', async (event: IpcMainInvokeEvent, config: TaskConfig) => {
    const window = assertTrustedWindow(BrowserWindow.fromWebContents(event.sender));
    const sender = event.sender;
    const validatedConfig = validateTaskConfig(config);

    // Check for ready provider before starting task (skip in E2E mock mode)
    // This is a backend safety check - the UI should also check before calling
    if (!isMockTaskEventsEnabled() && !hasReadyProvider()) {
      throw new Error('No provider is ready. Please connect a provider and select a model in Settings.');
    }

    // Initialize permission API server (once, when we have a window)
    if (!permissionApiInitialized) {
      initPermissionApi(window, () => taskManager.getActiveTaskId());
      startPermissionApiServer();
      startQuestionApiServer();
      startShopifyPermissionApiServer();
      permissionApiInitialized = true;
    }

    const taskId = createTaskId();

    // E2E Mock Mode: Return mock task and emit simulated events
    if (isMockTaskEventsEnabled()) {
      const mockTask = createMockTask(taskId, validatedConfig.prompt);
      const scenario = detectScenarioFromPrompt(validatedConfig.prompt);

      // Save task to history so Execution page can load it
      saveTask(mockTask);

      // Execute mock flow asynchronously (sends IPC events)
      void executeMockTaskFlow(window, {
        taskId,
        prompt: validatedConfig.prompt,
        scenario,
        delayMs: 50,
      });

      return mockTask;
    }

    // Setup event forwarding to renderer
    const forwardToRenderer = (channel: string, data: unknown) => {
      if (!window.isDestroyed() && !sender.isDestroyed()) {
        sender.send(channel, data);
      }
    };

    // Create task-scoped callbacks for the TaskManager
    const callbacks: TaskCallbacks = {
      onMessage: (message: OpenCodeMessage) => {
        console.log('[IPC handlers] onMessage received:', message.type, 
          message.type === 'text' ? `text: "${(message as any).part?.text?.substring(0, 50)}..."` : '',
          message.type === 'tool_use' ? `tool: ${(message as any).part?.tool}, status: ${(message as any).part?.state?.status}` : ''
        );
        
        const taskMessage = toTaskMessage(message);
        if (!taskMessage) {
          console.log('[IPC handlers] toTaskMessage returned null for:', message.type);
          return;
        }
        
        console.log('[IPC handlers] taskMessage created:', taskMessage.type, taskMessage.content?.substring(0, 50));

        // Process generated images asynchronously, then queue the message
        // This uploads local /tmp/*.png files to S3 and replaces paths with URLs
        (async () => {
          try {
            if (taskMessage.content) {
              taskMessage.content = await processGeneratedImages(taskMessage.content, taskId);
            }
          } catch (error) {
            console.error('[IPC handlers] Error processing generated images:', error);
          }
          // Queue message for batching (even if image processing failed)
          queueMessage(taskId, taskMessage, forwardToRenderer, addTaskMessage);
        })();
      },

      // Real-time text streaming (from server adapter)
      onTextDelta: (text: string, messageId: string) => {
        // Accumulate text for persistence
        if (!streamingTextMap.has(taskId)) {
          streamingTextMap.set(taskId, new Map());
        }
        const taskMap = streamingTextMap.get(taskId)!;
        const currentText = taskMap.get(messageId) || '';
        taskMap.set(messageId, currentText + text);

        console.log(`[IPC:onTextDelta] Forwarding to renderer:`, {
          taskId,
          messageId,
          textLength: text.length,
          textPreview: text.substring(0, 30),
        });
        // Forward text delta to renderer for real-time display with messageId for tracking
        forwardToRenderer('task:text-delta', {
          taskId,
          messageId,
          text,
        });
      },

      // Streaming complete - mark the current streaming message as done
      onStreamComplete: (messageId: string) => {
        console.log(`[IPC:onStreamComplete] Finalizing streaming message:`, { taskId, messageId });
        
        // Persist the accumulated text to history
        const taskMap = streamingTextMap.get(taskId);
        if (taskMap && taskMap.has(messageId)) {
          const finalContent = taskMap.get(messageId)!;
          console.log(`[IPC:onStreamComplete] Persisting accumulated text (${finalContent.length} chars)`);
          
          const assistantMessage: TaskMessage = {
            id: messageId,
            type: 'assistant',
            content: finalContent,
            timestamp: new Date().toISOString(),
          };
          addTaskMessage(taskId, assistantMessage);
          
          // Force flush to ensure persistence even if app reloads immediately
          flushPendingTasks();
          
          // Clean up
          taskMap.delete(messageId);
          if (taskMap.size === 0) {
            streamingTextMap.delete(taskId);
          }
        }

        forwardToRenderer('task:stream-complete', { taskId, messageId });
      },

      onProgress: (progress: { stage: string; message?: string }) => {
        forwardToRenderer('task:progress', {
          taskId,
          ...progress,
        });
      },

      onPermissionRequest: (request: unknown) => {
        // Flush pending messages before showing permission request
        flushAndCleanupBatcher(taskId);
        forwardToRenderer('permission:request', request);
      },

      onComplete: (result: TaskResult) => {
        // Flush any pending messages before completing
        flushAndCleanupBatcher(taskId);

        forwardToRenderer('task:update', {
          taskId,
          type: 'complete',
          result,
        });

        // Map result status to task status
        let taskStatus: TaskStatus;
        if (result.status === 'success') {
          taskStatus = 'completed';
        } else if (result.status === 'interrupted') {
          taskStatus = 'interrupted';
        } else {
          taskStatus = 'failed';
        }

        // Update task status in history
        updateTaskStatus(taskId, taskStatus, new Date().toISOString());

        // Update session ID if available (important for interrupted tasks to allow continuation)
        const sessionId = result.sessionId || taskManager.getSessionId(taskId);
        if (sessionId) {
          updateTaskSessionId(taskId, sessionId);
        }
      },

      onError: (error: Error) => {
        // Flush any pending messages before error
        flushAndCleanupBatcher(taskId);

        forwardToRenderer('task:update', {
          taskId,
          type: 'error',
          error: error.message,
        });

        // Update task status in history
        updateTaskStatus(taskId, 'failed', new Date().toISOString());
      },

      onDebug: (log: { type: string; message: string; data?: unknown }) => {
        if (getDebugMode()) {
          forwardToRenderer('debug:log', {
            taskId,
            timestamp: new Date().toISOString(),
            ...log,
          });
        }
      },

      onStatusChange: (status: TaskStatus) => {
        // Notify renderer of status change (e.g., queued -> running)
        forwardToRenderer('task:status-change', {
          taskId,
          status,
        });
        // Update task status in history
        updateTaskStatus(taskId, status, new Date().toISOString());
      },
    };

    // Start the task via TaskManager (creates isolated adapter or queues if busy)
    const task = await taskManager.startTask(taskId, validatedConfig, callbacks);

    // Log streaming mode to debug panel
    const streamingMode = isServerModeActive() ? 'Server (Real Streaming)' : 'PTY (Fake Streaming)';
    forwardToRenderer('debug:log', {
      taskId,
      timestamp: new Date().toISOString(),
      type: 'info',
      message: `Streaming Mode: ${streamingMode}`,
    });

    // Convert attachments to TaskAttachment format for rendering
    const messageAttachments = validatedConfig.attachments?.map(a => ({
      type: 'file' as const,
      data: a.url,
      filename: a.filename,
      contentType: a.contentType,
    }));

    // Add initial user message with the prompt to the chat
    const initialUserMessage: TaskMessage = {
      id: createMessageId(),
      type: 'user',
      content: validatedConfig.prompt,
      timestamp: new Date().toISOString(),
      attachments: messageAttachments,
    };
    task.messages = [initialUserMessage];

    // Save task to history (includes the initial user message)
    saveTask(task);

    // Generate AI summary asynchronously (don't block task execution)
    generateTaskSummary(validatedConfig.prompt)
      .then((summary) => {
        updateTaskSummary(taskId, summary);
        forwardToRenderer('task:summary', { taskId, summary });
      })
      .catch((err) => {
        console.warn('[IPC] Failed to generate task summary:', err);
      });

    return task;
  });

  // Task: Cancel current task (running or queued)
  handle('task:cancel', async (_event: IpcMainInvokeEvent, taskId?: string) => {
    if (!taskId) return;

    // Check if it's a queued task first
    if (taskManager.isTaskQueued(taskId)) {
      taskManager.cancelQueuedTask(taskId);
      updateTaskStatus(taskId, 'cancelled', new Date().toISOString());
      return;
    }

    // Otherwise cancel the running task
    if (taskManager.hasActiveTask(taskId)) {
      await taskManager.cancelTask(taskId);
      updateTaskStatus(taskId, 'cancelled', new Date().toISOString());
    }
  });

  // Task: Interrupt current task (graceful Ctrl+C, doesn't kill process)
  handle('task:interrupt', async (_event: IpcMainInvokeEvent, taskId?: string) => {
    if (!taskId) return;

    if (taskManager.hasActiveTask(taskId)) {
      await taskManager.interruptTask(taskId);
      // Note: Don't change task status - task is still running, just interrupted
      console.log(`[IPC] Task ${taskId} interrupted`);
    }
  });

  // Task: Get task from history
  handle('task:get', async (_event: IpcMainInvokeEvent, taskId: string) => {
    return getTask(taskId) || null;
  });

  // Task: List tasks from history
  handle('task:list', async (_event: IpcMainInvokeEvent) => {
    return getTasks();
  });

  // Task: Delete task from history
  handle('task:delete', async (_event: IpcMainInvokeEvent, taskId: string) => {
    deleteTask(taskId);
  });

  // Task: Clear all history
  handle('task:clear-history', async (_event: IpcMainInvokeEvent) => {
    clearHistory();
  });

  // Permission: Respond to permission request
  handle('permission:respond', async (_event: IpcMainInvokeEvent, response: PermissionResponse) => {
    console.log('[IPC] >>> permission:respond received', {
      requestId: response.requestId,
      taskId: response.taskId,
      decision: response.decision,
      selectedOptions: response.selectedOptions,
      customText: response.customText?.substring(0, 50),
    });
    
    const parsedResponse = validate(permissionResponseSchema, response);
    const { taskId, decision, requestId } = parsedResponse;

    console.log(`[IPC] Request ID analysis: ${requestId}`);
    console.log(`[IPC]   - isFilePermissionRequest: ${requestId ? isFilePermissionRequest(requestId) : 'no requestId'}`);
    console.log(`[IPC]   - isQuestionRequest: ${requestId ? isQuestionRequest(requestId) : 'no requestId'}`);
    console.log(`[IPC]   - isShopifyPermissionRequest: ${requestId ? isShopifyPermissionRequest(requestId) : 'no requestId'}`);

    // Check if this is a Shopify permission request from the MCP server
    if (requestId && isShopifyPermissionRequest(requestId)) {
      const allowed = decision === 'allow';
      const rememberSession = parsedResponse.rememberSession;
      console.log(`[IPC] Processing as SHOPIFY permission request: ${requestId}`);
      console.log(`[IPC]   - allowed: ${allowed}, rememberSession: ${rememberSession}`);
      const resolved = resolveShopifyPermission(requestId, allowed, rememberSession);
      if (resolved) {
        console.log(`[IPC] Shopify permission request ${requestId} resolved: ${allowed ? 'allowed' : 'denied'}`);
        return;
      }
      // If not found in pending, DON'T fall through
      console.error(`[IPC] !!! Shopify permission request ${requestId} not found in pending requests - NOT falling through`);
      return;
    }

    // Check if this is a file permission request from the MCP server
    if (requestId && isFilePermissionRequest(requestId)) {
      const allowed = decision === 'allow';
      console.log(`[IPC] Processing as FILE permission request: ${requestId}`);
      const resolved = resolvePermission(requestId, allowed);
      if (resolved) {
        console.log(`[IPC] File permission request ${requestId} resolved: ${allowed ? 'allowed' : 'denied'}`);
        return;
      }
      // If not found in pending, fall through to standard handling
      console.warn(`[IPC] File permission request ${requestId} not found in pending requests`);
    }

    // Check if this is a question request from the MCP server
    if (requestId && isQuestionRequest(requestId)) {
      const denied = decision === 'deny';
      console.log(`[IPC] Processing as QUESTION request: ${requestId}`);
      console.log(`[IPC]   - selectedOptions: ${parsedResponse.selectedOptions?.join(', ')}`);
      console.log(`[IPC]   - customText: ${parsedResponse.customText}`);
      console.log(`[IPC]   - denied: ${denied}`);
      
      const result: QuestionResolveResult = resolveQuestion(requestId, {
        selectedOptions: parsedResponse.selectedOptions,
        customText: parsedResponse.customText,
        denied,
      });
      
      if (result.resolved && !result.lateResponse) {
        // Normal flow - question answered while MCP was still waiting
        console.log(`[IPC] Question request ${requestId} resolved immediately: ${denied ? 'denied' : 'answered'}`);
        return;
      }
      
      if (result.resolved && result.lateResponse && result.taskId && result.response) {
        // Late response - MCP timed out, but user just answered
        // We need to resume the session with the user's answer
        console.log(`[IPC] Late question response for task ${result.taskId} - will resume session`);
        
        // Format the answer as a message for the agent
        let answerText: string;
        if (result.response.denied) {
          answerText = "I've decided not to answer that question. Please proceed without this information.";
        } else if (result.response.selectedOptions?.length) {
          answerText = `My answer to your question: ${result.response.selectedOptions.join(', ')}`;
        } else if (result.response.customText) {
          answerText = `My answer to your question: ${result.response.customText}`;
        } else {
          answerText = "I've acknowledged your question but provided no specific answer.";
        }
        
        // Persist the user's answer to task history as a message
        // This ensures the answer appears in chat history even if app restarts
        const answerMessage: TaskMessage = {
          id: createMessageId(),
          type: 'user',
          content: answerText,
          timestamp: new Date().toISOString(),
        };
        addTaskMessage(result.taskId, answerMessage);
        console.log(`[IPC] Persisted answer to task history for task ${result.taskId}`);
        
        // Get the task to find its session ID
        const task = getTask(result.taskId);
        if (task?.sessionId) {
          console.log(`[IPC] Resuming session ${task.sessionId} with answer: "${answerText.substring(0, 50)}..."`);
          
          // Emit an event to tell the frontend to resume the session
          // The frontend will call session:resume with the answer
          const window = BrowserWindow.getAllWindows()[0];
          if (window && !window.isDestroyed()) {
            window.webContents.send('question:late-response', {
              taskId: result.taskId,
              sessionId: task.sessionId,
              answer: answerText,
            });
          }
        } else {
          console.warn(`[IPC] Cannot resume - task ${result.taskId} has no sessionId`);
        }
        return;
      }
      
      // If not found in pending or timed-out, DON'T fall through - just log and return
      console.error(`[IPC] !!! Question request ${requestId} not found in pending requests - NOT falling through to PTY`);
      return;  // Prevent race condition by not falling through
    }

    // Check if the task is still active
    if (!taskManager.hasActiveTask(taskId)) {
      console.warn(`[IPC] Permission response for inactive task ${taskId}`);
      return;
    }

    console.log(`[IPC] Falling through to standard PTY response for task ${taskId}`);
    if (decision === 'allow') {
      // Send the response to the correct task's CLI
      const message = parsedResponse.selectedOptions?.join(', ') || parsedResponse.message || 'yes';
      const sanitizedMessage = sanitizeString(message, 'permissionResponse', 1024);
      console.log(`[IPC] Sending to PTY: "${sanitizedMessage}"`);
      await taskManager.sendResponse(taskId, sanitizedMessage);
    } else {
      // Send denial to the correct task
      console.log(`[IPC] Sending denial to PTY: "no"`);
      await taskManager.sendResponse(taskId, 'no');
    }
  });

  // Session: Resume (continue conversation)
  handle('session:resume', async (event: IpcMainInvokeEvent, sessionId: string, prompt: string, existingTaskId?: string, attachments?: Array<{ filename: string; contentType: string; url: string; size: number }>) => {
    const window = assertTrustedWindow(BrowserWindow.fromWebContents(event.sender));
    const sender = event.sender;
    const validatedSessionId = sanitizeString(sessionId, 'sessionId', 128);
    const validatedPrompt = sanitizeString(prompt, 'prompt');
    const validatedExistingTaskId = existingTaskId
      ? sanitizeString(existingTaskId, 'taskId', 128)
      : undefined;

    // Check for ready provider before resuming session (skip in E2E mock mode)
    // This is a backend safety check - the UI should also check before calling
    if (!isMockTaskEventsEnabled() && !hasReadyProvider()) {
      throw new Error('No provider is ready. Please connect a provider and select a model in Settings.');
    }

    // Use existing task ID or create a new one
    const taskId = validatedExistingTaskId || createTaskId();

    // Persist the user's follow-up message to task history
    if (validatedExistingTaskId) {
      // Convert attachments to TaskAttachment format for rendering
      const messageAttachments = attachments?.map(a => ({
        type: 'file' as const,
        data: a.url,
        filename: a.filename,
        contentType: a.contentType,
      }));
      
      const userMessage: TaskMessage = {
        id: createMessageId(),
        type: 'user',
        content: validatedPrompt,
        timestamp: new Date().toISOString(),
        attachments: messageAttachments,
      };
      addTaskMessage(validatedExistingTaskId, userMessage);
    }

    // Setup event forwarding to renderer
    const forwardToRenderer = (channel: string, data: unknown) => {
      if (!window.isDestroyed() && !sender.isDestroyed()) {
        sender.send(channel, data);
      }
    };

    // Create task-scoped callbacks for the TaskManager (with batching for performance)
    const callbacks: TaskCallbacks = {
      onMessage: (message: OpenCodeMessage) => {
        const taskMessage = toTaskMessage(message);
        if (!taskMessage) return;

        // Process generated images asynchronously, then queue the message
        // This uploads local /tmp/*.png files to S3 and replaces paths with URLs
        (async () => {
          try {
            if (taskMessage.content) {
              taskMessage.content = await processGeneratedImages(taskMessage.content, taskId);
            }
          } catch (error) {
            console.error('[IPC handlers] Error processing generated images:', error);
          }
          // Queue message for batching (even if image processing failed)
          queueMessage(taskId, taskMessage, forwardToRenderer, addTaskMessage);
        })();
      },

      // Real-time text streaming (from server adapter)
      onTextDelta: (text: string, messageId: string) => {
        // Accumulate text for persistence
        if (!streamingTextMap.has(taskId)) {
          streamingTextMap.set(taskId, new Map());
        }
        const taskMap = streamingTextMap.get(taskId)!;
        const currentText = taskMap.get(messageId) || '';
        taskMap.set(messageId, currentText + text);

        console.log(`[IPC:session:resume:onTextDelta] Forwarding to renderer:`, {
          taskId,
          messageId,
          textLength: text.length,
          textPreview: text.substring(0, 30),
        });
        // Forward text delta to renderer for real-time display with messageId for tracking
        forwardToRenderer('task:text-delta', {
          taskId,
          messageId,
          text,
        });
      },

      // Streaming complete - mark the current streaming message as done
      onStreamComplete: (messageId: string) => {
        console.log(`[IPC:session:resume:onStreamComplete] Finalizing streaming message:`, { taskId, messageId });
        
        // Persist the accumulated text to history
        const taskMap = streamingTextMap.get(taskId);
        if (taskMap && taskMap.has(messageId)) {
          const finalContent = taskMap.get(messageId)!;
          console.log(`[IPC:session:resume:onStreamComplete] Persisting accumulated text (${finalContent.length} chars)`);
          
          const assistantMessage: TaskMessage = {
            id: messageId,
            type: 'assistant',
            content: finalContent,
            timestamp: new Date().toISOString(),
          };
          addTaskMessage(taskId, assistantMessage);
          
          // Force flush to ensure persistence even if app reloads immediately
          flushPendingTasks();
          
          // Clean up
          taskMap.delete(messageId);
          if (taskMap.size === 0) {
            streamingTextMap.delete(taskId);
          }
        }

        forwardToRenderer('task:stream-complete', { taskId, messageId });
      },

      onProgress: (progress: { stage: string; message?: string }) => {
        forwardToRenderer('task:progress', {
          taskId,
          ...progress,
        });
      },

      onPermissionRequest: (request: unknown) => {
        // Flush pending messages before showing permission request
        flushAndCleanupBatcher(taskId);
        forwardToRenderer('permission:request', request);
      },

      onComplete: (result: TaskResult) => {
        // Flush any pending messages before completing
        flushAndCleanupBatcher(taskId);

        forwardToRenderer('task:update', {
          taskId,
          type: 'complete',
          result,
        });

        // Map result status to task status
        let taskStatus: TaskStatus;
        if (result.status === 'success') {
          taskStatus = 'completed';
        } else if (result.status === 'interrupted') {
          taskStatus = 'interrupted';
        } else {
          taskStatus = 'failed';
        }

        // Update task status in history
        updateTaskStatus(taskId, taskStatus, new Date().toISOString());

        // Update session ID if available (important for interrupted tasks to allow continuation)
        const newSessionId = result.sessionId || taskManager.getSessionId(taskId);
        if (newSessionId) {
          updateTaskSessionId(taskId, newSessionId);
        }
      },

      onError: (error: Error) => {
        // Flush any pending messages before error
        flushAndCleanupBatcher(taskId);

        forwardToRenderer('task:update', {
          taskId,
          type: 'error',
          error: error.message,
        });

        // Update task status in history
        updateTaskStatus(taskId, 'failed', new Date().toISOString());
      },

      onDebug: (log: { type: string; message: string; data?: unknown }) => {
        if (getDebugMode()) {
          forwardToRenderer('debug:log', {
            taskId,
            timestamp: new Date().toISOString(),
            ...log,
          });
        }
      },

      onStatusChange: (status: TaskStatus) => {
        // Notify renderer of status change (e.g., queued -> running)
        forwardToRenderer('task:status-change', {
          taskId,
          status,
        });
        // Update task status in history
        updateTaskStatus(taskId, status, new Date().toISOString());
      },
    };

    // Start the task via TaskManager with sessionId for resume (creates isolated adapter or queues if busy)
    const task = await taskManager.startTask(taskId, {
      prompt: validatedPrompt,
      sessionId: validatedSessionId,
      taskId,
      attachments,
    }, callbacks);

    // Update task status in history (whether running or queued)
    if (validatedExistingTaskId) {
      updateTaskStatus(validatedExistingTaskId, task.status, new Date().toISOString());
    }

    return task;
  });

  // Settings: Get API keys
  // Note: In production, this should fetch from backend to get metadata
  // The actual keys are stored locally in secure storage
  handle('settings:api-keys', async (_event: IpcMainInvokeEvent) => {
    const storedCredentials = await listStoredCredentials();

    return storedCredentials
      .filter((credential) => credential.account.startsWith('apiKey:'))
      .filter((credential) => !credential.account.endsWith(':shopify')) // Exclude Shopify - handled separately in Integrations
      .map((credential) => {
        const provider = credential.account.replace('apiKey:', '');

        const keyPrefix =
          credential.password && credential.password.length > 0
            ? `${credential.password.substring(0, 8)}...`
            : '';

        return {
          id: `local-${provider}`,
          provider,
          label: 'Local API Key',
          keyPrefix,
          isActive: true,
          createdAt: new Date().toISOString(),
        };
      });
  });

  // Settings: Add API key (stores securely in OS keychain)
  handle(
    'settings:add-api-key',
    async (_event: IpcMainInvokeEvent, provider: string, key: string, label?: string) => {
      if (!ALLOWED_API_KEY_PROVIDERS.has(provider)) {
        throw new Error('Unsupported API key provider');
      }
      const sanitizedKey = sanitizeString(key, 'apiKey', 256);
      const sanitizedLabel = label ? sanitizeString(label, 'label', 128) : undefined;

      // Store the API key securely in OS keychain
      await storeApiKey(provider, sanitizedKey);

      return {
        id: `local-${provider}`,
        provider,
        label: sanitizedLabel || 'Local API Key',
        keyPrefix: sanitizedKey.substring(0, 8) + '...',
        isActive: true,
        createdAt: new Date().toISOString(),
      };
    }
  );

  // Settings: Remove API key
  handle('settings:remove-api-key', async (_event: IpcMainInvokeEvent, id: string) => {
    // Extract provider from id (format: local-{provider})
    const sanitizedId = sanitizeString(id, 'id', 128);
    const provider = sanitizedId.replace('local-', '');
    await deleteApiKey(provider);
  });

  // API Key: Check if API key exists
  handle('api-key:exists', async (_event: IpcMainInvokeEvent) => {
    const apiKey = await getApiKey('anthropic');
    return Boolean(apiKey);
  });

  // API Key: Set API key
  handle('api-key:set', async (_event: IpcMainInvokeEvent, key: string) => {
    const sanitizedKey = sanitizeString(key, 'apiKey', 256);
    await storeApiKey('anthropic', sanitizedKey);
    console.log('[API Key] Key set', { keyPrefix: sanitizedKey.substring(0, 8) });
  });

  // API Key: Get API key
  handle('api-key:get', async (_event: IpcMainInvokeEvent) => {
    return getApiKey('anthropic');
  });

  // API Key: Validate API key by making a test request
  handle('api-key:validate', async (_event: IpcMainInvokeEvent, key: string) => {
    const sanitizedKey = sanitizeString(key, 'apiKey', 256);
    console.log('[API Key] Validation requested');

    try {
      // Make a simple API call to validate the key
      const response = await fetchWithTimeout(
        'https://api.anthropic.com/v1/messages',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': sanitizedKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-3-haiku-20240307',
            max_tokens: 1,
            messages: [{ role: 'user', content: 'test' }],
          }),
        },
        API_KEY_VALIDATION_TIMEOUT_MS
      );

      if (response.ok) {
        console.log('[API Key] Validation succeeded');
        return { valid: true };
      }

      const errorData = await response.json().catch(() => ({}));
      const errorMessage = (errorData as { error?: { message?: string } })?.error?.message || `API returned status ${response.status}`;

      console.warn('[API Key] Validation failed', { status: response.status, error: errorMessage });

      return { valid: false, error: errorMessage };
    } catch (error) {
      console.error('[API Key] Validation error', { error: error instanceof Error ? error.message : String(error) });
      if (error instanceof Error && error.name === 'AbortError') {
        return { valid: false, error: 'Request timed out. Please check your internet connection and try again.' };
      }
      return { valid: false, error: 'Failed to validate API key. Check your internet connection.' };
    }
  });

  // API Key: Validate API key for any provider
  handle('api-key:validate-provider', async (_event: IpcMainInvokeEvent, provider: string, key: string) => {
    if (!ALLOWED_API_KEY_PROVIDERS.has(provider)) {
      return { valid: false, error: 'Unsupported provider' };
    }
    const sanitizedKey = sanitizeString(key, 'apiKey', 256);
    console.log(`[API Key] Validation requested for provider: ${provider}`);

    try {
      let response: Response;

      switch (provider) {
        case 'anthropic':
          response = await fetchWithTimeout(
            'https://api.anthropic.com/v1/messages',
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-api-key': sanitizedKey,
                'anthropic-version': '2023-06-01',
              },
              body: JSON.stringify({
                model: 'claude-3-haiku-20240307',
                max_tokens: 1,
                messages: [{ role: 'user', content: 'test' }],
              }),
            },
            API_KEY_VALIDATION_TIMEOUT_MS
          );
          break;

        case 'openai':
          response = await fetchWithTimeout(
            'https://api.openai.com/v1/models',
            {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${sanitizedKey}`,
              },
            },
            API_KEY_VALIDATION_TIMEOUT_MS
          );
          break;

        case 'openrouter':
          response = await fetchWithTimeout(
            'https://openrouter.ai/api/v1/models',
            {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${sanitizedKey}`,
              },
            },
            API_KEY_VALIDATION_TIMEOUT_MS
          );
          break;

        case 'google':
          response = await fetchWithTimeout(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${sanitizedKey}`,
            {
              method: 'GET',
            },
            API_KEY_VALIDATION_TIMEOUT_MS
          );
          break;

        case 'xai':
          response = await fetchWithTimeout(
            'https://api.x.ai/v1/models',
            {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${sanitizedKey}`,
              },
            },
            API_KEY_VALIDATION_TIMEOUT_MS
          );
          break;

        case 'deepseek':
          response = await fetchWithTimeout(
            'https://api.deepseek.com/models',
            {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${sanitizedKey}`,
              },
            },
            API_KEY_VALIDATION_TIMEOUT_MS
          );
          break;

        // Z.AI Coding Plan uses the same validation as standard API
        case 'zai':
          response = await fetchWithTimeout(
            'https://open.bigmodel.cn/api/paas/v4/models',
            {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${sanitizedKey}`,
              },
            },
            API_KEY_VALIDATION_TIMEOUT_MS
          );
          break;

        default:
          // For 'custom' provider, skip validation
          console.log('[API Key] Skipping validation for custom provider');
          return { valid: true };
      }

      if (response.ok) {
        console.log(`[API Key] Validation succeeded for ${provider}`);
        return { valid: true };
      }

      const errorData = await response.json().catch(() => ({}));
      const errorMessage = (errorData as { error?: { message?: string } })?.error?.message || `API returned status ${response.status}`;

      console.warn(`[API Key] Validation failed for ${provider}`, { status: response.status, error: errorMessage });
      return { valid: false, error: errorMessage };
    } catch (error) {
      console.error(`[API Key] Validation error for ${provider}`, { error: error instanceof Error ? error.message : String(error) });
      if (error instanceof Error && error.name === 'AbortError') {
        return { valid: false, error: 'Request timed out. Please check your internet connection and try again.' };
      }
      return { valid: false, error: 'Failed to validate API key. Check your internet connection.' };
    }
  });

  // Kimi: Validate API key (simple test against Moonshot API)
  handle('kimi:validate', async (_event: IpcMainInvokeEvent, apiKey: string) => {
    console.log('[Kimi] Validation requested');

    try {
      // Test by calling the models endpoint
      const response = await fetchWithTimeout(
        'https://api.moonshot.ai/v1/models',
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
        },
        API_KEY_VALIDATION_TIMEOUT_MS
      );

      if (response.ok) {
        console.log('[Kimi] Validation succeeded');
        return { valid: true };
      }

      const errorText = await response.text();
      console.warn('[Kimi] Validation failed:', response.status, errorText);
      
      if (response.status === 401) {
        return { valid: false, error: 'Invalid API key. Please check your Moonshot API key.' };
      }
      
      return { valid: false, error: `Validation failed: ${response.status}` };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Validation failed';
      console.warn('[Kimi] Validation error:', message);
      
      if (message.includes('timeout') || message.includes('abort')) {
        return { valid: false, error: 'Request timed out. Please check your internet connection.' };
      }
      
      return { valid: false, error: message };
    }
  });

  // API Key: Clear API key
  handle('api-key:clear', async (_event: IpcMainInvokeEvent) => {
    await deleteApiKey('anthropic');
    console.log('[API Key] Key cleared');
  });

  // OpenCode CLI: Check if installed
  handle('opencode:check', async (_event: IpcMainInvokeEvent) => {
    // E2E test bypass: return mock CLI status when E2E skip auth is enabled
    if (isE2ESkipAuthEnabled()) {
      return {
        installed: true,
        version: '1.0.0-test',
        installCommand: 'npm install -g opencode-ai',
      };
    }

    const installed = await isOpenCodeCliInstalled();
    const version = installed ? await getOpenCodeCliVersion() : null;
    return {
      installed,
      version,
      installCommand: 'npm install -g opencode-ai',
    };
  });

  // OpenCode CLI: Get version
  handle('opencode:version', async (_event: IpcMainInvokeEvent) => {
    return getOpenCodeCliVersion();
  });

  // Model: Get selected model
  handle('model:get', async (_event: IpcMainInvokeEvent) => {
    return getSelectedModel();
  });

  // Model: Set selected model
  handle('model:set', async (_event: IpcMainInvokeEvent, model: SelectedModel) => {
    if (!model || typeof model.provider !== 'string' || typeof model.model !== 'string') {
      throw new Error('Invalid model configuration');
    }
    setSelectedModel(model);
  });

  // Ollama: Test connection and get models
  handle('ollama:test-connection', async (_event: IpcMainInvokeEvent, url: string) => {
    const sanitizedUrl = sanitizeString(url, 'ollamaUrl', 256);

    // Validate URL format and protocol
    try {
      const parsed = new URL(sanitizedUrl);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return { success: false, error: 'Only http and https URLs are allowed' };
      }
    } catch {
      return { success: false, error: 'Invalid URL format' };
    }

    try {
      const response = await fetchWithTimeout(
        `${sanitizedUrl}/api/tags`,
        { method: 'GET' },
        API_KEY_VALIDATION_TIMEOUT_MS
      );

      if (!response.ok) {
        throw new Error(`Ollama returned status ${response.status}`);
      }

      const data = await response.json() as { models?: Array<{ name: string; size: number }> };
      const models: OllamaModel[] = (data.models || []).map((m) => ({
        id: m.name,
        displayName: m.name,
        size: m.size,
      }));

      console.log(`[Ollama] Connection successful, found ${models.length} models`);
      return { success: true, models };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Connection failed';
      console.warn('[Ollama] Connection failed:', message);

      if (error instanceof Error && error.name === 'AbortError') {
        return { success: false, error: 'Connection timed out. Make sure Ollama is running.' };
      }
      return { success: false, error: `Cannot connect to Ollama: ${message}` };
    }
  });

  // Ollama: Get stored config
  handle('ollama:get-config', async (_event: IpcMainInvokeEvent) => {
    return getOllamaConfig();
  });

  // Ollama: Set config
  handle('ollama:set-config', async (_event: IpcMainInvokeEvent, config: OllamaConfig | null) => {
    if (config !== null) {
      if (typeof config.baseUrl !== 'string' || typeof config.enabled !== 'boolean') {
        throw new Error('Invalid Ollama configuration');
      }
      // Validate URL format and protocol
      try {
        const parsed = new URL(config.baseUrl);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          throw new Error('Only http and https URLs are allowed');
        }
      } catch (e) {
        if (e instanceof Error && e.message.includes('http')) {
          throw e; // Re-throw our protocol error
        }
        throw new Error('Invalid base URL format');
      }
      // Validate optional lastValidated if present
      if (config.lastValidated !== undefined && typeof config.lastValidated !== 'number') {
        throw new Error('Invalid Ollama configuration');
      }
      // Validate optional models array if present
      if (config.models !== undefined) {
        if (!Array.isArray(config.models)) {
          throw new Error('Invalid Ollama configuration: models must be an array');
        }
        for (const model of config.models) {
          if (typeof model.id !== 'string' || typeof model.displayName !== 'string' || typeof model.size !== 'number') {
            throw new Error('Invalid Ollama configuration: invalid model format');
          }
        }
      }
    }
    setOllamaConfig(config);
    console.log('[Ollama] Config saved:', config);
  });

  // OpenRouter: Fetch available models
  handle('openrouter:fetch-models', async (_event: IpcMainInvokeEvent) => {
    const apiKey = getApiKey('openrouter');
    if (!apiKey) {
      return { success: false, error: 'No OpenRouter API key configured' };
    }

    try {
      const response = await fetchWithTimeout(
        'https://openrouter.ai/api/v1/models',
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
          },
        },
        API_KEY_VALIDATION_TIMEOUT_MS
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = (errorData as { error?: { message?: string } })?.error?.message || `API returned status ${response.status}`;
        return { success: false, error: errorMessage };
      }

      const data = await response.json() as { data?: Array<{ id: string; name: string; context_length?: number }> };
      const models = (data.data || []).map((m) => {
        // Extract provider from model ID (e.g., "anthropic/claude-3.5-sonnet" -> "anthropic")
        const provider = m.id.split('/')[0] || 'unknown';
        return {
          id: m.id,
          name: m.name || m.id,
          provider,
          contextLength: m.context_length || 0,
        };
      });

      console.log(`[OpenRouter] Fetched ${models.length} models`);
      return { success: true, models };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch models';
      console.warn('[OpenRouter] Fetch failed:', message);

      if (error instanceof Error && error.name === 'AbortError') {
        return { success: false, error: 'Request timed out. Check your internet connection.' };
      }
      return { success: false, error: `Failed to fetch models: ${message}` };
    }
  });

  // LiteLLM: Test connection and fetch models
  handle('litellm:test-connection', async (_event: IpcMainInvokeEvent, url: string, apiKey?: string) => {
    const sanitizedUrl = sanitizeString(url, 'litellmUrl', 256);
    const sanitizedApiKey = apiKey ? sanitizeString(apiKey, 'apiKey', 256) : undefined;

    // Validate URL format and protocol
    try {
      const parsed = new URL(sanitizedUrl);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return { success: false, error: 'Only http and https URLs are allowed' };
      }
    } catch {
      return { success: false, error: 'Invalid URL format' };
    }

    try {
      const headers: Record<string, string> = {};
      if (sanitizedApiKey) {
        headers['Authorization'] = `Bearer ${sanitizedApiKey}`;
      }

      const response = await fetchWithTimeout(
        `${sanitizedUrl}/v1/models`,
        { method: 'GET', headers },
        API_KEY_VALIDATION_TIMEOUT_MS
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = (errorData as { error?: { message?: string } })?.error?.message || `API returned status ${response.status}`;
        return { success: false, error: errorMessage };
      }

      const data = await response.json() as { data?: Array<{ id: string; object: string; created?: number; owned_by?: string }> };
      const models = (data.data || []).map((m) => {
        // Extract provider from model ID (e.g., "openai/gpt-4" -> "openai")
        const provider = m.id.split('/')[0] || m.owned_by || 'unknown';
        return {
          id: m.id,
          name: m.id, // LiteLLM uses id as name
          provider,
          contextLength: 0, // LiteLLM doesn't provide this in /v1/models
        };
      });

      console.log(`[LiteLLM] Connection successful, found ${models.length} models`);
      return { success: true, models };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Connection failed';
      console.warn('[LiteLLM] Connection failed:', message);

      if (error instanceof Error && error.name === 'AbortError') {
        return { success: false, error: 'Connection timed out. Make sure LiteLLM proxy is running.' };
      }
      return { success: false, error: `Cannot connect to LiteLLM: ${message}` };
    }
  });

  // LiteLLM: Fetch models from configured proxy
  handle('litellm:fetch-models', async (_event: IpcMainInvokeEvent) => {
    const config = getLiteLLMConfig();
    if (!config || !config.baseUrl) {
      return { success: false, error: 'No LiteLLM proxy configured' };
    }

    const apiKey = getApiKey('litellm');

    try {
      const headers: Record<string, string> = {};
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      const response = await fetchWithTimeout(
        `${config.baseUrl}/v1/models`,
        { method: 'GET', headers },
        API_KEY_VALIDATION_TIMEOUT_MS
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = (errorData as { error?: { message?: string } })?.error?.message || `API returned status ${response.status}`;
        return { success: false, error: errorMessage };
      }

      const data = await response.json() as { data?: Array<{ id: string; object: string; created?: number; owned_by?: string }> };
      const models = (data.data || []).map((m) => {
        // Extract provider from model ID (e.g., "anthropic/claude-sonnet" -> "anthropic")
        const parts = m.id.split('/');
        const provider = parts.length > 1 ? parts[0] : (m.owned_by !== 'openai' ? m.owned_by : 'unknown') || 'unknown';

        // Generate display name (e.g., "anthropic/claude-sonnet" -> "Anthropic: Claude Sonnet")
        const modelPart = parts.length > 1 ? parts.slice(1).join('/') : m.id;
        const providerDisplay = provider.charAt(0).toUpperCase() + provider.slice(1);
        const modelDisplay = modelPart
          .split('-')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
        const displayName = parts.length > 1 ? `${providerDisplay}: ${modelDisplay}` : modelDisplay;

        return {
          id: m.id,
          name: displayName,
          provider,
          contextLength: 0,
        };
      });

      console.log(`[LiteLLM] Fetched ${models.length} models`);
      return { success: true, models };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch models';
      console.warn('[LiteLLM] Fetch failed:', message);

      if (error instanceof Error && error.name === 'AbortError') {
        return { success: false, error: 'Request timed out. Check your LiteLLM proxy.' };
      }
      return { success: false, error: `Failed to fetch models: ${message}` };
    }
  });

  // LiteLLM: Get stored config
  handle('litellm:get-config', async (_event: IpcMainInvokeEvent) => {
    return getLiteLLMConfig();
  });

  // LiteLLM: Set config
  handle('litellm:set-config', async (_event: IpcMainInvokeEvent, config: LiteLLMConfig | null) => {
    if (config !== null) {
      if (typeof config.baseUrl !== 'string' || typeof config.enabled !== 'boolean') {
        throw new Error('Invalid LiteLLM configuration');
      }
      // Validate URL format and protocol
      try {
        const parsed = new URL(config.baseUrl);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          throw new Error('Only http and https URLs are allowed');
        }
      } catch (e) {
        if (e instanceof Error && e.message.includes('http')) {
          throw e; // Re-throw our protocol error
        }
        throw new Error('Invalid base URL format');
      }
      // Validate optional lastValidated if present
      if (config.lastValidated !== undefined && typeof config.lastValidated !== 'number') {
        throw new Error('Invalid LiteLLM configuration');
      }
      // Validate optional models array if present
      if (config.models !== undefined) {
        if (!Array.isArray(config.models)) {
          throw new Error('Invalid LiteLLM configuration: models must be an array');
        }
        for (const model of config.models) {
          if (typeof model.id !== 'string' || typeof model.name !== 'string' || typeof model.provider !== 'string') {
            throw new Error('Invalid LiteLLM configuration: invalid model format');
          }
        }
      }
    }
    setLiteLLMConfig(config);
    console.log('[LiteLLM] Config saved:', config);
  });

  // API Keys: Get all API keys (with masked values)
  handle('api-keys:all', async (_event: IpcMainInvokeEvent) => {
    const keys = await getAllApiKeys();
    // Return masked versions for UI
    const masked: Record<string, { exists: boolean; prefix?: string }> = {};
    for (const [provider, key] of Object.entries(keys)) {
      masked[provider] = {
        exists: Boolean(key),
        prefix: key ? key.substring(0, 8) + '...' : undefined,
      };
    }
    return masked;
  });

  // API Keys: Check if any key exists
  handle('api-keys:has-any', async (_event: IpcMainInvokeEvent) => {
    // In E2E mock mode, pretend we have API keys
    if (isMockTaskEventsEnabled()) {
      return true;
    }
    return hasAnyApiKey();
  });

  // Settings: Get debug mode setting
  handle('settings:debug-mode', async (_event: IpcMainInvokeEvent) => {
    return getDebugMode();
  });

  // Settings: Set debug mode setting
  handle('settings:set-debug-mode', async (_event: IpcMainInvokeEvent, enabled: boolean) => {
    if (typeof enabled !== 'boolean') {
      throw new Error('Invalid debug mode flag');
    }
    setDebugMode(enabled);
    // Broadcast the change to all renderer windows
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('settings:debug-mode-changed', { enabled });
    }
  });

  // Settings: Get all app settings
  handle('settings:app-settings', async (_event: IpcMainInvokeEvent) => {
    return getAppSettings();
  });

  // Onboarding: Get onboarding complete status
  // Also checks for existing task history to handle upgrades from pre-onboarding versions
  handle('onboarding:complete', async (_event: IpcMainInvokeEvent) => {
    // E2E test bypass: skip onboarding when E2E skip auth is enabled
    if (isE2ESkipAuthEnabled()) {
      return true;
    }

    // If onboarding is already marked complete, return true
    if (getOnboardingComplete()) {
      return true;
    }

    // Check if this is an existing user (has task history)
    // If so, mark onboarding as complete and skip the wizard
    const tasks = getTasks();
    if (tasks.length > 0) {
      setOnboardingComplete(true);
      return true;
    }

    return false;
  });

  // Onboarding: Set onboarding complete status
  handle('onboarding:set-complete', async (_event: IpcMainInvokeEvent, complete: boolean) => {
    setOnboardingComplete(complete);
  });

  // Shell: Open URL in external browser
  // Only allows http/https URLs for security
  handle('shell:open-external', async (_event: IpcMainInvokeEvent, url: string) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('Only http and https URLs are allowed');
      }
      await shell.openExternal(url);
    } catch (error) {
      console.error('Failed to open external URL:', error);
      throw error;
    }
  });

  // Log event handler - now just returns ok (no external logging)
  handle(
    'log:event',
    async (_event: IpcMainInvokeEvent, _payload: { level?: string; message?: string; context?: Record<string, unknown> }) => {
      // No-op: external logging removed
      return { ok: true };
    }
  );

  // Provider Settings
  handle('provider-settings:get', async () => {
    return getProviderSettings();
  });

  handle('provider-settings:set-active', async (_event: IpcMainInvokeEvent, providerId: ProviderId | null) => {
    setActiveProvider(providerId);
  });

  handle('provider-settings:get-connected', async (_event: IpcMainInvokeEvent, providerId: ProviderId) => {
    return getConnectedProvider(providerId);
  });

  handle('provider-settings:set-connected', async (_event: IpcMainInvokeEvent, providerId: ProviderId, provider: ConnectedProvider) => {
    setConnectedProvider(providerId, provider);
  });

  handle('provider-settings:remove-connected', async (_event: IpcMainInvokeEvent, providerId: ProviderId) => {
    removeConnectedProvider(providerId);
  });

  handle('provider-settings:update-model', async (_event: IpcMainInvokeEvent, providerId: ProviderId, modelId: string | null) => {
    updateProviderModel(providerId, modelId);
  });

  handle('provider-settings:set-debug', async (_event: IpcMainInvokeEvent, enabled: boolean) => {
    setProviderDebugMode(enabled);
  });

  handle('provider-settings:get-debug', async () => {
    return getProviderDebugMode();
  });

  // ============================================
  // App Settings Handlers
  // ============================================

  // Get Claude SDK setting
  handle('settings:get-use-claude-sdk', async () => {
    const { getUseClaudeSdk } = await import('../store/appSettings');
    return getUseClaudeSdk();
  });

  // Set Claude SDK setting
  handle('settings:set-use-claude-sdk', async (_event: IpcMainInvokeEvent, enabled: boolean) => {
    const { setUseClaudeSdk } = await import('../store/appSettings');
    setUseClaudeSdk(enabled);
    return { success: true };
  });

  // ============================================
  // Brand Memory Handlers
  // ============================================

  // Brand: Save brand profile
  handle('brand:save', async (_event: IpcMainInvokeEvent, profile: unknown) => {
    const { saveBrandProfile } = await import('../store/brandMemory');
    saveBrandProfile(profile as import('@shopos/shared').BrandProfile);
    return { success: true };
  });

  // Brand: Get active brand profile
  handle('brand:get-active', async () => {
    const { getActiveBrandProfile } = await import('../store/brandMemory');
    return getActiveBrandProfile();
  });

  // Brand: Get brand profile by ID
  handle('brand:get', async (_event: IpcMainInvokeEvent, id: string) => {
    const { getBrandProfile } = await import('../store/brandMemory');
    return getBrandProfile(id);
  });

  // Brand: List all brand profiles
  handle('brand:list', async () => {
    const { getAllBrandProfiles } = await import('../store/brandMemory');
    return getAllBrandProfiles();
  });

  // Brand: Update brand profile
  handle('brand:update', async (_event: IpcMainInvokeEvent, id: string, updates: unknown) => {
    const { updateBrandProfile } = await import('../store/brandMemory');
    updateBrandProfile(id, updates as Partial<import('@shopos/shared').BrandProfile>);
    return { success: true };
  });

  // Brand: Delete brand profile
  handle('brand:delete', async (_event: IpcMainInvokeEvent, id: string) => {
    const { deleteBrandProfile } = await import('../store/brandMemory');
    deleteBrandProfile(id);
    return { success: true };
  });

  // Brand: Set active brand profile
  handle('brand:set-active', async (_event: IpcMainInvokeEvent, id: string) => {
    const { setActiveBrandProfile } = await import('../store/brandMemory');
    setActiveBrandProfile(id);
    return { success: true };
  });

  // Brand: Check if any brand profile exists
  handle('brand:has-profile', async () => {
    const { hasBrandProfile } = await import('../store/brandMemory');
    return hasBrandProfile();
  });

  // Brand: Get brand context for prompt injection
  handle('brand:get-context', async (_event: IpcMainInvokeEvent, brandId?: string) => {
    const { generateBrandContext } = await import('../store/brandMemory');
    return generateBrandContext(brandId);
  });

  // Brand: Add example to brand memory
  handle('brand:add-example', async (_event: IpcMainInvokeEvent, brandId: string, exampleType: string, inputText: string | null, outputText: string, rating?: number) => {
    const { addBrandExample } = await import('../store/brandMemory');
    addBrandExample(brandId, exampleType, inputText, outputText, rating);
    return { success: true };
  });

  // Brand: Import brand memory data
  handle('brand:import-memory', async (_event: IpcMainInvokeEvent, brandId: string, memoryData: unknown) => {
    const { importBrandMemory } = await import('../store/brandMemory');
    return importBrandMemory(brandId, memoryData as import('@shopos/shared').BrandMemory);
  });

  // Brand: Get brand memory
  handle('brand:get-memory', async (_event: IpcMainInvokeEvent, brandId?: string) => {
    const { getBrandMemory, getActiveBrandMemory } = await import('../store/brandMemory');
    if (brandId) {
      return getBrandMemory(brandId);
    }
    return getActiveBrandMemory();
  });

  // ============================================
  // File Dialog Handlers
  // ============================================

  // Dialog: Open file picker
  handle('dialog:open-file', async () => {
    const { dialog } = await import('electron');
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: 'All Files', extensions: ['*'] },
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] },
      ],
    });
    return { canceled: result.canceled, filePaths: result.filePaths };
  });

  // Dialog: Open JSON file picker (for brand memory import)
  handle('dialog:open-json', async () => {
    const { dialog } = await import('electron');
    const fs = await import('fs');
    
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: 'JSON Files', extensions: ['json'] },
      ],
    });
    
    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true, filePath: null };
    }
    
    const filePath = result.filePaths[0];
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(content);
      return { canceled: false, filePath, data };
    } catch (error) {
      console.error('[Dialog] Failed to read JSON file:', error);
      return { canceled: false, filePath, data: null, error: 'Failed to parse JSON file' };
    }
  });

  // Shell: Open path with system default app
  handle('shell:open-path', async (_event: IpcMainInvokeEvent, filePath: string) => {
    return shell.openPath(filePath);
  });

  // Media: Load local file as data URL
  handle('media:load-local-file', async (_event: IpcMainInvokeEvent, filePath: string) => {
    const fs = await import('fs');
    const path = await import('path');
    
    try {
      // Resolve real path (handle symlinks like /tmp -> /private/tmp on macOS)
      let finalPath = filePath;
      try {
        finalPath = fs.realpathSync(filePath);
      } catch (err) {
        // Fallback to original path
      }

      const buffer = fs.readFileSync(finalPath);
      const ext = path.extname(finalPath).toLowerCase();
      const fileName = path.basename(finalPath);
      
      // Determine MIME type
      const mimeTypes: Record<string, string> = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.svg': 'image/svg+xml',
        '.mp4': 'video/mp4',
        '.webm': 'video/webm',
        '.mov': 'video/quicktime',
        '.pdf': 'application/pdf',
      };
      
      const mimeType = mimeTypes[ext] || 'application/octet-stream';
      const base64 = buffer.toString('base64');
      const dataUrl = `data:${mimeType};base64,${base64}`;
      
      return {
        dataUrl,
        mimeType,
        size: buffer.length,
        fileName,
      };
    } catch (error) {
      console.error('[Media] Failed to load local file:', error);
      throw new Error(`Failed to load file: ${filePath}`);
    }
  });

  // ============================================
  // Shopify Handlers
  // ============================================

  // Shopify: Get connection status
  handle('shopify:status', async () => {
    const { getShopifyCredentials } = await import('../store/secureStorage');
    const credentials = getShopifyCredentials();
    if (credentials?.shopDomain && credentials?.accessToken) {
      return { connected: true, shopDomain: credentials.shopDomain };
    }
    return { connected: false };
  });

  // Shopify: Connect (save credentials)
  handle('shopify:connect', async (_event: IpcMainInvokeEvent, credentials: { shopDomain: string; accessToken: string }) => {
    const { storeShopifyCredentials } = await import('../store/secureStorage');
    storeShopifyCredentials({ shopDomain: credentials.shopDomain, accessToken: credentials.accessToken });
    return { success: true, shopDomain: credentials.shopDomain };
  });

  // Shopify: Disconnect (remove credentials)
  handle('shopify:disconnect', async () => {
    const { deleteApiKey } = await import('../store/secureStorage');
    deleteApiKey('shopify');
    return { success: true };
  });

  // Shopify: Test connection with provided or stored credentials
  handle('shopify:test-connection', async (_event: IpcMainInvokeEvent, credentials?: { shopDomain: string; accessToken: string }) => {
    const { getShopifyCredentials } = await import('../store/secureStorage');
    
    // Use provided credentials or fetch stored ones
    let shopDomain: string;
    let accessToken: string;
    
    if (credentials) {
      shopDomain = credentials.shopDomain;
      accessToken = credentials.accessToken;
    } else {
      const stored = getShopifyCredentials();
      if (!stored?.shopDomain || !stored?.accessToken) {
        return { success: false, error: 'No Shopify credentials configured' };
      }
      shopDomain = stored.shopDomain;
      accessToken = stored.accessToken;
    }

    try {
      // Test the connection by fetching shop info
      const cleanDomain = shopDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');
      const response = await fetch(`https://${cleanDomain}/admin/api/2024-01/shop.json`, {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        return { success: false, error: `Shopify API error: ${response.status} - ${errorText}` };
      }

      const data = await response.json();
      return {
        success: true,
        shop: {
          name: data.shop?.name || 'Unknown',
          domain: data.shop?.domain || cleanDomain,
          email: data.shop?.email || '',
        },
      };
    } catch (error) {
      return { success: false, error: `Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}` };
    }
  });

  // ============================================
  // Space Runtime Handlers
  // ============================================

  // Space Runtime: Match prompt to space
  handle('space-runtime:match', async (_event: IpcMainInvokeEvent, prompt: string) => {
    const { matchPromptToSpaceAsync } = await import('../spaces/space-selector');
    return matchPromptToSpaceAsync(prompt);
  });

  // Space Runtime: Get suggestions for a prompt
  handle('space-runtime:suggestions', async (_event: IpcMainInvokeEvent, prompt: string) => {
    const { getSuggestedSpaces } = await import('../spaces/space-selector');
    return getSuggestedSpaces(prompt);
  });

  // Space Runtime: Check if runtime is available
  handle('space-runtime:is-available', async () => {
    const { isSpaceRuntimeAvailable } = await import('../spaces/space-runtime-client');
    return isSpaceRuntimeAvailable();
  });

  // Space Runtime: List spaces from remote
  handle('space-runtime:list-remote', async () => {
    const { listSpacesFromRuntime } = await import('../spaces/space-runtime-client');
    return listSpacesFromRuntime();
  });

  // Space Runtime: Execute a space
  handle('space-runtime:execute', async (_event: IpcMainInvokeEvent, spaceId: string, inputs: Record<string, unknown>) => {
    const { executeSpace } = await import('../spaces/space-runtime-client');
    return executeSpace(spaceId, inputs);
  });

  // Space Runtime: Get local registry
  handle('space-runtime:registry', async () => {
    const { SPACE_REGISTRY } = await import('../spaces/space-registry');
    return SPACE_REGISTRY;
  });

  // ============================================
  // Brand Asset Upload Handlers
  // ============================================

  // Brand: Upload asset (logo, character, scene, site-image) to S3
  handle('brand:upload-asset', async (
    _event: IpcMainInvokeEvent,
    brandId: string,
    assetType: 'logos' | 'characters' | 'scenes' | 'site-images',
    filename: string,
    contentType: string,
    imageBase64: string
  ) => {
    const { uploadBrandAsset } = await import('../spaces/space-runtime-client');
    return uploadBrandAsset({
      brandId,
      assetType,
      filename,
      contentType,
      imageBase64,
    });
  });

  // ============================================
  // Chat Attachment Upload Handlers
  // ============================================

  // Attachment: Upload chat attachment to S3 (from file path)
  handle('attachment:upload', async (
    _event: IpcMainInvokeEvent,
    taskId: string,
    filePath: string
  ) => {
    const fs = await import('fs');
    const path = await import('path');
    const { uploadChatAttachment } = await import('../spaces/space-runtime-client');
    
    try {
      const buffer = fs.readFileSync(filePath);
      const base64Data = buffer.toString('base64');
      const filename = path.basename(filePath);
      const ext = path.extname(filePath).toLowerCase();
      
      // Determine MIME type
      const mimeTypes: Record<string, string> = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.svg': 'image/svg+xml',
        '.pdf': 'application/pdf',
        '.json': 'application/json',
        '.md': 'text/markdown',
        '.txt': 'text/plain',
        '.csv': 'text/csv',
      };
      const contentType = mimeTypes[ext] || 'application/octet-stream';
      
      return uploadChatAttachment({
        taskId,
        filename,
        contentType,
        base64Data,
      });
    } catch (error) {
      console.error('[Attachment] Failed to upload file:', error);
      return {
        success: false,
        error: `Failed to upload file: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  });

  // Attachment: Upload chat attachment to S3 (from base64 data)
  handle('attachment:upload-base64', async (
    _event: IpcMainInvokeEvent,
    taskId: string,
    filename: string,
    contentType: string,
    base64Data: string
  ) => {
    const { uploadChatAttachment } = await import('../spaces/space-runtime-client');
    
    try {
      const base64Size = base64Data.length;
      console.log(`[Attachment] Uploading ${filename} (${contentType}), base64 size: ${(base64Size / 1024 / 1024).toFixed(2)}MB`);
      
      // Check if payload might exceed Lambda limit (6MB for sync, but we use ~4MB as safe limit)
      const MAX_PAYLOAD_SIZE = 4 * 1024 * 1024; // 4MB
      if (base64Size > MAX_PAYLOAD_SIZE) {
        console.error(`[Attachment] File too large for upload: ${(base64Size / 1024 / 1024).toFixed(2)}MB exceeds ${MAX_PAYLOAD_SIZE / 1024 / 1024}MB limit`);
        return {
          success: false,
          error: `File too large for upload. Maximum size is ~3MB (your file is ${(base64Size / 1024 / 1024).toFixed(1)}MB after encoding). Please use a smaller image.`,
        };
      }
      
      const result = await uploadChatAttachment({
        taskId,
        filename,
        contentType,
        base64Data,
      });
      
      console.log(`[Attachment] Upload result for ${filename}:`, result.success ? 'success' : result.error);
      return result;
    } catch (error) {
      console.error('[Attachment] Failed to upload base64 data:', error);
      return {
        success: false,
        error: `Failed to upload: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  });

  // Attachment: Upload generated image to S3 for persistence
  handle('generated-image:upload', async (
    _event: IpcMainInvokeEvent,
    taskId: string,
    localPath: string
  ) => {
    const fs = await import('fs');
    const path = await import('path');
    const { uploadGeneratedImage } = await import('../spaces/space-runtime-client');
    
    try {
      const buffer = fs.readFileSync(localPath);
      const base64Data = buffer.toString('base64');
      const filename = path.basename(localPath);
      
      return uploadGeneratedImage({
        taskId,
        filename,
        base64Data,
      });
    } catch (error) {
      console.error('[GeneratedImage] Failed to upload:', error);
      return {
        success: false,
        error: `Failed to upload generated image: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  });

}

function createTaskId(): string {
  return `task_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function createMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Validate that a base64 data URL contains actual image data
 * Returns false for malformed data URLs like "data:image/png;base64,null" or very short data
 */
function isValidBase64DataUrl(dataUrl: string): boolean {
  // Extract the base64 portion after the comma
  const commaIndex = dataUrl.indexOf(',');
  if (commaIndex === -1) return false;
  
  const base64Data = dataUrl.substring(commaIndex + 1);
  
  // Reject null, empty, or very short base64 (real images are much larger)
  if (!base64Data || 
      base64Data === 'null' || 
      base64Data === 'undefined' ||
      base64Data.length < 100) {
    console.warn(`[extractScreenshots] Rejected malformed base64 data URL (data length: ${base64Data?.length || 0})`);
    return false;
  }
  
  // Valid PNG base64 starts with iVBORw0 (PNG header)
  // Valid JPEG base64 starts with /9j/ (JPEG header)
  // Valid WebP base64 starts with UklGR (RIFF header)
  const validPrefixes = ['iVBORw0', '/9j/', 'UklGR'];
  const hasValidPrefix = validPrefixes.some(prefix => base64Data.startsWith(prefix));
  
  if (!hasValidPrefix) {
    console.warn(`[extractScreenshots] Rejected base64 data URL with invalid image header`);
    return false;
  }
  
  return true;
}

/**
 * Extract base64 screenshots from tool output
 * Returns cleaned text (with images replaced by placeholders) and extracted attachments
 */
function extractScreenshots(output: string): {
  cleanedText: string;
  attachments: Array<{ type: 'screenshot' | 'json'; data: string; label?: string }>;
} {
  const attachments: Array<{ type: 'screenshot' | 'json'; data: string; label?: string }> = [];

  // Match data URLs (data:image/png;base64,...)
  const dataUrlRegex = /data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+/g;
  let match;
  while ((match = dataUrlRegex.exec(output)) !== null) {
    const dataUrl = match[0];
    // Validate the base64 data before adding
    if (isValidBase64DataUrl(dataUrl)) {
      attachments.push({
        type: 'screenshot',
        data: dataUrl,
        label: 'Browser screenshot',
      });
    }
  }

  // Also check for raw base64 PNG (starts with iVBORw0)
  // This pattern matches PNG base64 that isn't already a data URL
  const rawBase64Regex = /(?<![;,])(?:^|["\s])?(iVBORw0[A-Za-z0-9+/=]{100,})(?:["\s]|$)/g;
  while ((match = rawBase64Regex.exec(output)) !== null) {
    const base64Data = match[1];
    // Wrap in data URL if it's valid base64 PNG
    if (base64Data && base64Data.length > 100) {
      attachments.push({
        type: 'screenshot',
        data: `data:image/png;base64,${base64Data}`,
        label: 'Browser screenshot',
      });
    }
  }

  // Clean the text - replace image data with placeholder
  let cleanedText = output
    .replace(dataUrlRegex, '[Screenshot captured]')
    .replace(rawBase64Regex, '[Screenshot captured]');

  // Also clean up common JSON wrappers around screenshots
  cleanedText = cleanedText
    .replace(/"[Screenshot captured]"/g, '"[Screenshot]"')
    .replace(/\[Screenshot captured\]\[Screenshot captured\]/g, '[Screenshot captured]');

  return { cleanedText, attachments };
}

/**
 * Sanitize tool output to remove technical details that confuse users
 */
function sanitizeToolOutput(text: string, isError: boolean): string {
  let result = text;

  // Strip any remaining ANSI escape codes
  result = result.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
  // Also strip any leftover escape sequences that may have been partially matched
  result = result.replace(/\x1B\[2m|\x1B\[22m|\x1B\[0m/g, '');

  // Remove WebSocket URLs
  result = result.replace(/ws:\/\/[^\s\]]+/g, '[connection]');

  // Remove "Call log:" sections and everything after
  result = result.replace(/\s*Call log:[\s\S]*/i, '');

  // Simplify common Playwright/CDP errors for users
  if (isError) {
    // Timeout errors: extract just the timeout duration
    const timeoutMatch = result.match(/timed? ?out after (\d+)ms/i);
    if (timeoutMatch) {
      const seconds = Math.round(parseInt(timeoutMatch[1]) / 1000);
      return `Timed out after ${seconds}s`;
    }

    // "browserType.connectOverCDP: Protocol error (X): Y" → "Y"
    const protocolMatch = result.match(/Protocol error \([^)]+\):\s*(.+)/i);
    if (protocolMatch) {
      result = protocolMatch[1].trim();
    }

    // "Error executing code: X" → just the meaningful part
    result = result.replace(/^Error executing code:\s*/i, '');

    // Clean up "browserType.connectOverCDP:" prefix
    result = result.replace(/browserType\.connectOverCDP:\s*/i, '');

    // Remove stack traces (lines starting with "at ")
    result = result.replace(/\s+at\s+.+/g, '');

    // Remove error class names like "CodeExecutionTimeoutError:"
    result = result.replace(/\w+Error:\s*/g, '');
  }

  return result.trim();
}

/**
 * Regex to detect local file paths for generated images in /tmp/
 * Matches patterns like: /tmp/generated_20240122_143052.png
 */
const LOCAL_IMAGE_PATH_REGEX = /\/tmp\/[^\s"'<>]+\.(png|jpg|jpeg|gif|webp)/gi;

/**
 * Process message content to upload local generated images to S3
 * Returns the content with local paths replaced by S3 URLs
 */
async function processGeneratedImages(content: string, taskId: string): Promise<string> {
  // Find all local image paths in the content
  const matches = content.match(LOCAL_IMAGE_PATH_REGEX);
  if (!matches || matches.length === 0) {
    return content;
  }

  // Dedupe matches (same path might appear multiple times)
  const uniquePaths = [...new Set(matches)];
  
  let processedContent = content;
  const uploadedImages: Array<{ filename: string; s3Url: string }> = [];
  
  for (const localPath of uniquePaths) {
    try {
      // Check if file exists
      if (!fs.existsSync(localPath)) {
        console.log(`[IPC handlers] Generated image not found: ${localPath}`);
        continue;
      }

      // Read file and convert to base64
      const fileBuffer = fs.readFileSync(localPath);
      
      // Skip corrupt/empty files (real images are > 10KB)
      if (fileBuffer.length < 10000) {
        console.warn(`[IPC handlers] Skipping corrupt image (${fileBuffer.length} bytes): ${localPath}`);
        continue;
      }
      
      const base64Data = fileBuffer.toString('base64');
      const filename = path.basename(localPath);

      console.log(`[IPC handlers] Uploading generated image: ${localPath}`);

      // Upload to S3
      const result = await uploadGeneratedImage({
        taskId,
        filename,
        base64Data,
      });

      if (result.success && result.url) {
        // Replace local path with S3 URL in content
        processedContent = processedContent.split(localPath).join(result.url);
        console.log(`[IPC handlers] Replaced ${localPath} with ${result.url}`);
        // Track for URL summary (agent needs this to use S3 URLs with Shopify)
        uploadedImages.push({ filename, s3Url: result.url });
      } else {
        console.warn(`[IPC handlers] Failed to upload generated image: ${result.error}`);
      }
    } catch (error) {
      console.error(`[IPC handlers] Error processing generated image ${localPath}:`, error);
    }
  }

  // Append S3 URL summary so agent sees URLs in conversation history
  // Uses markdown link syntax: clean for users, agent can extract URLs
  if (uploadedImages.length > 0) {
    const urlSummary = uploadedImages
      .map(img => `- [${img.filename}](${img.s3Url})`)
      .join('\n');
    processedContent += `\n\n**Generated Images:**\n${urlSummary}`;
  }

  return processedContent;
}

function toTaskMessage(message: OpenCodeMessage): TaskMessage | null {
  // OpenCode format: step_start, text, tool_call, tool_use, tool_result, step_finish

  // Handle text content
  if (message.type === 'text') {
    if (message.part.text) {
      return {
        id: createMessageId(),
        type: 'assistant',
        content: message.part.text,
        timestamp: new Date().toISOString(),
      };
    }
    return null;
  }

  // Handle tool calls (legacy format - just shows tool is starting)
  if (message.type === 'tool_call') {
    return {
      id: createMessageId(),
      type: 'tool',
      content: `Using tool: ${message.part.tool}`,
      toolName: message.part.tool,
      toolInput: message.part.input,
      timestamp: new Date().toISOString(),
    };
  }

  // Handle tool_use messages (combined tool call + result)
  if (message.type === 'tool_use') {
    const toolUseMsg = message as import('@shopos/shared').OpenCodeToolUseMessage;
    const toolName = toolUseMsg.part.tool || 'unknown';
    const toolInput = toolUseMsg.part.state?.input;
    const toolOutput = toolUseMsg.part.state?.output || '';
    const status = toolUseMsg.part.state?.status;

    // For running status, show the tool description as a thinking message
    // This helps users understand what the agent is doing (especially for Gemini which doesn't emit text messages)
    if (status === 'running' || status === 'pending') {
      const description = (toolInput as { description?: string })?.description;
      if (description) {
        // Emit as assistant message (thinking) so user sees what agent is planning
        return {
          id: createMessageId(),
          type: 'assistant',
          content: description,
          timestamp: new Date().toISOString(),
          subtype: 'thinking',
        };
      }
      // For tools without description, show a brief "Using X" message
      return {
        id: createMessageId(),
        type: 'tool',
        content: `Using ${toolName}...`,
        toolName,
        toolInput,
        toolStatus: 'running',
        timestamp: new Date().toISOString(),
      };
    }

    // For completed/error status, show the result
    if (status === 'completed' || status === 'error') {
      // Extract screenshots from tool output
      const { cleanedText, attachments } = extractScreenshots(toolOutput);

      // Sanitize output - more aggressive for errors
      const isError = status === 'error';
      const sanitizedText = sanitizeToolOutput(cleanedText, isError);

      // Truncate long outputs for display
      const displayText = sanitizedText.length > 500
        ? sanitizedText.substring(0, 500) + '...'
        : sanitizedText;

      return {
        id: createMessageId(),
        type: 'tool',
        content: displayText || `Tool ${toolName} ${status}`,
        toolName,
        toolInput,
        toolStatus: status,
        timestamp: new Date().toISOString(),
        attachments: attachments.length > 0 ? attachments : undefined,
      };
    }
    return null;
  }

  return null;
}
