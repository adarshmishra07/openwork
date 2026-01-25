/**
 * ClaudeAgentAdapter - SDK-based adapter for Claude Agent
 * 
 * Replaces the PTY-based OpenCodeAdapter with direct SDK integration.
 * Provides cleaner streaming, better error handling, and native session support.
 */

import { EventEmitter } from 'events';
import { query, type Options as SdkOptions } from '@anthropic-ai/claude-agent-sdk';
import {
  buildMcpServers,
  buildAllowedTools,
  buildEnvironment,
  getModelForSdk,
  getSystemPrompt,
  getWorkingDirectory,
} from './config-builder';
import type {
  ClaudeAgentAdapterEvents,
  NormalizedEvent,
  PermissionContext,
} from './types';
import type { TaskConfig, Task, PermissionRequest } from '@shopos/shared';

/**
 * ClaudeAgentAdapter - Uses Claude Agent SDK for task execution
 * 
 * Benefits over PTY-based approach:
 * - True streaming (token-by-token)
 * - Native session management
 * - Typed event callbacks
 * - No shell/PTY complexity
 * - Better error handling
 */
export class ClaudeAgentAdapter extends EventEmitter<ClaudeAgentAdapterEvents> {
  private currentSessionId: string | null = null;
  private currentTaskId: string | null = null;
  private isRunning: boolean = false;
  private isDisposed: boolean = false;
  private abortController: AbortController | null = null;
  
  // Pending permission requests (tool call ID -> resolver)
  private pendingPermissions: Map<string, (allowed: boolean) => void> = new Map();

  constructor(taskId?: string) {
    super();
    this.currentTaskId = taskId || null;
  }

  /**
   * Start a new task using Claude Agent SDK
   */
  async startTask(config: TaskConfig): Promise<Task> {
    if (this.isDisposed) {
      throw new Error('Adapter has been disposed and cannot start new tasks');
    }

    if (this.isRunning) {
      throw new Error('A task is already running');
    }

    const taskId = config.taskId || this.generateTaskId();
    this.currentTaskId = taskId;
    this.currentSessionId = config.sessionId || null;
    this.isRunning = true;
    this.abortController = new AbortController();

    this.emit('debug', { type: 'info', message: `Starting task ${taskId} with Claude Agent SDK` });
    this.emit('progress', { stage: 'init', message: 'Initializing agent...' });

    // Build SDK options
    const env = await buildEnvironment();
    const model = await getModelForSdk();
    
    // Set environment variables for SDK
    Object.entries(env).forEach(([key, value]) => {
      process.env[key] = value;
    });

    // Find Claude CLI executable path
    const claudeCliPath = await this.findClaudeCliPath();
    console.log('[ClaudeAgentAdapter] Using Claude CLI at:', claudeCliPath);

    const sdkOptions: SdkOptions = {
      pathToClaudeCodeExecutable: claudeCliPath,
      allowedTools: buildAllowedTools(),
      mcpServers: buildMcpServers() as SdkOptions['mcpServers'],
      cwd: getWorkingDirectory(config.workingDirectory),
      settingSources: ['project'], // Load Skills from .claude/skills/
      systemPrompt: {
        type: 'preset',
        preset: 'claude_code',
        append: getSystemPrompt(),
      },
      // Permission handling via canUseTool callback
      canUseTool: async (toolName: string, input: Record<string, unknown>, { signal }) => {
        // Check if tool needs permission
        if (['Edit', 'Write', 'Bash'].includes(toolName)) {
          const toolUseId = `${toolName}_${Date.now()}`;
          const result = await this.handlePermissionCheck({ tool_name: toolName, tool_input: input }, toolUseId);
          if (result.decision === 'deny') {
            return { behavior: 'deny', message: 'User denied permission' };
          }
        }
        return { behavior: 'allow' };
      },
    };

    // Add model if specified
    if (model) {
      (sdkOptions as any).model = model;
    }

    // Resume session if provided
    if (config.sessionId) {
      (sdkOptions as any).resume = config.sessionId;
      this.emit('debug', { type: 'info', message: `Resuming session: ${config.sessionId}` });
    }

    // Create the task object immediately
    const task: Task = {
      id: taskId,
      prompt: config.prompt,
      status: 'running',
      messages: [],
      createdAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
    };

    // Run the SDK query in the background
    this.runQuery(config.prompt, sdkOptions).catch((error) => {
      if (!this.isDisposed) {
        this.emit('error', error);
      }
    });

    return task;
  }

