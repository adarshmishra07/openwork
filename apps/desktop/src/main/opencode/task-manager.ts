/**
 * TaskManager - Manages multiple concurrent agent task executions
 *
 * This class implements a process manager pattern to support true parallel
 * session execution. Each task gets its own adapter instance with
 * isolated state and event handling.
 * 
 * Supports two adapters:
 * - OpenCodeServerAdapter (HTTP/SSE-based) - primary, real-time streaming
 * - OpenCodeAdapter (PTY-based) - fallback, legacy
 * 
 * The server adapter is preferred because it provides true real-time
 * text streaming via SSE, rather than batched text messages.
 */

import { OpenCodeAdapter, isOpenCodeCliInstalled, OpenCodeCliNotFoundError } from './adapter';
import { 
  OpenCodeServerAdapter, 
  getServerAdapter, 
  isServerAdapterRunning,
  disposeServerAdapter,
} from './server-adapter';
import { getSkillsPath } from './config-generator';
import { getNpxPath, getBundledNodePaths } from '../utils/bundled-node';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import {
  DEV_BROWSER_PORT,
  type TaskConfig,
  type Task,
  type TaskResult,
  type TaskStatus,
  type OpenCodeMessage,
  type PermissionRequest,
} from '@shopos/shared';

/**
 * Check if system Chrome is installed
 */
function isSystemChromeInstalled(): boolean {
  if (process.platform === 'darwin') {
    return fs.existsSync('/Applications/Google Chrome.app');
  } else if (process.platform === 'win32') {
    // Check common Windows Chrome locations
    const programFiles = process.env['PROGRAMFILES'] || 'C:\\Program Files';
    const programFilesX86 = process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)';
    return (
      fs.existsSync(path.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe')) ||
      fs.existsSync(path.join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'))
    );
  }
  // Linux - check common paths
  return fs.existsSync('/usr/bin/google-chrome') || fs.existsSync('/usr/bin/chromium-browser');
}

/**
 * Check if Playwright Chromium is installed
 */
function isPlaywrightInstalled(): boolean {
  const homeDir = os.homedir();
  const possiblePaths = [
    path.join(homeDir, 'Library', 'Caches', 'ms-playwright'), // macOS
    path.join(homeDir, '.cache', 'ms-playwright'), // Linux
  ];

  if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
    possiblePaths.unshift(path.join(process.env.LOCALAPPDATA, 'ms-playwright'));
  }

  for (const playwrightDir of possiblePaths) {
    if (fs.existsSync(playwrightDir)) {
      try {
        const entries = fs.readdirSync(playwrightDir);
        if (entries.some((entry) => entry.startsWith('chromium'))) {
          return true;
        }
      } catch {
        continue;
      }
    }
  }
  return false;
}

/**
 * Install Playwright Chromium browser.
 * Returns a promise that resolves when installation is complete.
 * Uses bundled Node.js to ensure it works in packaged app.
 */
async function installPlaywrightChromium(
  onProgress?: (message: string) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const skillsPath = getSkillsPath();
    const devBrowserDir = path.join(skillsPath, 'dev-browser');

    // Use bundled npx for packaged app compatibility
    const npxPath = getNpxPath();
    const bundledPaths = getBundledNodePaths();

    console.log(`[TaskManager] Installing Playwright Chromium using bundled npx: ${npxPath}`);
    onProgress?.('Downloading browser...');

    // Build environment with bundled node in PATH
    let spawnEnv: NodeJS.ProcessEnv = { ...process.env };
    if (bundledPaths) {
      const delimiter = process.platform === 'win32' ? ';' : ':';
      spawnEnv.PATH = `${bundledPaths.binDir}${delimiter}${process.env.PATH || ''}`;
    }

    const child = spawn(npxPath, ['playwright', 'install', 'chromium'], {
      cwd: devBrowserDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: spawnEnv,
      shell: process.platform === 'win32',
    });

    child.stdout?.on('data', (data: Buffer) => {
      const line = data.toString().trim();
      if (line) {
        console.log(`[Playwright Install] ${line}`);
        // Send progress info: percentage updates and "Downloading X" messages
        if (line.includes('%') || line.toLowerCase().startsWith('downloading')) {
          onProgress?.(line);
        }
      }
    });

    child.stderr?.on('data', (data: Buffer) => {
      const line = data.toString().trim();
      if (line) {
        console.log(`[Playwright Install] ${line}`);
      }
    });

    child.on('close', (code) => {
      if (code === 0) {
        console.log('[TaskManager] Playwright Chromium installed successfully');
        onProgress?.('Browser installed successfully!');
        resolve();
      } else {
        reject(new Error(`Playwright install failed with code ${code}`));
      }
    });

    child.on('error', (err) => {
      reject(err);
    });
  });
}

