import { X, FileText, FileJson, FileType, AlertCircle, RefreshCw, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FileAttachment, FileCategory } from '@shopos/shared';
import { getFileCategory, formatFileSize } from '@shopos/shared';

interface AttachmentPreviewProps {
  attachment: FileAttachment;
  onRemove: (id: string) => void;
  onRetry?: (id: string) => void;
}

/**
 * Get the icon component for a file category
 */
function getCategoryIcon(category: FileCategory) {
  switch (category) {
    case 'image':
      return null; // Images show thumbnail instead
    case 'document':
      return FileText;
    case 'data':
      return FileJson;
    case 'text':
      return FileType;
    default:
      return FileText;
  }
}

export function AttachmentPreview({ attachment, onRemove, onRetry }: AttachmentPreviewProps) {
  const { id, filename, contentType, size, uploadStatus, uploadProgress, previewDataUrl, error } = attachment;
  const category = getFileCategory(contentType);
  const Icon = getCategoryIcon(category);
  
  const isUploading = uploadStatus === 'uploading';
  const isCompleted = uploadStatus === 'completed';
  const isFailed = uploadStatus === 'failed';
  const isPending = uploadStatus === 'pending';

  return (
    <div 
      className={cn(
        'relative group w-20 h-20 rounded-lg border overflow-hidden flex-shrink-0 transition-all',
        isFailed ? 'border-destructive/50 bg-destructive/10' : 'border-border bg-muted/50',
        isCompleted && 'border-green-500/50'
      )}
      title={`${filename} (${formatFileSize(size)})`}
    >
      {/* Preview content */}
      <div className="w-full h-full flex items-center justify-center">
        {category === 'image' && previewDataUrl ? (
          <img 
            src={previewDataUrl} 
            alt={filename}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="flex flex-col items-center justify-center text-muted-foreground">
            {Icon && <Icon className="w-8 h-8" />}
            <span className="text-[10px] mt-1 uppercase font-medium">
              {contentType.split('/')[1]?.slice(0, 4) || 'file'}
            </span>
          </div>
        )}
      </div>

      {/* Upload progress overlay */}
      {(isUploading || isPending) && (
        <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center">
          {isUploading && uploadProgress !== undefined ? (
            <>
              {/* Circular progress indicator */}
              <div className="relative w-10 h-10">
                <svg className="w-full h-full transform -rotate-90">
                  <circle
                    cx="20"
                    cy="20"
                    r="16"
                    stroke="currentColor"
                    strokeWidth="3"
                    fill="none"
                    className="text-white/20"
                  />
                  <circle
                    cx="20"
                    cy="20"
                    r="16"
                    stroke="currentColor"
                    strokeWidth="3"
                    fill="none"
                    strokeDasharray={`${2 * Math.PI * 16}`}
                    strokeDashoffset={`${2 * Math.PI * 16 * (1 - uploadProgress / 100)}`}
                    className="text-white transition-all duration-300"
                    strokeLinecap="round"
                  />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-white text-xs font-medium">
                  {uploadProgress}%
                </span>
              </div>
            </>
          ) : (
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          )}
        </div>
      )}

      {/* Completed overlay */}
      {isCompleted && (
        <div className="absolute top-1 left-1">
          <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
            <Check className="w-3 h-3 text-white" />
          </div>
        </div>
      )}

      {/* Error overlay */}
      {isFailed && (
        <div className="absolute inset-0 bg-destructive/80 flex flex-col items-center justify-center gap-1">
          <AlertCircle className="w-5 h-5 text-white" />
          {onRetry && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRetry(id);
              }}
              className="flex items-center gap-1 text-[10px] text-white hover:underline"
            >
              <RefreshCw className="w-3 h-3" />
              Retry
            </button>
          )}
        </div>
      )}

      {/* Remove button - always visible on hover */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove(id);
        }}
        className={cn(
          'absolute top-1 right-1 p-0.5 rounded-full transition-opacity',
          'bg-black/60 hover:bg-black/80',
          isCompleted || isFailed ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        )}
        title="Remove attachment"
      >
        <X className="h-3.5 w-3.5 text-white" />
      </button>

      {/* Filename tooltip bar at bottom */}
      <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] px-1.5 py-0.5 truncate opacity-0 group-hover:opacity-100 transition-opacity">
        {filename}
      </div>
    </div>
  );
}
