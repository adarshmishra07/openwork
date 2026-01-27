/**
 * OpenCode Server Adapter
 * 
 * Uses OpenCode's HTTP serve mode with SSE for real-time streaming.
 * This replaces the PTY-based adapter for better streaming support.
 */

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { EventSource } from 'eventsource';
import portfinder from 'portfinder';
import { app } from 'electron';
import {
  getOpenCodeCliPath,
  isOpenCodeBundled,
} from './cli-path';
import { getAllApiKeys } from '../store/secureStorage';
import { getSelectedModel } from '../store/appSettings';
import { getActiveProviderModel } from '../store/providerSettings';
import { generateOpenCodeConfig, ACCOMPLISH_AGENT_NAME, syncApiKeysToOpenCodeAuth, getAppScopedDataHome } from './config-generator';
import { getExtendedNodePath } from '../utils/system-path';
import { getBundledNodePaths, logBundledNodeInfo } from '../utils/bundled-node';
import type {
  TaskConfig,
  Task,
  TaskResult,
  OpenCodeMessage,
} from '@shopos/shared';

/**
 * Attachment type matching TaskConfig.attachments
 */
interface TaskAttachmentInput {
  filename: string;
  contentType: string;
  url: string;
  size: number;
}

// Server startup timeout (30 seconds)
const SERVER_STARTUP_TIMEOUT = 30000;

// Server health check interval
const HEALTH_CHECK_INTERVAL = 1000;

// SSE reconnect delay
const SSE_RECONNECT_DELAY = 2000;

/**
 * Events emitted by the server adapter
 */
export interface ServerAdapterEvents {
  // Real-time text streaming (replaces batched text messages)
  'text-delta': [{ sessionId: string; text: string; messageId: string }];
  
  // Stream complete - marks the end of a streaming message
  'stream-complete': [{ sessionId: string; messageId: string }];
  
  // Complete message (for backwards compatibility)
  'message': [OpenCodeMessage];
  
  // Tool events
  'tool-use': [{ sessionId: string; tool: string; input: unknown; callId: string }];
  'tool-result': [{ sessionId: string; toolCallId: string; output: string; isError: boolean }];
  
  // Session status changes
  'session-status': [{ sessionId: string; status: string; message?: string; retryAt?: number }];
  
  // Task completion
  'complete': [{ sessionId: string; result: TaskResult }];
  
  // Errors
  'error': [{ sessionId: string; error: string }];
  'server-error': [Error];
  
  // Debug logging
  'debug': [{ type: string; message: string; data?: unknown }];
}

/**
 * Session info tracked by the adapter
 */
interface SessionInfo {
  taskId: string;
  currentMessageId: string | null;
  textBuffer: string;
  lastTextLength: number;  // Track last text length for computing deltas
  isStreaming: boolean;
  messageRoles: Map<string, string>;  // messageID -> role (user/assistant)
}

/**
 * OpenCode Server Adapter
 * 
 * Manages a long-running `opencode serve` process and communicates
 * via HTTP REST API and SSE events for real-time streaming.
 */
export class OpenCodeServerAdapter extends EventEmitter<ServerAdapterEvents> {
  private serverProcess: ChildProcess | null = null;
  private eventSource: EventSource | null = null;
  private serverPort: number | null = null;
  private serverUrl: string | null = null;
  private isStarting: boolean = false;
  private isDisposed: boolean = false;
  private sessions: Map<string, SessionInfo> = new Map();
  private sessionToTask: Map<string, string> = new Map();
  private healthCheckTimer: NodeJS.Timeout | null = null;

  constructor() {
    super();
  }

