/**
 * Media URL Detection Utilities
 * 
 * Utilities for detecting and extracting media URLs (images, videos, PDFs)
 * from text content for rich rendering in the chat interface.
 * 
 * Supports both remote URLs (http/https) and local file paths.
 */

// Supported media types
export enum MediaType {
  IMAGE = 'image',
  VIDEO = 'video',
  PDF = 'pdf',
}

// Extracted media item
export interface ExtractedMedia {
  type: MediaType;
  url: string;
  isLocal?: boolean;
}

// Image file extensions
const IMAGE_EXTENSIONS = [
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif', 'tiff', 'tif'
];

// Video file extensions
const VIDEO_EXTENSIONS = [
  'mp4', 'webm', 'mov', 'avi', 'mkv', 'm4v', 'ogv', 'ogg', 'flv', 'wmv'
];

// PDF extension
const PDF_EXTENSIONS = ['pdf'];

/**
 * Check if a path is a local file path
 */
export function isLocalPath(path: string): boolean {
  if (!path || typeof path !== 'string') {
    return false;
  }
  
  // Check for absolute paths (Unix or Windows) or file:// / local-media:// protocols
  return (
    path.startsWith('/') ||              // Unix absolute path
    path.startsWith('file://') ||        // file:// protocol
    path.startsWith('local-media://') || // Our custom protocol
    /^[A-Za-z]:\\/.test(path) ||         // Windows absolute path (C:\)
    /^[A-Za-z]:\//.test(path)            // Windows with forward slash (C:/)
  );
}

/**
 * Normalize a local path to local-media:// URL for use in img/video src
 * 
 * We use a custom protocol (local-media://) instead of file:// because
 * Chromium blocks file:// URLs in the renderer for security reasons.
 * The custom protocol is registered in the Electron main process.
 * 
 * URL format must be: local-media:///absolute/path (3 slashes for Unix paths)
 * This ensures the URL parser treats the path correctly with no host.
 */
export function normalizeLocalPath(filePath: string): string {
  if (!filePath) return filePath;
  
  // Already a local-media:// URL - ensure it has 3 slashes
  if (filePath.startsWith('local-media://')) {
    // Check if it has 3 slashes (local-media:/// for absolute paths)
    if (filePath.startsWith('local-media:///')) {
      return filePath;
    }
    // Fix URLs with only 2 slashes by extracting the path and reformatting
    const pathPart = filePath.replace('local-media://', '');
    return `local-media:///${pathPart.startsWith('/') ? pathPart.slice(1) : pathPart}`;
  }
  
  // Convert file:// URL to local-media://
  // file:///path -> local-media:///path
  if (filePath.startsWith('file://')) {
    const pathPart = filePath.replace('file://', '');
    // Ensure we have exactly 3 slashes
    if (pathPart.startsWith('/')) {
      return `local-media://${pathPart}`;
    }
    return `local-media:///${pathPart}`;
  }
  
  // Convert Windows paths (C:\path or C:/path)
  if (/^[A-Za-z]:/.test(filePath)) {
    return `local-media:///${filePath.replace(/\\/g, '/')}`;
  }
  
  // Unix absolute path - ensure 3 slashes total
  // /path/to/file -> local-media:///path/to/file
  if (filePath.startsWith('/')) {
    return `local-media://${filePath}`;
  }
  
  // Relative path (shouldn't happen, but handle it)
  return `local-media:///${filePath}`;
}

/**
 * Get the file extension from a path (local or URL)
 */
function getExtension(pathOrUrl: string): string {
  try {
    let pathname: string;
    
    if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) {
      const parsedUrl = new URL(pathOrUrl);
      pathname = parsedUrl.pathname;
    } else if (pathOrUrl.startsWith('file://')) {
      pathname = pathOrUrl.replace('file://', '');
    } else if (pathOrUrl.startsWith('local-media://')) {
      pathname = pathOrUrl.replace('local-media://', '');
    } else {
      pathname = pathOrUrl;
    }
    
    const match = pathname.toLowerCase().match(/\.([a-z0-9]+)$/);
    return match ? match[1] : '';
  } catch {
    return '';
  }
}

/**
 * Check if a URL or path points to an image file
 */
export function isImageUrl(url: string): boolean {
  if (!url || typeof url !== 'string') {
    return false;
  }

  const ext = getExtension(url);
  if (!ext) return false;
  
  // Check if it's a valid URL or local path
  const isValidSource = 
    url.startsWith('http://') || 
    url.startsWith('https://') || 
    isLocalPath(url);
    
  if (!isValidSource) return false;

  return IMAGE_EXTENSIONS.includes(ext);
}

/**
 * Check if a URL or path points to a video file
 */
export function isVideoUrl(url: string): boolean {
  if (!url || typeof url !== 'string') {
    return false;
  }

  const ext = getExtension(url);
  if (!ext) return false;
  
  // Check if it's a valid URL or local path
  const isValidSource = 
    url.startsWith('http://') || 
    url.startsWith('https://') || 
    isLocalPath(url);
    
  if (!isValidSource) return false;

  return VIDEO_EXTENSIONS.includes(ext);
}

/**
 * Check if a URL or path points to a PDF file
 */
export function isPdfUrl(url: string): boolean {
  if (!url || typeof url !== 'string') {
    return false;
  }

  const ext = getExtension(url);
  if (!ext) return false;
  
  // Check if it's a valid URL or local path
  const isValidSource = 
    url.startsWith('http://') || 
    url.startsWith('https://') || 
    isLocalPath(url);
    
  if (!isValidSource) return false;

  return PDF_EXTENSIONS.includes(ext);
}

/**
 * Determine the media type of a URL
 */
