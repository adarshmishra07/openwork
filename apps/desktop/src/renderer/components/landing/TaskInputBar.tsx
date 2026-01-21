'use client';

import { useRef, useEffect, useState } from 'react';
import { getAccomplish } from '../../lib/accomplish';
import { analytics } from '../../lib/analytics';
import { ArrowUp, Loader2, Store, Check, Paperclip, X, Image, FileText, File } from 'lucide-react';

interface AttachedFile {
  path: string;
  name: string;
  type: 'image' | 'document' | 'other';
}

interface TaskInputBarProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  isLoading?: boolean;
  disabled?: boolean;
  large?: boolean;
  autoFocus?: boolean;
  files?: string[];
  onFilesChange?: (files: string[]) => void;
  showStop?: boolean;
  onConnectStore?: () => void;
  shopifyRefreshKey?: number;
}

// Get file type from extension
function getFileType(path: string): 'image' | 'document' | 'other' {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif'];
  const docExts = ['pdf', 'txt', 'md', 'json', 'csv'];
  
  if (imageExts.includes(ext)) return 'image';
  if (docExts.includes(ext)) return 'document';
  return 'other';
}

// Get file name from path
function getFileName(path: string): string {
  return path.split('/').pop() || path.split('\\').pop() || path;
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
  files = [],
  onFilesChange,
  showStop = false,
  onConnectStore,
  shopifyRefreshKey = 0,
}: TaskInputBarProps) {
  const isDisabled = disabled && !showStop; // Allow clicking stop even when "disabled"
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const accomplish = getAccomplish();
  const [shopifyConnected, setShopifyConnected] = useState(false);
  const [shopDomain, setShopDomain] = useState<string | null>(null);

  // Convert file paths to AttachedFile objects
  const attachedFiles: AttachedFile[] = files.map(path => ({
    path,
    name: getFileName(path),
    type: getFileType(path),
  }));

  // Handle file picker
  const handleAttachFiles = async () => {
    try {
      const result = await accomplish.openFilePicker();
      if (!result.canceled && result.filePaths.length > 0) {
        // Add new files to existing files (avoid duplicates)
        const newFiles = [...files];
        for (const path of result.filePaths) {
          if (!newFiles.includes(path)) {
            newFiles.push(path);
          }
        }
        onFilesChange?.(newFiles);
      }
    } catch (error) {
      console.error('Failed to open file picker:', error);
    }
  };

  // Remove a file
  const handleRemoveFile = (path: string) => {
    onFilesChange?.(files.filter(f => f !== path));
  };

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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
    }
  };

  return (
    <div className="relative flex flex-col gap-2 rounded-[32px] border border-border bg-card px-4 py-4 shadow-lg transition-all duration-200 ease-accomplish focus-within:ring-1 focus-within:ring-ring/20">
      
      {/* Attached Files */}
      {attachedFiles.length > 0 && (
        <div className="flex flex-wrap gap-2 px-2 pb-2">
          {attachedFiles.map((file) => (
            <div
              key={file.path}
              className="flex items-center gap-1.5 h-7 pl-2 pr-1 rounded-full bg-muted/50 text-sm text-foreground/80 group"
              title={file.path}
            >
              {file.type === 'image' ? (
                <Image className="h-3.5 w-3.5 text-muted-foreground" />
              ) : file.type === 'document' ? (
                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <File className="h-3.5 w-3.5 text-muted-foreground" />
              )}
              <span className="max-w-[120px] truncate">{file.name}</span>
              <button
                type="button"
                onClick={() => handleRemoveFile(file.path)}
                className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-foreground/10 transition-colors"
                title="Remove file"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Text input area */}
      <textarea
        data-testid="task-input-textarea"
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={isDisabled}
        rows={1}
        className="max-h-[200px] min-h-[24px] w-full resize-none bg-transparent px-2 text-foreground placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 text-lg font-light tracking-tight"
      />

      {/* Bottom Actions Row */}
      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-2">
            {/* Attachment Button */}
            <button 
                type="button"
                onClick={handleAttachFiles}
                disabled={isDisabled}
                className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Attach files"
            >
                <Paperclip className="h-4 w-4" />
            </button>

            {/* Store Status Pill */}
            <button 
                type="button"
                onClick={() => {
                  if (!shopifyConnected && onConnectStore) {
                    onConnectStore();
                  }
                }}
                className={`flex items-center gap-1.5 h-8 px-3 rounded-full border text-sm font-medium transition-colors ${
                  shopifyConnected 
                    ? 'border-foreground/20 bg-foreground/5 text-foreground cursor-default' 
                    : 'border-border bg-background text-muted-foreground hover:border-foreground/30 hover:text-foreground cursor-pointer'
                }`}
                title={shopifyConnected ? `Connected to ${shopDomain}` : 'Click to connect a store'}
            >
                {shopifyConnected ? (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    <span>{shopDomain?.replace('.myshopify.com', '') || 'Store Connected'}</span>
                  </>
                ) : (
                  <>
                    <Store className="h-3.5 w-3.5" />
                    <span>No Store</span>
                  </>
                )}
            </button>
        </div>

        {/* Submit/Stop button */}
        <button
            data-testid="task-input-submit"
            type="button"
            onClick={() => {
              if (showStop) {
                onSubmit(); // This will call interruptTask when showStop is true
              } else {
                analytics.trackSubmitTask();
                accomplish.logEvent({
                    level: 'info',
                    message: 'Task input submit clicked',
                    context: { prompt: value, files },
                });
                onSubmit();
              }
            }}
            disabled={!showStop && (!value.trim() || isDisabled)}
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all duration-200 ease-accomplish disabled:cursor-not-allowed disabled:opacity-40 ${
              showStop 
                ? 'bg-foreground text-background hover:bg-foreground/80' 
                : 'bg-muted text-muted-foreground hover:bg-foreground hover:text-background'
            }`}
            title={showStop ? "Stop" : "Submit"}
        >
            {showStop ? (
              <div className="w-3 h-3 rounded-sm bg-current" />
            ) : isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowUp className="h-4 w-4" />
            )}
        </button>
      </div>
    </div>
  );
}
