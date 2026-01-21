/**
 * RichContentRenderer Component
 * 
 * Renders text content with automatic media detection and rendering.
 * Extracts images, videos, and PDFs from text and renders them with
 * appropriate components, while preserving the text content.
 */

import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { extractMediaUrls, MediaType, type ExtractedMedia, isLocalPath, normalizeLocalPath } from '@/lib/media-utils';
import { ImageRenderer, ImageGallery } from './ImageRenderer';
import { VideoRenderer } from './VideoRenderer';
import { PDFRenderer } from './PDFRenderer';
import { cn } from '@/lib/utils';

interface RichContentRendererProps {
  content: string;
  className?: string;
}

export function RichContentRenderer({ content, className }: RichContentRendererProps) {
  // Extract media URLs from content
  const mediaItems = useMemo(() => {
    if (!content) return [];
    return extractMediaUrls(content);
  }, [content]);

  // Group media by type
  const { images, videos, pdfs } = useMemo(() => {
    const images: string[] = [];
    const videos: ExtractedMedia[] = [];
    const pdfs: ExtractedMedia[] = [];

    for (const item of mediaItems) {
      switch (item.type) {
        case MediaType.IMAGE:
          images.push(item.url);
          break;
        case MediaType.VIDEO:
          videos.push(item);
          break;
        case MediaType.PDF:
          pdfs.push(item);
          break;
      }
    }

    return { images, videos, pdfs };
  }, [mediaItems]);

  // Clean content by removing media URLs for cleaner text display
  // (optional - we can also keep the URLs in text)
  const textContent = useMemo(() => {
    if (!content) return '';
    
    // For now, keep the original content with markdown
    // The markdown renderer will also handle images, but our custom
    // renderers below will provide enhanced functionality
    return content;
  }, [content]);

  const hasMedia = mediaItems.length > 0;

  return (
    <div data-testid="rich-content" className="space-y-4">
      {/* Text content with markdown */}
      <div className={className}>
        <ReactMarkdown
          components={{
            // Override img to handle both remote and local images properly
            img: ({ src, alt }) => {
              if (!src) return null;
              
              // Normalize local paths to local-media:// protocol
              const normalizedSrc = isLocalPath(src) ? normalizeLocalPath(src) : src;
              
              // If this image is in our media list (normalized), skip it here (rendered below)
              if (images.includes(normalizedSrc) || images.includes(src)) {
                return null;
              }
              
              // For local files, use ImageRenderer which handles IPC loading
              if (isLocalPath(src)) {
                return <ImageRenderer url={normalizedSrc} alt={alt || 'Image'} maxWidth={600} />;
              }
              
              // Render remote images normally
              return <img src={src} alt={alt || 'Image'} className="rounded-lg" />;
            },
            // Ensure all text elements have proper color
            p: ({ children }) => <p className="text-foreground">{children}</p>,
            li: ({ children }) => <li className="text-foreground">{children}</li>,
            strong: ({ children }) => <strong className="text-foreground font-semibold">{children}</strong>,
            a: ({ href, children }) => {
              if (!href) return <span>{children}</span>;
              
              // Check if link points to an image
              const isImageLink = /\.(png|jpg|jpeg|gif|webp|svg|bmp|avif)(\?|$)/i.test(href);
              if (isImageLink) {
                // Normalize local paths
                const normalizedHref = isLocalPath(href) ? normalizeLocalPath(href) : href;
                return <ImageRenderer url={normalizedHref} alt={String(children) || 'Image'} maxWidth={600} />;
              }
              
              // Regular link - open in external browser
              return (
                <a 
                  href={href} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="text-foreground underline hover:text-foreground/80"
                >
                  {children}
                </a>
              );
            },
          }}
        >
          {textContent}
        </ReactMarkdown>
      </div>

      {/* Media section */}
      {hasMedia && (
        <div className="space-y-4">
          {/* Images */}
          {images.length === 1 && (
            <ImageRenderer url={images[0]} maxWidth={600} />
          )}
          {images.length > 1 && (
            <ImageGallery urls={images} />
          )}

          {/* Videos */}
          {videos.map((video) => (
            <VideoRenderer key={video.url} url={video.url} maxWidth={600} />
          ))}

          {/* PDFs */}
          {pdfs.map((pdf) => (
            <PDFRenderer key={pdf.url} url={pdf.url} />
          ))}
        </div>
      )}
    </div>
  );
}

export default RichContentRenderer;
