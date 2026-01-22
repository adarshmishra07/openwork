/**
 * CollapsibleThinking - Renders thinking/reasoning content in a collapsible section
 * 
 * Collapsed by default to keep the chat clean. Users can expand to see the full reasoning.
 */
import { memo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, Brain } from 'lucide-react';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface CollapsibleThinkingProps {
  content: string;
  defaultExpanded?: boolean;
  className?: string;
}

export const CollapsibleThinking = memo(function CollapsibleThinking({
  content,
  defaultExpanded = false,
  className,
}: CollapsibleThinkingProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  // Strip markdown formatting for preview and truncate
  const stripMarkdown = (text: string) => {
    return text
      .replace(/\*\*(.*?)\*\*/g, '$1')  // Bold
      .replace(/\*(.*?)\*/g, '$1')       // Italic
      .replace(/`(.*?)`/g, '$1')         // Inline code
      .replace(/^[\*\-]\s+/gm, '')       // List bullets
      .replace(/^\d+\.\s+/gm, '')        // Numbered lists
      .replace(/\n+/g, ' ')              // Newlines to spaces
      .trim();
  };
  
  const cleanContent = stripMarkdown(content);
  const previewText = cleanContent.length > 60 ? cleanContent.slice(0, 60) + '...' : cleanContent;

  return (
    <div className={cn('group', className)}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 w-full text-left py-1.5 px-2 -mx-2 rounded-md hover:bg-muted/50 transition-colors"
      >
        {/* Expand/collapse chevron */}
        <motion.div
          animate={{ rotate: isExpanded ? 90 : 0 }}
          transition={{ duration: 0.15 }}
        >
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        </motion.div>

        {/* Brain icon */}
        <Brain className="h-3.5 w-3.5 text-muted-foreground" />

        {/* Label or preview */}
        <span className="text-sm text-muted-foreground">
          {isExpanded ? (
            <span className="font-medium">Thinking</span>
          ) : (
            <span className="italic">{previewText}</span>
          )}
        </span>
      </button>

      {/* Expanded content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="pl-7 pr-2 pb-2">
              <div className={cn(
                'text-sm text-muted-foreground leading-relaxed',
                'prose prose-sm max-w-none',
                'prose-p:text-muted-foreground prose-p:my-1.5',
                'prose-strong:text-foreground prose-strong:font-semibold',
                'prose-ul:text-muted-foreground prose-ul:my-1.5',
                'prose-ol:text-muted-foreground prose-ol:my-1.5',
                'prose-li:text-muted-foreground prose-li:my-0.5',
                'prose-code:text-muted-foreground prose-code:bg-muted/50 prose-code:px-1 prose-code:rounded',
              )}>
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    table: ({ children }) => (
                      <div className="overflow-x-auto my-2">
                        <table className="min-w-full border-collapse border border-border rounded-lg text-xs">
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
                      <th className="px-3 py-1.5 text-left text-xs font-semibold text-muted-foreground border-r border-border last:border-r-0">
                        {children}
                      </th>
                    ),
                    td: ({ children }) => (
                      <td className="px-3 py-1.5 text-xs text-muted-foreground border-r border-border last:border-r-0">
                        {children}
                      </td>
                    ),
                  }}
                >
                  {content}
                </ReactMarkdown>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});
