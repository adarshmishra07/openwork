/**
 * Standardized error types for Shop OS
 */

export type ErrorSeverity = 'warning' | 'error' | 'critical';

export interface ErrorEvent {
  /** Unique error identifier */
  id: string;
  /** Human-readable error message */
  message: string;
  /** Error severity level */
  severity: ErrorSeverity;
  /** Technical error details (stack trace, etc.) */
  details?: string;
  /** Error code for categorization */
  code?: string;
  /** Timestamp when error occurred */
  timestamp: string;
  /** Source of the error (tool name, component, etc.) */
  source?: string;
  /** Whether the error is recoverable */
  recoverable?: boolean;
  /** Suggested action for the user */
  suggestedAction?: string;
}

export interface ToolError extends ErrorEvent {
  /** The tool that caused the error */
  toolName: string;
  /** Tool input that caused the error */
  toolInput?: unknown;
}

export interface SpaceError extends ErrorEvent {
  /** The space that caused the error */
  spaceName: string;
  /** Space request that caused the error */
  request?: unknown;
}

/**
 * Helper to create a standardized error event
 */
export function createErrorEvent(
  message: string,
  options?: Partial<Omit<ErrorEvent, 'id' | 'message' | 'timestamp'>>
): ErrorEvent {
  // Generate a simple unique ID without relying on crypto
  const id = `err_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  return {
    id,
    message,
    severity: options?.severity ?? 'error',
    timestamp: new Date().toISOString(),
    ...options,
  };
}
