import { AttachmentPreview } from './AttachmentPreview';
import type { FileAttachment } from '@shopos/shared';

interface AttachmentListProps {
  attachments: FileAttachment[];
  onRemove: (id: string) => void;
  onRetry?: (id: string) => void;
}

export function AttachmentList({ attachments, onRemove, onRetry }: AttachmentListProps) {
  if (attachments.length === 0) return null;

  return (
    <div className="flex gap-2 overflow-x-auto pb-2 mb-2 scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent">
      {attachments.map((attachment) => (
        <AttachmentPreview
          key={attachment.id}
          attachment={attachment}
          onRemove={onRemove}
          onRetry={onRetry}
        />
      ))}
    </div>
  );
}
