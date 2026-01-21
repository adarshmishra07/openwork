/**
 * PDFRenderer Component
 * 
 * Renders a PDF preview card with filename, open in new tab,
 * and download functionality.
 * 
 * Supports both:
 * - Web URLs (https://...) - opens in browser
 * - Local file paths (/tmp/..., ~/...) - opens with system default app via Electron
 */

import { FileText, Download, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getFileNameFromUrl } from '@/lib/media-utils';

interface PDFRendererProps {
  url: string;
  title?: string;
  fileSize?: string;
  className?: string;
}

/**
 * Check if a path is a local file path (not a URL)
 */
function isLocalFilePath(path: string): boolean {
  return path.startsWith('/') || path.startsWith('~') || path.startsWith('file://');
}

/**
 * Clean file path by removing file:// prefix if present
 */
function cleanFilePath(path: string): string {
  if (path.startsWith('file://')) {
    return path.replace('file://', '');
  }
  return path;
}

export function PDFRenderer({
  url,
  title,
  fileSize,
  className,
}: PDFRendererProps) {
  const filename = title || getFileNameFromUrl(url);
  const isLocal = isLocalFilePath(url);

  const handleOpen = async () => {
    if (isLocal) {
      // Local file - use Electron shell to open with system default app
      try {
        const cleanPath = cleanFilePath(url);
        await window.accomplish?.openPath(cleanPath);
      } catch (error) {
        console.error('Failed to open local file:', error);
        // Fallback: try opening in browser anyway
        window.open(url, '_blank');
      }
    } else {
      // Web URL - open in browser
      window.open(url, '_blank');
    }
  };

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isLocal) {
      // For local files, opening is effectively the same as "download"
      // The system will open it with the default PDF viewer
      try {
        const cleanPath = cleanFilePath(url);
        await window.accomplish?.openPath(cleanPath);
      } catch (error) {
        console.error('Failed to open local file:', error);
      }
    } else {
      window.open(url, '_blank');
    }
  };

  return (
    <div
      data-testid="pdf-renderer"
      onClick={handleOpen}
      className={cn(
        'flex items-center gap-3 p-4 rounded-lg border border-border bg-card',
        'cursor-pointer hover:bg-muted/50 transition-colors group',
        className
      )}
    >
      {/* PDF Icon */}
      <div 
        data-testid="pdf-icon"
        className="flex-shrink-0 w-12 h-12 rounded-lg bg-red-500/10 flex items-center justify-center"
      >
        <FileText className="w-6 h-6 text-red-500" />
      </div>

      {/* File info */}
      <div className="flex-1 min-w-0">
        <h4 className="font-medium text-sm truncate">{filename}</h4>
        {fileSize && (
          <p data-testid="pdf-file-size" className="text-xs text-muted-foreground">
            {fileSize}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          data-testid="pdf-open-button"
          onClick={(e) => {
            e.stopPropagation();
            handleOpen();
          }}
          className="p-2 rounded-full hover:bg-muted transition-colors"
          title="Open PDF"
        >
          <ExternalLink className="w-4 h-4 text-muted-foreground" />
        </button>
        <button
          data-testid="pdf-download-button"
          onClick={handleDownload}
          className="p-2 rounded-full hover:bg-muted transition-colors"
          title="Download PDF"
        >
          <Download className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>
    </div>
  );
}

export default PDFRenderer;
