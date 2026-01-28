import { create } from 'zustand';
import type {
  Task,
  TaskConfig,
  TaskStatus,
  TaskUpdateEvent,
  PermissionRequest,
  PermissionResponse,
  TaskMessage,
} from '@shopos/shared';
import { getAccomplish } from '../lib/accomplish';
import { showTaskErrorToast } from '../lib/toast';

// Batch update event type for performance optimization
interface TaskUpdateBatchEvent {
  taskId: string;
  messages: TaskMessage[];
}

// Setup progress event type
interface SetupProgressEvent {
  taskId: string;
  stage: string;
  message?: string;
}

// Selected image reference for chat input
interface SelectedImage {
  label: string;  // A, B, C, etc.
  url: string;
}

interface TaskState {
  // Current task
  currentTask: Task | null;
  isLoading: boolean;
  error: string | null;

  // Task history
  tasks: Task[];

  // Permission handling
  permissionRequest: PermissionRequest | null;

  // Setup progress (e.g., browser download)
  setupProgress: string | null;
  setupProgressTaskId: string | null;
  setupDownloadStep: number; // 1=Chromium, 2=FFMPEG, 3=Headless Shell

  // Task launcher
  isLauncherOpen: boolean;
  openLauncher: () => void;
  closeLauncher: () => void;

  // Image selection for chat input
  selectedImages: SelectedImage[];
  selectImage: (label: string, url: string) => void;
  deselectImage: (label: string) => void;
  clearSelectedImages: () => void;

  // Actions
  startTask: (config: TaskConfig) => Promise<Task | null>;
  setSetupProgress: (taskId: string | null, message: string | null) => void;
  sendFollowUp: (message: string, attachments?: Array<{ filename: string; contentType: string; url: string; size: number }>, imageReferences?: Array<{ label: string; url: string }>) => Promise<void>;
  cancelTask: () => Promise<void>;
  interruptTask: () => Promise<void>;
  setPermissionRequest: (request: PermissionRequest | null) => void;
  respondToPermission: (response: PermissionResponse) => Promise<void>;
  addTaskUpdate: (event: TaskUpdateEvent) => void;
  addTaskUpdateBatch: (event: TaskUpdateBatchEvent) => void;
  updateTaskStatus: (taskId: string, status: TaskStatus) => void;
  setTaskSummary: (taskId: string, summary: string) => void;
  loadTasks: () => Promise<void>;
  loadTaskById: (taskId: string) => Promise<void>;
  deleteTask: (taskId: string) => Promise<void>;
  clearHistory: () => Promise<void>;
  reset: () => void;
}

function createMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export const useTaskStore = create<TaskState>((set, get) => ({
  currentTask: null,
  isLoading: false,
  error: null,
  tasks: [],
  permissionRequest: null,
  setupProgress: null,
  setupProgressTaskId: null,
  setupDownloadStep: 1,
  
  // Image selection state
  selectedImages: [],
  
  selectImage: (label: string, url: string) => {
    set((state) => {
      // Don't add duplicates
      if (state.selectedImages.some((img) => img.label === label)) {
        return state;
      }
      return { selectedImages: [...state.selectedImages, { label, url }] };
    });
  },
  
  deselectImage: (label: string) => {
    set((state) => ({
      selectedImages: state.selectedImages.filter((img) => img.label !== label),
    }));
  },
  
  clearSelectedImages: () => {
    set({ selectedImages: [] });
  },
  isLauncherOpen: false,

  setSetupProgress: (taskId: string | null, message: string | null) => {
    // Detect which package is being downloaded from the message
    let step = useTaskStore.getState().setupDownloadStep;
    if (message) {
      const lowerMsg = message.toLowerCase();
      if (lowerMsg.includes('downloading chromium headless')) {
        step = 3;
      } else if (lowerMsg.includes('downloading ffmpeg')) {
        step = 2;
      } else if (lowerMsg.includes('downloading chromium')) {
        step = 1;
      }
    }
    set({ setupProgress: message, setupProgressTaskId: taskId, setupDownloadStep: step });
  },

  startTask: async (config: TaskConfig) => {
    const accomplish = getAccomplish();
    set({ isLoading: true, error: null });
    try {
      void accomplish.logEvent({
        level: 'info',
        message: 'UI start task',
        context: { prompt: config.prompt, taskId: config.taskId },
      });
      const task = await accomplish.startTask(config);
      // Task might be 'running' or 'queued' depending on if another task is running
      // Also add to tasks list so sidebar updates immediately
      const currentTasks = get().tasks;
      set({
        currentTask: task,
        tasks: [task, ...currentTasks.filter((t) => t.id !== task.id)],
        // Keep loading state if queued (waiting for queue)
        isLoading: task.status === 'queued',
      });
      void accomplish.logEvent({
        level: 'info',
        message: task.status === 'queued' ? 'UI task queued' : 'UI task started',
        context: { taskId: task.id, status: task.status },
      });
      return task;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to start task';
      set({
        error: errorMsg,
        isLoading: false,
      });
      showTaskErrorToast(errorMsg);
      void accomplish.logEvent({
        level: 'error',
        message: 'UI task start failed',
        context: { error: err instanceof Error ? err.message : String(err) },
      });
      return null;
    }
  },

  sendFollowUp: async (message: string, attachments?: Array<{ filename: string; contentType: string; url: string; size: number }>, imageReferences?: Array<{ label: string; url: string }>) => {
    const accomplish = getAccomplish();
    const { currentTask, startTask } = get();
    if (!currentTask) {
      set({ error: 'No active task to continue' });
      void accomplish.logEvent({
        level: 'warn',
        message: 'UI follow-up failed: no active task',
      });
      return;
    }

    const sessionId = currentTask.result?.sessionId || currentTask.sessionId;
    
    console.log(`[TaskStore:sendFollowUp] Checking session:`, {
      taskId: currentTask.id,
      sessionId,
      resultSessionId: currentTask.result?.sessionId,
      taskSessionId: currentTask.sessionId,
      taskStatus: currentTask.status,
      hasResult: !!currentTask.result,
    });

    // If no session but task was interrupted, start a fresh task with the new message
    if (!sessionId && currentTask.status === 'interrupted') {
      console.log(`[TaskStore:sendFollowUp] No session, interrupted task - starting fresh`);
      void accomplish.logEvent({
        level: 'info',
        message: 'UI follow-up: starting fresh task (no session from interrupted task)',
        context: { taskId: currentTask.id },
      });
      await startTask({ prompt: message, attachments });
      return;
    }

    if (!sessionId) {
      console.log(`[TaskStore:sendFollowUp] No session found - aborting`);
      set({ error: 'No session to continue - please start a new task' });
      void accomplish.logEvent({
        level: 'warn',
        message: 'UI follow-up failed: missing session',
        context: { taskId: currentTask.id },
      });
      return;
    }
    
    console.log(`[TaskStore:sendFollowUp] Resuming session ${sessionId} with message: "${message.substring(0, 30)}..."`)

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
      content: message,
      timestamp: new Date().toISOString(),
      attachments: messageAttachments,
      imageReferences,
    };

    // Optimistically add user message and set status to running
    const taskId = currentTask.id;
    set((state) => ({
      isLoading: true,
      error: null,
      currentTask: state.currentTask
        ? {
            ...state.currentTask,
            status: 'running',
            result: undefined,
            messages: [...state.currentTask.messages, userMessage],
          }
        : null,
      tasks: state.tasks.map((t) =>
        t.id === taskId ? { ...t, status: 'running' as TaskStatus } : t
      ),
    }));

    try {
      void accomplish.logEvent({
        level: 'info',
        message: 'UI follow-up sent',
        context: { taskId: currentTask.id, message, attachmentCount: attachments?.length || 0 },
      });
      const task = await accomplish.resumeSession(sessionId, message, currentTask.id, attachments);

      // Update status based on response (could be 'running' or 'queued')
      set((state) => ({
        currentTask: state.currentTask
          ? { ...state.currentTask, status: task.status }
          : null,
        isLoading: task.status === 'queued',
        tasks: state.tasks.map((t) =>
          t.id === taskId ? { ...t, status: task.status } : t
        ),
      }));
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to send message';
      set((state) => ({
        error: errorMsg,
        isLoading: false,
        currentTask: state.currentTask
          ? { ...state.currentTask, status: 'failed' }
          : null,
        tasks: state.tasks.map((t) =>
          t.id === taskId ? { ...t, status: 'failed' as TaskStatus } : t
        ),
      }));
      showTaskErrorToast(errorMsg);
      void accomplish.logEvent({
        level: 'error',
        message: 'UI follow-up failed',
        context: { taskId: currentTask.id, error: err instanceof Error ? err.message : String(err) },
      });
    }
  },

  cancelTask: async () => {
    const accomplish = getAccomplish();
    const { currentTask } = get();
    if (currentTask) {
      void accomplish.logEvent({
        level: 'info',
        message: 'UI cancel task',
        context: { taskId: currentTask.id },
      });
      await accomplish.cancelTask(currentTask.id);
      set((state) => ({
        currentTask: state.currentTask
          ? { ...state.currentTask, status: 'cancelled' }
          : null,
        tasks: state.tasks.map((t) =>
          t.id === currentTask.id ? { ...t, status: 'cancelled' as TaskStatus } : t
        ),
      }));
    }
  },

  interruptTask: async () => {
    const accomplish = getAccomplish();
    const { currentTask } = get();
    if (currentTask && currentTask.status === 'running') {
      void accomplish.logEvent({
        level: 'info',
        message: 'UI interrupt task',
        context: { taskId: currentTask.id },
      });
      await accomplish.interruptTask(currentTask.id);
      // Note: Don't change task status - task is still running, just interrupted
    }
  },

  setPermissionRequest: (request) => {
    set({ permissionRequest: request });
  },

  respondToPermission: async (response: PermissionResponse) => {
    const accomplish = getAccomplish();
    void accomplish.logEvent({
      level: 'info',
      message: 'UI permission response',
      context: { ...response },
    });
    await accomplish.respondToPermission(response);
    set({ permissionRequest: null });
  },

  addTaskUpdate: (event: TaskUpdateEvent) => {
    const accomplish = getAccomplish();
    void accomplish.logEvent({
      level: 'debug',
      message: 'UI task update received',
      context: { ...event },
    });
    set((state) => {
      // Determine if this event is for the currently viewed task
      const isCurrentTask = state.currentTask?.id === event.taskId;

      // Start with current state
      let updatedCurrentTask = state.currentTask;
      let updatedTasks = state.tasks;
      let newStatus: TaskStatus | null = null;

      // Handle message events - only if viewing this task
      if (event.type === 'message' && event.message && isCurrentTask && state.currentTask) {
        const messages = [...state.currentTask.messages];
        const existingIndex = messages.findIndex(m => m.id === event.message!.id);
        
        if (existingIndex !== -1) {
          // Update existing message (e.g. tool status change)
          console.log(`[TaskStore:addTaskUpdate] Updating existing message: ${event.message.id}`);
          messages[existingIndex] = {
            ...messages[existingIndex],
            ...event.message,
            // Preserve content if the update has no content (common for status updates)
            content: event.message.content || messages[existingIndex].content
          };
        } else {
          // Append new message
          console.log(`[TaskStore:addTaskUpdate] Appending new message: ${event.message.id}`);
          messages.push(event.message);
        }

        updatedCurrentTask = {
          ...state.currentTask,
          messages,
        };
      }

      // Handle complete events
      if (event.type === 'complete' && event.result) {
        console.log(`[TaskStore:onTaskUpdate] Task complete event:`, {
          taskId: event.taskId,
          resultStatus: event.result.status,
          resultSessionId: event.result.sessionId,
          currentTaskSessionId: state.currentTask?.sessionId,
        });
        
        // Map result status to task status
        if (event.result.status === 'success') {
          newStatus = 'completed';
        } else if (event.result.status === 'interrupted') {
          newStatus = 'interrupted';
        } else {
          newStatus = 'failed';
        }

        // Update currentTask if viewing this task
        if (isCurrentTask && state.currentTask) {
          const newSessionId = event.result.sessionId || state.currentTask.sessionId;
          console.log(`[TaskStore:onTaskUpdate] Setting sessionId on task: ${newSessionId}`);
          updatedCurrentTask = {
            ...state.currentTask,
            status: newStatus,
            result: event.result,
            // Don't set completedAt for interrupted tasks - they can continue
            completedAt: newStatus === 'interrupted' ? undefined : new Date().toISOString(),
            sessionId: newSessionId,
          };
        }
      }

      // Handle error events
      if (event.type === 'error') {
        newStatus = 'failed';

        // Show toast for task errors
        if (event.error) {
          showTaskErrorToast(event.error);
        }

        // Update currentTask if viewing this task
        if (isCurrentTask && state.currentTask) {
          updatedCurrentTask = {
            ...state.currentTask,
            status: newStatus,
            result: { status: 'error', error: event.error },
          };
        }
      }

      // Always update sidebar tasks list if status changed
      if (newStatus) {
        const finalStatus = newStatus;
        updatedTasks = state.tasks.map((t) =>
          t.id === event.taskId ? { ...t, status: finalStatus } : t
        );
      }

      // Clear permission request when task completes, fails, or is interrupted
      // EXCEPT: Keep question permission requests visible so user can still answer
      // (late responses will trigger session resume)
      const currentPermission = get().permissionRequest;
      const isQuestionPermission = currentPermission?.type === 'question';
      
      // If task is "completing" but there's a pending question, override to waiting_permission
      // This prevents the UI from showing "Completed" while user still needs to answer
      let effectiveStatus: TaskStatus | null = newStatus;
      if (newStatus === 'completed' && isQuestionPermission && isCurrentTask) {
        const overrideStatus: TaskStatus = 'waiting_permission';
        effectiveStatus = overrideStatus;
        // Also update the task object with the overridden status
        if (updatedCurrentTask) {
          updatedCurrentTask = { ...updatedCurrentTask, status: overrideStatus };
        }
        // Update in tasks list too
        updatedTasks = state.tasks.map((t): Task =>
          t.id === event.taskId ? { ...t, status: overrideStatus } : t
        );
      }
      
      const shouldClearPermission = effectiveStatus && isCurrentTask && 
        (effectiveStatus === 'completed' || effectiveStatus === 'failed' || effectiveStatus === 'interrupted') &&
        !isQuestionPermission; // Don't clear questions - user can still answer

      return {
        currentTask: updatedCurrentTask,
        tasks: updatedTasks,
        isLoading: false,
        // Clear permission request if task is done (but not questions)
        ...(shouldClearPermission ? { permissionRequest: null } : {}),
      };
    });
  },

  // Batch update handler for performance - processes multiple messages in single state update
  addTaskUpdateBatch: (event: TaskUpdateBatchEvent) => {
    const accomplish = getAccomplish();
    void accomplish.logEvent({
      level: 'debug',
      message: 'UI task batch update received',
      context: { taskId: event.taskId, messageCount: event.messages.length },
    });
    set((state) => {
      if (!state.currentTask || state.currentTask.id !== event.taskId) {
        return state;
      }

      // Add all messages in a single state update
      const updatedTask = {
        ...state.currentTask,
        messages: [...state.currentTask.messages, ...event.messages],
      };

      return { currentTask: updatedTask, isLoading: false };
    });
  },

  // Update task status (e.g., queued -> running)
  updateTaskStatus: (taskId: string, status: TaskStatus) => {
    set((state) => {
      // Update in tasks list
      const updatedTasks = state.tasks.map((task) =>
        task.id === taskId
          ? { ...task, status, updatedAt: new Date().toISOString() }
          : task
      );

      // Update currentTask if it matches
      const updatedCurrentTask =
        state.currentTask?.id === taskId
          ? { ...state.currentTask, status, updatedAt: new Date().toISOString() }
          : state.currentTask;

      return {
        tasks: updatedTasks,
        currentTask: updatedCurrentTask,
      };
    });
  },

  // Update task summary (AI-generated)
  setTaskSummary: (taskId: string, summary: string) => {
    set((state) => {
      // Update in tasks list
      const updatedTasks = state.tasks.map((task) =>
        task.id === taskId ? { ...task, summary } : task
      );

      // Update currentTask if it matches
      const updatedCurrentTask =
        state.currentTask?.id === taskId
          ? { ...state.currentTask, summary }
          : state.currentTask;

      return {
        tasks: updatedTasks,
        currentTask: updatedCurrentTask,
      };
    });
  },

  loadTasks: async () => {
    const accomplish = getAccomplish();
    const tasks = await accomplish.listTasks();
    set({ tasks });
  },

  loadTaskById: async (taskId: string) => {
    const accomplish = getAccomplish();
    const task = await accomplish.getTask(taskId);
    set({ currentTask: task, error: task ? null : 'Task not found' });
  },

  deleteTask: async (taskId: string) => {
    const accomplish = getAccomplish();
    await accomplish.deleteTask(taskId);
    set((state) => ({
      tasks: state.tasks.filter((t) => t.id !== taskId),
    }));
  },

  clearHistory: async () => {
    const accomplish = getAccomplish();
    await accomplish.clearTaskHistory();
    set({ tasks: [] });
  },

  reset: () => {
    set({
      currentTask: null,
      isLoading: false,
      error: null,
      permissionRequest: null,
      setupProgress: null,
      setupProgressTaskId: null,
      setupDownloadStep: 1,
      isLauncherOpen: false,
    });
  },

  openLauncher: () => set({ isLauncherOpen: true }),
  closeLauncher: () => set({ isLauncherOpen: false }),
}));