// DEV_BROWSER_PORT imported from @shopos/shared

/**
 * Check if the dev-browser server is running and ready
 */
async function isDevBrowserServerReady(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1000);
    const res = await fetch(`http://localhost:${DEV_BROWSER_PORT}`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Wait for the dev-browser server to be ready with polling
 */
async function waitForDevBrowserServer(maxWaitMs = 15000, pollIntervalMs = 500): Promise<boolean> {
  const startTime = Date.now();
  while (Date.now() - startTime < maxWaitMs) {
    if (await isDevBrowserServerReady()) {
      console.log('[TaskManager] Dev-browser server is ready');
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
  }
  console.log('[TaskManager] Dev-browser server not ready after waiting');
  return false;
}

/**
 * Ensure the dev-browser server is running.
 * Called before starting tasks to pre-warm the browser.
 *
 * If neither system Chrome nor Playwright is installed, downloads Playwright first.
 */
async function ensureDevBrowserServer(
  onProgress?: (progress: { stage: string; message?: string }) => void
): Promise<void> {
  // Check if we have a browser available
  const hasChrome = isSystemChromeInstalled();
  const hasPlaywright = isPlaywrightInstalled();

  console.log(`[TaskManager] Browser check: Chrome=${hasChrome}, Playwright=${hasPlaywright}`);

  // If no browser available, install Playwright first
  if (!hasChrome && !hasPlaywright) {
    console.log('[TaskManager] No browser available, installing Playwright Chromium...');
    onProgress?.({
      stage: 'setup',
      message: 'Chrome not found. Downloading browser (one-time setup, ~2 min)...',
    });

    try {
      await installPlaywrightChromium((msg) => {
        onProgress?.({ stage: 'setup', message: msg });
      });
    } catch (error) {
      console.error('[TaskManager] Failed to install Playwright:', error);
      // Don't throw - let agent handle the failure
    }
  }

  // Check if server is already running (skip on macOS to avoid Local Network permission dialog)
  if (process.platform !== 'darwin') {
    if (await isDevBrowserServerReady()) {
      console.log('[TaskManager] Dev-browser server already running');
      return;
    }
  }

  // Now start the server
  try {
    const skillsPath = getSkillsPath();
    const serverScript = path.join(skillsPath, 'dev-browser', 'server.cjs');

    // Build environment with bundled Node.js in PATH
    const bundledPaths = getBundledNodePaths();
    let spawnEnv: NodeJS.ProcessEnv = { ...process.env };
    if (bundledPaths) {
      const delimiter = process.platform === 'win32' ? ';' : ':';
      spawnEnv.PATH = `${bundledPaths.binDir}${delimiter}${process.env.PATH || ''}`;
      spawnEnv.NODE_BIN_PATH = bundledPaths.binDir;
    }

    // Get node executable path
    const nodeExe = bundledPaths?.nodePath || 'node';

    // Spawn server in background (detached, unref to not block)
    // windowsHide: true prevents a console window from appearing on Windows
    const child = spawn(nodeExe, [serverScript], {
      detached: true,
      stdio: 'ignore',
      cwd: path.join(skillsPath, 'dev-browser'),
      env: spawnEnv,
      windowsHide: true,
    });
    child.unref();

    console.log('[TaskManager] Dev-browser server spawn initiated');

    // On Windows, wait for the server to be ready before proceeding
    // (On macOS, the server starts faster and the MCP has its own retry logic)
    if (process.platform === 'win32') {
      console.log('[TaskManager] Waiting for dev-browser server to be ready (Windows)...');
      await waitForDevBrowserServer();
    }
  } catch (error) {
    console.error('[TaskManager] Failed to start dev-browser server:', error);
  }
}

/**
 * Callbacks for task events - scoped to a specific task
 */
export interface TaskCallbacks {
  onMessage: (message: OpenCodeMessage) => void;
  onTextDelta?: (text: string) => void;  // Real-time text streaming (incremental)
  onStreamComplete?: () => void;  // Called when streaming message is complete
  onProgress: (progress: { stage: string; message?: string }) => void;
  onPermissionRequest: (request: PermissionRequest) => void;
  onComplete: (result: TaskResult) => void;
  onError: (error: Error) => void;
  onStatusChange?: (status: TaskStatus) => void;
  onDebug?: (log: { type: string; message: string; data?: unknown }) => void;
}

/**
 * Internal representation of a managed task
 */
interface ManagedTask {
  taskId: string;
  sessionId?: string;  // For server adapter
  adapter?: OpenCodeAdapter;  // For PTY fallback
  callbacks: TaskCallbacks;
  cleanup: () => void;
  createdAt: Date;
  usingServer: boolean; // Track which mode is being used
}

/**
 * Queued task waiting for execution
 */
interface QueuedTask {
  taskId: string;
  config: TaskConfig;
  callbacks: TaskCallbacks;
  createdAt: Date;
}

/**
 * Default maximum number of concurrent tasks
 * Can be configured via constructor
 */
// Max concurrent tasks - reduced from 10 to 4 to prevent overwhelming API rate limits
const DEFAULT_MAX_CONCURRENT_TASKS = 4;

/**
 * TaskManager manages OpenCode CLI task executions with parallel execution
 *
 * Multiple tasks can run concurrently up to maxConcurrentTasks.
 * Each task gets its own isolated session (server mode) or PTY process (fallback).
 */
export class TaskManager {
  private activeTasks: Map<string, ManagedTask> = new Map();
  private taskQueue: QueuedTask[] = [];
  private maxConcurrentTasks: number;
  private serverAdapter: OpenCodeServerAdapter | null = null;
  private useServerMode: boolean = true;
  private serverInitialized: boolean = false;
  private serverInitPromise: Promise<void> | null = null;

  constructor(options?: { maxConcurrentTasks?: number }) {
    this.maxConcurrentTasks = options?.maxConcurrentTasks ?? DEFAULT_MAX_CONCURRENT_TASKS;
  }

  /**
   * Check if server mode (real streaming) is active
   */
  isUsingServerMode(): boolean {
    return this.useServerMode && this.serverAdapter?.isRunning() === true;
  }

  /**
   * Initialize the server adapter (called on first task or app startup)
   */
  async initializeServer(): Promise<void> {
    if (this.serverInitialized) return;
    
    // Prevent concurrent initialization
    if (this.serverInitPromise) {
      return this.serverInitPromise;
    }

    this.serverInitPromise = this._doInitializeServer();
    return this.serverInitPromise;
  }

  private async _doInitializeServer(): Promise<void> {
    try {
      console.log('[TaskManager] Initializing server adapter...');
      this.serverAdapter = getServerAdapter();
      await this.serverAdapter.start();
      this.setupServerEventHandlers();
      this.serverInitialized = true;
      this.useServerMode = true;
      console.log('[TaskManager] Server adapter initialized successfully');
    } catch (error) {
      console.warn('[TaskManager] Server adapter failed to start, will use PTY fallback:', error);
      this.useServerMode = false;
      this.serverInitialized = true; // Mark as initialized even on failure to prevent retries
    }
  }

  /**
   * Setup event handlers for the server adapter
   */
  private setupServerEventHandlers(): void {
    if (!this.serverAdapter) return;

    // Real-time text streaming
    this.serverAdapter.on('text-delta', ({ sessionId, text }) => {
      const taskId = this.serverAdapter?.getTaskIdForSession(sessionId);
      console.log(`[TaskManager:EVENT] text-delta received:`, {
        sessionId,
        taskId,
        textLength: text.length,
        textPreview: text.substring(0, 30),
      });
      if (!taskId) {
        console.log(`[TaskManager:EVENT] No taskId for session ${sessionId}, skipping`);
        return;
      }

      const managedTask = this.activeTasks.get(taskId);
      if (managedTask?.callbacks.onTextDelta) {
        console.log(`[TaskManager:EVENT] Forwarding text-delta to callback`);
        managedTask.callbacks.onTextDelta(text);
      } else {
        console.log(`[TaskManager:EVENT] No onTextDelta callback for task ${taskId}`);
      }
    });

    // Stream complete - mark streaming message as done
    this.serverAdapter.on('stream-complete', ({ sessionId }) => {
      const taskId = this.serverAdapter?.getTaskIdForSession(sessionId);
      console.log(`[TaskManager:EVENT] stream-complete received:`, { sessionId, taskId });
      if (!taskId) return;

      const managedTask = this.activeTasks.get(taskId);
      if (managedTask?.callbacks.onStreamComplete) {
        console.log(`[TaskManager:EVENT] Forwarding stream-complete to callback`);
        managedTask.callbacks.onStreamComplete();
      }
    });

    // Tool messages (not text - text is handled by text-delta/stream-complete)
    this.serverAdapter.on('message', (message) => {
      const sessionId = (message as any).sessionID || (message as any).part?.sessionID;
      const taskId = sessionId ? this.serverAdapter?.getTaskIdForSession(sessionId) : undefined;
      console.log(`[TaskManager:EVENT] message received:`, {
        sessionId,
        taskId,
        messageType: message.type,
      });
      if (!taskId) return;

      // Only forward non-text messages (tools)
      // Text messages are handled by text-delta for real streaming
      if (message.type === 'text') {
        console.log(`[TaskManager:EVENT] Skipping text message (handled by text-delta)`);
        return;
      }

      const managedTask = this.activeTasks.get(taskId);
      if (managedTask) {
        console.log(`[TaskManager:EVENT] Forwarding message to callback`);
        managedTask.callbacks.onMessage(message);
      }
    });

    // Tool usage
    this.serverAdapter.on('tool-use', ({ sessionId, tool, input }) => {
      const taskId = this.serverAdapter?.getTaskIdForSession(sessionId);
      if (!taskId) return;

      const managedTask = this.activeTasks.get(taskId);
      if (managedTask) {
        managedTask.callbacks.onProgress({
          stage: 'tool-use',
          message: `Using ${tool}`,
        });
      }
    });

    // Session status
    this.serverAdapter.on('session-status', ({ sessionId, status, message }) => {
      const taskId = this.serverAdapter?.getTaskIdForSession(sessionId);
      if (!taskId) return;

      const managedTask = this.activeTasks.get(taskId);
      if (managedTask) {
        managedTask.callbacks.onProgress({
          stage: status,
          message: message || status,
        });
      }
    });

    // Completion
    this.serverAdapter.on('complete', ({ sessionId, result }) => {
      const taskId = this.serverAdapter?.getTaskIdForSession(sessionId);
      if (!taskId) return;

      const managedTask = this.activeTasks.get(taskId);
      if (managedTask) {
        managedTask.callbacks.onComplete(result);
        this.cleanupTask(taskId);
        this.processQueue();
      }
    });

    // Errors
    this.serverAdapter.on('error', ({ sessionId, error }) => {
      const taskId = this.serverAdapter?.getTaskIdForSession(sessionId);
      if (!taskId) return;

      const managedTask = this.activeTasks.get(taskId);
      if (managedTask) {
        managedTask.callbacks.onError(new Error(error));
        this.cleanupTask(taskId);
        this.processQueue();
      }
    });

    // Debug
    this.serverAdapter.on('debug', (log) => {
      // Forward to all active tasks (server-level debug)
      for (const task of this.activeTasks.values()) {
        task.callbacks.onDebug?.(log);
      }
    });
  }

  /**
   * Start a new task. Multiple tasks can run in parallel up to maxConcurrentTasks.
   * If at capacity, new tasks are queued and start automatically when a task completes.
   */
  async startTask(
    taskId: string,
    config: TaskConfig,
    callbacks: TaskCallbacks
  ): Promise<Task> {
    // Check if CLI is installed
    const cliInstalled = await isOpenCodeCliInstalled();
    if (!cliInstalled) {
      throw new OpenCodeCliNotFoundError();
    }

    // Initialize server if not already done
    await this.initializeServer();

    // Check if task already exists (either running or queued)
    if (this.activeTasks.has(taskId) || this.taskQueue.some(q => q.taskId === taskId)) {
      throw new Error(`Task ${taskId} is already running or queued`);
    }

    // If at max concurrent tasks, queue this one
    if (this.activeTasks.size >= this.maxConcurrentTasks) {
      console.log(`[TaskManager] At max concurrent tasks (${this.maxConcurrentTasks}). Queueing task ${taskId}`);
      return this.queueTask(taskId, config, callbacks);
    }

    // Execute immediately (parallel execution)
    return this.executeTask(taskId, config, callbacks);
  }

  /**
   * Queue a task for later execution
   */
  private queueTask(
    taskId: string,
    config: TaskConfig,
    callbacks: TaskCallbacks
  ): Task {
    // Check queue limit (allow same number of queued tasks as max concurrent)
    if (this.taskQueue.length >= this.maxConcurrentTasks) {
      throw new Error(
        `Maximum queued tasks (${this.maxConcurrentTasks}) reached. Please wait for tasks to complete.`
      );
    }

    const queuedTask: QueuedTask = {
      taskId,
      config,
      callbacks,
      createdAt: new Date(),
    };

    this.taskQueue.push(queuedTask);
    console.log(`[TaskManager] Task ${taskId} queued. Queue length: ${this.taskQueue.length}`);

    // Return a task object with 'queued' status
    return {
      id: taskId,
      prompt: config.prompt,
      status: 'queued',
      messages: [],
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Execute a task immediately (internal)
   * Uses server adapter (preferred) or PTY adapter (fallback)
   */
  private async executeTask(
    taskId: string,
    config: TaskConfig,
    callbacks: TaskCallbacks
  ): Promise<Task> {
    const usingServer = this.useServerMode && this.serverAdapter?.isRunning();

    console.log(`[TaskManager] Using ${usingServer ? 'Server' : 'PTY'} mode for task ${taskId}`);

    // Create task object immediately so UI can navigate
    const task: Task = {
      id: taskId,
      prompt: config.prompt,
      status: 'running',
      messages: [],
      createdAt: new Date().toISOString(),
    };

    if (usingServer) {
      // Server mode - use HTTP/SSE
      return this.executeTaskWithServer(taskId, config, callbacks, task);
    } else {
      // PTY fallback
      return this.executeTaskWithPty(taskId, config, callbacks, task);
    }
  }

  /**
   * Execute task using server adapter (HTTP/SSE mode)
   */
  private async executeTaskWithServer(
    taskId: string,
    config: TaskConfig,
    callbacks: TaskCallbacks,
    task: Task
  ): Promise<Task> {
    // Create managed task entry
    const managedTask: ManagedTask = {
      taskId,
      callbacks,
      cleanup: () => {
        // Server adapter cleanup is handled by session cleanup
      },
      createdAt: new Date(),
      usingServer: true,
    };
    this.activeTasks.set(taskId, managedTask);

    console.log(`[TaskManager] Executing task ${taskId} with server. Active tasks: ${this.activeTasks.size}`);

    // Start session asynchronously (browser will be started lazily when needed by tools)
    (async () => {
      try {
        // NOTE: Don't call ensureDevBrowserServer() here anymore!
        // The browser will be started lazily when the agent actually uses browser tools.
        // This prevents Chrome from opening for simple text-only tasks like "hi there".
        
        // Create session and send initial message
        const sessionId = await this.serverAdapter!.createSession(taskId, config);
        managedTask.sessionId = sessionId;

        console.log(`[TaskManager] Task ${taskId} session created: ${sessionId}`);
      } catch (error) {
        callbacks.onError(error instanceof Error ? error : new Error(String(error)));
        this.cleanupTask(taskId);
        this.processQueue();
      }
    })();

    return task;
  }

  /**
   * Execute task using PTY adapter (fallback mode)
   */
  private async executeTaskWithPty(
    taskId: string,
    config: TaskConfig,
    callbacks: TaskCallbacks,
    task: Task
  ): Promise<Task> {
    const adapter = new OpenCodeAdapter(taskId);

    // Wire up event listeners
    const onMessage = (message: OpenCodeMessage) => {
      callbacks.onMessage(message);
    };

    const onProgress = (progress: { stage: string; message?: string }) => {
      callbacks.onProgress(progress);
    };

    const onPermissionRequest = (request: PermissionRequest) => {
      callbacks.onPermissionRequest(request);
    };

    const onComplete = (result: TaskResult) => {
      callbacks.onComplete(result);
      this.cleanupTask(taskId);
      this.processQueue();
    };

    const onError = (error: Error) => {
      callbacks.onError(error);
      this.cleanupTask(taskId);
      this.processQueue();
    };

    const onDebug = (log: { type: string; message: string; data?: unknown }) => {
      callbacks.onDebug?.(log);
    };

    // Attach listeners
    adapter.on('message', onMessage);
    adapter.on('progress', onProgress);
    adapter.on('permission-request', onPermissionRequest);
    adapter.on('complete', onComplete);
    adapter.on('error', onError);
    adapter.on('debug', onDebug);

    // Create cleanup function
    const cleanup = () => {
      adapter.off('message', onMessage);
      adapter.off('progress', onProgress);
      adapter.off('permission-request', onPermissionRequest);
      adapter.off('complete', onComplete);
      adapter.off('error', onError);
      adapter.off('debug', onDebug);
      adapter.dispose();
    };

    // Register the managed task
    const managedTask: ManagedTask = {
      taskId,
      adapter,
      callbacks,
      cleanup,
      createdAt: new Date(),
      usingServer: false,
    };
    this.activeTasks.set(taskId, managedTask);

    console.log(`[TaskManager] Executing task ${taskId} with PTY. Active tasks: ${this.activeTasks.size}`);

    // Start agent asynchronously (browser will be started lazily when needed by tools)
    (async () => {
      try {
        // NOTE: Don't call ensureDevBrowserServer() here anymore!
        // The browser will be started lazily when the agent actually uses browser tools.
        await adapter.startTask({ ...config, taskId });
      } catch (error) {
        callbacks.onError(error instanceof Error ? error : new Error(String(error)));
        this.cleanupTask(taskId);
        this.processQueue();
      }
    })();

    return task;
  }

  /**
   * Process the queue - start queued tasks if we have capacity
   */
  private async processQueue(): Promise<void> {
    // Start queued tasks while we have capacity
    while (this.taskQueue.length > 0 && this.activeTasks.size < this.maxConcurrentTasks) {
      const nextTask = this.taskQueue.shift()!;
      console.log(`[TaskManager] Processing queue. Starting task ${nextTask.taskId}. Active: ${this.activeTasks.size}, Remaining in queue: ${this.taskQueue.length}`);

      // Notify that task is now running
      nextTask.callbacks.onStatusChange?.('running');

      try {
        await this.executeTask(nextTask.taskId, nextTask.config, nextTask.callbacks);
      } catch (error) {
        console.error(`[TaskManager] Error starting queued task ${nextTask.taskId}:`, error);
        nextTask.callbacks.onError(error instanceof Error ? error : new Error(String(error)));
      }
    }

    if (this.taskQueue.length === 0) {
      console.log('[TaskManager] Queue empty, no more tasks to process');
    }
  }

  /**
   * Cancel a specific task (running or queued)
   */
  async cancelTask(taskId: string): Promise<void> {
    // Check if it's a queued task
    const queueIndex = this.taskQueue.findIndex(q => q.taskId === taskId);
    if (queueIndex !== -1) {
      console.log(`[TaskManager] Cancelling queued task ${taskId}`);
      this.taskQueue.splice(queueIndex, 1);
      return;
    }

    // Otherwise, it's a running task
    const managedTask = this.activeTasks.get(taskId);
    if (!managedTask) {
      console.warn(`[TaskManager] Task ${taskId} not found for cancellation`);
      return;
    }

    console.log(`[TaskManager] Cancelling running task ${taskId}`);

    try {
      if (managedTask.usingServer && managedTask.sessionId) {
        await this.serverAdapter?.interruptSession(managedTask.sessionId);
      } else if (managedTask.adapter) {
        await managedTask.adapter.cancelTask();
      }
    } finally {
      this.cleanupTask(taskId);
      this.processQueue();
    }
  }

  /**
   * Interrupt a running task (graceful Ctrl+C)
   * Unlike cancel, this doesn't kill the process - it just interrupts the current operation
   * and allows the agent to wait for the next user input.
   */
  async interruptTask(taskId: string): Promise<void> {
    const managedTask = this.activeTasks.get(taskId);
    if (!managedTask) {
      console.warn(`[TaskManager] Task ${taskId} not found for interruption`);
      return;
    }

    console.log(`[TaskManager] Interrupting task ${taskId}`);
    
    if (managedTask.usingServer && managedTask.sessionId) {
      await this.serverAdapter?.interruptSession(managedTask.sessionId);
    } else if (managedTask.adapter) {
      await managedTask.adapter.interruptTask();
    }
  }

  /**
   * Cancel a queued task and optionally revert to a previous status
   * Used for cancelling follow-ups on completed tasks
   */
  cancelQueuedTask(taskId: string): boolean {
    const queueIndex = this.taskQueue.findIndex(q => q.taskId === taskId);
    if (queueIndex === -1) {
      return false;
    }

    console.log(`[TaskManager] Removing task ${taskId} from queue`);
    this.taskQueue.splice(queueIndex, 1);
    return true;
  }

  /**
   * Check if there are any running tasks
   */
  hasRunningTask(): boolean {
    return this.activeTasks.size > 0;
  }

  /**
   * Check if a specific task is queued
   */
  isTaskQueued(taskId: string): boolean {
    return this.taskQueue.some(q => q.taskId === taskId);
  }

  /**
   * Get queue position (1-based) for a task, or 0 if not queued
   */
  getQueuePosition(taskId: string): number {
    const index = this.taskQueue.findIndex(q => q.taskId === taskId);
    return index === -1 ? 0 : index + 1;
  }

  /**
   * Get the current queue length
   */
  getQueueLength(): number {
    return this.taskQueue.length;
  }

  /**
   * Send a response to a specific task's PTY (for permissions/questions)
   */
  async sendResponse(taskId: string, response: string): Promise<void> {
    const managedTask = this.activeTasks.get(taskId);
    if (!managedTask) {
      throw new Error(`Task ${taskId} not found or not active`);
    }

    if (managedTask.usingServer && managedTask.sessionId) {
      // For server mode, send as a follow-up message
      await this.serverAdapter?.continueSession(managedTask.sessionId, response);
    } else if (managedTask.adapter) {
      await managedTask.adapter.sendResponse(response);
    }
  }

  /**
   * Get the session ID for a specific task
   */
  getSessionId(taskId: string): string | null {
    const managedTask = this.activeTasks.get(taskId);
    if (managedTask?.usingServer) {
      return managedTask.sessionId || null;
    }
    return managedTask?.adapter?.getSessionId() ?? null;
  }

  /**
   * Check if a task is active
   */
  hasActiveTask(taskId: string): boolean {
    return this.activeTasks.has(taskId);
  }

  /**
   * Get the number of active tasks
   */
  getActiveTaskCount(): number {
    return this.activeTasks.size;
  }

  /**
   * Get all active task IDs
   */
  getActiveTaskIds(): string[] {
    return Array.from(this.activeTasks.keys());
  }

  /**
   * Get the currently running task ID (not queued)
   * Returns the first active task if multiple are running
   */
  getActiveTaskId(): string | null {
    const firstActive = this.activeTasks.keys().next();
    return firstActive.done ? null : firstActive.value;
  }

  /**
   * Cleanup a specific task (internal)
   */
  private cleanupTask(taskId: string): void {
    const managedTask = this.activeTasks.get(taskId);
    if (managedTask) {
      console.log(`[TaskManager] Cleaning up task ${taskId}`);
      managedTask.cleanup();
      this.activeTasks.delete(taskId);
      console.log(`[TaskManager] Task ${taskId} cleaned up. Active tasks: ${this.activeTasks.size}`);
    }
  }

  /**
   * Dispose all tasks and cleanup resources
   * Called on app quit
   */
  async dispose(): Promise<void> {
    console.log(`[TaskManager] Disposing all tasks (${this.activeTasks.size} active, ${this.taskQueue.length} queued)`);

    // Clear the queue
    this.taskQueue = [];

    for (const [taskId, managedTask] of this.activeTasks) {
      try {
        managedTask.cleanup();
      } catch (error) {
        console.error(`[TaskManager] Error cleaning up task ${taskId}:`, error);
      }
    }

    this.activeTasks.clear();

    // Stop the server adapter
    if (this.serverAdapter) {
      try {
        await this.serverAdapter.stop();
      } catch (error) {
        console.error('[TaskManager] Error stopping server adapter:', error);
      }
      this.serverAdapter = null;
    }

    console.log('[TaskManager] All tasks disposed');
  }
}

// Singleton TaskManager instance for the application
let taskManagerInstance: TaskManager | null = null;

/**
 * Get the global TaskManager instance
 */
export function getTaskManager(): TaskManager {
  if (!taskManagerInstance) {
    taskManagerInstance = new TaskManager();
  }
  return taskManagerInstance;
}

/**
 * Dispose the global TaskManager instance
 * Called on app quit
 */
export async function disposeTaskManager(): Promise<void> {
  if (taskManagerInstance) {
    await taskManagerInstance.dispose();
    taskManagerInstance = null;
  }
  
  // Also dispose the server adapter singleton
  await disposeServerAdapter();
}

/**
 * Initialize the server adapter (can be called on app startup)
 */
export async function initializeTaskManager(): Promise<void> {
  const manager = getTaskManager();
  await manager.initializeServer();
}

/**
 * Check if server mode (real streaming) is active
 */
export function isServerModeActive(): boolean {
  if (!taskManagerInstance) return false;
  return taskManagerInstance.isUsingServerMode();
}
