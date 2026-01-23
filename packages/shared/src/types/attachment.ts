/**
 * File attachment types for chat messages
 * 
 * Supports uploading files (images, PDFs, JSON, text) to S3
 * for use in AI conversations.
 */

/**
 * Upload status for a file attachment
 */
export type AttachmentUploadStatus = 'pending' | 'uploading' | 'completed' | 'failed';

/**
 * File attachment with upload state and S3 URL
 */
export interface FileAttachment {
  /** Unique identifier for this attachment */
  id: string;
  /** Original filename */
  filename: string;
  /** MIME type (e.g., 'image/png', 'application/pdf') */
  contentType: string;
  /** File size in bytes */
  size: number;
  /** Local file path (if selected from disk) */
  localPath?: string;
  /** S3 URL after successful upload */
  url?: string;
  /** Current upload status */
  uploadStatus: AttachmentUploadStatus;
  /** Upload progress (0-100) */
  uploadProgress?: number;
  /** Base64 data URL for preview (images only) */
  previewDataUrl?: string;
  /** Error message if upload failed */
  error?: string;
}

/**
 * File type configuration with size limits
 */
export interface FileTypeConfig {
  /** File extension (e.g., '.jpg') */
  extension: string;
  /** Maximum file size in bytes */
  maxSize: number;
  /** File category for UI grouping */
  category: FileCategory;
}

/**
 * File categories for UI display
 */
export type FileCategory = 'image' | 'document' | 'data' | 'text';

/**
 * Supported file types with their configurations
 */
export const SUPPORTED_FILE_TYPES: Record<string, FileTypeConfig> = {
  // Images (10MB limit)
  'image/jpeg': { extension: '.jpg', maxSize: 10 * 1024 * 1024, category: 'image' },
  'image/png': { extension: '.png', maxSize: 10 * 1024 * 1024, category: 'image' },
  'image/gif': { extension: '.gif', maxSize: 10 * 1024 * 1024, category: 'image' },
  'image/webp': { extension: '.webp', maxSize: 10 * 1024 * 1024, category: 'image' },
  'image/svg+xml': { extension: '.svg', maxSize: 2 * 1024 * 1024, category: 'image' },
  // Documents (25MB limit for PDF)
  'application/pdf': { extension: '.pdf', maxSize: 25 * 1024 * 1024, category: 'document' },
  // Data files (5MB limit)
  'application/json': { extension: '.json', maxSize: 5 * 1024 * 1024, category: 'data' },
  'text/csv': { extension: '.csv', maxSize: 5 * 1024 * 1024, category: 'data' },
  // Text files (2MB limit)
  'text/markdown': { extension: '.md', maxSize: 2 * 1024 * 1024, category: 'text' },
  'text/plain': { extension: '.txt', maxSize: 2 * 1024 * 1024, category: 'text' },
} as const;

/**
 * Global file limits
 */
export const FILE_LIMITS = {
  /** Maximum number of files per message */
  maxFilesPerMessage: 10,
  /** Maximum total size of all attachments per message (50MB) */
  maxTotalSizeBytes: 50 * 1024 * 1024,
} as const;

/**
 * Supported MIME types
 */
export type SupportedMimeType = keyof typeof SUPPORTED_FILE_TYPES;

/**
 * Validation result for file checks
 */
export interface FileValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate a file before adding to attachments
 * 
 * @param file - The file to validate
 * @param existingAttachments - Currently attached files
 * @returns Validation result with error message if invalid
 */
export function validateFile(
  file: { name: string; type: string; size: number },
  existingAttachments: FileAttachment[]
): FileValidationResult {
  // 1. Check file type
  if (!(file.type in SUPPORTED_FILE_TYPES)) {
    const supportedTypes = Object.keys(SUPPORTED_FILE_TYPES)
      .map(t => SUPPORTED_FILE_TYPES[t as SupportedMimeType].extension)
      .join(', ');
    return {
      valid: false,
      error: `Unsupported file type: ${file.type || 'unknown'}. Supported: ${supportedTypes}`,
    };
  }

  // 2. Check individual file size
  const typeConfig = SUPPORTED_FILE_TYPES[file.type as SupportedMimeType];
  if (file.size > typeConfig.maxSize) {
    const limitMB = typeConfig.maxSize / (1024 * 1024);
    return {
      valid: false,
      error: `File too large: ${file.name} (${formatFileSize(file.size)}). Max for this type: ${limitMB}MB`,
    };
  }

  // 3. Check total file count
  if (existingAttachments.length >= FILE_LIMITS.maxFilesPerMessage) {
    return {
      valid: false,
      error: `Maximum ${FILE_LIMITS.maxFilesPerMessage} files per message`,
    };
  }

  // 4. Check total size
  const currentTotal = existingAttachments.reduce((sum, a) => sum + a.size, 0);
  if (currentTotal + file.size > FILE_LIMITS.maxTotalSizeBytes) {
    const limitMB = FILE_LIMITS.maxTotalSizeBytes / (1024 * 1024);
    return {
      valid: false,
      error: `Total attachments exceed ${limitMB}MB limit`,
    };
  }

  return { valid: true };
}

/**
 * Get the file category for a MIME type
 * 
 * @param mimeType - The MIME type to check
 * @returns The file category or 'text' as default
 */
export function getFileCategory(mimeType: string): FileCategory {
  const config = SUPPORTED_FILE_TYPES[mimeType as SupportedMimeType];
  return config?.category ?? 'text';
}

/**
 * Format file size for display
 * 
 * @param bytes - Size in bytes
 * @returns Human-readable size string
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/**
 * Check if a MIME type is supported
 * 
 * @param mimeType - The MIME type to check
 * @returns True if the type is supported
 */
export function isSupportedFileType(mimeType: string): mimeType is SupportedMimeType {
  return mimeType in SUPPORTED_FILE_TYPES;
}

/**
 * Check if a MIME type is an image type
 * 
 * @param mimeType - The MIME type to check
 * @returns True if the type is an image
 */
export function isImageType(mimeType: string): boolean {
  return mimeType.startsWith('image/');
}

/**
 * Generate a unique attachment ID
 * 
 * @returns A unique ID string
 */
export function generateAttachmentId(): string {
  return `att_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Get accepted file types for file input
 * 
 * @returns Comma-separated list of accepted MIME types
 */
export function getAcceptedFileTypes(): string {
  return Object.keys(SUPPORTED_FILE_TYPES).join(',');
}
