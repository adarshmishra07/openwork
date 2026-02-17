'use client';

import { useEffect, useState, useRef, useMemo, useCallback, memo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useTaskStore } from '../stores/taskStore';
import { getAccomplish } from '../lib/accomplish';
import { springs } from '../lib/animations';
import type { TaskMessage, TodoItem, FileAttachment } from '@shopos/shared';
import { hasAnyReadyProvider, getAcceptedFileTypes } from '@shopos/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { XCircle, X, CornerDownLeft, ArrowLeft, CheckCircle2, AlertCircle, Terminal, Wrench, FileText, Search, Code, Brain, Clock, Square, Play, Download, Bug, ChevronUp, ChevronDown, Trash2, Check, Sparkles, BookOpen, Palette, Globe, Copy, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { StreamingText } from '../components/ui/streaming-text';
import { RichContentRenderer } from '../components/media/RichContentRenderer';
import { isWaitingForUser } from '../lib/waiting-detection';
import loadingSymbol from '/assets/loading-symbol.svg';
import SettingsDialog from '../components/layout/SettingsDialog';
import { CollapsibleThinking } from '../components/chat/CollapsibleThinking';
import { CollapsibleToolCall } from '../components/chat/CollapsibleToolCall';
import { ProgressIndicator } from '../components/chat/ProgressIndicator';
import { TodoList } from '../components/chat/TodoList';
import { InlinePermission } from '../components/chat/InlinePermission';
import { AttachmentButton, AttachmentList, AttachmentDropzone } from '../components/attachments';
import { useAttachmentStore } from '../stores/attachmentStore';

// Debug log entry type
interface DebugLogEntry {
  taskId: string;
  timestamp: string;
  type: string;
  message: string;
  data?: unknown;
}

// Spinning Openwork icon component
const SpinningIcon = ({ className }: { className?: string }) => (
  <img
    src={loadingSymbol}
    alt=""
    className={cn('animate-spin-ccw', className)}
  />
);

/**
 * Extract todo JSON blocks from text content and return filtered content + todos
 * Detects JSON code blocks that contain "todos": [...] and parses them
 */
function extractTodosFromText(content: string): {
  filteredContent: string;
  extractedTodos: TodoItem[][]
} {
  const extractedTodos: TodoItem[][] = [];
  let filteredContent = content;

  // Match any code block (``` ... ```) and check if it contains todos JSON
  const codeBlockRegex = /```(?:json)?\s*\n?([\s\S]*?)\n?```/gi;

  filteredContent = filteredContent.replace(codeBlockRegex, (match, codeContent) => {
    // Check if this looks like todos JSON
    if (codeContent.includes('"todos"') && codeContent.includes('[')) {
      try {
        const parsed = JSON.parse(codeContent.trim());
        if (parsed.todos && Array.isArray(parsed.todos) && parsed.todos.length > 0) {
          const normalizedTodos = parsed.todos.map((t: { id?: string; content?: string; status?: string }, idx: number) => ({
            id: t.id || `todo-${idx}`,
            content: t.content || '',
            status: t.status || 'pending'
          }));
          extractedTodos.push(normalizedTodos);
          return ''; // Remove the JSON block from content
        }
      } catch {
        // Not valid JSON, keep original
      }
    }
    return match;
  });

  // Also match bare JSON objects (not in code blocks) that look like todos
  // This handles cases where the JSON is just text without fences
  const lines = filteredContent.split('\n');
  let inJson = false;
  let jsonBuffer = '';
  let jsonStartIdx = -1;
  const linesToRemove: number[] = [];

  lines.forEach((line, idx) => {
    if (!inJson && line.trim().startsWith('{') && line.includes('"todos"')) {
      inJson = true;
      jsonBuffer = line;
      jsonStartIdx = idx;
    } else if (inJson) {
      jsonBuffer += '\n' + line;
      // Check if JSON is complete (balanced braces)
      const openBraces = (jsonBuffer.match(/\{/g) || []).length;
      const closeBraces = (jsonBuffer.match(/\}/g) || []).length;
      if (openBraces === closeBraces && openBraces > 0) {
        try {
          const parsed = JSON.parse(jsonBuffer.trim());
          if (parsed.todos && Array.isArray(parsed.todos) && parsed.todos.length > 0) {
            const normalizedTodos = parsed.todos.map((t: { id?: string; content?: string; status?: string }, i: number) => ({
              id: t.id || `todo-${i}`,
              content: t.content || '',
              status: t.status || 'pending'
            }));
            extractedTodos.push(normalizedTodos);
            // Mark lines for removal
            for (let i = jsonStartIdx; i <= idx; i++) {
              linesToRemove.push(i);
            }
          }
        } catch {
          // Not valid JSON
        }
        inJson = false;
        jsonBuffer = '';
        jsonStartIdx = -1;
      }
    }
  });

  // Remove the lines that contained todos JSON
  if (linesToRemove.length > 0) {
    filteredContent = lines.filter((_, idx) => !linesToRemove.includes(idx)).join('\n');
  }

  return {
    filteredContent: filteredContent.trim(),
    extractedTodos
  };
}

// Tool name to human-readable progress mapping
const TOOL_PROGRESS_MAP: Record<string, { label: string; icon: typeof FileText }> = {
  // Standard Claude Code tools
  Read: { label: 'Reading files', icon: FileText },
  Glob: { label: 'Finding files', icon: Search },
  Grep: { label: 'Searching code', icon: Search },
  Bash: { label: 'Running command', icon: Terminal },
  Write: { label: 'Writing file', icon: FileText },
  Edit: { label: 'Editing file', icon: FileText },
  Task: { label: 'Running agent', icon: Brain },
  WebFetch: { label: 'Fetching web page', icon: Search },
  WebSearch: { label: 'Searching web', icon: Search },
  // Dev Browser tools
  dev_browser_execute: { label: 'Executing browser action', icon: Terminal },
};

// Message type detection and formatting helpers
type ActivityType = 'thinking' | 'tool' | 'skill' | 'space' | 'browser';

interface ActivityInfo {
  type: ActivityType;
  label: string;
  detail?: string;
  icon: typeof Brain;
}

/**
 * Format a raw tool/skill name into a clean, readable label
 * Examples:
 *   "skill-loader_load_skill" -> "Loading Skill"
 *   "space_product_swap" -> "Product Swap"
 *   "dev-browser-mcp_browser_navigate" -> "Browser Navigate"
 *   "shopify_get_products" -> "Get Products"
 */
