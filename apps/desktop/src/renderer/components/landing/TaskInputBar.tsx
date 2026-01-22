'use client';

import { useRef, useEffect, useState } from 'react';
import { getAccomplish } from '../../lib/accomplish';
import { analytics } from '../../lib/analytics';
import { ArrowUp, Loader2, Store, Check } from 'lucide-react';

interface TaskInputBarProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  isLoading?: boolean;
  disabled?: boolean;
  large?: boolean;
  autoFocus?: boolean;
  showStop?: boolean;
  onConnectStore?: () => void;
  shopifyRefreshKey?: number;
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
}: TaskInputBarProps) {
  const isDisabled = disabled && !showStop;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const accomplish = getAccomplish();
  const [shopifyConnected, setShopifyConnected] = useState(false);
  const [shopDomain, setShopDomain] = useState<string | null>(null);

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
    <div className="relative flex flex-col gap-3 rounded-2xl border border-border bg-card px-5 py-4 shadow-xl transition-all duration-200 ease-accomplish focus-within:ring-2 focus-within:ring-ring/10">
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
        className={`max-h-[200px] min-h-[28px] w-full resize-none bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${large ? 'text-base' : 'text-sm'}`}
      />

      {/* Bottom Actions Row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
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
          onClick={() => {
            if (showStop) {
              onSubmit();
            } else {
              analytics.trackSubmitTask();
              accomplish.logEvent({
                level: 'info',
                message: 'Task input submit clicked',
                context: { prompt: value },
              });
              onSubmit();
            }
          }}
          disabled={!showStop && (!value.trim() || isDisabled)}
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all duration-200 ease-accomplish disabled:cursor-not-allowed disabled:opacity-40 ${
            showStop 
              ? 'bg-foreground text-background hover:bg-foreground/80' 
              : 'bg-foreground text-background hover:bg-foreground/80'
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
