/**
 * ProgressIndicator - Subtle pulsing text indicator for long-running operations
 * 
 * Shows a "Still working..." message with pulsing animation for operations
 * that take longer than expected (e.g., AI image generation, web scraping).
 */
import { memo, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface ProgressIndicatorProps {
  /** The tool or activity currently running */
  activity?: string;
  /** Optional timing hint (e.g., "60-90 seconds") */
  timingHint?: string;
  /** Custom message to display */
  message?: string;
  /** Additional CSS classes */
  className?: string;
}

// Duration thresholds for showing different messages
const LONG_RUNNING_THRESHOLD_MS = 10_000; // 10 seconds
const VERY_LONG_RUNNING_THRESHOLD_MS = 30_000; // 30 seconds

export const ProgressIndicator = memo(function ProgressIndicator({
  activity,
  timingHint,
  message,
  className,
}: ProgressIndicatorProps) {
  const [elapsedTime, setElapsedTime] = useState(0);
  const [startTime] = useState(() => Date.now());

  // Update elapsed time every second
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedTime(Date.now() - startTime);
    }, 1000);

    return () => clearInterval(interval);
  }, [startTime]);

  // Determine the message to show based on elapsed time
  const getProgressMessage = () => {
    if (message) return message;
    
    if (elapsedTime > VERY_LONG_RUNNING_THRESHOLD_MS) {
      return timingHint 
        ? `Still working... (typically takes ${timingHint})`
        : 'Still working on this...';
    }
    
    if (elapsedTime > LONG_RUNNING_THRESHOLD_MS) {
      return activity 
        ? `${activity}...` 
        : 'Processing...';
    }
    
    return activity ? `${activity}...` : 'Working...';
  };

  // Format elapsed time
  const formatElapsed = () => {
    const seconds = Math.floor(elapsedTime / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {/* Pulsing dot */}
      <motion.span
        className="w-1.5 h-1.5 rounded-full bg-primary"
        animate={{
          opacity: [0.4, 1, 0.4],
          scale: [0.9, 1.1, 0.9],
        }}
        transition={{
          duration: 1.5,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />

      {/* Progress text with subtle pulse */}
      <motion.span
        className="text-sm text-muted-foreground italic"
        animate={{
          opacity: [0.7, 1, 0.7],
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      >
        {getProgressMessage()}
      </motion.span>

      {/* Elapsed time (only show after 5 seconds) */}
      {elapsedTime > 5000 && (
        <span className="text-xs text-muted-foreground/60 tabular-nums">
          {formatElapsed()}
        </span>
      )}
    </div>
  );
});