  /**
   * Start the OpenCode server
   */
  async start(): Promise<void> {
    if (this.serverProcess || this.isStarting) {
      console.log('[ServerAdapter] Server already running or starting');
      return;
    }

    // Check if CLI is available
    const cliAvailable = await isOpenCodeBundled();
    if (!cliAvailable) {
      throw new Error('OpenCode CLI is not available');
    }

    this.isStarting = true;
    this.isDisposed = false;

    try {
      // Find available port starting from 14100
      this.serverPort = await portfinder.getPortPromise({ port: 14100, stopPort: 15000 });
      this.serverUrl = `http://127.0.0.1:${this.serverPort}`;

      console.log(`[ServerAdapter] Starting server on port ${this.serverPort}`);
      this.emit('debug', { type: 'info', message: `Starting server on port ${this.serverPort}` });

      // Sync API keys before starting
      const useSubscription = app.isPackaged
        ? process.env.USE_OPENCODE_SUBSCRIPTION !== '0'
        : process.env.USE_OPENCODE_SUBSCRIPTION === '1';
      
      if (!useSubscription) {
        await syncApiKeysToOpenCodeAuth();
      }

      // Generate OpenCode config
      await generateOpenCodeConfig();

      // Build environment
      const env = await this.buildEnvironment();

      // Get CLI path and spawn server
      const { command, args: baseArgs } = getOpenCodeCliPath();
      const serverArgs = [...baseArgs, 'serve', '--port', String(this.serverPort)];

      console.log(`[ServerAdapter] Spawning: ${command} ${serverArgs.join(' ')}`);
      this.emit('debug', { type: 'info', message: `Spawning: ${command} ${serverArgs.join(' ')}` });

      const safeCwd = app.getPath('temp');

      this.serverProcess = spawn(command, serverArgs, {
        env: env as NodeJS.ProcessEnv,
        cwd: safeCwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
      });

      // Handle process output
      this.serverProcess.stdout?.on('data', (data: Buffer) => {
        const output = data.toString();
        console.log('[ServerAdapter stdout]', output.trim());
        this.emit('debug', { type: 'stdout', message: output });
      });

      this.serverProcess.stderr?.on('data', (data: Buffer) => {
        const output = data.toString();
        console.log('[ServerAdapter stderr]', output.trim());
        this.emit('debug', { type: 'stderr', message: output });
      });

      // Handle process errors
      this.serverProcess.on('error', (error) => {
        console.error('[ServerAdapter] Process error:', error);
        this.emit('server-error', error);
      });

      this.serverProcess.on('exit', (code, signal) => {
        console.log(`[ServerAdapter] Process exited with code: ${code}, signal: ${signal}`);
        this.emit('debug', { type: 'exit', message: `Server exited: code=${code}, signal=${signal}` });
        this.serverProcess = null;
        
        // Clean up SSE connection
        if (this.eventSource) {
          this.eventSource.close();
          this.eventSource = null;
        }
      });

      // Wait for server to be ready
      await this.waitForServerReady();

      // Connect to SSE endpoint
      this.connectEventSource();

      // Start health check
      this.startHealthCheck();

      console.log(`[ServerAdapter] Server started successfully on ${this.serverUrl}`);
      this.emit('debug', { type: 'info', message: `Server ready at ${this.serverUrl}` });

    } catch (error) {
      console.error('[ServerAdapter] Failed to start server:', error);
      this.cleanup();
      throw error;
    } finally {
      this.isStarting = false;
    }
  }

  /**
   * Stop the OpenCode server
   */
  async stop(): Promise<void> {
    console.log('[ServerAdapter] Stopping server...');
    this.isDisposed = true;
    this.cleanup();
  }

  /**
   * Check if server is running
   */
  isRunning(): boolean {
    return this.serverProcess !== null && !this.serverProcess.killed;
  }

  /**
   * Get the server URL
   */
  getServerUrl(): string | null {
    return this.serverUrl;
  }