function formatToolName(rawName: string): string {
  // Remove common prefixes (MCP server names, etc.)
  let name = rawName
    .replace(/^skill-loader_/, '')
    .replace(/^dev-browser-mcp_/, '')
    .replace(/^dev_browser_/, '')
    .replace(/^space-runtime_/, '')
    .replace(/^space_/, '')
    .replace(/^browser_/, '')
    .replace(/^shopify_/, '')
    .replace(/^mcp_/, '');
  
  // Convert snake_case and kebab-case to Title Case
  name = name
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
  
  // Clean up common patterns for better readability
  name = name
    .replace(/^Load Skill$/, 'Loading Skill')
    .replace(/^List Skills$/, 'Listing Skills')
    .replace(/^Browser Execute$/, 'Browser Action')
    .replace(/^Browser Snapshot$/, 'Page Snapshot')
    .replace(/^Browser Screenshot$/, 'Screenshot')
    .replace(/^Browser Navigate$/, 'Navigating')
    .replace(/^Browser Click$/, 'Clicking')
    .replace(/^Browser Type$/, 'Typing')
    .replace(/^Browser Scroll$/, 'Scrolling')
    .replace(/^Execute$/, 'Browser Action')
    .replace(/^Snapshot$/, 'Page Snapshot')
    .replace(/^Navigate$/, 'Navigating')
    .replace(/^Click$/, 'Clicking')
    .replace(/^Type$/, 'Typing');
  
  return name;
}

/**
 * Pre-process markdown content to convert image links to image syntax
 * [filename](https://...png) → ![filename](https://...png)
 * This makes ReactMarkdown render them as <img> tags instead of <a> links
 */
function preprocessImageLinks(content: string): string {
  if (!content) return '';
  
  let processed = content;
  
  // Convert markdown links that point to images into markdown image syntax
  // [filename](https://...png) → ![filename](https://...png)
  processed = processed.replace(
    /(?<!!)\[([^\]]+)\]\((https?:\/\/[^\s)]+\.(?:png|jpg|jpeg|gif|webp|svg|bmp|avif)(?:\?[^\s)]*)?)\)/gi,
    '![$1]($2)'
  );
  
  // Also convert bare image URLs on their own line
  processed = processed.replace(
    /(?<=^|\s)(https?:\/\/[^\s<>]+\.(?:png|jpg|jpeg|gif|webp|svg|bmp|avif)(?:\?[^\s<>]*)?)(?=\s|$)/gim,
    '![]($1)'
  );
  
  return processed;
}

/**
 * Detect the type of activity from a tool name
 */
function detectActivityType(toolName: string): ActivityType {
  if (toolName.startsWith('skill-loader') || toolName.includes('load_skill')) {
    return 'skill';
  }
  if (toolName.startsWith('space_') || toolName.startsWith('space-runtime')) {
    return 'space';
  }
  if (toolName.startsWith('browser_') || toolName.startsWith('dev_browser') || toolName.startsWith('dev-browser')) {
    return 'browser';
  }
  return 'tool';
}

/**
 * Get activity info for rendering badges
 */
function getActivityInfo(toolName: string, toolInput?: unknown): ActivityInfo {
  const type = detectActivityType(toolName);
  const label = formatToolName(toolName);
  
  // Extract detail (e.g., skill name, space name)
  let detail: string | undefined;
  if (type === 'skill' && toolInput && typeof toolInput === 'object') {
    const input = toolInput as { skill_name?: string };
    if (input.skill_name) {
      detail = formatToolName(input.skill_name);
    }
  }
  
  // Select icon based on type
  let icon: typeof Brain;
  switch (type) {
    case 'skill':
      icon = BookOpen;
      break;
    case 'space':
      icon = Sparkles;
      break;
    case 'browser':
      icon = Search;
      break;
    default:
      icon = Wrench;
  }
  
  return { type, label, detail, icon };
}

/**
 * Get timing hint for long-running Space tools
 */
function getSpaceToolTimingHint(toolName: string): string | null {
  const spaceTimings: Record<string, string> = {
    'space_product_swap': '60-90 seconds',
    'space_background_remover': '30-60 seconds',
    'space_steal_the_look': '60-90 seconds',
    'space_sketch_to_product': '60-90 seconds',
  };
  
  // Extract space name from full tool name (e.g., "space-runtime_space_product_swap" -> "space_product_swap")
  const spaceName = toolName.replace('space-runtime_', '');
  return spaceTimings[spaceName] || null;
}

/**
 * Check if a message is a "final response" (should be rendered as full bubble)
 * vs an intermediate activity (should be rendered as simple italic text)
 */
function isFinalResponse(message: TaskMessage, isLastAssistant: boolean, nextMessage?: TaskMessage): boolean {
  // User messages are always full bubbles
  if (message.type === 'user') return true;
  
  // Tool messages are never final responses (rendered as badges)
  if (message.type === 'tool') return false;
  
  // Assistant messages:
  if (message.type === 'assistant') {
    // If followed by a tool, it's a thinking/planning message (render as italic text)
    if (nextMessage?.type === 'tool') return false;
    // Otherwise it's a final response (render as full bubble)
    return true;
  }
  
  return true;
}

// Debounce utility
function debounce<T extends (...args: unknown[]) => void>(fn: T, ms: number): T {
  let timeoutId: ReturnType<typeof setTimeout>;
  return ((...args: unknown[]) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), ms);
  }) as T;
}

