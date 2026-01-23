import { Paperclip } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AttachmentButtonProps {
  onClick: () => void;
  disabled?: boolean;
  hasAttachments?: boolean;
  attachmentCount?: number;
}

export function AttachmentButton({ 
  onClick, 
  disabled = false,
  hasAttachments = false,
  attachmentCount = 0,
}: AttachmentButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex items-center gap-2 h-9 px-4 rounded-full border text-sm font-medium transition-colors',
        disabled
          ? 'border-border bg-muted text-muted-foreground cursor-not-allowed opacity-50'
          : hasAttachments
            ? 'border-primary/50 bg-primary/10 text-primary hover:bg-primary/20'
            : 'border-border bg-card text-foreground hover:bg-muted cursor-pointer'
      )}
      title={disabled ? 'Cannot attach files while task is running' : 'Attach files'}
    >
      <Paperclip className="h-4 w-4" />
      {hasAttachments && attachmentCount > 0 ? (
        <span>{attachmentCount}</span>
      ) : (
        <span>Attach</span>
      )}
    </button>
  );
}
