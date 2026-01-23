/**
 * CollapsibleToolCall - Renders tool/skill/space calls in a collapsible format
 * 
 * Features:
 * - Status indicator (running/success/error)
 * - Collapsible input/output sections
 * - Auto-expands on error
 * - Unified styling for tools, skills, and spaces
 */
import { memo, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ChevronRight, 
  Wrench, 
  BookOpen, 
  Sparkles, 
  Search,
  CheckCircle2,
  XCircle,
  Loader2,
  FileText,
  Terminal,
  Code,
  Globe,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

type ToolStatus = 'running' | 'success' | 'error';
type ActivityType = 'tool' | 'skill' | 'space' | 'browser';

interface CollapsibleToolCallProps {
  /** The tool/skill/space name */
  name: string;
  /** Current status of the tool call */
  status: ToolStatus;
  /** Tool input parameters */
  input?: unknown;
  /** Tool output/result */
  output?: string;
  /** Error message if status is 'error' */
  error?: string;
  /** Description of what the tool is doing */
  description?: string;
  /** Whether to auto-expand (defaults to false, auto-expands on error) */
  defaultExpanded?: boolean;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Detect the type of activity from a tool name
 */
function detectActivityType(toolName: string): ActivityType {
  if (toolName.startsWith('skill-loader') || toolName.includes('load_skill')) {
    return 'skill';
  }
  if (toolName.startsWith('space_') || toolName.startsWith('space-runtime')) {
    return 'space';
  }
  if (
    toolName.startsWith('browser_') || 
    toolName.startsWith('dev_browser') || 
    toolName.startsWith('dev-browser')
  ) {
    return 'browser';
  }
  return 'tool';
}

/**
 * Get icon for activity type
 */
function getActivityIcon(type: ActivityType, toolName: string) {
  switch (type) {
    case 'skill':
      return BookOpen;
    case 'space':
      return Sparkles;
    case 'browser':
      return Globe;
    default:
      // More specific icons for common tools
      if (toolName.includes('Read') || toolName.includes('Write') || toolName.includes('Edit')) {
        return FileText;
      }
      if (toolName.includes('Bash') || toolName.includes('Terminal')) {
        return Terminal;
      }
      if (toolName.includes('Grep') || toolName.includes('Glob') || toolName.includes('Search')) {
        return Search;
      }
      if (toolName.includes('Code')) {
        return Code;
      }
      return Wrench;
  }
}

/**
 * Format a raw tool/skill name into a clean, readable label
 */
function formatToolName(rawName: string): string {
  let name = rawName
    .replace(/^skill-loader_/, '')
    .replace(/^dev-browser-mcp_/, '')
    .replace(/^dev_browser_/, '')
    .replace(/^space-runtime_/, '')
    .replace(/^space_/, '')
    .replace(/^browser_/, '')
    .replace(/^shopify_/, '')
    .replace(/^mcp_/, '');
  
  // Convert snake_case and kebab-case to Title Case
  name = name
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
  
  return name;
}

/**
 * Get background color class based on activity type
 */
function getTypeBadgeClass(type: ActivityType): string {
  switch (type) {
    case 'skill':
      return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
    case 'space':
      return 'bg-purple-500/10 text-purple-600 border-purple-500/20';
    case 'browser':
      return 'bg-amber-500/10 text-amber-600 border-amber-500/20';
    default:
      return 'bg-muted text-foreground border-border';
  }
}

export const CollapsibleToolCall = memo(function CollapsibleToolCall({
  name,
  status,
  input,
  output,
  error,
  description,
  defaultExpanded = false,
  className,
}: CollapsibleToolCallProps) {
  // Auto-expand on error
  const [isExpanded, setIsExpanded] = useState(defaultExpanded || status === 'error');
  
  // Auto-expand when error occurs
  useEffect(() => {
    if (status === 'error') {
      setIsExpanded(true);
    }
  }, [status]);

  const type = detectActivityType(name);
  const Icon = getActivityIcon(type, name);
  const displayName = formatToolName(name);
  const hasDetails = input || output || error;
  
  // Apply pulsating glow when browser tool is running
  const isBrowserRunning = type === 'browser' && status === 'running';

  // Status indicator
  const StatusIcon = () => {
    switch (status) {
      case 'running':
        return <Loader2 className="h-3.5 w-3.5 text-primary animate-spin" />;
      case 'success':
        return <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />;
      case 'error':
        return <XCircle className="h-3.5 w-3.5 text-destructive" />;
    }
  };

  return (
    <div className={cn(
      'group',
      isBrowserRunning && 'browser-active-glow',
      className
    )}>
      <button
        onClick={() => hasDetails && setIsExpanded(!isExpanded)}
        disabled={!hasDetails}
        className={cn(
          'flex items-center gap-2 w-full text-left py-1.5 px-2 -mx-2 rounded-md transition-colors',
          hasDetails && 'hover:bg-muted/50 cursor-pointer',
          !hasDetails && 'cursor-default'
        )}
      >
        {/* Expand/collapse chevron - only show if has details */}
        {hasDetails ? (
          <motion.div
            animate={{ rotate: isExpanded ? 90 : 0 }}
            transition={{ duration: 0.15 }}
            className="shrink-0"
          >
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          </motion.div>
        ) : (
          <span className="w-3.5 shrink-0" /> // Spacer for alignment
        )}

        {/* Tool badge */}
        <Badge 
          variant="outline" 
          className={cn(
            'rounded-sm text-xs font-medium gap-1.5 py-0.5 px-2 shrink-0',
            getTypeBadgeClass(type)
          )}
        >
          <Icon className="h-3 w-3" />
          {displayName}
        </Badge>

        {/* Description or type label */}
        {description && (
          <span className="text-sm text-muted-foreground truncate">
            {description}
          </span>
        )}

        {/* Status indicator */}
        <div className="ml-auto shrink-0">
          <StatusIcon />
        </div>
      </button>

      {/* Expanded content */}
      <AnimatePresence>
        {isExpanded && hasDetails && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="pl-7 pr-2 pb-2 space-y-2">
              {/* Input section */}
              {input !== undefined && input !== null && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Input</p>
                  <pre className="text-xs bg-muted/50 rounded-md p-2 overflow-x-auto max-h-32 overflow-y-auto">
                    {typeof input === 'string' ? input : JSON.stringify(input, null, 2)}
                  </pre>
                </div>
              )}

              {/* Output section */}
              {output && status === 'success' && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Output</p>
                  <pre className="text-xs bg-muted/50 rounded-md p-2 overflow-x-auto max-h-32 overflow-y-auto whitespace-pre-wrap">
                    {output.length > 500 ? `${output.slice(0, 500)}...` : output}
                  </pre>
                </div>
              )}

              {/* Error section */}
              {error && status === 'error' && (
                <div>
                  <p className="text-xs font-medium text-destructive mb-1">Error</p>
                  <pre className="text-xs bg-destructive/10 text-destructive rounded-md p-2 overflow-x-auto max-h-32 overflow-y-auto whitespace-pre-wrap">
                    {error}
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
