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
    let cleanPath = path.replace(/[,;:!?`'"]+$/, '');
    
    // Remove trailing ) or ] if not balanced (common in markdown)
    if (cleanPath.endsWith(')') && !cleanPath.includes('(')) {
      cleanPath = cleanPath.slice(0, -1);
    }
    if (cleanPath.endsWith(']') && !cleanPath.includes('[')) {
      cleanPath = cleanPath.slice(0, -1);
    }
    // Remove trailing backticks (common in markdown code formatting)
    cleanPath = cleanPath.replace(/`+$/, '');

    // For remote URLs, encode spaces and other special characters in the path
    // This handles S3 URLs with spaces in filenames
    let normalizedUrl: string;
    if (isLocal) {
      normalizedUrl = normalizeLocalPath(cleanPath);
    } else {
      // URL-encode spaces in the path portion of remote URLs
      try {
        const urlObj = new URL(cleanPath);
        // Encode spaces in pathname (but preserve already-encoded characters)
        urlObj.pathname = urlObj.pathname.split('/').map(segment => 
          encodeURIComponent(decodeURIComponent(segment))
        ).join('/');
        normalizedUrl = urlObj.toString();
      } catch {
        // If URL parsing fails, just encode spaces directly
        normalizedUrl = cleanPath.replace(/ /g, '%20');
      }
    }

    // Skip if already seen (use normalized URL for deduplication)
    if (seenUrls.has(normalizedUrl)) {
      return;
    }

    // Determine media type (use original path for extension detection)
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
  // Handle URLs that may contain spaces (common in S3 URLs with descriptive filenames)
  // Strategy: First try to match URLs ending with image/video/pdf extensions (may contain spaces)
  // Then fall back to standard URL matching for other URLs
  
  // Pattern for URLs with media extensions (allow spaces before the extension)
  // Matches: https://...amazonaws.com/path/file name with spaces.jpg
  const mediaUrlRegex = /https?:\/\/[^\s\)\]\>`'"]*?[^\s\)\]\>`'"\/]+\.(?:png|jpg|jpeg|gif|webp|svg|bmp|avif|mp4|webm|mov|pdf)(?:\?[^\s\)\]\>`'"]*)?/gi;
  const mediaUrlMatches = text.match(mediaUrlRegex);
  if (mediaUrlMatches) {
    for (const url of mediaUrlMatches) {
      addMedia(url, false);
    }
  }
  
  // Also try a more aggressive pattern for S3/cloud storage URLs with spaces
  // Match from https:// to .jpg/.png etc, allowing spaces in the path
  const s3UrlRegex = /https?:\/\/[a-zA-Z0-9\-_.]+\.(?:amazonaws\.com|s3\.[a-z0-9\-]+\.amazonaws\.com|storage\.googleapis\.com|blob\.core\.windows\.net)[^\n\r]*?\.(?:png|jpg|jpeg|gif|webp|mp4|pdf)/gi;
  const s3Matches = text.match(s3UrlRegex);
  if (s3Matches) {
    for (const url of s3Matches) {
      // Clean up any trailing characters that aren't part of the URL
      const cleanUrl = url.replace(/[,;:!?\s]+$/, '');
      addMedia(cleanUrl, false);
    }
  }

  // Standard URL pattern (no spaces) for other URLs
  const urlRegex = /https?:\/\/[^\s\)\]\>`'"]+/gi;
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
  // 
  // IMPORTANT: We need to avoid matching filenames that are part of URLs.
  // URLs with spaces can get truncated by the URL regex, leaving orphaned filenames.
  const relativePathPatterns = [
    // "saved to: filename.png" or "saved to filename.png"
    /saved to:?\s*["']?([a-zA-Z0-9_\-]+\.[a-z0-9]+)["']?/gi,
    // "> filename.png" (bash redirect output)
    /> ["']?([a-zA-Z0-9_\-]+\.[a-z0-9]+)["']?(?:\s|$)/gi,
    // Markdown image with relative path: ![alt](filename.png)
    /!\[[^\]]*\]\(([a-zA-Z0-9_\-]+\.[a-z0-9]+)\)/gi,
  ];

  // Helper to check if a match position is within a URL in the original text
  const isWithinUrl = (matchIndex: number): boolean => {
    // Find all URLs in the text
    const urlPattern = /https?:\/\/[^\s]+/gi;
    let urlMatch;
    while ((urlMatch = urlPattern.exec(text)) !== null) {
      const urlStart = urlMatch.index;
      const urlEnd = urlStart + urlMatch[0].length;
      // Check if the match index falls within this URL's range
      // (extend range a bit to catch filenames at the end of truncated URLs)
      if (matchIndex >= urlStart && matchIndex < urlEnd + 50) {
        return true;
      }
    }
    return false;
  };

  for (const regex of relativePathPatterns) {
    regex.lastIndex = 0; // Reset regex state
    while ((match = regex.exec(text)) !== null) {
      const relativePath = match[1];
      // Skip if this match appears to be within or near a URL
      if (isWithinUrl(match.index)) {
        continue;
      }
      // Convert relative path to /tmp/ path as best guess for working directory
      // This is a fallback - the agent should ideally use absolute paths
      const assumedAbsolutePath = `/tmp/${relativePath}`;
      addMedia(assumedAbsolutePath, true);
    }
  }

  // NOTE: We removed the standalone relative filename pattern (e.g., "1_abc123.jpg")
  // as it was too aggressive and matched filenames within truncated URLs.
  // If needed, the agent should use absolute paths or "saved to:" patterns.

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