export default function ExecutionPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const accomplish = getAccomplish();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [followUp, setFollowUp] = useState('');
  const followUpInputRef = useRef<HTMLInputElement>(null);
  const [taskRunCount, setTaskRunCount] = useState(0);
  const [currentTool, setCurrentTool] = useState<string | null>(null);
  const [currentToolInput, setCurrentToolInput] = useState<unknown>(null);
  const [debugLogs, setDebugLogs] = useState<DebugLogEntry[]>([]);
  const [debugPanelOpen, setDebugPanelOpen] = useState(false);
  const [debugModeEnabled, setDebugModeEnabled] = useState(false);
  const [debugExported, setDebugExported] = useState(false);
  const debugPanelRef = useRef<HTMLDivElement>(null);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [pendingFollowUp, setPendingFollowUp] = useState<string | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<FileAttachment[]>([]);
  const [isIntermediateExpanded, setIsIntermediateExpanded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Generate a local task ID for attachment uploads (reused when sending follow-up)
  const [localTaskId, setLocalTaskId] = useState<string>(() => 
    `task_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
  );

  // Attachment store
  const {
    pendingAttachments: attachments,
    addFiles,
    addPastedImage,
    removeAttachment,
    clearAttachments,
    retryUpload,
    getCompletedAttachments,
    hasUploadsInProgress,
    allUploadsComplete,
  } = useAttachmentStore();

  const {
    currentTask,
    loadTaskById,
    isLoading,
    error,
    addTaskUpdate,
    addTaskUpdateBatch,
    updateTaskStatus,
    setPermissionRequest,
    permissionRequest,
    respondToPermission,
    sendFollowUp,
    interruptTask,
    setupProgress,
    setupProgressTaskId,
    setupDownloadStep,
    // Image selection
    selectedImages,
    selectImage,
    deselectImage,
    clearSelectedImages,
    // Intent analysis
    intentAnalysisInProgress,
    setIntentAnalysisInProgress,
  } = useTaskStore();

  // Debounced scroll function
  const scrollToBottom = useMemo(
    () =>
      debounce(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100),
    []
  );

  // Load debug mode setting on mount and subscribe to changes
  useEffect(() => {
    accomplish.getDebugMode().then(setDebugModeEnabled);

    // Subscribe to debug mode changes from settings
    const unsubscribeDebugMode = accomplish.onDebugModeChange?.(({ enabled }) => {
      setDebugModeEnabled(enabled);
    });

    return () => {
      unsubscribeDebugMode?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps - accomplish is a stable singleton wrapper

  // Load task and subscribe to events
  useEffect(() => {
    if (id) {
      loadTaskById(id);
      // Clear debug logs when switching tasks
      setDebugLogs([]);
      // Reset collapsed state when switching tasks
      setIsIntermediateExpanded(false);
    }

    // Handle individual task updates
    const unsubscribeTask = accomplish.onTaskUpdate((event) => {
      addTaskUpdate(event);
      // Track current tool from tool messages
      if (event.type === 'message' && event.message?.type === 'tool') {
        const toolName = event.message.toolName || event.message.content?.match(/Using tool: (\w+)/)?.[1];
        if (toolName) {
          setCurrentTool(toolName);
          setCurrentToolInput(event.message.toolInput);
        }
      }
      // Clear tool on completion
      if (event.type === 'complete' || event.type === 'error') {
        setCurrentTool(null);
        setCurrentToolInput(null);
      }
    });

    // Handle batched task updates (for performance)
    const unsubscribeTaskBatch = accomplish.onTaskUpdateBatch?.((event) => {
      if (event.messages?.length) {
        addTaskUpdateBatch(event);
        // Track current tool from the last tool message
        const lastToolMsg = [...event.messages].reverse().find(m => m.type === 'tool');
        if (lastToolMsg) {
          const toolName = lastToolMsg.toolName || lastToolMsg.content?.match(/Using tool: (\w+)/)?.[1];
          if (toolName) {
            setCurrentTool(toolName);
            setCurrentToolInput(lastToolMsg.toolInput);
          }
        }
      }
    });

    const unsubscribePermission = accomplish.onPermissionRequest((request) => {
      setPermissionRequest(request);
    });

    // Subscribe to task status changes (e.g., queued -> running)
    const unsubscribeStatusChange = accomplish.onTaskStatusChange?.((data) => {
      if (data.taskId === id) {
        updateTaskStatus(data.taskId, data.status);
      }
    });

    // Subscribe to debug logs
    const unsubscribeDebugLog = accomplish.onDebugLog((log) => {
      const entry = log as DebugLogEntry;
      if (entry.taskId === id) {
        setDebugLogs((prev) => [...prev, entry]);
      }
    });

    // Subscribe to intent analysis events
    const unsubscribeIntentAnalysis = accomplish.onIntentAnalysis?.((data) => {
      if (data.taskId === id) {
        setIntentAnalysisInProgress(data.status === 'analyzing');
      }
    });

    return () => {
      unsubscribeTask();
      unsubscribeTaskBatch?.();
      unsubscribePermission();
      unsubscribeStatusChange?.();
      unsubscribeDebugLog();
      unsubscribeIntentAnalysis?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, loadTaskById, addTaskUpdate, addTaskUpdateBatch, updateTaskStatus, setPermissionRequest]); // accomplish is stable singleton

  // Increment counter when task starts/resumes
  useEffect(() => {
    if (currentTask?.status === 'running') {
      setTaskRunCount((c) => c + 1);
    }
  }, [currentTask?.status]);

  // Auto-scroll to bottom (debounced for performance)
  useEffect(() => {
    scrollToBottom();
  }, [currentTask?.messages?.length, scrollToBottom]);

  // Auto-scroll debug panel when new logs arrive
  useEffect(() => {
    if (debugPanelOpen && debugPanelRef.current) {
      debugPanelRef.current.scrollTop = debugPanelRef.current.scrollHeight;
    }
  }, [debugLogs.length, debugPanelOpen]);

  // Auto-focus follow-up input when task completes
  const isComplete = ['completed', 'failed', 'cancelled', 'interrupted'].includes(currentTask?.status ?? '');
  const hasSession = currentTask?.sessionId || currentTask?.result?.sessionId;
  // Always allow follow-up on completed tasks - will continue session if available, or start fresh
  const canFollowUp = isComplete;

  useEffect(() => {
    if (canFollowUp) {
      followUpInputRef.current?.focus();
    }
  }, [canFollowUp]);

  // Handle file selection from button click
  const handleAttachClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // Handle files from file input
  const handleFileInputChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      // Errors are shown via toast in attachmentStore
      await addFiles(files, localTaskId);
    }
    // Reset input so same file can be selected again
    e.target.value = '';
  }, [addFiles, localTaskId]);

  // Handle files from drag and drop
  const handleDrop = useCallback(async (files: File[]) => {
    // Errors are shown via toast in attachmentStore
    await addFiles(files, localTaskId);
  }, [addFiles, localTaskId]);

  // Handle paste (for images)
  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items);
    
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          // Errors are shown via toast in attachmentStore
          await addPastedImage(file, localTaskId);
          return;
        }
      }
    }
  }, [addPastedImage, localTaskId]);

  // Handle retry
  const handleRetry = useCallback((attachmentId: string) => {
    retryUpload(attachmentId, localTaskId);
  }, [retryUpload, localTaskId]);

  const handleFollowUp = async () => {
    // Don't submit if uploads are in progress
    if (hasUploadsInProgress()) {
      return;
    }
    
    const completedAttachments = getCompletedAttachments();
    
    // Need either text or attachments
    if (!followUp.trim() && completedAttachments.length === 0) return;

    // Check if any provider is ready before sending (skip in E2E mode)
    const isE2EMode = await accomplish.isE2EMode();
    if (!isE2EMode) {
      const settings = await accomplish.getProviderSettings();
      if (!hasAnyReadyProvider(settings)) {
        // Store the pending message and attachments, open settings dialog
        setPendingFollowUp(followUp);
        setPendingAttachments(completedAttachments);
        setShowSettingsDialog(true);
        return;
      }
    }

    // Convert FileAttachment to the format expected by sendFollowUp
    const attachmentsForApi = completedAttachments
      .filter(a => a.url)
      .map(a => ({
        filename: a.filename,
        contentType: a.contentType,
        url: a.url!,
        size: a.size,
      }));

    // Prepend selected image labels to the message if any are selected
    let messageToSend = followUp;
    const imageReferences = selectedImages.length > 0 
      ? selectedImages.map(img => ({ label: img.label, url: img.url }))
      : undefined;
    if (selectedImages.length > 0) {
      const imageRefs = selectedImages.map(img => `[${img.label}]`).join(' ');
      messageToSend = `${imageRefs} ${followUp}`.trim();
    }

    await sendFollowUp(
      messageToSend, 
      attachmentsForApi.length > 0 ? attachmentsForApi : undefined,
      imageReferences
    );
    setFollowUp('');
    clearAttachments();
    clearSelectedImages(); // Clear selected images after sending
    // Generate new local task ID for next follow-up
    setLocalTaskId(`task_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`);
  };

  const handleSettingsDialogClose = (open: boolean) => {
    setShowSettingsDialog(open);
    if (!open) {
      setPendingFollowUp(null);
      setPendingAttachments([]);
    }
  };

  const handleApiKeySaved = async () => {
    // Provider is now ready - close dialog and send the pending message
    setShowSettingsDialog(false);
    if (pendingFollowUp || pendingAttachments.length > 0) {
      const attachmentsForApi = pendingAttachments
        .filter(a => a.url)
        .map(a => ({
          filename: a.filename,
          contentType: a.contentType,
          url: a.url!,
          size: a.size,
        }));
      
      await sendFollowUp(pendingFollowUp || '', attachmentsForApi.length > 0 ? attachmentsForApi : undefined);
      setFollowUp('');
      setPendingFollowUp(null);
      setPendingAttachments([]);
      clearAttachments();
    }
  };

  const handleContinue = async () => {
    // Check if any provider is ready before sending (skip in E2E mode)
    const isE2EMode = await accomplish.isE2EMode();
    if (!isE2EMode) {
      const settings = await accomplish.getProviderSettings();
      if (!hasAnyReadyProvider(settings)) {
        // Store the pending message and open settings dialog
        setPendingFollowUp('continue');
        setShowSettingsDialog(true);
        return;
      }
    }

    // Send a simple "continue" message to resume the task
    await sendFollowUp('continue');
  };

  const handleExportDebugLogs = useCallback(() => {
    const text = debugLogs
      .map((log) => {
        const dataStr = log.data !== undefined
          ? ` ${typeof log.data === 'string' ? log.data : JSON.stringify(log.data)}`
          : '';
        return `${new Date(log.timestamp).toISOString()} [${log.type}] ${log.message}${dataStr}`;
      })
      .join('\n');

    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `debug-logs-${id}-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setDebugExported(true);
    setTimeout(() => setDebugExported(false), 2000);
  }, [debugLogs, id]);

  // Handler for InlinePermission component
  const handleInlinePermissionResponse = async (
    allowed: boolean,
    options?: {
      rememberSession?: boolean;
      rememberPermanent?: boolean;
      selectedOptions?: string[];
      customText?: string;
    }
  ) => {
    if (!permissionRequest || !currentTask) return;

    const isQuestion = permissionRequest.type === 'question';

    await respondToPermission({
      requestId: permissionRequest.id,
      taskId: permissionRequest.taskId,
      decision: allowed ? 'allow' : 'deny',
      selectedOptions: options?.selectedOptions,
      customText: options?.customText,
      rememberSession: options?.rememberSession,
      rememberPermanent: options?.rememberPermanent,
    });

    // Note: For questions, we don't interrupt the task on skip/deny.
    // The MCP server returns "User declined to answer" and Claude continues gracefully.
    // Only permission denials (shopify, file, tool) may cause the agent to pause.
  };

  if (error) {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <Card className="max-w-md w-full p-6 text-center">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
          <p className="text-destructive mb-4">{error}</p>
          <Button onClick={() => navigate('/')}>Go Home</Button>
        </Card>
      </div>
    );
  }

  if (!currentTask) {
    return (
      <div className="h-full flex items-center justify-center">
        <SpinningIcon className="h-8 w-8" />
      </div>
    );
  }

  const getStatusBadge = () => {
    switch (currentTask.status) {
      case 'queued':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground shrink-0">
            <Clock className="h-3 w-3" />
            Queued
          </span>
        );
      case 'running':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 shrink-0">
            <span
              className="animate-shimmer bg-gradient-to-r from-primary via-primary/50 to-primary bg-[length:200%_100%] bg-clip-text text-transparent"
            >
              Running
            </span>
          </span>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-500/10 text-green-600 shrink-0">
            <CheckCircle2 className="h-3 w-3" />
            Completed
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-destructive/10 text-destructive shrink-0">
            <XCircle className="h-3 w-3" />
            Failed
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground shrink-0">
            <XCircle className="h-3 w-3" />
            Cancelled
          </span>
        );
      case 'interrupted':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground shrink-0">
            <Square className="h-3 w-3" />
            Stopped
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground shrink-0">
            {currentTask.status}
          </span>
        );
    }
  };

  return (
    <>
      {/* Settings Dialog - shown when no provider is ready */}
      <SettingsDialog
        open={showSettingsDialog}
        onOpenChange={handleSettingsDialogClose}
        onApiKeySaved={handleApiKeySaved}
      />

    <div className="h-full flex flex-col bg-background relative">
      {/* Task header */}
      <div className="flex-shrink-0 border-b border-border bg-card/50 px-6 py-4">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <div className="flex items-center gap-4 min-w-0 flex-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/')}
              className="shrink-0 no-drag"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <h1 className="text-base font-medium text-foreground truncate min-w-0">
                {currentTask.prompt}
              </h1>
              <span data-testid="execution-status-badge">
                {getStatusBadge()}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Browser installation modal - only shown during Playwright download */}
      <AnimatePresence>
        {setupProgress && setupProgressTaskId === id && (setupProgress.toLowerCase().includes('download') || setupProgress.includes('% of')) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={springs.bouncy}
            >
              <Card className="w-[480px] p-6">
                <div className="flex flex-col items-center text-center gap-4">
                  <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                    <Download className="h-7 w-7 text-primary" />
                    <motion.div
                      className="absolute inset-0 rounded-full border-2 border-primary/30 border-t-primary"
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    />
                  </div>
                  <div className="w-full">
                    <h3 className="text-lg font-semibold text-foreground mb-1">
                      Chrome not installed
                    </h3>
                    <p className="text-muted-foreground mb-4">
                      Installing browser for automation...
                    </p>
                    {/* Progress bar - combines all downloads into single 0-100% */}
                    {(() => {
                      const percentMatch = setupProgress?.match(/(\d+)%/);
                      const currentPercent = percentMatch ? parseInt(percentMatch[1], 10) : 0;

                      // Weight each download by size: Chromium ~160MB (64%), FFMPEG ~1MB (0%), Headless ~90MB (36%)
                      // Step 1: 0-64%, Step 2: 64-64%, Step 3: 64-100%
                      let overallPercent = 0;
                      if (setupDownloadStep === 1) {
                        overallPercent = Math.round(currentPercent * 0.64);
                      } else if (setupDownloadStep === 2) {
                        overallPercent = 64 + Math.round(currentPercent * 0.01);
                      } else {
                        overallPercent = 65 + Math.round(currentPercent * 0.35);
                      }

                      return (
                        <div className="w-full">
                          <div className="flex justify-between text-sm mb-2">
                            <span className="text-muted-foreground">Downloading...</span>
                            <span className="text-foreground font-medium">{overallPercent}%</span>
                          </div>
                          <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                            <motion.div
                              className="h-full bg-primary rounded-full"
                              initial={{ width: 0 }}
                              animate={{ width: `${overallPercent}%` }}
                              transition={{ duration: 0.3 }}
                            />
                          </div>
                        </div>
                      );
                    })()}
                    <p className="text-xs text-muted-foreground mt-4 text-center">
                      One-time setup (~250 MB total)
                    </p>
                  </div>
                </div>
              </Card>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Queued state - full page (new task, no messages yet) */}
      {currentTask.status === 'queued' && currentTask.messages.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={springs.gentle}
          className="flex-1 flex flex-col items-center justify-center gap-6 px-6"
        >
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/10">
            <Clock className="h-8 w-8 text-amber-600" />
          </div>
          <div className="text-center max-w-md">
            <h2 className="text-xl font-semibold text-foreground mb-2">
              Waiting for another task
            </h2>
            <p className="text-muted-foreground">
              Your task is queued and will start automatically when the current task completes.
            </p>
          </div>
        </motion.div>
      )}



      {/* Messages - show for any state as long as there are messages */}
      {(currentTask.status !== 'queued' || currentTask.messages.length > 0) && (
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="max-w-4xl mx-auto space-y-2">
            {(() => {
              const filteredMessages = currentTask.messages
                .filter((m) => !(m.type === 'tool' && m.toolName?.toLowerCase() === 'bash'));
              
              // Find the last assistant message index
              let lastAssistantIndex = -1;
              for (let i = filteredMessages.length - 1; i >= 0; i--) {
                if (filteredMessages[i].type === 'assistant') {
                  lastAssistantIndex = i;
                  break;
                }
              }

              // Group messages into blocks (Expanded vs Collapsed)
              type RenderBlock = 
                | { type: 'expanded'; message: TaskMessage; isLast: boolean; isLastAssistant: boolean }
                | { type: 'collapsed'; messages: TaskMessage[] };

              const blocks: RenderBlock[] = [];
              let currentCollapsed: TaskMessage[] = [];

              filteredMessages.forEach((message, index) => {
                const isLastAssistant = index === lastAssistantIndex;
                const isLastMessage = index === filteredMessages.length - 1;
                
                // Determine if this message should be expanded
                // Expanded if:
                // 1. It's a user message
                // 2. It's an assistant message (ALL assistant messages are now shown expanded, including thinking)
                // Only tool messages are collapsed
                const isExpanded = message.type === 'user' || message.type === 'assistant';

                if (isExpanded) {
                  // If we have pending collapsed messages (tools), push them as a block first
                  if (currentCollapsed.length > 0) {
                    blocks.push({ type: 'collapsed', messages: [...currentCollapsed] });
                    currentCollapsed = [];
                  }
                  // Push this message as an expanded block
                  blocks.push({ 
                    type: 'expanded', 
                    message, 
                    isLast: isLastMessage, 
                    isLastAssistant 
                  });
                } else {
                  // Only tool messages go into collapsed group
                  currentCollapsed.push(message);
                }
              });

              // Push any remaining collapsed messages
              if (currentCollapsed.length > 0) {
                blocks.push({ type: 'collapsed', messages: [...currentCollapsed] });
              }

              return blocks.map((block, blockIdx) => {
                if (block.type === 'expanded') {
                  const { message, isLast, isLastAssistant } = block;
                  const hasSession = currentTask?.sessionId || currentTask?.result?.sessionId;
                  const nextMsg = getNextMessage(filteredMessages, message);
                  
                  // Show continue button logic
                  const showContinue = isLastAssistant && !!hasSession &&
                    (currentTask.status === 'interrupted' ||
                     (currentTask.status === 'completed' && isWaitingForUser(message.content)));

                  // Stream assistant messages while task is running
                  // All assistant messages should stream, not just the last one
                  const shouldStreamThis = message.type === 'assistant' && currentTask.status === 'running';
                  
                  return (
                    <MessageBubble
                      key={message.id}
                      message={message}
                      nextMessage={nextMsg}
                      shouldStream={shouldStreamThis}
                      isLastMessage={isLast}
                      isLastAssistantMessage={isLastAssistant}
                      isRunning={currentTask.status === 'running'}
                      showContinueButton={showContinue}
                      continueLabel={currentTask.status === 'interrupted' ? 'Continue' : 'Done, Continue'}
                      onContinue={handleContinue}
                      isLoading={isLoading}
                      imageSelectable={message.type === 'assistant'}
                      onImageSelect={selectImage}
                    />
                  );
                } else {
                  // Render collapsed group
                  const messages = block.messages;
                  
                  // Collapse logic: if > 5 intermediate messages, show first 2 + collapsed + last 2
                  const COLLAPSE_THRESHOLD = 5;
                  const shouldCollapse = messages.length > COLLAPSE_THRESHOLD && !isIntermediateExpanded;
                  const collapsedCount = messages.length - 4; // first 2 + last 2
                  
                  const visibleMessages = shouldCollapse
                    ? [
                        ...messages.slice(0, 2),
                        { type: 'collapse-indicator', count: collapsedCount, id: `collapse-${blockIdx}` } as const,
                        ...messages.slice(-2)
                      ]
                    : messages;

                  return (
                    <div key={`group-${blockIdx}`} className="space-y-0.5">
                      {visibleMessages.map((item, idx) => {
                         if ('count' in item && item.type === 'collapse-indicator') {
                           return (
                             <motion.button
                               key={item.id}
                               initial={{ opacity: 0 }}
                               animate={{ opacity: 1 }}
                               onClick={() => setIsIntermediateExpanded(!isIntermediateExpanded)}
                               className="flex items-center gap-2 py-2 px-3 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
                             >
                               <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 shrink-0" />
                               {isIntermediateExpanded ? (
                                 <ChevronUp className="h-3 w-3" />
                               ) : (
                                 <ChevronDown className="h-3 w-3" />
                               )}
                               <span>{isIntermediateExpanded ? 'Show fewer steps' : `Show ${item.count} more steps`}</span>
                             </motion.button>
                           );
                         }

                         const message = item as TaskMessage;
                         const nextMsg = getNextMessage(filteredMessages, message);
                         return (
                           <MessageBubble
                             key={message.id}
                             message={message}
                             nextMessage={nextMsg}
                             shouldStream={false}
                             isLastMessage={false} 
                             isLastAssistantMessage={false}
                             isRunning={currentTask.status === 'running'}
                             showContinueButton={false}
                             onContinue={handleContinue}
                             isLoading={isLoading}
                             imageSelectable={message.type === 'assistant'}
                             onImageSelect={selectImage}
                           />
                         );
                      })}
                    </div>
                  );
                }
              });
            })()}

            {/* Intent Analysis Indicator */}
            <AnimatePresence>
              {intentAnalysisInProgress && (
                <motion.div
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -8 }}
                  transition={springs.gentle}
                  data-testid="execution-intent-indicator"
                >
                  <ProgressIndicator activity="Understanding Intent" />
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {currentTask.status === 'running' && !permissionRequest && !intentAnalysisInProgress && (
                <motion.div
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -8 }}
                  transition={springs.gentle}
                  data-testid="execution-thinking-indicator"
                >
                  <ProgressIndicator
                    activity={currentTool
                      ? (() => {
                          const activity = getActivityInfo(currentTool, currentToolInput);
                          const description = (currentToolInput as { description?: string })?.description;
                          return activity.detail
                            ? `${activity.label}: ${activity.detail}`
                            : (description || activity.label);
                        })()
                      : 'Thinking'}
                    timingHint={currentTool ? getSpaceToolTimingHint(currentTool) ?? undefined : undefined}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Inline Permission Request */}
            <AnimatePresence>
              {permissionRequest && (
                <InlinePermission
                  request={permissionRequest}
                  onRespond={handleInlinePermissionResponse}
                  isLoading={isLoading}
                />
              )}
            </AnimatePresence>

            <div ref={messagesEndRef} />
          </div>
        </div>
      )}

      {/* Persistent Input Bar */}
      {!permissionRequest && (
        <AttachmentDropzone onDrop={handleDrop} disabled={currentTask.status === 'running' || isLoading}>
          <div className="flex-shrink-0 border-t border-border bg-card/50 px-6 py-4">
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={getAcceptedFileTypes()}
              onChange={handleFileInputChange}
              className="hidden"
            />
            
            <div className="max-w-4xl mx-auto space-y-3">
              {/* Attachment previews */}
              {attachments.length > 0 && (
                <AttachmentList
                  attachments={attachments}
                  onRemove={removeAttachment}
                  onRetry={handleRetry}
                />
              )}

              {/* Selected image thumbnails with overlaid tags */}
              {selectedImages.length > 0 && (
                <div className="flex flex-wrap gap-2 pb-2">
                  {selectedImages.map((img) => (
                    <div
                      key={img.label}
                      className="relative w-24 h-24 rounded-lg overflow-hidden border border-border/50 group"
                    >
                      <img
                        src={img.url}
                        alt={`Selected image ${img.label}`}
                        className="w-full h-full object-cover"
                      />
                      {/* Overlaid label tag */}
                      <span className="absolute bottom-1 left-1 bg-black/60 text-white text-[10px] font-medium px-1.5 py-0.5 rounded">
                        {img.label}
                      </span>
                      {/* Remove button */}
                      <button
                        onClick={() => deselectImage(img.label)}
                        className="absolute top-1 right-1 bg-black/50 hover:bg-destructive text-white rounded-full p-0.5 transition-colors"
                        title={`Remove image ${img.label}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              
              <div className="flex gap-3">
                {/* Attachment button */}
                <AttachmentButton
                  onClick={handleAttachClick}
                  disabled={currentTask.status === 'running' || isLoading}
                  hasAttachments={attachments.length > 0}
                  attachmentCount={attachments.length}
                />
                
                <Input
                  ref={followUpInputRef}
                  value={followUp}
                  onChange={(e) => setFollowUp(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      if (currentTask.status !== 'running' && !hasUploadsInProgress()) {
                        handleFollowUp();
                      }
                    }
                  }}
                  onPaste={handlePaste}
                  placeholder={
                    currentTask.status === 'running'
                      ? "Agent is working... (Stop to send new message)"
                      : hasUploadsInProgress()
                        ? "Uploading files..."
                        : currentTask.status === 'failed'
                          ? "Try again or give new instructions..."
                          : "Send a follow-up..."
                  }
                  disabled={currentTask.status === 'running' || isLoading}
                  className="flex-1"
                />
                
                {currentTask.status === 'running' ? (
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={interruptTask}
                    title="Stop agent (Ctrl+C)"
                    className="shrink-0 hover:bg-destructive/10 hover:text-destructive hover:border-destructive"
                    data-testid="execution-stop-button"
                  >
                    <Square className="h-4 w-4 fill-current" />
                  </Button>
                ) : (
                  <Button
                    onClick={handleFollowUp}
                    disabled={(!followUp.trim() && getCompletedAttachments().length === 0) || isLoading || hasUploadsInProgress()}
                    variant="outline"
                  >
                    <CornerDownLeft className="h-4 w-4 mr-1.5" />
                    Send
                  </Button>
                )}
              </div>
            </div>
          </div>
        </AttachmentDropzone>
      )}





      {/* Debug Panel - Only visible when debug mode is enabled */}
      {debugModeEnabled && (
        <div className="flex-shrink-0 border-t border-border" data-testid="debug-panel">
          {/* Toggle header */}
          <button
            onClick={() => setDebugPanelOpen(!debugPanelOpen)}
            className="w-full flex items-center justify-between px-6 py-2.5 bg-zinc-900 hover:bg-zinc-800 transition-colors"
          >
            <div className="flex items-center gap-2 text-sm text-zinc-400">
              <Bug className="h-4 w-4" />
              <span className="font-medium">Debug Logs</span>
              {debugLogs.length > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-zinc-700 text-zinc-300 text-xs">
                  {debugLogs.length}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {debugLogs.length > 0 && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleExportDebugLogs();
                    }}
                  >
                    {debugExported ? (
                      <Check className="h-3 w-3 mr-1 text-green-400" />
                    ) : (
                      <Download className="h-3 w-3 mr-1" />
                    )}
                    {debugExported ? 'Exported' : 'Export'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDebugLogs([]);
                    }}
                  >
                    <Trash2 className="h-3 w-3 mr-1" />
                    Clear
                  </Button>
                </>
              )}
              {debugPanelOpen ? (
                <ChevronDown className="h-4 w-4 text-zinc-500" />
              ) : (
                <ChevronUp className="h-4 w-4 text-zinc-500" />
              )}
            </div>
          </button>

          {/* Collapsible panel content */}
          <AnimatePresence>
            {debugPanelOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 200, opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div
                  ref={debugPanelRef}
                  className="h-[200px] overflow-y-auto bg-zinc-950 text-zinc-300 font-mono text-xs p-4"
                >
                  {debugLogs.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-zinc-500">
                      No debug logs yet. Run a task to see logs.
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {debugLogs.map((log, index) => (
                        <div key={index} className="flex gap-2">
                          <span className="text-zinc-500 shrink-0">
                            {new Date(log.timestamp).toLocaleTimeString()}
                          </span>
                          <span className={cn(
                            'shrink-0 px-1 rounded',
                            log.type === 'error' ? 'bg-red-500/20 text-red-400' :
                            log.type === 'warn' ? 'bg-yellow-500/20 text-yellow-400' :
                            log.type === 'info' ? 'bg-blue-500/20 text-blue-400' :
                            'bg-zinc-700 text-zinc-400'
                          )}>
                            [{log.type}]
                          </span>
                          <span className="text-zinc-300 break-all">
                            {log.message}
                            {log.data !== undefined && (
                              <span className="text-zinc-500 ml-2">
                                {typeof log.data === 'string' ? log.data : JSON.stringify(log.data, null, 0)}
                              </span>
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
    </>
  );
}

interface MessageBubbleProps {
  message: TaskMessage;
  nextMessage?: TaskMessage;
  shouldStream?: boolean;
  isLastMessage?: boolean;
  isLastAssistantMessage?: boolean;
  isRunning?: boolean;
  showContinueButton?: boolean;
  continueLabel?: string;
  onContinue?: () => void;
  isLoading?: boolean;
  /** Enable image selection for this message */
  imageSelectable?: boolean;
  /** Callback when an image is selected */
  onImageSelect?: (label: string, url: string, index: number) => void;
}

// Get the next message from a flat list given current message
function getNextMessage(messages: TaskMessage[], currentMessage: TaskMessage): TaskMessage | undefined {
  const idx = messages.findIndex(m => m.id === currentMessage.id);
  return idx >= 0 ? messages[idx + 1] : undefined;
}

// Activity Bullet component for non-final messages (thinking, tools, skills, spaces)
// Now uses CollapsibleToolCall for richer display with collapsible details
// Special handling for TodoWrite to render inline checklist
const ActivityBullet = memo(function ActivityBullet({ 
  message, 
  isRunning = false,
  isLastMessage = false 
}: { 
  message: TaskMessage; 
  isRunning?: boolean;
  isLastMessage?: boolean;
}) {
  const toolName = message.toolName || '';
  const description = (message.toolInput as { description?: string })?.description;
  
  // Special handling for TodoWrite - render inline todo list (case-insensitive check)
  // Also handles 'todos' tool name which some models may use
  const toolInput = message.toolInput as { todos?: TodoItem[] } | undefined;
  const isTodoTool = toolName.toLowerCase() === 'todowrite' || toolName.toLowerCase() === 'todos';
  if (isTodoTool && toolInput?.todos) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springs.gentle}
      >
        <TodoList todos={toolInput.todos} />
      </motion.div>
    );
  }
  
  // Determine status based on toolStatus field or running state
  const status: 'running' | 'success' | 'error' = 
    isLastMessage && isRunning 
      ? 'running' 
      : message.toolStatus === 'error' 
        ? 'error' 
        : 'success';

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={springs.gentle}
    >
      <CollapsibleToolCall
        name={toolName}
        status={status}
        description={description}
        input={message.toolInput}
      />
    </motion.div>
  );
});

// Intermediate assistant message - shows thinking/reasoning as plain text
// No longer collapsible - streams and stays visible
// Now uses RichContentRenderer for consistent image handling and selection
const IntermediateMessage = memo(function IntermediateMessage({ 
  content,
  isRunning = false,
  isLastMessage = false,
  imageSelectable = false,
  onImageSelect,
}: { 
  content: string;
  isRunning?: boolean;
  isLastMessage?: boolean;
  imageSelectable?: boolean;
  onImageSelect?: (label: string, url: string, index: number) => void;
}) {
  const proseClasses = cn(
    'text-sm prose prose-sm max-w-none',
    'prose-p:my-1 prose-p:leading-relaxed',
    'prose-headings:text-foreground',
    'prose-strong:text-foreground',
    'prose-code:text-xs prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded'
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springs.gentle}
      className="flex items-start gap-3 py-1"
    >
      {/* Content rendered with RichContentRenderer for image support */}
      <div className="flex-1 text-foreground/90">
        <RichContentRenderer 
          content={content}
          className={proseClasses}
          imageSelectable={imageSelectable}
          onImageSelect={onImageSelect}
        />
      </div>
      {/* Loading spinner for active thinking */}
      {isLastMessage && isRunning && (
        <SpinningIcon className="h-3.5 w-3.5 shrink-0 mt-1" />
      )}
    </motion.div>
  );
});

/**
 * Helper to extract text content from React children
 */
function extractTextFromChildren(children: React.ReactNode): string {
  if (typeof children === 'string') return children;
  if (typeof children === 'number') return String(children);
  if (!children) return '';
  
  if (Array.isArray(children)) {
    return children.map(extractTextFromChildren).join('');
  }
  
  if (typeof children === 'object' && 'props' in children) {
    return extractTextFromChildren((children as { props: { children: React.ReactNode } }).props.children);
  }
  
  return '';
}

/**
 * CodeBlock component with always-visible copy button
 */
function CodeBlock({ children, className }: { children: React.ReactNode; className?: string }) {
  const [copied, setCopied] = useState(false);
  
  const handleCopy = useCallback(() => {
    const text = extractTextFromChildren(children);
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [children]);
  
  return (
    <div className={cn(
      "relative group my-3 rounded-lg overflow-x-auto bg-muted/50 border border-border",
      className
    )}>
      <pre className="whitespace-pre-wrap break-words text-sm p-4 m-0">
        {children}
      </pre>
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 p-1.5 rounded bg-background/80 hover:bg-background border border-border/50 text-muted-foreground hover:text-foreground transition-colors"
        title={copied ? "Copied!" : "Copy to clipboard"}
      >
        {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

/**
 * Renders user message content with inline image thumbnails for image references like [A], [B], [C]
 */
function renderContentWithImagePreviews(
  content: string,
  imageReferences?: Array<{ label: string; url: string }>
): React.ReactNode {
  if (!imageReferences || imageReferences.length === 0) {
    return content;
  }

  // Create a map of label -> url
  const refMap = new Map(imageReferences.map(ref => [ref.label, ref.url]));

  // Split content by image tag pattern [A], [B], [C], etc.
  const parts = content.split(/(\[[A-Z]\])/g);

  return parts.map((part, index) => {
    const match = part.match(/^\[([A-Z])\]$/);
    if (match) {
      const label = match[1];
      const url = refMap.get(label);
      if (url) {
        return (
          <span key={index} className="inline-flex items-center align-middle mx-0.5">
            <img
              src={url}
              alt={`Image ${label}`}
              className="w-10 h-10 rounded object-cover border border-primary-foreground/30"
            />
          </span>
        );
      }
    }
    return <span key={index}>{part}</span>;
  });
}

// Memoized MessageBubble to prevent unnecessary re-renders and markdown re-parsing
const MessageBubble = memo(function MessageBubble({ 
  message,
  nextMessage,
  shouldStream = false, 
  isLastMessage = false, 
  isLastAssistantMessage = false,
  isRunning = false, 
  showContinueButton = false, 
  continueLabel, 
  onContinue, 
  isLoading = false,
  imageSelectable = false,
  onImageSelect
}: MessageBubbleProps) {
  // Track whether streaming animation has completed
  // Initialized to false so streaming can start, will be set true when animation finishes or shouldStream becomes false
  const [streamComplete, setStreamComplete] = useState(false);
  const [contentCopied, setContentCopied] = useState(false);
  const isUser = message.type === 'user';
  const isTool = message.type === 'tool';
  const isSystem = message.type === 'system';
  const isAssistant = message.type === 'assistant';
  
  // Handle copying assistant message content
  const handleCopyContent = useCallback(() => {
    if (message.content) {
      navigator.clipboard.writeText(message.content);
      setContentCopied(true);
      setTimeout(() => setContentCopied(false), 2000);
    }
  }, [message.content]);

  // Check if this should be rendered as a bullet or full bubble
  const shouldRenderAsBullet = !isFinalResponse(message, isLastAssistantMessage, nextMessage);

  // If shouldStream becomes false (task stopped), mark streaming as complete to show full content
  useEffect(() => {
    if (!shouldStream) {
      setStreamComplete(true);
    }
  }, [shouldStream]);

  const proseClasses = cn(
    'text-sm prose prose-sm max-w-full',
    'prose-headings:text-foreground',
    'prose-p:text-foreground prose-p:my-2',
    'prose-strong:text-foreground prose-strong:font-semibold',
    'prose-em:text-foreground',
    'prose-code:text-foreground prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:break-all',
    'prose-pre:bg-muted prose-pre:text-foreground prose-pre:p-3 prose-pre:rounded-lg prose-pre:overflow-x-auto prose-pre:max-w-full prose-pre:whitespace-pre-wrap',
    'prose-ul:text-foreground prose-ol:text-foreground',
    'prose-li:text-foreground prose-li:my-1',
    'prose-a:text-primary prose-a:underline',
    'prose-blockquote:text-muted-foreground prose-blockquote:border-l-4 prose-blockquote:border-border prose-blockquote:pl-4',
    'prose-hr:border-border'
  );

  // Render as bullet point for tool messages
  if (isTool) {
    return (
      <ActivityBullet 
        message={message} 
        isRunning={isRunning} 
        isLastMessage={isLastMessage} 
      />
    );
  }

  // Render intermediate assistant messages with RichContentRenderer
  if (isAssistant && shouldRenderAsBullet) {
    return (
      <IntermediateMessage 
        content={message.content || ''} 
        isRunning={isRunning}
        isLastMessage={isLastMessage}
        imageSelectable={imageSelectable}
        onImageSelect={onImageSelect}
      />
    );
  }

  // Render full message bubble for user messages and final assistant responses
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springs.gentle}
      className={cn('flex', isUser ? 'justify-end' : 'justify-start')}
    >
      <div
        className={cn(
          'max-w-[85%] min-w-0 rounded-2xl px-4 py-3 transition-all duration-150',
          isUser
            ? 'bg-primary text-primary-foreground'
            : isSystem
              ? 'bg-muted/50 border border-border'
              : ''
        )}
      >
        {isSystem && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5 font-medium">
            <Terminal className="h-3.5 w-3.5" />
            System
          </div>
        )}
        {isUser ? (
          <div className="space-y-2">
            {/* Render file attachments as image previews or file badges */}
            {message.attachments && message.attachments.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {message.attachments.map((attachment, idx) => {
                  const isImage = attachment.contentType?.startsWith('image/');
                  if (isImage) {
                    return (
                      <img
                        key={idx}
                        src={attachment.data}
                        alt={attachment.filename || 'Attached image'}
                        className="max-w-[200px] max-h-[150px] rounded-lg object-cover border border-primary-foreground/20"
                      />
                    );
                  }
                  // Non-image files show as badges
                  return (
                    <div
                      key={idx}
                      className="flex items-center gap-1.5 px-2 py-1 bg-primary-foreground/10 rounded text-xs"
                    >
                      <FileText className="h-3 w-3" />
                      <span className="truncate max-w-[150px]">{attachment.filename}</span>
                    </div>
                  );
                })}
              </div>
            )}
            {message.content && (
              <p
                className={cn(
                  'text-sm whitespace-pre-wrap break-words',
                  'text-primary-foreground'
                )}
              >
                {renderContentWithImagePreviews(message.content, message.imageReferences)}
              </p>
            )}
          </div>
        ) : isAssistant && shouldStream && !streamComplete ? (
          <StreamingText
            text={message.content}
            speed={350}
            isComplete={streamComplete}
            onComplete={() => setStreamComplete(true)}
          >
            {(streamedText) => (
              <div className={proseClasses}>
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    // Render images inline with proper styling
                    img: ({ src, alt }) => {
                      if (!src) return null;
                      return (
                        <img 
                          src={src} 
                          alt={alt || 'Image'} 
                          className="max-w-[600px] w-full h-auto rounded-lg border border-border shadow-sm my-2"
                          loading="lazy"
                        />
                      );
                    },
                    // Fallback: convert image links to images if pre-processing missed any
                    a: ({ href, children }) => {
                      if (!href) return <span>{children}</span>;
                      const isImageLink = /\.(png|jpg|jpeg|gif|webp|svg|bmp|avif)(\?|$)/i.test(href);
                      if (isImageLink) {
                        return (
                          <span className="block my-4">
                            <img 
                              src={href} 
                              alt={String(children) || 'Image'} 
                              className="max-w-[600px] w-full h-auto rounded-lg border border-border shadow-sm"
                              loading="lazy"
                            />
                          </span>
                        );
                      }
                      return (
                        <a href={href} target="_blank" rel="noopener noreferrer" className="text-foreground underline hover:text-foreground/80">
                          {children}
                        </a>
                      );
                    },
                    table: ({ children }) => (
                      <div className="overflow-x-auto my-4">
                        <table className="min-w-full border-collapse border border-border rounded-lg">
                          {children}
                        </table>
                      </div>
                    ),
                    thead: ({ children }) => (
                      <thead className="bg-muted/50">{children}</thead>
                    ),
                    tbody: ({ children }) => (
                      <tbody className="divide-y divide-border">{children}</tbody>
                    ),
                    tr: ({ children }) => (
                      <tr className="border-b border-border">{children}</tr>
                    ),
                    th: ({ children }) => (
                      <th className="px-4 py-2 text-left text-sm font-semibold text-foreground border-r border-border last:border-r-0">
                        {children}
                      </th>
                    ),
                    td: ({ children }) => (
                      <td className="px-4 py-2 text-sm text-foreground border-r border-border last:border-r-0">
                        {children}
                      </td>
                    ),
                    // Code block with copy button
                    pre: ({ children }) => (
                      <CodeBlock className="bg-muted text-foreground p-3 rounded-lg">
                        {children}
                      </CodeBlock>
                    ),
                  }}
                >
                  {preprocessImageLinks(streamedText)}
                </ReactMarkdown>
              </div>
            )}
          </StreamingText>
        ) : (
          (() => {
            // Extract any todo JSON blocks from text content
            const { filteredContent, extractedTodos } = extractTodosFromText(message.content);
            return (
              <>
                {/* Render extracted todos as proper TodoList components */}
                {extractedTodos.map((todos, idx) => (
                  <TodoList key={`extracted-todo-${idx}`} todos={todos} />
                ))}
                {/* Render remaining content */}
                {filteredContent && (
                  <RichContentRenderer
                    content={filteredContent}
                    className={proseClasses}
                    imageSelectable={imageSelectable}
                    onImageSelect={onImageSelect}
                  />
                )}
              </>
            );
          })()
        )}
        {/* Copy button for assistant messages */}
        {isAssistant && message.content && (
          <button
            onClick={handleCopyContent}
            className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            title={contentCopied ? "Copied!" : "Copy message"}
          >
            {contentCopied ? (
              <>
                <Check className="h-3.5 w-3.5 text-green-500" />
                <span className="text-green-500">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                <span>Copy</span>
              </>
            )}
          </button>
        )}
        {/* Only show timestamp on the final assistant message */}
        {isLastAssistantMessage && (
          <p className="text-xs mt-1.5 text-muted-foreground">
            {new Date(message.timestamp).toLocaleTimeString()}
          </p>
        )}
        {/* Continue button inside assistant bubble */}
        {isAssistant && showContinueButton && onContinue && (
          <Button
            size="sm"
            onClick={onContinue}
            disabled={isLoading}
            className="mt-3 gap-1.5"
          >
            <Play className="h-3 w-3" />
            {continueLabel || 'Continue'}
          </Button>
        )}
      </div>
    </motion.div>
  );
}, (prev, next) => 
  prev.message.id === next.message.id && 
  prev.message.content === next.message.content &&
  prev.shouldStream === next.shouldStream && 
  prev.isLastMessage === next.isLastMessage && 
  prev.isLastAssistantMessage === next.isLastAssistantMessage &&
  prev.isRunning === next.isRunning && 
  prev.showContinueButton === next.showContinueButton && 
  prev.isLoading === next.isLoading
);