  /**
   * Run the SDK query and process events
   */
  private async runQuery(prompt: string, options: SdkOptions): Promise<void> {
    try {
      console.log('[ClaudeAgentAdapter] Starting SDK query with prompt:', prompt.substring(0, 100));
      console.log('[ClaudeAgentAdapter] SDK options:', JSON.stringify({
        allowedTools: options.allowedTools?.slice(0, 5),
        mcpServers: Object.keys(options.mcpServers || {}),
        cwd: options.cwd,
      }, null, 2));
      this.emit('debug', { type: 'info', message: 'Starting SDK query...' });

      for await (const event of query({ prompt, options })) {
        // Check for abort
        if (this.abortController?.signal.aborted) {
          console.log('[ClaudeAgentAdapter] Query aborted');
          this.emit('debug', { type: 'info', message: 'Query aborted' });
          break;
        }

        // Process the event
        console.log('[ClaudeAgentAdapter] SDK event:', event.type, (event as any).subtype || '');
        this.handleSdkEvent(event);
      }

      // Query completed successfully
      console.log('[ClaudeAgentAdapter] Query completed successfully');
      if (!this.abortController?.signal.aborted) {
        this.emit('complete', {
          status: 'success',
          sessionId: this.currentSessionId || undefined,
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : '';
      console.error('[ClaudeAgentAdapter] SDK ERROR:', errorMessage);
      console.error('[ClaudeAgentAdapter] Stack:', errorStack);
      this.emit('debug', { type: 'error', message: `SDK error: ${errorMessage}` });
      
      if (!this.isDisposed) {
        this.emit('complete', {
          status: 'error',
          sessionId: this.currentSessionId || undefined,
          error: errorMessage,
        });
      }
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Handle SDK events and normalize them
   */
  private handleSdkEvent(event: any): void {
    const eventType = event.type;
    const subtype = event.subtype;

    this.emit('debug', { 
      type: 'sdk-event', 
      message: `Event: ${eventType}${subtype ? `/${subtype}` : ''}`,
      data: event,
    });

    // Session initialization
    if (eventType === 'system' && subtype === 'init') {
      const sessionId = event.session_id;
      if (sessionId) {
        this.currentSessionId = sessionId;
        this.emit('session-init', sessionId);
        this.emit('debug', { type: 'info', message: `Session initialized: ${sessionId}` });
      }
      return;
    }

    // Assistant text content
    if (eventType === 'assistant' && event.message?.content) {
      for (const block of event.message.content) {
        if (block.type === 'text' && block.text) {
          const normalized: NormalizedEvent = {
            type: 'text',
            content: block.text,
            sessionId: this.currentSessionId || undefined,
          };
          this.emit('message', normalized);
        } else if (block.type === 'tool_use') {
          // Tool call started
          this.emit('tool-start', block.name, block.input, block.id);
          this.emit('progress', { stage: 'tool-use', message: `Using ${block.name}` });
          
          // Handle AskUserQuestion specially
          if (block.name === 'AskUserQuestion') {
            this.handleAskUserQuestion(block.input, block.id);
          }
        }
      }
      return;
    }

    // Tool result
    if (eventType === 'tool_result' || eventType === 'result') {
      const toolCallId = event.tool_use_id;
      const result = event.result || event.content || '';
      const isError = event.is_error || false;
      
      this.emit('tool-result', toolCallId, 
        typeof result === 'string' ? result : JSON.stringify(result),
        isError
      );
      return;
    }

    // Content delta (streaming text)
    if (eventType === 'content_block_delta') {
      const delta = event.delta;
      if (delta?.type === 'text_delta' && delta.text) {
        const normalized: NormalizedEvent = {
          type: 'text_delta',
          content: delta.text,
          sessionId: this.currentSessionId || undefined,
        };
        this.emit('message', normalized);
      }
      return;
    }

    // Thinking/reasoning content
    if (eventType === 'thinking' || (event.message?.content?.[0]?.type === 'thinking')) {
      const thinkingText = event.thinking || event.message?.content?.[0]?.thinking || '';
      if (thinkingText) {
        const normalized: NormalizedEvent = {
          type: 'thinking',
          content: thinkingText,
          sessionId: this.currentSessionId || undefined,
        };
        this.emit('message', normalized);
      }
      return;
    }

    // Result/completion
    if (eventType === 'result' && subtype === 'success') {
      const normalized: NormalizedEvent = {
        type: 'text',
        content: event.result || '',
        sessionId: this.currentSessionId || undefined,
      };
      this.emit('message', normalized);
      return;
    }

    // Error
    if (eventType === 'error') {
      const normalized: NormalizedEvent = {
        type: 'error',
        error: event.error || event.message || 'Unknown error',
        sessionId: this.currentSessionId || undefined,
      };
      this.emit('message', normalized);
      return;
    }
  }

  /**
   * Handle permission check for tools that need approval
   */
  private async handlePermissionCheck(input: any, toolUseId: string): Promise<{ decision?: 'deny' }> {
    const toolName = input.tool_name || input.toolName || 'unknown';
    const toolInput = input.tool_input || input.toolInput || {};

    // Emit permission request in the format that IPC handlers expect
    const permissionRequest: PermissionRequest = {
      id: toolUseId,
      taskId: this.currentTaskId || '',
      type: 'tool',
      toolName,
      toolInput,
      createdAt: new Date().toISOString(),
    };
    this.emit('permission-request', permissionRequest as any);

    // Wait for permission response
    return new Promise((resolve) => {
      this.pendingPermissions.set(toolUseId, (allowed) => {
        if (allowed) {
          resolve({});
        } else {
          resolve({ decision: 'deny' });
        }
      });

      // Timeout after 5 minutes
      setTimeout(() => {
        if (this.pendingPermissions.has(toolUseId)) {
          this.pendingPermissions.delete(toolUseId);
          resolve({ decision: 'deny' });
        }
      }, 5 * 60 * 1000);
    });
  }

  /**
   * Respond to a pending permission request
   */
  respondToPermission(toolCallId: string, allowed: boolean): void {
    const resolver = this.pendingPermissions.get(toolCallId);
    if (resolver) {
      resolver(allowed);
      this.pendingPermissions.delete(toolCallId);
    }
  }

  /**
   * Handle AskUserQuestion tool
   */
  private handleAskUserQuestion(input: any, toolCallId: string): void {
    const question = input.questions?.[0];
    if (!question) return;

    const permissionRequest: PermissionRequest = {
      id: this.generateRequestId(),
      taskId: this.currentTaskId || '',
      type: 'question',
      question: question.question,
      options: question.options?.map((o: any) => ({
        label: o.label,
        description: o.description,
      })),
      multiSelect: question.multiSelect,
      createdAt: new Date().toISOString(),
    };

    // Store the tool call ID for response routing
    (permissionRequest as any).toolCallId = toolCallId;

    this.emit('permission-request', permissionRequest as any);
  }

  /**
   * Send user response for permission/question
   */
  async sendResponse(response: string): Promise<void> {
    // In SDK mode, responses are handled via permission hooks
    // This method is kept for API compatibility
    this.emit('debug', { type: 'info', message: `Response received: ${response}` });
  }

  /**
   * Resume an existing session
   */
  async resumeSession(sessionId: string, prompt: string): Promise<Task> {
    return this.startTask({
      prompt,
      sessionId,
    });
  }

  /**
   * Cancel the current task (hard abort)
   */
  async cancelTask(): Promise<void> {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.isRunning = false;
  }

  /**
   * Interrupt the current task (graceful stop)
   */
  async interruptTask(): Promise<void> {
    // In SDK mode, interrupt is the same as cancel
    // The SDK handles graceful shutdown internally
    await this.cancelTask();
    
    if (!this.isDisposed) {
      this.emit('complete', {
        status: 'interrupted',
        sessionId: this.currentSessionId || undefined,
      });
    }
  }

  /**
   * Get the current session ID
   */
  getSessionId(): string | null {
    return this.currentSessionId;
  }

  /**
   * Get the current task ID
   */
  getTaskId(): string | null {
    return this.currentTaskId;
  }

  /**
   * Check if the adapter has been disposed
   */
  isAdapterDisposed(): boolean {
    return this.isDisposed;
  }

  /**
   * Dispose the adapter and clean up resources
   */
  dispose(): void {
    if (this.isDisposed) {
      return;
    }

    this.emit('debug', { type: 'info', message: `Disposing adapter for task ${this.currentTaskId}` });
    this.isDisposed = true;

    // Abort any running query
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    // Clear pending permissions
    this.pendingPermissions.clear();

    // Clear state
    this.currentSessionId = null;
    this.currentTaskId = null;
    this.isRunning = false;

    // Remove all listeners
    this.removeAllListeners();
  }

  private generateTaskId(): string {
    return `task_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Find the Claude CLI executable path
   * Searches common installation locations
   */
  private async findClaudeCliPath(): Promise<string> {
    const { existsSync } = await import('fs');
    const { homedir } = await import('os');
    const { join } = await import('path');
    const { execSync } = await import('child_process');

    // Common paths to check
    const possiblePaths = [
      // User's local bin (most common for npm global installs)
      join(homedir(), '.local', 'bin', 'claude'),
      // npm global bin
      join(homedir(), '.npm-global', 'bin', 'claude'),
      // Homebrew on macOS
      '/opt/homebrew/bin/claude',
      '/usr/local/bin/claude',
      // Linux
      '/usr/bin/claude',
    ];

    // Check each path
    for (const p of possiblePaths) {
      if (existsSync(p)) {
        return p;
      }
    }

    // Try using 'which' command as fallback
    try {
      const whichResult = execSync('which claude', { encoding: 'utf-8' }).trim();
      if (whichResult && existsSync(whichResult)) {
        return whichResult;
      }
    } catch {
      // 'which' failed, continue
    }

    // If not found, throw helpful error
    throw new Error(
      'Claude CLI not found. Please install it with: npm install -g @anthropic-ai/claude-code'
    );
  }
}

/**
 * Factory function to create a new adapter instance
 */
export function createClaudeAgentAdapter(taskId?: string): ClaudeAgentAdapter {
  return new ClaudeAgentAdapter(taskId);
}
