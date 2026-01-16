import { useState, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronRight, CheckCircle2, AlertTriangle, FileText, Search, SquareTerminal, Brain, Globe, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';
import { springs } from '../../lib/animations';
import { CodeBlock } from './CodeBlock';
import loadingSymbol from '/assets/loading-symbol.svg';

// Normalize tool name to PascalCase for consistent matching
function normalizeToolName(tool: string): string {
  if (!tool) return tool;
  const lowerTool = tool.toLowerCase();
  const toolMap: Record<string, string> = {
    read: 'Read',
    write: 'Write',
    edit: 'Edit',
    glob: 'Glob',
    grep: 'Grep',
    bash: 'Bash',
    task: 'Task',
    webfetch: 'WebFetch',
    websearch: 'WebSearch',
  };
  return toolMap[lowerTool] || tool.charAt(0).toUpperCase() + tool.slice(1);
}

// Tool icon mapping
const TOOL_ICONS: Record<string, typeof FileText> = {
  Read: FileText,
  Write: FileText,
  Edit: FileText,
  Glob: Search,
  Grep: Search,
  Bash: SquareTerminal,
  Task: Brain,
  WebFetch: Globe,
  WebSearch: Globe,
};

// Human-readable tool names
const TOOL_DISPLAY_NAMES: Record<string, string> = {
  Read: 'Read File',
  Write: 'Write File',
  Edit: 'Edit File',
  Glob: 'Find Files',
  Grep: 'Search Code',
  Bash: 'Run Command',
  Task: 'Agent Task',
  WebFetch: 'Fetch URL',
  WebSearch: 'Web Search',
};

export interface ActivityRowProps {
  id: string;
  tool: string;
  input: unknown;
  output?: string;
  status: 'running' | 'complete' | 'error';
}

// Format JSON with syntax highlighting-friendly output
function formatJson(obj: unknown): string {
  if (obj === null || obj === undefined) return '';
  if (typeof obj === 'string') return obj;
  try {
    return JSON.stringify(obj, null, 2);
  } catch {
    return String(obj);
  }
}

// Spinning icon component
const SpinningIcon = ({ className }: { className?: string }) => (
  <img
    src={loadingSymbol}
    alt=""
    className={cn('animate-spin-ccw', className)}
  />
);

export const ActivityRow = memo(function ActivityRow({
  id,
  tool,
  input,
  output,
  status,
}: ActivityRowProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const normalizedTool = normalizeToolName(tool);
  const Icon = TOOL_ICONS[normalizedTool] || Wrench;
  const displayName = TOOL_DISPLAY_NAMES[normalizedTool] || normalizedTool;
  const formattedInput = formatJson(input);
  const formattedOutput = output || '';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springs.gentle}
      className="w-full relative"
    >
      {/* Timeline connector dot */}
      <div className="absolute -left-[21px] top-3 w-2 h-2 rounded-full bg-muted-foreground/50" />

      {/* Collapsed row - Tool name as title */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          'w-full flex items-center gap-2 px-3 py-2 rounded-lg',
          'hover:bg-muted/50 transition-colors',
          'text-left text-sm'
        )}
      >
        {/* Tool icon */}
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />

        {/* Tool name */}
        <span className="flex-1 font-medium text-foreground">{displayName}</span>

        {/* Status indicator */}
        {status === 'running' ? (
          <SpinningIcon className="h-4 w-4 shrink-0" />
        ) : status === 'error' ? (
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
        ) : (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
        )}

        {/* Expand/collapse chevron */}
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
      </button>

      {/* Expanded details - Request/Response blocks */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="ml-6 mt-1 space-y-2 pb-2">
              {/* Request block */}
              {formattedInput && (
                <CodeBlock label="Request" content={formattedInput} />
              )}

              {/* Response block */}
              {status !== 'running' && formattedOutput && (
                <CodeBlock
                  label="Response"
                  content={formattedOutput.length > 2000
                    ? formattedOutput.slice(0, 2000) + '\n...(truncated)'
                    : formattedOutput}
                />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
});
