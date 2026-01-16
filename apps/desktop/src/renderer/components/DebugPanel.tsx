'use client';

import { useRef, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Terminal, Trash2, ChevronRight, Bug, Download, Check, FolderOpen, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface DebugLog {
  taskId: string;
  timestamp: string;
  type: string;
  message: string;
  data?: unknown;
}

interface DebugPanelProps {
  logs: DebugLog[];
  isOpen: boolean;
  onToggle: () => void;
  onClear: () => void;
  onSave: () => Promise<{ success: boolean; filepath: string; filename: string }>;
}

// Animation variants
const toggleButtonVariants = {
  hidden: {
    x: 20,
    opacity: 0,
    scale: 0.8,
    transition: { duration: 0.2 }
  },
  visible: {
    x: 0,
    opacity: 1,
    scale: 1,
    transition: {
      type: 'spring' as const,
      damping: 20,
      stiffness: 300,
      delay: 0.1
    }
  }
};

const logItemVariants = {
  hidden: {
    opacity: 0,
    x: 20,
    height: 0
  },
  visible: {
    opacity: 1,
    x: 0,
    height: 'auto',
    transition: {
      type: 'spring' as const,
      damping: 25,
      stiffness: 300
    }
  }
};

export function DebugPanel({ logs, isOpen, onToggle, onClear, onSave }: DebugPanelProps) {
  const logsEndRef = useRef<HTMLDivElement>(null);
  const [newLogIds, setNewLogIds] = useState<Set<string>>(new Set());
  const prevLogsLengthRef = useRef(logs.length);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [savedFilePath, setSavedFilePath] = useState<string | null>(null);

  const handleSave = async () => {
    if (logs.length === 0 || saveStatus === 'saving') return;

    setSaveStatus('saving');
    try {
      const result = await onSave();
      setSaveStatus('saved');
      setSavedFilePath(result.filepath);
      // Reset status after 5 seconds (longer to allow reading the path)
      setTimeout(() => {
        setSaveStatus('idle');
        setSavedFilePath(null);
      }, 8000);
    } catch (error) {
      console.error('Failed to save debug logs:', error);
      setSaveStatus('idle');
    }
  };

  const dismissNotification = () => {
    setSaveStatus('idle');
    setSavedFilePath(null);
  };

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (isOpen && logs.length > 0) {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs.length, isOpen]);

  // Track new logs for highlight animation
  useEffect(() => {
    if (logs.length > prevLogsLengthRef.current) {
      const newIds = new Set<string>();
      for (let i = prevLogsLengthRef.current; i < logs.length; i++) {
        newIds.add(`${logs[i].timestamp}-${i}`);
      }
      setNewLogIds(newIds);

      // Clear highlight after animation
      const timer = setTimeout(() => {
        setNewLogIds(new Set());
      }, 1500);

      return () => clearTimeout(timer);
    }
    prevLogsLengthRef.current = logs.length;
  }, [logs.length, logs]);

  const getLogTypeColor = (type: string) => {
    switch (type) {
      case 'stdout':
        return 'text-emerald-400';
      case 'stderr':
      case 'error':
        return 'text-red-400';
      case 'exit':
        return 'text-amber-400';
      case 'parse-warning':
        return 'text-orange-400';
      default:
        return 'text-sky-400';
    }
  };

  const getLogTypeBg = (type: string) => {
    switch (type) {
      case 'stdout':
        return 'bg-emerald-500/10';
      case 'stderr':
      case 'error':
        return 'bg-red-500/10';
      case 'exit':
        return 'bg-amber-500/10';
      case 'parse-warning':
        return 'bg-orange-500/10';
      default:
        return 'bg-sky-500/10';
    }
  };

  const getLogTypeLabel = (type: string) => {
    switch (type) {
      case 'stdout':
        return 'OUT';
      case 'stderr':
        return 'ERR';
      case 'exit':
        return 'EXIT';
      case 'info':
        return 'INFO';
      case 'parse-warning':
        return 'WARN';
      default:
        return type.toUpperCase().slice(0, 4);
    }
  };

  return (
    <>
      {/* Toggle button when closed */}
      <AnimatePresence mode="wait">
        {!isOpen && (
          <motion.button
            key="toggle-button"
            variants={toggleButtonVariants}
            initial="hidden"
            animate="visible"
            exit="hidden"
            onClick={onToggle}
            className={cn(
              "fixed right-0 top-1/2 -translate-y-1/2 z-40",
              "bg-card/95 backdrop-blur-sm border border-border border-r-0",
              "rounded-l-xl p-3 shadow-lg",
              "hover:bg-muted hover:scale-105 active:scale-95",
              "transition-all duration-200 ease-out",
              "group"
            )}
            title="Open Debug Panel"
          >
            <div className="relative">
              <Bug className={cn(
                "h-5 w-5 transition-colors duration-200",
                logs.length > 0 ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
              )} />

              {/* Animated badge for log count */}
              <AnimatePresence>
                {logs.length > 0 && (
                  <motion.span
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    transition={{ type: 'spring', damping: 15, stiffness: 400 }}
                    className={cn(
                      "absolute -top-2 -left-2 min-w-[18px] h-[18px] px-1",
                      "bg-primary text-primary-foreground",
                      "text-[10px] font-bold rounded-full",
                      "flex items-center justify-center",
                      "ring-2 ring-card"
                    )}
                  >
                    {logs.length > 99 ? '99+' : logs.length}
                  </motion.span>
                )}
              </AnimatePresence>

              {/* Pulse animation when new logs arrive */}
              {logs.length > 0 && (
                <motion.div
                  className="absolute inset-0 rounded-full bg-primary/30"
                  animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                />
              )}
            </div>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Backdrop - click to close panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="debug-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/10"
            onClick={onToggle}
            aria-hidden="true"
          />
        )}
      </AnimatePresence>

      {/* Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="debug-panel"
            initial={{ x: '100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className={cn(
              "fixed right-0 top-0 bottom-0 w-[420px] z-50",
              "bg-card/98 backdrop-blur-md",
              "border-l border-border shadow-2xl",
              "flex flex-col"
            )}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10">
                  <Bug className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <span className="font-semibold text-sm text-foreground">Debug Console</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {logs.length} {logs.length === 1 ? 'entry' : 'entries'}
                    </span>
                    {logs.length > 0 && (
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inset-0 inline-flex rounded-full bg-primary opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1 relative z-10">
                <button
                  type="button"
                  className={cn(
                    "h-8 w-8 flex items-center justify-center rounded-md transition-colors",
                    saveStatus === 'saved'
                      ? "text-emerald-500 hover:text-emerald-600 hover:bg-emerald-500/10"
                      : "text-muted-foreground hover:text-primary hover:bg-primary/10",
                    (logs.length === 0 || saveStatus === 'saving') && "opacity-50 cursor-not-allowed"
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSave();
                  }}
                  disabled={logs.length === 0 || saveStatus === 'saving'}
                  title={saveStatus === 'saved' ? 'Saved!' : 'Download logs'}
                >
                  {saveStatus === 'saved' ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Download className={cn("h-4 w-4", saveStatus === 'saving' && "animate-pulse")} />
                  )}
                </button>
                <button
                  type="button"
                  className="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    onClear();
                  }}
                  title="Clear logs"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggle();
                  }}
                  title="Close panel"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Logs */}
            <div className="flex-1 overflow-y-auto font-mono text-xs scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
              {logs.length === 0 ? (
                <motion.div
                  className="flex flex-col items-center justify-center h-full text-muted-foreground p-6"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.2 }}
                >
                  <div className="relative">
                    <Terminal className="h-12 w-12 mb-4 opacity-20" />
                    <motion.div
                      className="absolute inset-0 flex items-center justify-center"
                      animate={{ opacity: [0.2, 0.5, 0.2] }}
                      transition={{ duration: 2, repeat: Infinity }}
                    >
                      <Terminal className="h-12 w-12 opacity-30" />
                    </motion.div>
                  </div>
                  <p className="text-sm font-medium">No debug logs yet</p>
                  <p className="text-xs mt-1 text-center max-w-[200px]">
                    Logs will appear here when a task runs with debug mode enabled
                  </p>
                </motion.div>
              ) : (
                <div className="p-3 space-y-1">
                  <AnimatePresence initial={false}>
                    {logs.map((log, index) => {
                      const logId = `${log.timestamp}-${index}`;
                      const isNew = newLogIds.has(logId);

                      return (
                        <motion.div
                          key={logId}
                          variants={logItemVariants}
                          initial="hidden"
                          animate="visible"
                          className={cn(
                            "group rounded-lg px-3 py-2 transition-colors duration-300",
                            "hover:bg-muted/50",
                            isNew && "bg-primary/5 ring-1 ring-primary/20"
                          )}
                        >
                          <div className="flex items-start gap-2">
                            <span className="text-muted-foreground/60 shrink-0 tabular-nums">
                              {new Date(log.timestamp).toLocaleTimeString('en-US', {
                                hour12: false,
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit'
                              })}
                            </span>
                            <span
                              className={cn(
                                'shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide',
                                getLogTypeBg(log.type),
                                getLogTypeColor(log.type)
                              )}
                            >
                              {getLogTypeLabel(log.type)}
                            </span>
                            <span className="text-foreground/90 break-all whitespace-pre-wrap leading-relaxed">
                              {log.message}
                            </span>
                          </div>
                          {log.data !== undefined && log.data !== null ? (
                            <details className="mt-2 ml-[72px]">
                              <summary className="text-muted-foreground/60 cursor-pointer hover:text-muted-foreground text-[10px] uppercase tracking-wide">
                                Show data
                              </summary>
                              <pre className="mt-2 p-3 bg-muted/50 rounded-lg text-[11px] overflow-x-auto border border-border/50">
                                {JSON.stringify(log.data, null, 2)}
                              </pre>
                            </details>
                          ) : null}
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                  <div ref={logsEndRef} className="h-4" />
                </div>
              )}
            </div>

            {/* Footer with stats */}
            {logs.length > 0 && (
              <motion.div
                className="px-4 py-2 border-t border-border bg-muted/20 text-[10px] text-muted-foreground"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
              >
                <div className="flex items-center justify-between">
                  <span>
                    {logs.filter(l => l.type === 'stdout').length} out • {' '}
                    {logs.filter(l => l.type === 'stderr' || l.type === 'error').length} err • {' '}
                    {logs.filter(l => l.type === 'info').length} info
                  </span>
                  <span className="text-muted-foreground/50">
                    Debug Mode
                  </span>
                </div>
              </motion.div>
            )}

            {/* Save success notification */}
            <AnimatePresence>
              {saveStatus === 'saved' && savedFilePath && (
                <motion.div
                  initial={{ y: 100, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: 100, opacity: 0 }}
                  transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                  className="absolute bottom-0 left-0 right-0 p-3 bg-emerald-500/10 border-t border-emerald-500/30 backdrop-blur-sm"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                      <FolderOpen className="h-4 w-4 text-emerald-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-emerald-400 mb-1">Logs saved successfully!</p>
                      <p className="text-[10px] text-muted-foreground break-all leading-relaxed font-mono">
                        {savedFilePath}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={dismissNotification}
                      className="flex-shrink-0 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                      title="Dismiss"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
