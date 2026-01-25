import { create } from 'zustand';
import type { FileAttachment } from '@shopos/shared';
import { 
  validateFile, 
  generateAttachmentId, 
  isImageType,
  isSupportedFileType,
} from '@shopos/shared';
import { getAccomplish } from '../lib/accomplish';
import { showUploadErrorToast, showValidationErrorToast } from '../lib/toast';

/**
 * Read a File as a base64 data URL (for previews)
 */
async function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Read a File as base64 string (without data URL prefix)
 */
async function readFileAsBase64(file: File): Promise<string> {
  const dataUrl = await readFileAsDataUrl(file);
  // Remove the data URL prefix (e.g., "data:image/png;base64,")
  return dataUrl.split(',')[1] || dataUrl;
}

/**
 * Internal file reference - not exported
 */
interface InternalAttachment extends FileAttachment {
  _file?: File;
}

interface AttachmentState {
  /** Pending attachments waiting to be sent with a message */
  pendingAttachments: InternalAttachment[];
  
  /** Add files to pending attachments and start uploading */
  addFiles: (files: File[], taskId: string) => Promise<{ added: FileAttachment[]; errors: string[] }>;
  
  /** Add a file from clipboard (pasted image) */
  addPastedImage: (file: File, taskId: string) => Promise<{ added: FileAttachment | null; error?: string }>;
  
  /** Remove an attachment */
  removeAttachment: (id: string) => void;
  
  /** Clear all pending attachments */
  clearAttachments: () => void;
  
  /** Retry a failed upload */
  retryUpload: (id: string, taskId: string) => Promise<void>;
  
  /** Get all completed attachments (for sending with message) */
  getCompletedAttachments: () => FileAttachment[];
  
  /** Check if any uploads are in progress */
  hasUploadsInProgress: () => boolean;
  
  /** Check if all uploads are complete */
  allUploadsComplete: () => boolean;
}

export const useAttachmentStore = create<AttachmentState>((set, get) => ({
  pendingAttachments: [],

  addFiles: async (files, taskId) => {
    const added: FileAttachment[] = [];
    const errors: string[] = [];
    const accomplish = getAccomplish();

    for (const file of files) {
      // Validate the file
      const validation = validateFile(
        { name: file.name, type: file.type, size: file.size },
        get().pendingAttachments
      );

      if (!validation.valid) {
        const errorMsg = validation.error || `Invalid file: ${file.name}`;
        errors.push(errorMsg);
        showValidationErrorToast(errorMsg);
        continue;
      }

      // Create attachment object
      const attachment: InternalAttachment = {
        id: generateAttachmentId(),
        filename: file.name,
        contentType: file.type,
        size: file.size,
        uploadStatus: 'pending',
        uploadProgress: 0,
        _file: file,
      };

      // Generate preview for images
      if (isImageType(file.type)) {
        try {
          attachment.previewDataUrl = await readFileAsDataUrl(file);
        } catch (e) {
          console.warn('Failed to generate preview:', e);
        }
      }

      // Add to state immediately (shows in UI as pending)
      set((state) => ({
        pendingAttachments: [...state.pendingAttachments, attachment],
      }));
      added.push(attachment);

      // Start upload in background
      (async () => {
        // Update to uploading
        set((state) => ({
          pendingAttachments: state.pendingAttachments.map((a) =>
            a.id === attachment.id ? { ...a, uploadStatus: 'uploading', uploadProgress: 10 } : a
          ),
        }));

        try {
          // Read file as base64
          const base64Data = await readFileAsBase64(file);

          // Update progress
          set((state) => ({
            pendingAttachments: state.pendingAttachments.map((a) =>
              a.id === attachment.id ? { ...a, uploadProgress: 50 } : a
            ),
          }));

          // Upload to S3
          const result = await accomplish.uploadChatAttachmentBase64(
            taskId,
            file.name,
            file.type,
            base64Data
          );

          if (result.success && result.url) {
            // Update to completed
            set((state) => ({
              pendingAttachments: state.pendingAttachments.map((a) =>
                a.id === attachment.id
                  ? { ...a, uploadStatus: 'completed', uploadProgress: 100, url: result.url, _file: undefined }
                  : a
              ),
            }));
          } else {
            throw new Error(result.error || 'Upload failed');
          }
        } catch (error) {
          console.error('Upload failed:', error);
          const errorMsg = error instanceof Error ? error.message : 'Upload failed';
          set((state) => ({
            pendingAttachments: state.pendingAttachments.map((a) =>
              a.id === attachment.id
                ? { ...a, uploadStatus: 'failed', error: errorMsg }
                : a
            ),
          }));
          showUploadErrorToast(file.name, errorMsg);
        }
      })();
    }

    return { added, errors };
  },

  addPastedImage: async (file, taskId) => {
    // Generate a filename for pasted images
    const ext = file.type.split('/')[1] || 'png';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const filename = `pasted-image-${timestamp}.${ext}`;

    // Create a new File with the generated name
    const namedFile = new File([file], filename, { type: file.type });

    const result = await get().addFiles([namedFile], taskId);

    if (result.added.length > 0) {
      return { added: result.added[0] };
    }

    return { added: null, error: result.errors[0] || 'Failed to add pasted image' };
  },

  removeAttachment: (id) => {
    set((state) => ({
      pendingAttachments: state.pendingAttachments.filter((a) => a.id !== id),
    }));
  },

  clearAttachments: () => {
    set({ pendingAttachments: [] });
  },

  retryUpload: async (id, taskId) => {
    const attachment = get().pendingAttachments.find((a) => a.id === id);
    if (!attachment || !attachment._file) {
      console.warn('Cannot retry: attachment not found or file not available');
      return;
    }

    const accomplish = getAccomplish();

    // Reset to uploading
    set((state) => ({
      pendingAttachments: state.pendingAttachments.map((a) =>
        a.id === id ? { ...a, uploadStatus: 'uploading', uploadProgress: 10, error: undefined } : a
      ),
    }));

    try {
      const base64Data = await readFileAsBase64(attachment._file);

      set((state) => ({
        pendingAttachments: state.pendingAttachments.map((a) =>
          a.id === id ? { ...a, uploadProgress: 50 } : a
        ),
      }));

      const result = await accomplish.uploadChatAttachmentBase64(
        taskId,
        attachment.filename,
        attachment.contentType,
        base64Data
      );

      if (result.success && result.url) {
        set((state) => ({
          pendingAttachments: state.pendingAttachments.map((a) =>
            a.id === id
              ? { ...a, uploadStatus: 'completed', uploadProgress: 100, url: result.url, _file: undefined }
              : a
          ),
        }));
      } else {
        throw new Error(result.error || 'Upload failed');
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Upload failed';
      set((state) => ({
        pendingAttachments: state.pendingAttachments.map((a) =>
          a.id === id
            ? { ...a, uploadStatus: 'failed', error: errorMsg }
            : a
        ),
      }));
      showUploadErrorToast(attachment.filename, errorMsg);
    }
  },

  getCompletedAttachments: () => {
    return get().pendingAttachments.filter((a) => a.uploadStatus === 'completed');
  },

  hasUploadsInProgress: () => {
    return get().pendingAttachments.some(
      (a) => a.uploadStatus === 'pending' || a.uploadStatus === 'uploading'
    );
  },

  allUploadsComplete: () => {
    const attachments = get().pendingAttachments;
    if (attachments.length === 0) return true;
    return attachments.every(
      (a) => a.uploadStatus === 'completed' || a.uploadStatus === 'failed'
    );
  },
}));
