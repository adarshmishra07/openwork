import Store from 'electron-store';
import type { Task, TaskMessage, TaskStatus } from '@shopos/shared';

/**
 * Key asset tracked during task execution for context preservation on resume
 */
export interface KeyAsset {
  type: 'image' | 'file' | 'url';
  url: string;
  description: string;
  timestamp: string;
}

/**
 * Task entry stored in history
 */
export interface StoredTask {
  id: string;
  prompt: string;
  /** AI-generated short summary of the task (displayed in history) */
  summary?: string;
  status: TaskStatus;
  messages: TaskMessage[];
  sessionId?: string;
  /** Key assets (images, files, URLs) from the conversation for context on resume */
  keyAssets?: KeyAsset[];
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

interface TaskHistorySchema {
  tasks: StoredTask[];
  maxHistoryItems: number;
}

const taskHistoryStore = new Store<TaskHistorySchema>({
  name: 'task-history',
  defaults: {
    tasks: [],
    maxHistoryItems: 100,
  },
});

const PERSIST_DEBOUNCE_MS = 250;
let pendingTasks: StoredTask[] | null = null;
let persistTimeout: NodeJS.Timeout | null = null;

function getCurrentTasks(): StoredTask[] {
  return pendingTasks ?? taskHistoryStore.get('tasks') ?? [];
}

function schedulePersist(tasks: StoredTask[]): void {
  pendingTasks = tasks;
  if (persistTimeout) {
    return;
  }
  persistTimeout = setTimeout(() => {
    if (pendingTasks) {
      taskHistoryStore.set('tasks', pendingTasks);
      pendingTasks = null;
    }
    persistTimeout = null;
  }, PERSIST_DEBOUNCE_MS);
}

/**
 * Immediately flush any pending task history writes to disk.
 * Call this on app shutdown (e.g., 'before-quit' event) to prevent data loss.
 */
export function flushPendingTasks(): void {
  if (persistTimeout) {
    clearTimeout(persistTimeout);
    persistTimeout = null;
  }
  if (pendingTasks) {
    taskHistoryStore.set('tasks', pendingTasks);
    pendingTasks = null;
  }
}

/**
 * Get all tasks from history
 */
export function getTasks(): StoredTask[] {
  return getCurrentTasks();
}

/**
 * Get a specific task by ID
 */
export function getTask(taskId: string): StoredTask | undefined {
  const tasks = getCurrentTasks();
  return tasks.find((t) => t.id === taskId);
}

/**
 * Save a new task to history
 */
export function saveTask(task: Task): void {
  const tasks = getCurrentTasks();
  const maxItems = taskHistoryStore.get('maxHistoryItems');

  const storedTask: StoredTask = {
    id: task.id,
    prompt: task.prompt,
    summary: task.summary,
    status: task.status,
    messages: task.messages || [],
    sessionId: task.sessionId,
    createdAt: task.createdAt,
    startedAt: task.startedAt,
    completedAt: task.completedAt,
  };

  // Check if task already exists (update it)
  const existingIndex = tasks.findIndex((t) => t.id === task.id);
  if (existingIndex >= 0) {
    tasks[existingIndex] = storedTask;
  } else {
    // Add new task at the beginning
    tasks.unshift(storedTask);
  }

  // Limit history size
  if (tasks.length > maxItems) {
    tasks.splice(maxItems);
  }

  schedulePersist([...tasks]);
}

/**
 * Update a task's status
 */
export function updateTaskStatus(
  taskId: string,
  status: StoredTask['status'],
  completedAt?: string
): void {
  const tasks = getCurrentTasks();
  const taskIndex = tasks.findIndex((t) => t.id === taskId);

  if (taskIndex >= 0) {
    tasks[taskIndex].status = status;
    if (completedAt) {
      tasks[taskIndex].completedAt = completedAt;
    }
    schedulePersist([...tasks]);
  }
}

/**
 * Add a message to a task
 */
export function addTaskMessage(taskId: string, message: TaskMessage): void {
  const tasks = getCurrentTasks();
  const taskIndex = tasks.findIndex((t) => t.id === taskId);

  if (taskIndex >= 0) {
    tasks[taskIndex].messages.push(message);
    schedulePersist([...tasks]);
  }
}

/**
 * Update task's session ID
 */
export function updateTaskSessionId(taskId: string, sessionId: string): void {
  const tasks = getCurrentTasks();
  const taskIndex = tasks.findIndex((t) => t.id === taskId);

  if (taskIndex >= 0) {
    tasks[taskIndex].sessionId = sessionId;
    schedulePersist([...tasks]);
  }
}

/**
 * Update task's AI-generated summary
 */
export function updateTaskSummary(taskId: string, summary: string): void {
  const tasks = getCurrentTasks();
  const taskIndex = tasks.findIndex((t) => t.id === taskId);

  if (taskIndex >= 0) {
    tasks[taskIndex].summary = summary;
    schedulePersist([...tasks]);
  }
}

/**
 * Add a key asset to a task for context preservation on resume
 * Deduplicates by URL to avoid storing the same asset multiple times
 */
export function addKeyAsset(taskId: string, asset: KeyAsset): void {
  const tasks = getCurrentTasks();
  const taskIndex = tasks.findIndex((t) => t.id === taskId);

  if (taskIndex >= 0) {
    if (!tasks[taskIndex].keyAssets) {
      tasks[taskIndex].keyAssets = [];
    }
    
    // Deduplicate by URL
    const existingIndex = tasks[taskIndex].keyAssets!.findIndex(a => a.url === asset.url);
    if (existingIndex >= 0) {
      // Update existing asset with new description if provided
      if (asset.description) {
        tasks[taskIndex].keyAssets![existingIndex].description = asset.description;
      }
    } else {
      // Add new asset (limit to 20 most recent to avoid bloat)
      tasks[taskIndex].keyAssets!.push(asset);
      if (tasks[taskIndex].keyAssets!.length > 20) {
        tasks[taskIndex].keyAssets = tasks[taskIndex].keyAssets!.slice(-20);
      }
    }
    
    schedulePersist([...tasks]);
  }
}

/**
 * Get key assets for a task
 */
export function getKeyAssets(taskId: string): KeyAsset[] {
  const task = getTask(taskId);
  return task?.keyAssets || [];
}

/**
 * Delete a task from history
 */
export function deleteTask(taskId: string): void {
  const tasks = getCurrentTasks();
  const filteredTasks = tasks.filter((t) => t.id !== taskId);
  schedulePersist(filteredTasks);
}

/**
 * Clear all task history
 */
export function clearHistory(): void {
  schedulePersist([]);
}

/**
 * Set maximum history items
 */
export function setMaxHistoryItems(max: number): void {
  taskHistoryStore.set('maxHistoryItems', max);

  // Trim existing history if needed
  const tasks = getCurrentTasks();
  if (tasks.length > max) {
    tasks.splice(max);
    schedulePersist([...tasks]);
  }
}

/**
 * Clear all task history data (reset store to defaults)
 * Used during fresh install cleanup
 */
export function clearTaskHistoryStore(): void {
  // Clear any pending writes
  if (persistTimeout) {
    clearTimeout(persistTimeout);
    persistTimeout = null;
  }
  pendingTasks = null;

  // Clear the store (resets to defaults)
  taskHistoryStore.clear();
}