  /**
   * Create a new session or resume an existing one, then send the message
   * Note: Model selection is handled via the opencode.json config file (agents section)
   */
  async createSession(taskId: string, config: TaskConfig): Promise<string> {
    if (!this.isRunning() || !this.serverUrl) {
      throw new Error('Server is not running');
    }

    // Check if we're resuming an existing session
    if (config.sessionId) {
      console.log(`[ServerAdapter] Resuming session ${config.sessionId} for task: ${taskId}`);
      
      // Re-register the session mapping for this task
      this.sessions.set(config.sessionId, {
        taskId,
        currentMessageId: null,
        textBuffer: '',
        lastTextLength: 0,
        isStreaming: false,
        messageRoles: new Map(),
      });
      this.sessionToTask.set(config.sessionId, taskId);
      
      // Send the follow-up message to the existing session
      await this.sendMessage(config.sessionId, config.prompt, config.attachments);
      
      return config.sessionId;
    }

    // Create new session
    console.log(`[ServerAdapter] Creating new session for task: ${taskId}`);

    // Create session - model is determined by the config file's "agents" section
    const sessionResponse = await fetch(`${this.serverUrl}/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent: ACCOMPLISH_AGENT_NAME,
      }),
    });

    if (!sessionResponse.ok) {
      const error = await sessionResponse.text();
      throw new Error(`Failed to create session: ${error}`);
    }

    const session = await sessionResponse.json();
    const sessionId = session.id;

    console.log(`[ServerAdapter] Created session: ${sessionId}`);
    this.emit('debug', { type: 'info', message: `Created session: ${sessionId}` });

    // Track session BEFORE sending message (critical for SSE event handling)
    this.sessions.set(sessionId, {
      taskId,
      currentMessageId: null,
      textBuffer: '',
      lastTextLength: 0,  // Track last text length for computing deltas
      isStreaming: false,
      messageRoles: new Map(),
    });
    this.sessionToTask.set(sessionId, taskId);
    console.log(`[ServerAdapter] Session ${sessionId} tracked. Current sessions:`, Array.from(this.sessions.keys()));

    // Send initial message (SSE events will start flowing after this)
    console.log(`[ServerAdapter] Sending initial message for session ${sessionId}...`);
    await this.sendMessage(sessionId, config.prompt, config.attachments);
    console.log(`[ServerAdapter] Initial message sent for session ${sessionId}`);

    return sessionId;
  }

  /**
   * Send a message to a session
   */
  async sendMessage(sessionId: string, text: string, attachments?: TaskAttachmentInput[]): Promise<void> {
    if (!this.isRunning() || !this.serverUrl) {
      throw new Error('Server is not running');
    }

    // Build enhanced prompt with attachment context (same as PTY adapter)
    let prompt = text;
    if (attachments && attachments.length > 0) {
      const hasImages = attachments.some((att) => att.contentType.startsWith('image/'));

      const attachmentContext = attachments.map((att) => {
        const isImage = att.contentType.startsWith('image/');
        const isPdf = att.contentType === 'application/pdf';
        const isJson = att.contentType === 'application/json';
        const isText = att.contentType.startsWith('text/');

        let typeLabel = 'File';
        if (isImage) typeLabel = 'Image';
        else if (isPdf) typeLabel = 'PDF';
        else if (isJson) typeLabel = 'JSON';
        else if (isText) typeLabel = 'Text file';

        return `- ${typeLabel}: ${att.filename}
  URL: ${att.url}`;
      }).join('\n');

      let usageGuidance = `
IMPORTANT - How to use these attachments:
- These S3 URLs are PUBLICLY ACCESSIBLE - no authentication needed
- DO NOT open in browser, screenshot, download, or convert to base64`;

      if (hasImages) {
        usageGuidance += `
- For AI image generation/editing with these images:
  * OpenAI Vision: Use "image_url": {"url": "THE_S3_URL"} directly in the API request
  * For Gemini: Download with curl, then use JSON FILE approach (see system prompt for example)
  * For space_* tools: Pass the S3 URL directly as the image parameter
- NEVER use browser to navigate to an image URL just to view it - the URL IS the image
- CRITICAL FOR GEMINI: Never embed base64 directly in shell commands - use JSON file with curl -d @file.json`;
      }

      prompt = `User's attached files:
${attachmentContext}
${usageGuidance}

User's request: ${text}`;
    }

    // Build message parts
    const parts: Array<{ type: string; text?: string }> = [
      { type: 'text', text: prompt }
    ];

    console.log(`[ServerAdapter] Sending message to session ${sessionId}, length: ${prompt.length}`);

    const response = await fetch(`${this.serverUrl}/session/${sessionId}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parts }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to send message: ${error}`);
    }
  }

  /**
   * Continue an existing session with a follow-up message
   */
  async continueSession(sessionId: string, text: string): Promise<void> {
    await this.sendMessage(sessionId, text);
  }

  /**
   * Interrupt a running session
   */
  async interruptSession(sessionId: string): Promise<void> {
    if (!this.isRunning() || !this.serverUrl) {
      return;
    }

    console.log(`[ServerAdapter] Interrupting session: ${sessionId}`);

    try {
      // OpenCode serve might have an interrupt endpoint
      // For now, we'll mark the session as completed with interrupted status
      const sessionInfo = this.sessions.get(sessionId);
      if (sessionInfo) {
        this.emit('complete', {
          sessionId,
          result: {
            status: 'interrupted',
            sessionId,
          },
        });
      }
    } catch (error) {
      console.error('[ServerAdapter] Error interrupting session:', error);
    }
  }

  /**
   * Get task ID for a session
   */
  getTaskIdForSession(sessionId: string): string | undefined {
    return this.sessionToTask.get(sessionId);
  }

  /**
   * Get session ID for a task
   */
  getSessionIdForTask(taskId: string): string | undefined {
    for (const [sessionId, info] of this.sessions.entries()) {
      if (info.taskId === taskId) {
        return sessionId;
      }
    }
    return undefined;
  }

  // ==================== Private Methods ====================

  /**
   * Build environment variables
   */
  private async buildEnvironment(): Promise<NodeJS.ProcessEnv> {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
    };

    const useSubscription = app.isPackaged
      ? process.env.USE_OPENCODE_SUBSCRIPTION !== '0'
      : process.env.USE_OPENCODE_SUBSCRIPTION === '1';

    if (useSubscription) {
      console.log('[ServerAdapter] Using OpenCode subscription');
    } else {
      env.XDG_DATA_HOME = getAppScopedDataHome();
      console.log('[ServerAdapter] Using app-scoped XDG_DATA_HOME:', env.XDG_DATA_HOME);
    }

    if (app.isPackaged) {
      env.ELECTRON_RUN_AS_NODE = '1';
      logBundledNodeInfo();

      const bundledNode = getBundledNodePaths();
      if (bundledNode) {
        const delimiter = process.platform === 'win32' ? ';' : ':';
        env.PATH = `${bundledNode.binDir}${delimiter}${env.PATH || ''}`;
        env.NODE_BIN_PATH = bundledNode.binDir;
      }

      if (process.platform === 'darwin') {
        env.PATH = getExtendedNodePath(env.PATH);
      }
    }

    // Load API keys
    const apiKeys = await getAllApiKeys();

    if (apiKeys.anthropic && !useSubscription) {
      env.ANTHROPIC_API_KEY = apiKeys.anthropic;
    }
    if (apiKeys.openai) {
      env.OPENAI_API_KEY = apiKeys.openai;
    }
    if (apiKeys.google) {
      env.GOOGLE_GENERATIVE_AI_API_KEY = apiKeys.google;
    }
    if (apiKeys.xai) {
      env.XAI_API_KEY = apiKeys.xai;
    }
    if (apiKeys.deepseek) {
      env.DEEPSEEK_API_KEY = apiKeys.deepseek;
    }
    if (apiKeys.zai) {
      env.ZAI_API_KEY = apiKeys.zai;
    }
    if (apiKeys.openrouter) {
      env.OPENROUTER_API_KEY = apiKeys.openrouter;
    }
    if (apiKeys.litellm) {
      env.LITELLM_API_KEY = apiKeys.litellm;
    }
    if (apiKeys.kimi) {
      env.MOONSHOT_API_KEY = apiKeys.kimi;
    }

    // Set Ollama/LiteLLM hosts if configured
    const activeModel = getActiveProviderModel();
    const selectedModel = getSelectedModel();
    
    if (activeModel?.provider === 'ollama' && activeModel.baseUrl) {
      env.OLLAMA_HOST = activeModel.baseUrl;
    } else if (selectedModel?.provider === 'ollama' && selectedModel.baseUrl) {
      env.OLLAMA_HOST = selectedModel.baseUrl;
    }

    if (activeModel?.provider === 'litellm' && activeModel.baseUrl) {
      env.LITELLM_BASE_URL = activeModel.baseUrl;
    }

    // Pass config environment variables
    if (process.env.OPENCODE_CONFIG) {
      env.OPENCODE_CONFIG = process.env.OPENCODE_CONFIG;
    }
    if (process.env.OPENCODE_CONFIG_DIR) {
      env.OPENCODE_CONFIG_DIR = process.env.OPENCODE_CONFIG_DIR;
    }

    return env;
  }

  /**
   * Wait for server to be ready
   */
  private async waitForServerReady(): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < SERVER_STARTUP_TIMEOUT) {
      try {
        const response = await fetch(`${this.serverUrl}/config`);
        if (response.ok) {
          console.log('[ServerAdapter] Server is ready');
          return;
        }
      } catch {
        // Server not ready yet
      }

      await new Promise(resolve => setTimeout(resolve, HEALTH_CHECK_INTERVAL));
    }

    throw new Error('Server startup timeout');
  }

  /**
   * Connect to SSE endpoint
   */
  private connectEventSource(): void {
    if (!this.serverUrl || this.isDisposed) return;

    const sseUrl = `${this.serverUrl}/event`;
    console.log(`[ServerAdapter] Connecting to SSE: ${sseUrl}`);

    this.eventSource = new EventSource(sseUrl);

    this.eventSource.onopen = () => {
      console.log('[ServerAdapter] SSE connected');
      this.emit('debug', { type: 'info', message: 'SSE connected' });
    };

    this.eventSource.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        this.handleSSEEvent(data);
      } catch (error) {
        console.error('[ServerAdapter] Failed to parse SSE event:', error);
      }
    };

    this.eventSource.onerror = (error: Event) => {
      console.error('[ServerAdapter] SSE error:', error);
      this.emit('debug', { type: 'error', message: 'SSE connection error' });

      // EventSource will auto-reconnect, but we can also manually reconnect
      if (!this.isDisposed && this.isRunning()) {
        setTimeout(() => {
          if (!this.isDisposed && this.isRunning() && this.eventSource?.readyState === EventSource.CLOSED) {
            console.log('[ServerAdapter] Reconnecting SSE...');
            this.connectEventSource();
          }
        }, SSE_RECONNECT_DELAY);
      }
    };
  }

  /**
   * Handle SSE events
   */
  private handleSSEEvent(event: any): void {
    const eventType = event.type;
    const properties = event.properties || {};

    // Extract session ID from various locations in the event
    const sessionId = properties.sessionID ||
      properties.info?.sessionID ||
      properties.part?.sessionID;

    // Debug log for SSE events (only log important events)
    if (eventType !== 'session.updated' && eventType !== 'session.status') {
      console.log(`[ServerAdapter:SSE] Event: ${eventType}`, sessionId ? `session=${sessionId}` : '');
    }

    // Skip events without session context (like server.connected)
    if (eventType === 'server.connected') {
      console.log('[ServerAdapter:SSE] Server connected event received');
      return;
    }

    // Get session info
    const sessionInfo = sessionId ? this.sessions.get(sessionId) : null;

    switch (eventType) {
      case 'message.updated': {
        // Store the message role when we receive message.updated events
        // This is crucial because message.part.updated doesn't include the role
        const info = properties.info;
        if (info?.id && info?.role && info?.sessionID) {
          const session = this.sessions.get(info.sessionID);
          if (session) {
            session.messageRoles.set(info.id, info.role);
            console.log(`[ServerAdapter:MSG] Stored role for message ${info.id}: ${info.role}`);
          }
        }
        break;
      }

      case 'message.part.updated': {
        const part = properties.part;
        if (!part || !sessionId) return;
        
        // Get session and look up the role from our stored map
        const session = this.sessions.get(sessionId);
        if (!session) {
          console.log(`[ServerAdapter:PART] No session found for ${sessionId}, skipping`);
          return;
        }
        
        // Look up the role from the stored message roles (set by message.updated events)
        // Fall back to 'assistant' if not found (since we want to show assistant messages)
        const messageId = part.messageID || part.id;
        const messageRole = session.messageRoles.get(messageId) || 'assistant';
        
        console.log(`[ServerAdapter:PART] Processing part: type=${part.type}, role=${messageRole}, messageId=${messageId}`);
        
        // Skip user messages - we only want to stream assistant responses
        if (messageRole === 'user') {
          console.log(`[ServerAdapter:PART] Skipping user message`);
          return;
        }

        if (part.type === 'text') {
          // Real-time text streaming!
          // SSE sends FULL text each time, so we compute the actual delta
          const fullText = part.text || '';
          
          // Check if this is a new message (different messageId)
          if (session.currentMessageId !== messageId) {
            console.log(`[ServerAdapter:TEXT] New message: ${messageId}`);
            session.currentMessageId = messageId;
            session.lastTextLength = 0;
          }
          
          // Compute the actual delta (new text since last update)
          const delta = fullText.substring(session.lastTextLength);
          session.lastTextLength = fullText.length;
          
          // Only emit if there's new text
          if (delta.length > 0) {
            console.log(`[ServerAdapter:TEXT] Emitting delta: ${delta.length} chars`);
            // Emit text-delta for real-time streaming (only the new part)
            this.emit('text-delta', { sessionId, text: delta, messageId });
          }

        } else if (part.type === 'step-start') {
          console.log(`[ServerAdapter:STEP] Step started`);
          
        } else if (part.type === 'step-finish') {
          console.log(`[ServerAdapter:STEP] Step finished`);
          // Step finished - mark streaming as complete
          this.emit('stream-complete', { sessionId, messageId: part.messageID });
          
          // Reset text tracking for next message
          const session = this.sessions.get(sessionId);
          if (session) {
            console.log(`[ServerAdapter:STEP] Resetting session text tracking`);
            session.lastTextLength = 0;
            session.currentMessageId = null;
          }
          
        } else if (part.type === 'tool' || part.type === 'tool-call') {
          // Tool usage
          const tool = part.tool || 'unknown';
          const input = part.state?.input || part.input;
          const callId = part.callID || part.id;
          const status = part.state?.status || 'running';
          const output = part.state?.output;

          console.log(`[ServerAdapter] Tool ${tool} status: ${status}`);

          this.emit('tool-use', { sessionId, tool, input, callId });

          // If completed or error, emit result
          if (status === 'completed' || status === 'error') {
            this.emit('tool-result', {
              sessionId,
              toolCallId: callId,
              output: output || '',
              isError: status === 'error',
            });
          }

          // Also emit as OpenCodeMessage
          const openCodeMessage: OpenCodeMessage = {
            type: 'tool_use',
            timestamp: Date.now(),
            sessionID: sessionId,
            part: {
              id: part.id,
              sessionID: sessionId,
              messageID: part.messageID,
              type: 'tool',
              callID: callId,
              tool: tool,
              state: {
                status: status,
                input: input,
                output: output,
              },
            },
          } as any;
          this.emit('message', openCodeMessage);
        }
        break;
      }

      case 'session.status': {
        const status = properties.status;
        if (!status || !sessionId) return;

        const statusType = status.type;
        const message = status.message;
        const retryAt = status.next;

        console.log(`[ServerAdapter] Session ${sessionId} status: ${statusType}`);

        this.emit('session-status', {
          sessionId,
          status: statusType,
          message,
          retryAt,
        });

        // Handle completion
        if (statusType === 'idle') {
          // Session is idle - task completed
          console.log(`[ServerAdapter] Session ${sessionId} completed (idle state)`);
          
          this.emit('complete', {
            sessionId,
            result: {
              status: 'success',
              sessionId,
            },
          });
          
          // DON'T delete session mappings - we may want to resume later
          // The session still exists on the server and can receive more messages
          // Clean up will happen when a new task takes over this mapping or app closes
        }
        break;
      }

      case 'session.updated': {
        // Session metadata updates
        break;
      }

      case 'session.diff': {
        // File diff updates
        break;
      }

      default:
        // Log unknown events for debugging
        if (eventType && !eventType.startsWith('session.') && !eventType.startsWith('message.')) {
          console.log(`[ServerAdapter] Unknown event type: ${eventType}`);
        }
    }
  }

  /**
   * Start health check timer
   */
  private startHealthCheck(): void {
    this.healthCheckTimer = setInterval(async () => {
      if (!this.isRunning() || this.isDisposed) {
        this.stopHealthCheck();
        return;
      }

      try {
        const response = await fetch(`${this.serverUrl}/config`);
        if (!response.ok) {
          console.warn('[ServerAdapter] Health check failed');
        }
      } catch {
        console.warn('[ServerAdapter] Health check error - server may be down');
      }
    }, 30000); // Every 30 seconds
  }

  /**
   * Stop health check timer
   */
  private stopHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  /**
   * Cleanup resources
   */
  private cleanup(): void {
    this.stopHealthCheck();

    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    if (this.serverProcess) {
      try {
        this.serverProcess.kill();
      } catch (error) {
        console.error('[ServerAdapter] Error killing server process:', error);
      }
      this.serverProcess = null;
    }

    this.sessions.clear();
    this.sessionToTask.clear();
    this.serverPort = null;
    this.serverUrl = null;
  }
}

// ==================== Singleton Management ====================

let serverAdapter: OpenCodeServerAdapter | null = null;

/**
 * Get the singleton server adapter instance
 */
export function getServerAdapter(): OpenCodeServerAdapter {
  if (!serverAdapter) {
    serverAdapter = new OpenCodeServerAdapter();
  }
  return serverAdapter;
}

/**
 * Dispose the server adapter
 */
export async function disposeServerAdapter(): Promise<void> {
  if (serverAdapter) {
    await serverAdapter.stop();
    serverAdapter = null;
  }
}

/**
 * Check if server adapter is available and running
 */
export function isServerAdapterRunning(): boolean {
  return serverAdapter?.isRunning() ?? false;
}