// Global subscription to setup progress events (browser download, etc.)
// This runs when the module is loaded to catch early progress events
if (typeof window !== 'undefined' && window.accomplish) {
  window.accomplish.onTaskProgress((progress: unknown) => {
    const event = progress as SetupProgressEvent;
    if (event.message) {
      // Clear progress if installation completed
      if (event.message.toLowerCase().includes('installed successfully')) {
        useTaskStore.getState().setSetupProgress(null, null);
      } else {
        useTaskStore.getState().setSetupProgress(event.taskId, event.message);
      }
    }
  });

  // Track streaming messages by messageId to handle tool messages interspersed with text
  // Map: messageId -> index in messages array
  const streamingMessageMap = new Map<string, number>();
  
  // Subscribe to real-time text streaming (from server adapter SSE)
  // This provides true streaming - text arrives as model generates it
  window.accomplish.onTaskTextDelta?.((event: { taskId: string; messageId: string; text: string }) => {
    console.log(`[TaskStore:onTaskTextDelta] Received:`, {
      taskId: event.taskId,
      messageId: event.messageId,
      textLength: event.text.length,
      textPreview: event.text.substring(0, 30),
    });
    
    const state = useTaskStore.getState();
    if (!state.currentTask || state.currentTask.id !== event.taskId) {
      console.log(`[TaskStore:onTaskTextDelta] Skipping - no matching task`, {
        hasCurrentTask: !!state.currentTask,
        currentTaskId: state.currentTask?.id,
        eventTaskId: event.taskId,
      });
      return;
    }

    const messages = [...state.currentTask.messages];
    
    // Check if we already have a message for this messageId
    let existingIndex = streamingMessageMap.get(event.messageId);
    
    // If not in map, search messages array by ID (to prevent double bubbles if onTaskUpdate fired first)
    if (existingIndex === undefined) {
      const foundIndex = messages.findIndex(m => m.id === event.messageId);
      if (foundIndex !== -1) {
        console.log(`[TaskStore:onTaskTextDelta] Found existing message for ID ${event.messageId} in messages array`);
        existingIndex = foundIndex;
        streamingMessageMap.set(event.messageId, existingIndex);
      }
    }
    
    // SMOOTH STREAMING: If messageId is new, check if we should merge with the last assistant bubble
    if (existingIndex === undefined && messages.length > 0) {
      const lastIndex = messages.length - 1;
      const lastMsg = messages[lastIndex];
      
      // If the last message is an assistant message and was streaming, we can merge
      // this new segment into it for a smoother experience
      if (lastMsg.type === 'assistant' && (lastMsg.isStreaming || lastMsg.id.startsWith('msg_c0'))) {
        console.log(`[TaskStore:onTaskTextDelta] Merging new messageId ${event.messageId} into existing last message`);
        existingIndex = lastIndex;
        streamingMessageMap.set(event.messageId, existingIndex);
      }
    }

    console.log(`[TaskStore:onTaskTextDelta] Processing:`, {
      messageCount: messages.length,
      messageId: event.messageId,
      existingIndex,
    });

    if (existingIndex !== undefined && existingIndex < messages.length) {
      // Append to existing message
      const existingMsg = messages[existingIndex];
      const newContent = (existingMsg.content || '') + event.text;
      
      messages[existingIndex] = {
        ...existingMsg,
        content: newContent,
        isStreaming: true, // Ensure it stays in streaming state
      };
    } else {
      // Create new streaming message and track it
      const newIndex = messages.length;
      streamingMessageMap.set(event.messageId, newIndex);
      console.log(`[TaskStore:onTaskTextDelta] Creating new streaming message at index ${newIndex} for messageId ${event.messageId}`);
      messages.push({
        id: event.messageId,
        type: 'assistant',
        content: event.text,
        timestamp: new Date().toISOString(),
        isStreaming: true,
      });
    }

    useTaskStore.setState({
      currentTask: {
        ...state.currentTask,
        messages,
      },
      isLoading: false,
    });
  });
  
  // Subscribe to stream complete events
  window.accomplish.onTaskStreamComplete?.((event: { taskId: string; messageId: string }) => {
    console.log(`[TaskStore:onTaskStreamComplete] Received:`, { taskId: event.taskId, messageId: event.messageId });
    
    const state = useTaskStore.getState();
    if (!state.currentTask || state.currentTask.id !== event.taskId) {
      return;
    }

    const messages = [...state.currentTask.messages];
    
    // Find the message by messageId
    const messageIndex = streamingMessageMap.get(event.messageId);
    
    if (messageIndex !== undefined && messageIndex < messages.length) {
      const msg = messages[messageIndex];
      if (msg.isStreaming) {
        console.log(`[TaskStore:onTaskStreamComplete] Marking message at index ${messageIndex} as complete:`, {
          messageId: event.messageId,
          contentLength: msg.content?.length,
        });
        messages[messageIndex] = {
          ...msg,
          isStreaming: false,
        };
        
        // Remove from tracking map
        streamingMessageMap.delete(event.messageId);
        
        useTaskStore.setState({
          currentTask: {
            ...state.currentTask,
            messages,
          },
        });
      }
    } else {
      // Fallback: mark last streaming assistant message as complete
      // Find last streaming assistant message (loop backwards for ES2022 compatibility)
      let lastStreamingIndex = -1;
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].type === 'assistant' && messages[i].isStreaming) {
          lastStreamingIndex = i;
          break;
        }
      }
      if (lastStreamingIndex !== -1) {
        console.log(`[TaskStore:onTaskStreamComplete] Fallback: marking last streaming message at index ${lastStreamingIndex} as complete`);
        messages[lastStreamingIndex] = {
          ...messages[lastStreamingIndex],
          isStreaming: false,
        };
        
        useTaskStore.setState({
          currentTask: {
            ...state.currentTask,
            messages,
          },
        });
      }
    }
  });

  // Clear progress when task completes or errors (not on messages - download continues during messages)
  window.accomplish.onTaskUpdate((event: unknown) => {
    const updateEvent = event as TaskUpdateEvent;
    if (updateEvent.type === 'complete' || updateEvent.type === 'error') {
      const state = useTaskStore.getState();
      if (state.setupProgressTaskId === updateEvent.taskId) {
        state.setSetupProgress(null, null);
      }
    }
  });

  // Subscribe to task summary updates
  window.accomplish.onTaskSummary?.(( data: { taskId: string; summary: string }) => {
    useTaskStore.getState().setTaskSummary(data.taskId, data.summary);
  });

  // Subscribe to late question responses
  // This fires when user answers a question after the MCP timeout expired
  // We need to resume the session with their answer
  window.accomplish.onQuestionLateResponse?.((data: { taskId: string; sessionId: string; answer: string }) => {
    const accomplish = getAccomplish();
    void accomplish.logEvent({
      level: 'info',
      message: 'Late question response received - resuming session',
      context: { taskId: data.taskId, sessionId: data.sessionId },
    });
    
    const state = useTaskStore.getState();
    
    // Update task status back to "running", add answer to chat, and clear the question UI
    // This ensures the UI shows the correct controls (pause/interrupt instead of follow-up)
    if (state.currentTask?.id === data.taskId) {
      // Add the user's answer to chat history as a visible message
      const answerMessage: TaskMessage = {
        id: createMessageId(),
        type: 'user',
        content: data.answer,
        timestamp: new Date().toISOString(),
      };
      
      useTaskStore.setState({
        currentTask: { 
          ...state.currentTask, 
          status: 'running' as TaskStatus,
          messages: [...state.currentTask.messages, answerMessage],
        },
        tasks: state.tasks.map(t => 
          t.id === data.taskId ? { ...t, status: 'running' as TaskStatus } : t
        ),
        isLoading: true,
        permissionRequest: null,
      });
    } else {
      // Just clear permission if not current task
      useTaskStore.getState().setPermissionRequest(null);
    }
    
    // Resume the session with the user's answer
    void accomplish.resumeSession(data.sessionId, data.answer, data.taskId);
  });
}
