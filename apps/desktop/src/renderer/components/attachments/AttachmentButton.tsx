import { Plus } from 'lucide-react';
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
        'w-8 h-8 rounded-full border flex items-center justify-center transition-colors',
        disabled
          ? 'border-border text-muted-foreground cursor-not-allowed opacity-40'
          : hasAttachments
            ? 'border-primary/50 bg-primary/10 text-primary hover:bg-primary/20'
            : 'border-border/60 text-muted-foreground hover:text-foreground hover:border-border cursor-pointer'
      )}
      title={disabled ? 'Cannot attach files while task is running' : 'Attach files'}
    >
      {hasAttachments && attachmentCount > 0 ? (
        <span className="text-xs font-medium">{attachmentCount}</span>
      ) : (
        <Plus className="h-4 w-4" />
      )}
    </button>
  );
}
