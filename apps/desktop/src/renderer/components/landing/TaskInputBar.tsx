'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { getAccomplish } from '../../lib/accomplish';
import { analytics } from '../../lib/analytics';
import { ArrowUp, Loader2, Store, Check } from 'lucide-react';
import { AttachmentButton, AttachmentList, AttachmentDropzone } from '../attachments';
import { useAttachmentStore } from '../../stores/attachmentStore';
import type { FileAttachment } from '@brandwork/shared';
import { getAcceptedFileTypes, isSupportedFileType } from '@brandwork/shared';

interface TaskInputBarProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (attachments?: FileAttachment[]) => void;
  placeholder?: string;
  isLoading?: boolean;
  disabled?: boolean;
  large?: boolean;
  autoFocus?: boolean;
  showStop?: boolean;
  onConnectStore?: () => void;
  shopifyRefreshKey?: number;
  /** Task ID for uploading attachments (generated before task starts) */
  taskId?: string;
}

export default function TaskInputBar({
  value,
  onChange,
  onSubmit,
  placeholder = 'Ask anything...',
  isLoading = false,
  disabled = false,
  large = false,
  autoFocus = false,
  showStop = false,
  onConnectStore,
  shopifyRefreshKey = 0,
  taskId,
}: TaskInputBarProps) {
  const isDisabled = disabled && !showStop;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const accomplish = getAccomplish();
  const [shopifyConnected, setShopifyConnected] = useState(false);
  const [shopDomain, setShopDomain] = useState<string | null>(null);
  const [localTaskId, setLocalTaskId] = useState<string>(() => 
    taskId || `task_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
  );

  // Attachment store
  const {
    pendingAttachments,
    addFiles,
    addPastedImage,
    removeAttachment,
    clearAttachments,
    retryUpload,
    getCompletedAttachments,
    hasUploadsInProgress,
    allUploadsComplete,
  } = useAttachmentStore();

  // Update localTaskId when taskId prop changes
  useEffect(() => {
    if (taskId) {
      setLocalTaskId(taskId);
    }
  }, [taskId]);

  // Check Shopify connection status
  useEffect(() => {
    const checkShopifyStatus = async () => {
      try {
        const status = await accomplish.getShopifyStatus();
        setShopifyConnected(status.connected);
        setShopDomain(status.shopDomain || null);
      } catch (error) {
        console.error('Failed to check Shopify status:', error);
      }
    };
    checkShopifyStatus();
  }, [accomplish, shopifyRefreshKey]);

  // Auto-focus on mount
  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [autoFocus]);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, [value]);

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
          return; // Only handle one image at a time
        }
      }
    }
  }, [addPastedImage, localTaskId]);

  // Handle retry
  const handleRetry = useCallback((id: string) => {
    retryUpload(id, localTaskId);
  }, [retryUpload, localTaskId]);

  // Handle submit
  const handleSubmit = useCallback(() => {
    if (showStop) {
      onSubmit();
      return;
    }

    // Don't submit if uploads are in progress
    if (hasUploadsInProgress()) {
      return;
    }

    analytics.trackSubmitTask();
    accomplish.logEvent({
      level: 'info',
      message: 'Task input submit clicked',
      context: { prompt: value, attachmentCount: pendingAttachments.length },
    });

    // Get completed attachments
    const completedAttachments = getCompletedAttachments();
    
    // Submit with attachments
    onSubmit(completedAttachments.length > 0 ? completedAttachments : undefined);
    
    // Clear attachments after submit
    clearAttachments();
    
    // Generate new task ID for next message
    setLocalTaskId(`task_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`);
  }, [showStop, onSubmit, hasUploadsInProgress, value, pendingAttachments, getCompletedAttachments, clearAttachments, accomplish]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Can submit if:
  // 1. Has text OR has completed attachments
  // 2. Not disabled
  // 3. Not loading
  // 4. All uploads complete (or no uploads)
  const canSubmit = showStop || (
    (value.trim() || getCompletedAttachments().length > 0) && 
    !isDisabled && 
    allUploadsComplete()
  );

  const uploadsInProgress = hasUploadsInProgress();

  return (
    <AttachmentDropzone onDrop={handleDrop} disabled={isDisabled}>
      <div className="relative flex flex-col gap-3 rounded-2xl border border-border bg-card px-5 py-4 shadow-xl transition-all duration-200 ease-accomplish focus-within:ring-2 focus-within:ring-ring/10">
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={getAcceptedFileTypes()}
          onChange={handleFileInputChange}
          className="hidden"
        />

        {/* Attachment previews */}
        <AttachmentList
          attachments={pendingAttachments}
          onRemove={removeAttachment}
          onRetry={handleRetry}
        />

        {/* Text input area */}
        <textarea
          data-testid="task-input-textarea"
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={placeholder}
          disabled={isDisabled}
          rows={1}
          className={`max-h-[200px] min-h-[28px] w-full resize-none bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${large ? 'text-base' : 'text-sm'}`}
        />

        {/* Bottom Actions Row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* Attachment Button */}
            <AttachmentButton
              onClick={handleAttachClick}
              disabled={isDisabled}
              hasAttachments={pendingAttachments.length > 0}
              attachmentCount={pendingAttachments.length}
            />

            {/* Store Status Pill */}
            <button 
              type="button"
              onClick={() => {
                if (!shopifyConnected && onConnectStore) {
                  onConnectStore();
                }
              }}
              className={`flex items-center gap-2 h-9 px-4 rounded-full border text-sm font-medium transition-colors ${
                shopifyConnected 
                  ? 'border-foreground/20 bg-foreground/5 text-foreground cursor-default' 
                  : 'border-border bg-card text-foreground hover:bg-muted cursor-pointer'
              }`}
              title={shopifyConnected ? `Connected to ${shopDomain}` : 'Click to connect a store'}
            >
              {shopifyConnected ? (
                <>
                  <Check className="h-4 w-4" />
                  <span>{shopDomain?.replace('.myshopify.com', '') || 'Connected'}</span>
                </>
              ) : (
                <>
                  <Store className="h-4 w-4" />
                  <span>Connect Store</span>
                </>
              )}
            </button>
          </div>

          {/* Submit/Stop button */}
          <button
            data-testid="task-input-submit"
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all duration-200 ease-accomplish disabled:cursor-not-allowed disabled:opacity-40 ${
              showStop 
                ? 'bg-foreground text-background hover:bg-foreground/80' 
                : 'bg-foreground text-background hover:bg-foreground/80'
            }`}
            title={
              showStop 
                ? "Stop" 
                : uploadsInProgress 
                  ? "Waiting for uploads to complete..." 
                  : "Submit"
            }
          >
            {showStop ? (
              <div className="w-3 h-3 rounded-sm bg-current" />
            ) : isLoading || uploadsInProgress ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowUp className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
    </AttachmentDropzone>
  );
}
