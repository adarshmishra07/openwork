/**
 * StreamingText - A component that displays streaming text with a cursor indicator.
 * 
 * This component supports two modes:
 * 1. Real streaming: Text arrives incrementally via SSE, just display with cursor
 * 2. Fake streaming (legacy): Animate character-by-character for pre-loaded text
 * 
 * The `isStreaming` prop from the message takes precedence when set.
 */

import { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface StreamingTextProps {
  text: string;
  /** Characters per second reveal rate for fake streaming (default: 80) */
  speed?: number;
  /** Whether streaming animation is complete (legacy: shows full text immediately) */
  isComplete?: boolean;
  /** Whether this message is being streamed in real-time (takes precedence over isComplete) */
  isStreaming?: boolean;
  /** Callback when streaming finishes (legacy) */
  onComplete?: () => void;
  /** Additional className for the container */
  className?: string;
  /** Render function for the displayed text */
  children: (displayedText: string) => React.ReactNode;
}

export function StreamingText({
  text,
  speed = 80,
  isComplete = false,
  isStreaming,
  onComplete,
  className,
  children,
}: StreamingTextProps) {
  // If isStreaming is explicitly set, use real streaming mode (no animation)
  // Otherwise fall back to legacy animated mode
  const useRealStreamingMode = isStreaming !== undefined;
  
  const [displayedLength, setDisplayedLength] = useState(isComplete ? text.length : 0);
  const [isAnimating, setIsAnimating] = useState(!isComplete);
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const textRef = useRef(text);

  // Update ref when text changes
  useEffect(() => {
    // If new text is longer, continue streaming from current position
    if (text.length > textRef.current.length && !isComplete) {
      setIsAnimating(true);
    }
    textRef.current = text;
  }, [text, isComplete]);

  // Handle immediate completion
  useEffect(() => {
    if (isComplete) {
      setDisplayedLength(text.length);
      setIsAnimating(false);
    }
  }, [isComplete, text.length]);

  // Animation loop for legacy fake streaming mode
  useEffect(() => {
    // Skip animation in real streaming mode
    if (useRealStreamingMode) {
      setDisplayedLength(text.length);
      return;
    }
    
    if (!isAnimating || isComplete) return;

    const charsPerMs = speed / 1000;

    const animate = (timestamp: number) => {
      if (!lastTimeRef.current) {
        lastTimeRef.current = timestamp;
      }

      const elapsed = timestamp - lastTimeRef.current;
      const charsToAdd = Math.floor(elapsed * charsPerMs);

      if (charsToAdd > 0) {
        setDisplayedLength((prev) => {
          const next = Math.min(prev + charsToAdd, textRef.current.length);
          return next;
        });
        lastTimeRef.current = timestamp;
        
        // Check if we've reached the end and stop streaming
        // Use a microtask to avoid setState during render
        const currentLength = displayedLength + charsToAdd;
        if (currentLength >= textRef.current.length) {
          queueMicrotask(() => {
            setIsAnimating(false);
            onComplete?.();
          });
        }
      }

      if (displayedLength < textRef.current.length) {
        rafRef.current = requestAnimationFrame(animate);
      }
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [isAnimating, isComplete, speed, onComplete, displayedLength, useRealStreamingMode, text.length]);

  // Determine what text to display and whether to show cursor
  const displayedText = useRealStreamingMode ? text : text.slice(0, displayedLength);
  const showCursor = useRealStreamingMode 
    ? isStreaming 
    : (isAnimating && displayedLength < text.length);

  return (
    <div className={className}>
      {children(displayedText)}
      {showCursor && (
        <span className="inline-block w-2 h-4 bg-foreground/60 animate-pulse ml-0.5 align-text-bottom" />
      )}
    </div>
  );
}

/**
 * Hook to track whether a message should show streaming indicator.
 * 
 * With real streaming (message.isStreaming), we use that directly.
 * For legacy mode, we track based on whether it's the latest assistant message during a running task.
 */
export function useStreamingState(
  messageId: string,
  isLatestAssistantMessage: boolean,
  isTaskRunning: boolean,
  messageIsStreaming?: boolean
) {
  const [hasFinishedStreaming, setHasFinishedStreaming] = useState(false);
  const wasStreamingRef = useRef(false);

  // With real streaming, use the message's isStreaming flag directly
  if (messageIsStreaming !== undefined) {
    return {
      shouldStream: messageIsStreaming,
      isComplete: !messageIsStreaming,
      onComplete: () => {}, // No-op for real streaming
    };
  }

  // Legacy mode: determine if this message should stream based on position and task state
  const shouldStream = isLatestAssistantMessage && isTaskRunning && !hasFinishedStreaming;

  // Track when streaming completes
  useEffect(() => {
    if (wasStreamingRef.current && !shouldStream) {
      setHasFinishedStreaming(true);
    }
    wasStreamingRef.current = shouldStream;
  }, [shouldStream]);

  // Reset if message ID changes
  useEffect(() => {
    setHasFinishedStreaming(false);
    wasStreamingRef.current = false;
  }, [messageId]);

  return {
    shouldStream,
    isComplete: !shouldStream,
    onComplete: () => setHasFinishedStreaming(true),
  };
}
