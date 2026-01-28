/**
 * StreamingText - A component that displays streaming text with a cursor indicator.
 * 
 * Vercel AI SDK Style: Direct rendering of text as it arrives, with a trailing cursor.
 * No artificial animations or delays.
 */

import { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface StreamingTextProps {
  text: string;
  /** Whether this message is being streamed in real-time */
  isStreaming?: boolean;
  /** Additional className for the container */
  className?: string;
  /** Render function for the displayed text */
  children: (displayedText: string) => React.ReactNode;
}

export function StreamingText({
  text,
  isStreaming,
  className,
  children,
}: StreamingTextProps) {
  return (
    <div className={cn("relative group/streaming", className)}>
      {children(text)}
      {isStreaming && (
        <span className="inline-block w-[2px] h-[1em] bg-primary animate-in fade-in duration-200 ml-0.5 align-middle shadow-[0_0_8px_rgba(var(--primary),0.5)]" />
      )}
    </div>
  );
}

/**
 * Hook to track whether a message should show streaming indicator.
 */
export function useStreamingState(
  messageId: string,
  isLatestAssistantMessage: boolean,
  isTaskRunning: boolean,
  messageIsStreaming?: boolean
) {
  const [hasFinishedStreaming, setHasFinishedStreaming] = useState(false);
  const wasStreamingRef = useRef(false);

  // With real streaming, we use the message's isStreaming flag directly
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
