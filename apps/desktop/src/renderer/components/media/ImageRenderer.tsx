/**
 * ImageRenderer Component
 * 
 * Renders images with loading states, error handling, lightbox preview,
 * and download functionality. Supports both remote URLs and local files
 * via IPC-based base64 loading.
 */

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Download, ChevronLeft, ChevronRight, AlertCircle, Loader2, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ImageRendererProps {
  url: string;
  alt?: string;
  maxWidth?: number;
  maxHeight?: number;
  className?: string;
}

type LoadingState = 'loading' | 'loaded' | 'error';

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
          // Extract the file path from local-media:// URL
          // local-media:///path/to/file -> /path/to/file
          const filePath = url.replace('local-media://', '');
          const result = await window.accomplish.loadLocalFile(filePath);
          setResolvedUrl(result.dataUrl);
        } else {
          throw new Error('Local file loading not available');
        }
      } catch (err) {
        console.error('[ImageRenderer] Failed to load local file:', url, err);
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

export function ImageRenderer({
  url,
  alt = 'Generated image',
  maxWidth,
  maxHeight,
  className,
}: ImageRendererProps) {
  const [loadingState, setLoadingState] = useState<LoadingState>('loading');
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  
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

  const handleLoad = () => {
    setLoadingState('loaded');
  };

  const handleError = () => {
    setLoadingState('error');
  };

  const handleImageClick = () => {
    if (loadingState === 'loaded') {
      setIsLightboxOpen(true);
    }
  };

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    // For local files, open the data URL; for remote, open the original URL
    window.open(resolvedUrl || url, '_blank');
  };

  const handleCloseLightbox = useCallback(() => {
    setIsLightboxOpen(false);
  }, []);

  // Handle escape key for lightbox
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isLightboxOpen) {
        handleCloseLightbox();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isLightboxOpen, handleCloseLightbox]);

  const containerStyle: React.CSSProperties = {
    maxWidth: maxWidth ? `${maxWidth}px` : undefined,
    maxHeight: maxHeight ? `${maxHeight}px` : undefined,
  };

  // Don't render the img tag if we're still loading the local file or there's an error
  const shouldRenderImage = !isLoadingLocal && !localError && resolvedUrl;

  return (
    <>
      <div
        data-testid="image-renderer"
        className={cn(
          'relative rounded-lg overflow-hidden group',
          loadingState === 'loaded' && 'cursor-pointer',
          className
        )}
        style={containerStyle}
      >
        {/* Loading spinner */}
        {loadingState === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted/50">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Error state */}
        {loadingState === 'error' && (
          <div className="flex items-center gap-2 p-3 text-muted-foreground bg-muted/30 rounded-md">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="text-xs">
              {localError || 'Image not found (may have been generated in a previous session)'}
            </span>
          </div>
        )}

        {/* Image */}
        {shouldRenderImage && (
          <img
            src={resolvedUrl}
            alt={alt}
            onLoad={handleLoad}
            onError={handleError}
            onClick={handleImageClick}
            className={cn(
              'w-full h-auto transition-opacity',
              loadingState === 'loading' && 'opacity-0',
              loadingState === 'loaded' && 'opacity-100',
              loadingState === 'error' && 'hidden'
            )}
          />
        )}

        {/* Download button overlay */}
        {loadingState === 'loaded' && (
          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              data-testid="download-button"
              onClick={handleDownload}
              className="p-2 rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors"
              title="Download image"
            >
              <Download className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Lightbox */}
      <AnimatePresence>
        {isLightboxOpen && resolvedUrl && (
          <Lightbox
            url={resolvedUrl}
            alt={alt}
            onClose={handleCloseLightbox}
          />
        )}
      </AnimatePresence>
    </>
  );
}

interface LightboxProps {
  url: string;
  alt: string;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  counter?: string;
}

function Lightbox({ url, alt, onClose, onPrev, onNext, counter }: LightboxProps) {
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <motion.div
      data-testid="lightbox"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center"
    >
      {/* Backdrop */}
      <div
        data-testid="lightbox-backdrop"
        className="absolute inset-0 bg-black/90"
        onClick={handleBackdropClick}
      />

      {/* Close button - prominent with higher z-index */}
      <button
        data-testid="lightbox-close"
        onClick={onClose}
        className="absolute top-4 right-4 z-50 p-3 rounded-full bg-black/70 hover:bg-black/90 text-white transition-colors border border-white/20"
      >
        <X className="w-8 h-8" />
      </button>

      {/* Navigation buttons */}
      {onPrev && (
        <button
          data-testid="lightbox-prev"
          onClick={onPrev}
          className="absolute left-4 z-10 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
      )}

      {onNext && (
        <button
          data-testid="lightbox-next"
          onClick={onNext}
          className="absolute right-4 z-10 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      )}

      {/* Counter */}
      {counter && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-white/10 text-white text-sm">
          {counter}
        </div>
      )}

      {/* Image */}
      <motion.img
        data-testid="lightbox-image"
        src={url}
        alt={alt}
        initial={{ scale: 0.9 }}
        animate={{ scale: 1 }}
        exit={{ scale: 0.9 }}
        className="relative z-0 max-w-[90vw] max-h-[90vh] object-contain"
      />

      {/* Download button */}
      <button
        onClick={() => window.open(url, '_blank')}
        className="absolute bottom-4 right-4 z-10 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
        title="Download image"
      >
        <Download className="w-5 h-5" />
      </button>
    </motion.div>
  );
}

/**
 * Standalone image card with number badge, select/download overlays, and lightbox.
 * Shared between ImageGallery and inline rendering.
 */
export interface GalleryImageItemProps {
  url: string;
  index: number;
  selectable?: boolean;
  onSelect?: (label: string, url: string, index: number) => void;
  className?: string;
}

export function GalleryImageItem({ url, index, selectable, onSelect, className }: GalleryImageItemProps) {
  const [loadState, setLoadState] = useState<LoadingState>('loading');
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const { resolvedUrl, isLoading: isLoadingLocal, error: localError } = useLocalFileLoader(url);

  const showLoading = isLoadingLocal || (loadState !== 'loaded' && loadState !== 'error' && !localError);
  const showError = !!localError || loadState === 'error';
  const canRender = !isLoadingLocal && !localError && resolvedUrl;

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isLightboxOpen) setIsLightboxOpen(false);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isLightboxOpen]);

  return (
    <>
      <div className={cn('relative rounded-lg overflow-hidden group cursor-pointer h-fit', className)}>
        {/* Loading */}
        {showLoading && (
          <div className="flex items-center justify-center min-h-[120px] bg-muted/30 rounded-lg">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Error */}
        {showError && (
          <div className={cn(
            'flex items-center justify-center gap-2 p-4 min-h-[80px]',
            localError === 'File no longer exists' ? 'text-muted-foreground' : 'text-destructive'
          )}>
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span className="text-sm">{localError || 'Failed to load'}</span>
          </div>
        )}

        {/* Image */}
        {canRender && (
          <img
            src={resolvedUrl}
            alt={`Image ${index + 1}`}
            onLoad={() => setLoadState('loaded')}
            onError={() => setLoadState('error')}
            onClick={() => loadState === 'loaded' && setIsLightboxOpen(true)}
            className={cn(
              'w-full h-auto block transition-opacity !m-0',
              loadState !== 'loaded' && 'opacity-0 absolute',
              loadState === 'loaded' && 'opacity-100',
              loadState === 'error' && 'hidden'
            )}
          />
        )}

        {/* Number badge */}
        {selectable && loadState === 'loaded' && (
          <div className="absolute top-2 left-2 w-6 h-6 rounded-full bg-black/70 flex items-center justify-center text-white text-xs font-bold z-10">
            {index + 1}
          </div>
        )}

        {/* Action buttons */}
        {loadState === 'loaded' && (
          <div className="absolute top-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
            {selectable && onSelect && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(String(index + 1), resolvedUrl, index);
                }}
                className="p-1.5 rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors"
                title={`Select image ${index + 1}`}
              >
                <Plus className="w-3 h-3" />
              </button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                window.open(resolvedUrl, '_blank');
              }}
              className="p-1.5 rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors"
              title="Download image"
            >
              <Download className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      {/* Lightbox */}
      <AnimatePresence>
        {isLightboxOpen && resolvedUrl && (
          <Lightbox
            url={resolvedUrl}
            alt={`Image ${index + 1}`}
            onClose={() => setIsLightboxOpen(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

interface ImageGalleryProps {
  urls: string[];
  className?: string;
  /** Enable selection mode with number labels (1, 2, 3...) */
  selectable?: boolean;
  /** Callback when an image is selected */
  onSelect?: (label: string, url: string, index: number) => void;
}

/**
 * Hook to load multiple local files via IPC
 */
function useLocalFilesLoader(urls: string[]): {
  resolvedUrls: string[];
  isLoading: boolean;
  errors: Record<number, string>;
} {
  const [resolvedUrls, setResolvedUrls] = useState<string[]>(urls);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errors, setErrors] = useState<Record<number, string>>({});

  useEffect(() => {
    const loadFiles = async () => {
      // Check if any URLs need loading
      const hasLocalFiles = urls.some(isLocalMediaUrl);
      if (!hasLocalFiles) {
        setResolvedUrls(urls);
        setIsLoading(false);
        setErrors({});
        return;
      }

      setIsLoading(true);
      const newErrors: Record<number, string> = {};
      
      const resolved = await Promise.all(
        urls.map(async (url, index) => {
          if (!isLocalMediaUrl(url)) {
            return url;
          }

          try {
            if (window.accomplish?.loadLocalFile) {
              // Extract the file path from local-media:// URL
              const filePath = url.replace('local-media://', '');
              const result = await window.accomplish.loadLocalFile(filePath);
              return result.dataUrl;
            } else {
              throw new Error('Local file loading not available');
            }
          } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Failed to load';
            // Only log unexpected errors (not "file not found" which is expected for temp files)
            const isFileNotFound = errorMessage.includes('File not found') || errorMessage.includes('not readable');
            if (!isFileNotFound) {
              console.error(`[ImageGallery] Failed to load local file ${index}:`, url, err);
            }
            newErrors[index] = isFileNotFound ? 'File no longer exists' : errorMessage;
            return ''; // Return empty string for failed loads
          }
        })
      );

      setResolvedUrls(resolved);
      setErrors(newErrors);
      setIsLoading(false);
    };

    loadFiles();
  }, [urls.join(',')]); // Join to create stable dependency

  return { resolvedUrls, isLoading, errors };
}

export function ImageGallery({ urls, className, selectable = false, onSelect }: ImageGalleryProps) {
  if (urls.length === 0) {
    return null;
  }

  // Gallery: up to 4 per row
  const gridCols = urls.length === 1
    ? 'grid-cols-1 max-w-xs'
    : urls.length === 2
      ? 'grid-cols-2'
      : urls.length === 3
        ? 'grid-cols-3'
        : 'grid-cols-4';

  return (
    <div
      data-testid="image-gallery"
      className={cn('grid gap-2 items-start', gridCols, className)}
    >
      {urls.map((url, index) => (
        <GalleryImageItem
          key={url}
          url={url}
          index={index}
          selectable={selectable}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

export default ImageRenderer;
