/**
 * ErrorDisplay - Renders error messages in a consistent, user-friendly format
 *
 * Features:
 * - Multiple severity levels (warning, error, critical)
 * - Collapsible technical details section
 * - Copy error to clipboard functionality
 * - Smooth animations for expand/collapse
 */
import { memo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertCircle,
  AlertTriangle,
  XCircle,
  ChevronRight,
  Copy,
  Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface ErrorDisplayProps {
  message: string;
  severity?: 'warning' | 'error' | 'critical';
  details?: string;
  code?: string;
  className?: string;
}

/**
 * Get styles based on severity level
 */
function getSeverityStyles(severity: ErrorDisplayProps['severity']) {
  switch (severity) {
    case 'warning':
      return {
        container: 'border-amber-500/30 bg-amber-500/5',
        icon: 'text-amber-500',
        title: 'text-amber-600 dark:text-amber-400',
        details: 'bg-amber-500/10 border-amber-500/20',
      };
    case 'critical':
      return {
        container: 'border-red-600/40 bg-red-600/10',
        icon: 'text-red-600',
        title: 'text-red-600 dark:text-red-400',
        details: 'bg-red-600/10 border-red-600/20',
      };
    case 'error':
    default:
      return {
        container: 'border-destructive/30 bg-destructive/5',
        icon: 'text-destructive',
        title: 'text-destructive',
        details: 'bg-destructive/10 border-destructive/20',
      };
  }
}

/**
 * Get icon based on severity level
 */
function getSeverityIcon(severity: ErrorDisplayProps['severity']) {
  switch (severity) {
    case 'warning':
      return AlertTriangle;
    case 'critical':
      return XCircle;
    case 'error':
    default:
      return AlertCircle;
  }
}

export const ErrorDisplay = memo(function ErrorDisplay({
  message,
  severity = 'error',
  details,
  code,
  className,
}: ErrorDisplayProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const styles = getSeverityStyles(severity);
  const Icon = getSeverityIcon(severity);
  const hasDetails = details || code;

  const handleCopyError = async () => {
    const errorText = [
      `Error: ${message}`,
      code ? `Code: ${code}` : null,
      details ? `\nDetails:\n${details}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    try {
      await navigator.clipboard.writeText(errorText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for environments where clipboard API is not available
      console.error('Failed to copy to clipboard');
    }
  };

  return (
    <div
      className={cn(
        'rounded-lg border p-3',
        styles.container,
        className
      )}
    >
      {/* Header row */}
      <div className="flex items-start gap-3">
        {/* Severity icon */}
        <Icon className={cn('h-5 w-5 shrink-0 mt-0.5', styles.icon)} />

        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* Error message */}
          <p className={cn('text-sm font-medium', styles.title)}>
            {message}
          </p>

          {/* Error code badge */}
          {code && (
            <span className="inline-block mt-1 text-xs font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
              {code}
            </span>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Copy button */}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleCopyError}
            className="h-7 w-7"
            title="Copy error details"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-green-500" />
            ) : (
              <Copy className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </Button>

          {/* Expand/collapse button */}
          {hasDetails && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setIsExpanded(!isExpanded)}
              className="h-7 w-7"
              title={isExpanded ? 'Hide details' : 'Show details'}
            >
              <motion.div
                animate={{ rotate: isExpanded ? 90 : 0 }}
                transition={{ duration: 0.15 }}
              >
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              </motion.div>
            </Button>
          )}
        </div>
      </div>

      {/* Collapsible details section */}
      <AnimatePresence>
        {isExpanded && hasDetails && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="mt-3 pt-3 border-t border-current/10">
              {details && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">
                    Technical Details
                  </p>
                  <pre
                    className={cn(
                      'text-xs rounded-md p-2 overflow-x-auto max-h-48 overflow-y-auto whitespace-pre-wrap font-mono border',
                      styles.details
                    )}
                  >
                    {details}
                  </pre>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});
