import { toast } from 'sonner';

/**
 * Human-readable error message mappings
 */
function humanizeError(error: string): string {
  const lowerError = error.toLowerCase();

  // File upload errors
  if (lowerError.includes('file too large') || lowerError.includes('413')) {
    return 'File too large';
  }
  if (lowerError.includes('unsupported') || lowerError.includes('file type')) {
    return 'Unsupported file type';
  }
  if (lowerError.includes('network') || lowerError.includes('fetch')) {
    return 'Network error - check your connection';
  }
  if (lowerError.includes('timeout')) {
    return 'Request timed out - please try again';
  }

  // Provider/model errors
  if (lowerError.includes('no provider') || lowerError.includes('not configured')) {
    return 'No AI provider configured';
  }
  if (lowerError.includes('rate limit') || lowerError.includes('429')) {
    return 'Rate limit reached - please wait';
  }
  if (lowerError.includes('invalid') && lowerError.includes('key')) {
    return 'Invalid API key';
  }
  if (lowerError.includes('unauthorized') || lowerError.includes('401')) {
    return 'Authentication failed - check your API key';
  }
  if (lowerError.includes('quota') || lowerError.includes('exceeded')) {
    return 'API quota exceeded';
  }
  if (lowerError.includes('model') && lowerError.includes('not found')) {
    return 'Model not available';
  }
  if (lowerError.includes('context') && lowerError.includes('length')) {
    return 'Message too long for model';
  }
  if (lowerError.includes('500') || lowerError.includes('internal server')) {
    return 'Server error - please try again';
  }
  if (lowerError.includes('503') || lowerError.includes('unavailable')) {
    return 'Service temporarily unavailable';
  }

  // Return original if no mapping found (truncate if too long)
  if (error.length > 100) {
    return error.substring(0, 97) + '...';
  }
  return error;
}

/**
 * Show a general error toast
 */
export function showErrorToast(title: string, description?: string) {
  toast.error(title, {
    description,
  });
}

/**
 * Show an error toast for file upload failures
 */
export function showUploadErrorToast(filename: string, error: string) {
  const humanError = humanizeError(error);
  toast.error(`Upload failed: ${filename}`, {
    description: humanError,
  });
}

/**
 * Show an error toast for file validation failures
 */
export function showValidationErrorToast(error: string) {
  toast.error('File not accepted', {
    description: humanizeError(error),
  });
}

/**
 * Show an error toast for task/model failures
 */
export function showTaskErrorToast(error: string) {
  const humanError = humanizeError(error);
  toast.error('Task failed', {
    description: humanError,
  });
}

/**
 * Show an error toast for provider/connection issues
 */
export function showProviderErrorToast(error: string) {
  const humanError = humanizeError(error);
  toast.error('Provider error', {
    description: humanError,
  });
}
