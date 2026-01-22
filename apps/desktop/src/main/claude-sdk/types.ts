/**
 * Type definitions for Claude Agent SDK integration
 * 
 * Maps SDK event types to our internal TaskMessage format
 */

/**
 * Configuration for the Claude Agent SDK adapter
 */
export interface ClaudeAgentConfig {
  /** The user prompt/message */
  prompt: string;
  /** Task identifier */
  taskId?: string;
  /** Session ID for resuming conversations */
  sessionId?: string;
  /** Working directory for file operations */
  workingDirectory?: string;
  /** Attached files */
  files?: string[];
  /** Model to use (e.g., 'claude-sonnet-4-20250514') */
  model?: string;
  /** Provider (anthropic, bedrock, etc.) */
  provider?: string;
}

/**
 * MCP server configuration for stdio transport (local servers)
 */
export interface McpServerStdio {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

/**
 * MCP server configuration for HTTP transport (remote servers)
 */
export interface McpServerHttp {
  type: 'http' | 'sse';
  url: string;
  headers?: Record<string, string>;
}

export type McpServerConfig = McpServerStdio | McpServerHttp;

/**
 * Normalized event types from Claude Agent SDK
 * These are transformed to our TaskMessage format
 */
export type NormalizedEventType = 
  | 'session_init'
  | 'text'
  | 'text_delta'
  | 'tool_use_start'
  | 'tool_use_result'
  | 'thinking'
  | 'error'
  | 'done';

/**
 * Normalized event from SDK
 */
export interface NormalizedEvent {
  type: NormalizedEventType;
  sessionId?: string;
  content?: string;
  toolName?: string;
  toolInput?: unknown;
  toolCallId?: string;
  toolResult?: string;
  isError?: boolean;
  error?: string;
}

/**
 * Permission hook context passed to permission handlers
 */
export interface PermissionContext {
  toolName: string;
  toolInput: unknown;
  toolCallId: string;
}

/**
 * Permission hook result
 */
export interface PermissionResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Adapter events interface
 */
export interface ClaudeAgentAdapterEvents {
  'session-init': [string]; // session ID
  'message': [NormalizedEvent];
  'tool-start': [string, unknown, string]; // toolName, toolInput, toolCallId
  'tool-result': [string, string, boolean]; // toolCallId, result, isError
  'permission-request': [PermissionContext];
  'progress': [{ stage: string; message?: string }];
  'complete': [{ status: 'success' | 'error' | 'interrupted'; sessionId?: string; error?: string }];
  'error': [Error];
  'debug': [{ type: string; message: string; data?: unknown }];
}