export function getMediaType(url: string): MediaType | null {
  if (isImageUrl(url)) return MediaType.IMAGE;
  if (isVideoUrl(url)) return MediaType.VIDEO;
  if (isPdfUrl(url)) return MediaType.PDF;
  return null;
}

/**
 * Extract all media URLs from text content
 * 
 * Finds URLs that point to images, videos, or PDFs in the text
 * and returns them with their types. Supports both remote URLs
 * and local file paths.
 */
export function extractMediaUrls(text: string): ExtractedMedia[] {
  if (!text || typeof text !== 'string') {
    return [];
  }

  // Track seen URLs to avoid duplicates
  const seenUrls = new Set<string>();
  const results: ExtractedMedia[] = [];

  // Helper to add a media item
  const addMedia = (path: string, isLocal: boolean) => {
    // Clean up path - remove trailing punctuation that might have been captured
    let cleanPath = path.replace(/[,;:!?]+$/, '');
    
    // Remove trailing ) or ] if not balanced (common in markdown)
    if (cleanPath.endsWith(')') && !cleanPath.includes('(')) {
      cleanPath = cleanPath.slice(0, -1);
    }
    if (cleanPath.endsWith(']') && !cleanPath.includes('[')) {
      cleanPath = cleanPath.slice(0, -1);
    }

    // Normalize local paths to file:// URL for consistent deduplication
    const normalizedUrl = isLocal ? normalizeLocalPath(cleanPath) : cleanPath;

    // Skip if already seen (use normalized URL for deduplication)
    if (seenUrls.has(normalizedUrl)) {
      return;
    }

    // Determine media type
    const mediaType = getMediaType(cleanPath);
    if (mediaType) {
      seenUrls.add(normalizedUrl);
      results.push({
        type: mediaType,
        url: normalizedUrl,
        isLocal,
      });
    }
  };

  // 1. Extract remote URLs (http:// and https://)
  const urlRegex = /https?:\/\/[^\s\)\]]+/gi;
  const urlMatches = text.match(urlRegex);
  if (urlMatches) {
    for (const url of urlMatches) {
      addMedia(url, false);
    }
  }

  // 2. Extract file:// URLs
  const fileUrlRegex = /file:\/\/[^\s\)\]]+/gi;
  const fileUrlMatches = text.match(fileUrlRegex);
  if (fileUrlMatches) {
    for (const url of fileUrlMatches) {
      addMedia(url, true);
    }
  }

  // 3. Extract local file paths from markdown image/link syntax: ![alt](path) or [text](path)
  // This catches paths like /Users/... or /tmp/... in markdown
  const markdownPathRegex = /\]\(([\/~][^\s\)]+\.[a-z0-9]+)\)/gi;
  let match;
  while ((match = markdownPathRegex.exec(text)) !== null) {
    const path = match[1];
    if (isLocalPath(path)) {
      addMedia(path, true);
    }
  }

  // 4. Extract standalone absolute paths (Unix-style)
  // Match paths like /Users/adarsh/file.png or /tmp/screenshot.jpg
  // But avoid matching paths already in markdown syntax
  const absolutePathRegex = /(?<!\()(?<!\[)(\/(?:Users|home|tmp|var|opt)[^\s\)\]]*\.[a-z0-9]+)/gi;
  while ((match = absolutePathRegex.exec(text)) !== null) {
    const path = match[1];
    if (isLocalPath(path)) {
      addMedia(path, true);
    }
  }

  // 5. Extract relative paths (fallback for cases where agent uses relative paths)
  // Match patterns like: output.png, model_on_beach.png, generated_image.jpg
  // Look for "saved to: filename.ext" or "> filename.ext" patterns
  // Also match markdown images with relative paths: ![alt](filename.png)
  const relativePathPatterns = [
    // "saved to: filename.png" or "saved to filename.png"
    /saved to:?\s*["']?([a-zA-Z0-9_\-]+\.[a-z0-9]+)["']?/gi,
    // "> filename.png" (bash redirect output)
    /> ["']?([a-zA-Z0-9_\-]+\.[a-z0-9]+)["']?(?:\s|$)/gi,
    // Markdown image with relative path: ![alt](filename.png)
    /!\[[^\]]*\]\(([a-zA-Z0-9_\-]+\.[a-z0-9]+)\)/gi,
    // Standalone relative filename mentioned in text (be more conservative)
    /(?:^|\s)([a-zA-Z0-9_\-]+\.(?:png|jpg|jpeg|gif|webp|mp4|pdf))(?:\s|$|[,.])/gi,
  ];

  for (const regex of relativePathPatterns) {
    regex.lastIndex = 0; // Reset regex state
    while ((match = regex.exec(text)) !== null) {
      const relativePath = match[1];
      // Convert relative path to /tmp/ path as best guess for working directory
      // This is a fallback - the agent should ideally use absolute paths
      const assumedAbsolutePath = `/tmp/${relativePath}`;
      addMedia(assumedAbsolutePath, true);
    }
  }

  return results;
}

/**
 * Check if text contains any media URLs
 */
export function hasMediaUrls(text: string): boolean {
  return extractMediaUrls(text).length > 0;
}

/**
 * Get a human-readable file name from a URL or path
 */
export function getFileNameFromUrl(url: string): string {
  try {
    let pathname: string;
    
    if (url.startsWith('http://') || url.startsWith('https://')) {
      const parsedUrl = new URL(url);
      pathname = parsedUrl.pathname;
    } else if (url.startsWith('file://')) {
      pathname = url.replace('file://', '');
    } else if (url.startsWith('local-media://')) {
      pathname = url.replace('local-media://', '');
    } else {
      pathname = url;
    }
    
    const segments = pathname.split('/');
    const fileName = segments[segments.length - 1];
    
    // Decode URL-encoded characters
    return decodeURIComponent(fileName) || 'file';
  } catch {
    return 'file';
  }
}
