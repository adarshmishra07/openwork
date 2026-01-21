/**
 * VideoRenderer Component
 * 
 * Renders video files with loading states, error handling, controls,
 * and download functionality. Supports both remote URLs and local files
 * via IPC-based base64 loading.
 */

import { useState, useEffect } from 'react';
import { Download, AlertCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface VideoRendererProps {
  url: string;
  poster?: string;
  autoPlay?: boolean;
  maxWidth?: number;
  className?: string;
}

type LoadingState = 'loading' | 'ready' | 'error';

/**
 * Check if a URL is a local file path (local-media:// protocol)
 */
function isLocalMediaUrl(url: string): boolean {
  return url.startsWith('local-media://');
}

/**
 * Hook to load local files via IPC, converting them to base64 data URLs
 */
function useLocalFileLoader(url: string): {
  resolvedUrl: string;
  isLoading: boolean;
  error: string | null;
} {
  const [resolvedUrl, setResolvedUrl] = useState<string>(url);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Only process local-media:// URLs
    if (!isLocalMediaUrl(url)) {
      setResolvedUrl(url);
      setIsLoading(false);
      setError(null);
      return;
    }

    // Load local file via IPC
    const loadFile = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Use the accomplish API to load the file
        if (window.accomplish?.loadLocalFile) {
          const result = await window.accomplish.loadLocalFile(url);
          setResolvedUrl(result.dataUrl);
        } else {
          throw new Error('Local file loading not available');
        }
      } catch (err) {
        console.error('[VideoRenderer] Failed to load local file:', url, err);
        setError(err instanceof Error ? err.message : 'Failed to load local file');
        setResolvedUrl(''); // Clear URL so error state shows
      } finally {
        setIsLoading(false);
      }
    };

    loadFile();
  }, [url]);

  return { resolvedUrl, isLoading, error };
}

export function VideoRenderer({
  url,
  poster,
  autoPlay = false,
  maxWidth,
  className,
}: VideoRendererProps) {
  const [loadingState, setLoadingState] = useState<LoadingState>('loading');
  
  // Load local files via IPC
  const { resolvedUrl, isLoading: isLoadingLocal, error: localError } = useLocalFileLoader(url);

  // Update loading state based on local file loading
  useEffect(() => {
    if (isLoadingLocal) {
      setLoadingState('loading');
    } else if (localError) {
      setLoadingState('error');
    }
  }, [isLoadingLocal, localError]);

  const handleCanPlay = () => {
    setLoadingState('ready');
  };

  const handleError = () => {
    setLoadingState('error');
  };

  const handleDownload = () => {
    // For local files, open the data URL; for remote, open the original URL
    window.open(resolvedUrl || url, '_blank');
  };

  const containerStyle: React.CSSProperties = {
    maxWidth: maxWidth ? `${maxWidth}px` : undefined,
  };

  // Don't render the video tag if we're still loading the local file or there's an error
  const shouldRenderVideo = !isLoadingLocal && !localError && resolvedUrl;

  return (
    <div
      data-testid="video-renderer"
      className={cn('relative w-full rounded-lg overflow-hidden bg-black group', className)}
      style={containerStyle}
    >
      {/* Loading indicator */}
      {loadingState === 'loading' && (
        <div 
          data-testid="video-loading"
          className="absolute inset-0 flex items-center justify-center bg-muted/50 z-10"
        >
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Error state */}
      {loadingState === 'error' && (
        <div className="flex items-center gap-2 p-4 text-destructive bg-muted">
          <AlertCircle className="w-5 h-5" />
          <span className="text-sm">{localError || 'Failed to load video'}</span>
        </div>
      )}

      {/* Video element */}
      {shouldRenderVideo && (
        <video
          data-testid="video-player"
          src={resolvedUrl}
          poster={poster}
          controls
          autoPlay={autoPlay}
          muted={autoPlay} // Must be muted for autoplay to work in most browsers
          playsInline
          onCanPlay={handleCanPlay}
          onError={handleError}
          className={cn(
            'w-full h-auto',
            loadingState === 'error' && 'hidden'
          )}
        />
      )}

      {/* Download button overlay */}
      {loadingState === 'ready' && (
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-20">
          <button
            data-testid="video-download-button"
            onClick={handleDownload}
            className="p-2 rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors"
            title="Download video"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

export default VideoRenderer;
