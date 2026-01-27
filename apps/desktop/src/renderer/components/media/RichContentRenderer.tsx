/**
 * RichContentRenderer Component
 * 
 * Renders text content with automatic media detection and rendering.
 * Extracts images, videos, and PDFs from text and renders them with
 * appropriate components, while preserving the text content.
 */

import { useMemo, useState, useCallback, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Copy, Check } from 'lucide-react';
import { extractMediaUrls, MediaType, type ExtractedMedia, isLocalPath, normalizeLocalPath } from '@/lib/media-utils';
import { ImageRenderer, ImageGallery } from './ImageRenderer';
import { VideoRenderer } from './VideoRenderer';
import { PDFRenderer } from './PDFRenderer';
import { cn } from '@/lib/utils';

/**
 * Helper to extract text content from React children
 */
function extractTextFromChildren(children: ReactNode): string {
  if (typeof children === 'string') return children;
  if (typeof children === 'number') return String(children);
  if (!children) return '';
  
  if (Array.isArray(children)) {
    return children.map(extractTextFromChildren).join('');
  }
  
  if (typeof children === 'object' && 'props' in children) {
    const propsChildren = (children as { props: { children?: ReactNode } }).props.children;
    return extractTextFromChildren(propsChildren);
  }
  
  return '';
}

/**
 * CodeBlock component with always-visible copy button
 */
