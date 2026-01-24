/**
 * Task-related types for execution management
 */

export type TaskStatus =
  | 'pending'
  | 'queued'
  | 'running'
  | 'waiting_permission'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'interrupted';

export interface TaskConfig {
  /** The task prompt/description */
  prompt: string;
  /** Optional task ID to correlate events */
  taskId?: string;
  /** Working directory for Claude Code operations */
  workingDirectory?: string;
  /** List of allowed tools */
  allowedTools?: string[];
  /** System prompt to append */
  systemPromptAppend?: string;
  /** JSON schema for structured output */
  outputSchema?: object;
  /** Session ID for resuming */
  sessionId?: string;
  /** File paths to attach to the message (legacy, for local files) */
  files?: string[];
  /** S3-uploaded file attachments with URLs */
  attachments?: Array<{
    /** Original filename */
    filename: string;
    /** MIME type */
    contentType: string;
    /** S3 URL */
    url: string;
    /** File size in bytes */
    size: number;
  }>;
}

export interface Task {
  id: string;
  prompt: string;
  /** AI-generated short summary of the task (displayed in history) */
  summary?: string;
  status: TaskStatus;
  sessionId?: string;
  messages: TaskMessage[];
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  result?: TaskResult;
  /** Error message when task fails */
  error?: string;
}

export interface TaskAttachment {
  type: 'screenshot' | 'json' | 'file';
  data: string; // base64 for images, JSON string for data, or URL for files
  label?: string; // e.g., "Screenshot after clicking Submit"
  /** MIME type for file attachments */
  contentType?: string;
  /** Original filename for file attachments */
  filename?: string;
}

export interface TaskMessage {
  id: string;
  type: 'assistant' | 'user' | 'tool' | 'system';
  content: string;
  toolName?: string;
  toolInput?: unknown;
  timestamp: string;
  /** Attachments like screenshots captured during browser automation */
  attachments?: TaskAttachment[];
  /** Subtype for assistant messages: 'thinking' (internal updates) vs 'response' (final output to user) */
  subtype?: 'thinking' | 'response';
  /** Status for tool messages */
  toolStatus?: 'running' | 'completed' | 'error';
  /** Human-readable label for display (e.g., "Product created" instead of raw JSON) */
  displayLabel?: string;
  /** Whether this message is a final response that should persist as a chat bubble */
  isFinal?: boolean;
}

export interface TaskResult {
  status: 'success' | 'error' | 'interrupted';
  sessionId?: string;
  durationMs?: number;
  error?: string;
}

export interface TaskProgress {
  taskId: string;
  stage: 'init' | 'thinking' | 'tool-use' | 'waiting' | 'complete';
  toolName?: string;
  toolInput?: unknown;
  percentage?: number;
  message?: string;
}

export interface TaskUpdateEvent {
  taskId: string;
  type: 'message' | 'progress' | 'complete' | 'error';
  message?: TaskMessage;
  progress?: TaskProgress;
  result?: TaskResult;
  error?: string;
}

/**
 * Todo item from TodoWrite tool calls
 * Used for displaying agent task progress in the UI
 */
export interface TodoItem {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  priority: 'high' | 'medium' | 'low';
}