function CodeBlock({ children, className }: { children: ReactNode; className?: string }) {
  const [copied, setCopied] = useState(false);
  
  const handleCopy = useCallback(() => {
    const text = extractTextFromChildren(children);
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [children]);
  
  return (
    <div className={cn(
      "relative group my-3 rounded-lg overflow-x-auto bg-muted/50 border border-border",
      className
    )}>
      <pre className="whitespace-pre-wrap break-words text-sm p-4 m-0">
        {children}
      </pre>
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 p-1.5 rounded bg-background/80 hover:bg-background border border-border/50 text-muted-foreground hover:text-foreground transition-colors"
        title={copied ? "Copied!" : "Copy to clipboard"}
      >
        {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

interface RichContentRendererProps {
  content: string;
  className?: string;
  /** Enable image selection mode with letter labels */
  imageSelectable?: boolean;
  /** Callback when an image is selected */
  onImageSelect?: (label: string, url: string, index: number) => void;
}

export function RichContentRenderer({ content, className, imageSelectable, onImageSelect }: RichContentRendererProps) {
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

  // Pre-process content to convert image links to proper markdown image syntax
  // This ensures images render inline instead of as clickable links
  const textContent = useMemo(() => {
    if (!content) return '';
    
    let processed = content;
    
    // Convert markdown links that point to images into markdown image syntax
    // [filename](https://...png) → ![filename](https://...png)
    // This makes ReactMarkdown render them as <img> tags natively
    processed = processed.replace(
      /(?<!!)\[([^\]]+)\]\((https?:\/\/[^\s)]+\.(?:png|jpg|jpeg|gif|webp|svg|bmp|avif)(?:\?[^\s)]*)?)\)/gi,
      '![$1]($2)'
    );
    
    // Also convert bare image URLs that are auto-linked by remark-gfm
    // https://...png → ![image](https://...png)
    // But only if they're on their own line or surrounded by whitespace
    processed = processed.replace(
      /(?<=^|\s)(https?:\/\/[^\s<>]+\.(?:png|jpg|jpeg|gif|webp|svg|bmp|avif)(?:\?[^\s<>]*)?)(?=\s|$)/gim,
      '![]($1)'
    );
    
    return processed;
  }, [content]);

  const hasMedia = mediaItems.length > 0;

  return (
    <div data-testid="rich-content" className="space-y-4">
      {/* Text content with markdown */}
      <div className={className}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            // Override img - skip inline images when we have images in the gallery
            // This prevents duplicate rendering
            img: ({ src, alt }) => {
              if (!src) return null;
              
              // If we have images extracted (will show in gallery), skip inline rendering
              if (images.length > 0) {
                return null;
              }
              
              // Normalize local paths to local-media:// protocol
              const normalizedSrc = isLocalPath(src) ? normalizeLocalPath(src) : src;
              
              // For local files, use ImageRenderer which handles IPC loading
              if (isLocalPath(src)) {
                return <ImageRenderer url={normalizedSrc} alt={alt || 'Image'} maxWidth={600} />;
              }
              
              // Render remote images with proper styling
              return (
                <img 
                  src={src} 
                  alt={alt || 'Image'} 
                  className="max-w-[600px] w-full h-auto rounded-lg border border-border shadow-sm my-2"
                  loading="lazy"
                />
              );
            },
            // Ensure paragraphs have proper text color
            p: ({ children }) => {
              // Hide empty paragraphs (e.g., after hiding "Generated Images:")
              if (!children || (Array.isArray(children) && children.every(c => c === null))) {
                return null;
              }
              return <p className="text-foreground">{children}</p>;
            },
            li: ({ children, node }) => {
              // Hide list items that only contain images (these are duplicates from "Generated Images:")
              // Check if the original node only had an image
              const hasOnlyImage = node?.children?.length === 1 && 
                node?.children?.[0]?.type === 'element' && 
                (node?.children?.[0] as { tagName?: string })?.tagName === 'img';
              
              if (hasOnlyImage && images.length > 0) {
                return null;
              }
              
              if (!children || (Array.isArray(children) && children.every(c => c === null || c === undefined))) {
                return null;
              }
              return <li className="text-foreground">{children}</li>;
            },
            ul: ({ children }) => {
              // Hide empty lists or lists where all children are null
              const childArray = Array.isArray(children) ? children : [children];
              const hasVisibleChildren = childArray.some(c => c !== null && c !== undefined);
              
              if (!hasVisibleChildren) {
                return null;
              }
              return <ul>{children}</ul>;
            },
            // Handle "Image A", "Image B" etc. and "Generated Images:"
            strong: ({ children }) => {
              const text = String(children);
              
              // Hide "Generated Images:" header - images shown in gallery
              if (text === 'Generated Images:') {
                return null;
              }
              
              // Hide "Image A", "Image B" etc labels when we have gallery - images shown there
              if (images.length > 0 && /^Image\s+[A-Z]$/i.test(text)) {
                return null;
              }
              
              // Default rendering
              return <strong className="text-foreground font-semibold">{children}</strong>;
            },
            a: ({ href, children }) => {
              if (!href) return <span>{children}</span>;
              
              // Image links are pre-processed to ![](url) syntax, so they become <img> tags
              // But as a fallback, if an image link still comes through, render it as image
              const isImageLink = /\.(png|jpg|jpeg|gif|webp|svg|bmp|avif)(\?|$)/i.test(href);
              
              if (isImageLink) {
                return (
                  <span className="block my-4">
                    <img 
                      src={href} 
                      alt={String(children) || 'Image'} 
                      className="max-w-[600px] w-full h-auto rounded-lg border border-border shadow-sm"
                      loading="lazy"
                    />
                  </span>
                );
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
            // Table components for GFM tables
            table: ({ children }) => (
              <div className="overflow-x-auto my-4">
                <table className="min-w-full border-collapse border border-border rounded-lg">
                  {children}
                </table>
              </div>
            ),
            thead: ({ children }) => (
              <thead className="bg-muted/50">{children}</thead>
            ),
            tbody: ({ children }) => (
              <tbody className="divide-y divide-border">{children}</tbody>
            ),
            tr: ({ children }) => (
              <tr className="border-b border-border">{children}</tr>
            ),
            th: ({ children }) => (
              <th className="px-4 py-2 text-left text-sm font-semibold text-foreground border-r border-border last:border-r-0">
                {children}
              </th>
            ),
            td: ({ children }) => (
              <td className="px-4 py-2 text-sm text-foreground border-r border-border last:border-r-0">
                {children}
              </td>
            ),
            // Code block with copy button
            pre: ({ children }) => (
              <CodeBlock className="bg-muted text-foreground p-3 rounded-lg">
                {children}
              </CodeBlock>
            ),
            // Inline code - shorten S3 URLs for cleaner display
            code: ({ children }) => {
              const text = String(children);
              
              // Check if this is an S3/cloud storage URL
              const s3UrlRegex = /^https?:\/\/[a-zA-Z0-9\-_.]+\.(?:amazonaws\.com|s3\.[a-z0-9\-]+\.amazonaws\.com)/;
              if (s3UrlRegex.test(text)) {
                // Extract filename from URL
                const filename = text.split('/').pop()?.split('?')[0] || 'file';
                const isImage = /\.(png|jpg|jpeg|gif|webp)$/i.test(text);
                
                return (
                  <a 
                    href={text} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-primary underline hover:text-primary/80 text-sm"
                    title={text}
                  >
                    {isImage ? filename : '[File URL]'}
                  </a>
                );
              }
              
              // Regular inline code
              return (
                <code className="text-sm bg-muted px-1.5 py-0.5 rounded font-mono">
                  {children}
                </code>
              );
            },
          }}
        >
          {textContent}
        </ReactMarkdown>
      </div>

      {/* Media section - only show gallery for selectable mode or videos/pdfs */}
      {hasMedia && (
        <div className="space-y-4">
          {/* Images - only show gallery in selectable mode (images are already rendered inline) */}
          {images.length >= 1 && imageSelectable && (
            <ImageGallery 
              urls={images} 
              selectable={imageSelectable}
              onSelect={onImageSelect}
            />
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
