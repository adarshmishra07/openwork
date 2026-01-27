/**
 * InlinePermission Component
 * 
 * Renders permission requests inline within the chat flow instead of as modals.
 * Three distinct layouts:
 * - Question UI: Clean, minimal design with numbered options and keyboard shortcuts
 * - Tool/Command UI: Shows command to run with Allow once / Always allow options
 * - File Permission UI: Risk-level colored cards for file operations
 */

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { 
  Shield, 
  ShieldAlert, 
  ShieldCheck, 
  AlertTriangle, 
  File, 
  Trash2,
  Edit,
  FolderInput,
  FilePlus,
  ChevronDown,
  ChevronUp,
  Terminal,
  ShoppingCart,
  Package,
  DollarSign,
  Boxes
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { PermissionRequest, RiskLevel, FileOperation, ShopifyOperation, ShopifyResource } from '@shopos/shared';

interface InlinePermissionProps {
  request: PermissionRequest;
  onRespond: (
    allowed: boolean, 
    options?: { 
      rememberSession?: boolean; 
      rememberPermanent?: boolean;
      selectedOptions?: string[];
      customText?: string;
    }
  ) => void;
  isLoading?: boolean;
}

// Risk level configuration for file permissions
const riskConfig: Record<RiskLevel, { 
  icon: typeof Shield; 
  color: string; 
  bgColor: string;
  borderColor: string;
  label: string;
}> = {
  low: { 
    icon: ShieldCheck, 
    color: 'text-green-600', 
    bgColor: 'bg-green-500/10',
    borderColor: 'border-green-500/30',
    label: 'Low Risk',
  },
  medium: { 
    icon: Shield, 
    color: 'text-amber-600', 
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/30',
    label: 'Medium Risk',
  },
  high: { 
    icon: ShieldAlert, 
    color: 'text-orange-600', 
    bgColor: 'bg-orange-500/10',
    borderColor: 'border-orange-500/30',
    label: 'High Risk',
  },
  critical: { 
    icon: AlertTriangle, 
    color: 'text-red-600', 
    bgColor: 'bg-red-500/10',
    borderColor: 'border-red-500/30',
    label: 'Critical',
  },
};

// File operation icons
const operationIcons: Record<FileOperation, typeof File> = {
  create: FilePlus,
  delete: Trash2,
  rename: Edit,
  move: FolderInput,
  modify: Edit,
  overwrite: Edit,
};

// Operation labels
const operationLabels: Record<FileOperation, string> = {
  create: 'Create',
  delete: 'Delete',
  rename: 'Rename',
  move: 'Move',
  modify: 'Modify',
  overwrite: 'Overwrite',
};

// Shopify resource icons
const shopifyResourceIcons: Record<ShopifyResource, typeof Package> = {
  product: Package,
  variant: DollarSign,
  inventory: Boxes,
};

// Shopify operation labels
const shopifyOperationLabels: Record<ShopifyOperation, string> = {
  create: 'Create',
  update: 'Update',
  delete: 'Delete',
};

// Shopify resource labels
const shopifyResourceLabels: Record<ShopifyResource, string> = {
  product: 'Product',
  variant: 'Price',
  inventory: 'Inventory',
};

/**
 * Keyboard shortcut badge component
 */
function KbdBadge({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd className={cn(
      "inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1.5 text-[10px] font-medium rounded",
      "bg-muted text-muted-foreground border border-border/50",
      className
    )}>
      {children}
    </kbd>
  );
}

/**
 * Question UI Component - Clean, minimal design matching reference
 */
function QuestionUI({ 
  request, 
  onRespond, 
  isLoading 
}: InlinePermissionProps) {
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [customText, setCustomText] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);

  const options = request.options || [];
  
  // Handle option selection and immediate submit (for single-select)
  const handleOptionSelect = useCallback((label: string, index: number) => {
    if (label.toLowerCase() === 'type something else...' || 
        label.toLowerCase() === 'other' ||
        label.toLowerCase() === 'type your own answer') {
      setShowCustomInput(true);
      setSelectedOption(null);
      return;
    }
    
    setSelectedOption(label);
    // Auto-submit for single-select questions
    if (!request.multiSelect) {
      onRespond(true, { selectedOptions: [label] });
    }
  }, [request.multiSelect, onRespond]);

  // Handle keyboard shortcuts (1-9 for options)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if typing in input
      if (showCustomInput && document.activeElement?.tagName === 'INPUT') {
        if (e.key === 'Enter' && customText.trim()) {
          onRespond(true, { customText: customText.trim() });
        }
        if (e.key === 'Escape') {
          setShowCustomInput(false);
          setCustomText('');
        }
        return;
      }
      
      // Number keys 1-9 for option selection
      const num = parseInt(e.key);
      if (num >= 1 && num <= options.length) {
        e.preventDefault();
        const option = options[num - 1];
        handleOptionSelect(option.label, num - 1);
      }
      
      // Escape to skip/cancel
      if (e.key === 'Escape') {
        onRespond(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [options, handleOptionSelect, showCustomInput, customText, onRespond]);

  const handleCustomSubmit = () => {
    if (customText.trim()) {
      onRespond(true, { customText: customText.trim() });
    }
  };

  const handleSkip = () => {
    onRespond(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="rounded-xl border-2 bg-card p-4 my-3 animate-pulse-border"
    >
      {/* Question text */}
      <p className="text-base text-foreground mb-4">
        {request.question || request.header || 'Please respond:'}
      </p>
      
      {/* Options list - when options are provided */}
      {!showCustomInput && options.length > 0 && (
        <div className="rounded-lg border border-border overflow-hidden">
          {options.map((option, index) => {
            const isCustomOption = 
              option.label.toLowerCase() === 'type something else...' ||
              option.label.toLowerCase() === 'other' ||
              option.label.toLowerCase() === 'type your own answer';
            
            return (
              <button
                key={option.label}
                onClick={() => handleOptionSelect(option.label, index)}
                disabled={isLoading}
                className={cn(
                  "w-full flex items-center justify-between px-4 py-3 text-left transition-colors",
                  "hover:bg-muted/50 focus:bg-muted/50 focus:outline-none",
                  index !== options.length - 1 && "border-b border-border",
                  selectedOption === option.label && "bg-muted/50",
                  isCustomOption && "text-muted-foreground italic"
                )}
              >
                <div className="flex-1 min-w-0">
                  <div className={cn(
                    "font-medium text-sm",
                    isCustomOption ? "text-muted-foreground" : "text-foreground"
                  )}>
                    {option.label}
                  </div>
                  {option.description && !isCustomOption && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {option.description}
                    </div>
                  )}
                </div>
                
                {/* Keyboard shortcut badge */}
                <div className="ml-3 shrink-0 w-7 h-7 rounded-md bg-muted flex items-center justify-center text-sm font-medium text-muted-foreground">
                  {index + 1}
                </div>
              </button>
            );
          })}
        </div>
      )}
      
      {/* Text input - when no options are provided (free-form question) */}
      {!showCustomInput && options.length === 0 && (
        <div className="w-full flex items-center gap-3">
          <Input
            autoFocus
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            placeholder="Type your response..."
            className="flex-1 border-0 shadow-none !bg-transparent dark:!bg-transparent p-0 h-auto focus-visible:ring-0 focus-visible:ring-offset-0 focus:ring-0 focus:outline-none text-sm placeholder:text-muted-foreground/60 rounded-none"
            disabled={isLoading}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && customText.trim()) {
                handleCustomSubmit();
              }
            }}
          />
          <Button
            size="sm"
            onClick={handleCustomSubmit}
            disabled={isLoading || !customText.trim()}
          >
            Submit
          </Button>
        </div>
      )}
      
      {/* Custom text input - when user clicks "Type your own" option */}
      {showCustomInput && (
        <div className="space-y-3">
          <Input
            autoFocus
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            placeholder="Type your response..."
            className="!bg-transparent dark:!bg-transparent rounded-none"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && customText.trim()) {
                handleCustomSubmit();
              }
            }}
            disabled={isLoading}
          />
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowCustomInput(false);
                setCustomText('');
              }}
              disabled={isLoading}
            >
              Back
            </Button>
            <Button
              size="sm"
              onClick={handleCustomSubmit}
              disabled={isLoading || !customText.trim()}
            >
              Submit
            </Button>
          </div>
        </div>
      )}
      
      {/* Skip button */}
      {!showCustomInput && (
        <div className="mt-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSkip}
            disabled={isLoading}
            className="text-muted-foreground hover:text-foreground"
          >
            Skip
          </Button>
        </div>
      )}
    </motion.div>
  );
}

/**
 * Tool/Command Permission UI - Clean design for bash/tool permissions
 */
function ToolPermissionUI({ 
  request, 
  onRespond, 
  isLoading 
}: InlinePermissionProps) {
  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Enter = Allow once
      if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        onRespond(true);
      }
      // Cmd/Ctrl + Enter = Always allow for session
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onRespond(true, { rememberSession: true });
      }
      // Escape = Deny
      if (e.key === 'Escape') {
        e.preventDefault();
        onRespond(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onRespond]);

  // Extract tool info
  const toolName = request.toolName || 'command';
  const toolInput = request.toolInput as { command?: string; description?: string } | undefined;
  const command = toolInput?.command || '';
  const description = toolInput?.description || '';

  // Format display command (truncate if too long)
  const displayCommand = command.length > 60 ? command.slice(0, 57) + '...' : command;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="rounded-xl border border-border bg-card p-4 my-3"
    >
      {/* Title */}
      <p className="text-base text-foreground mb-1">
        Allow ShopOS to <span className="font-semibold">Run</span>{' '}
        <code className="text-sm bg-muted px-1.5 py-0.5 rounded font-mono">
          {displayCommand}
        </code>
        ?
      </p>
      
      {/* Description */}
      {description && (
        <p className="text-sm text-muted-foreground mb-3">
          {description}
        </p>
      )}
      
      {/* Command preview box */}
      {command && (
        <div className="rounded-lg border border-border bg-muted/30 p-3 mb-4 font-mono text-sm text-foreground overflow-x-auto">
          <div className="flex items-center gap-2">
            <Terminal className="h-4 w-4 text-muted-foreground shrink-0" />
            <code className="break-all">{command}</code>
          </div>
        </div>
      )}
      
      {/* Action buttons */}
      <div className="flex items-center justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onRespond(false)}
          disabled={isLoading}
          className="gap-2"
        >
          Deny
          <KbdBadge>Esc</KbdBadge>
        </Button>
        
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onRespond(true, { rememberSession: true })}
          disabled={isLoading}
          className="gap-2"
        >
          Always allow for session
          <KbdBadge>⌘</KbdBadge>
          <KbdBadge>↵</KbdBadge>
        </Button>
        
        <Button
          variant="outline"
          size="sm"
          onClick={() => onRespond(true)}
          disabled={isLoading}
          className="gap-2 bg-background"
        >
          Allow once
          <KbdBadge>↵</KbdBadge>
        </Button>
      </div>
    </motion.div>
  );
}

/**
 * File Permission UI Component - Risk-level colored cards
 */
function FilePermissionUI({ 
  request, 
  onRespond, 
  isLoading 
}: InlinePermissionProps) {
  const [showDetails, setShowDetails] = useState(false);
  const [confirmingCritical, setConfirmingCritical] = useState(false);
  
  const riskLevel = request.riskLevel || 'medium';
  const config = riskConfig[riskLevel];
  const RiskIcon = config.icon;
  
  const isDeleteOperation = request.fileOperation === 'delete';
  const isCritical = riskLevel === 'critical';
  
  const OperationIcon = request.fileOperation 
    ? operationIcons[request.fileOperation] 
    : File;
  
  const operationLabel = request.fileOperation 
    ? operationLabels[request.fileOperation] 
    : 'Access';

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Enter = Allow once
      if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        if (isCritical && !confirmingCritical) {
          setConfirmingCritical(true);
        } else {
          onRespond(true);
        }
      }
      // Cmd/Ctrl + Enter = Always allow for session
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (isCritical && !confirmingCritical) {
          setConfirmingCritical(true);
        } else {
          onRespond(true, { rememberSession: true });
        }
      }
      // Escape = Deny
      if (e.key === 'Escape') {
        e.preventDefault();
        if (confirmingCritical) {
          setConfirmingCritical(false);
        } else {
          onRespond(false);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onRespond, isCritical, confirmingCritical]);

  // Get display paths
  const displayPaths = request.filePaths || (request.filePath ? [request.filePath] : []);
  const hasMultiplePaths = displayPaths.length > 1;
  const firstPath = displayPaths[0] || '';
  const displayPath = firstPath.length > 50 ? '...' + firstPath.slice(-47) : firstPath;
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className={cn(
        "rounded-xl border bg-card p-4 my-3",
        isCritical || isDeleteOperation ? "border-destructive/50" : "border-border"
      )}
    >
      {/* Title */}
      <p className="text-base text-foreground mb-1">
        Allow ShopOS to <span className={cn(
          "font-semibold",
          isDeleteOperation && "text-destructive"
        )}>{operationLabel}</span>{' '}
        {hasMultiplePaths ? (
          <span className="text-muted-foreground">{displayPaths.length} files</span>
        ) : (
          <code className="text-sm bg-muted px-1.5 py-0.5 rounded font-mono">
            {displayPath}
          </code>
        )}
        ?
      </p>
      
      {/* Risk badge for high/critical */}
      {(riskLevel === 'high' || riskLevel === 'critical') && (
        <div className={cn(
          "inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full mt-1 mb-2",
          config.bgColor,
          config.color
        )}>
          <RiskIcon className="h-3 w-3" />
          {config.label}
        </div>
      )}
      
      {/* File path preview box */}
      <div className={cn(
        "rounded-lg border bg-muted/30 p-3 mb-4 font-mono text-sm overflow-x-auto",
        isDeleteOperation ? "border-destructive/30" : "border-border"
      )}>
        {hasMultiplePaths ? (
          <div className="space-y-1">
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
            >
              <OperationIcon className="h-4 w-4 shrink-0" />
              <span>{displayPaths.length} files</span>
              {showDetails ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
            {showDetails && (
              <div className="pl-6 pt-2 space-y-1 border-t border-border/50 mt-2">
                {displayPaths.map((path, i) => (
                  <code key={i} className={cn(
                    "block text-xs break-all",
                    isDeleteOperation ? "text-destructive/80" : "text-foreground"
                  )}>
                    {path}
                  </code>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <OperationIcon className={cn(
              "h-4 w-4 shrink-0",
              isDeleteOperation ? "text-destructive" : "text-muted-foreground"
            )} />
            <code className={cn(
              "break-all",
              isDeleteOperation ? "text-destructive" : "text-foreground"
            )}>
              {firstPath}
            </code>
          </div>
        )}
        
        {/* Target path for rename/move */}
        {request.targetPath && (
          <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border/50">
            <span className="text-muted-foreground">→</span>
            <code className="break-all text-foreground">{request.targetPath}</code>
          </div>
        )}
      </div>
      
      {/* Content preview */}
      {request.contentPreview && (
        <details className="mb-4">
          <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
            Preview content
          </summary>
          <pre className="mt-2 p-2 bg-muted/50 rounded text-xs overflow-auto max-h-32 border border-border">
            {request.contentPreview}
          </pre>
        </details>
      )}
      
      {/* Critical warning */}
      {isCritical && (
        <p className="text-xs text-destructive mb-3 flex items-center gap-1.5">
          <AlertTriangle className="h-3 w-3" />
          This action cannot be undone.
        </p>
      )}
      
      {/* Action buttons */}
      <div className="flex items-center justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            if (confirmingCritical) {
              setConfirmingCritical(false);
            } else {
              onRespond(false);
            }
          }}
          disabled={isLoading}
          className="gap-2"
        >
          {confirmingCritical ? 'Cancel' : 'Deny'}
          <KbdBadge>Esc</KbdBadge>
        </Button>
        
        {confirmingCritical ? (
          <Button
            variant="destructive"
            size="sm"
            onClick={() => onRespond(true)}
            disabled={isLoading}
            className="gap-2 animate-pulse"
          >
            <AlertTriangle className="h-3 w-3" />
            Confirm {operationLabel}
            <KbdBadge className="bg-destructive-foreground/20 border-destructive-foreground/30 text-destructive-foreground">↵</KbdBadge>
          </Button>
        ) : (
          <>
            {!isDeleteOperation && !isCritical && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onRespond(true, { rememberSession: true })}
                disabled={isLoading}
                className="gap-2"
              >
                Always allow for session
                <KbdBadge>⌘</KbdBadge>
                <KbdBadge>↵</KbdBadge>
              </Button>
            )}
            
            <Button
              variant={isDeleteOperation ? "destructive" : "outline"}
              size="sm"
              onClick={() => {
                if (isCritical) {
                  setConfirmingCritical(true);
                } else {
                  onRespond(true);
                }
              }}
              disabled={isLoading}
              className={cn("gap-2", !isDeleteOperation && "bg-background")}
            >
              {isDeleteOperation ? 'Delete' : 'Allow once'}
              <KbdBadge className={isDeleteOperation ? "bg-destructive-foreground/20 border-destructive-foreground/30 text-destructive-foreground" : undefined}>↵</KbdBadge>
            </Button>
          </>
        )}
      </div>
    </motion.div>
  );
}

/**
 * Shopify Permission UI Component - For Shopify write operations
 */
function ShopifyPermissionUI({ 
  request, 
  onRespond, 
  isLoading 
}: InlinePermissionProps) {
  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Enter = Allow once
      if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        onRespond(true);
      }
      // Cmd/Ctrl + Enter = Always allow for session
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onRespond(true, { rememberSession: true });
      }
      // Escape = Deny
      if (e.key === 'Escape') {
        e.preventDefault();
        onRespond(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onRespond]);

  const operation = request.shopifyOperation || 'update';
  const resource = request.shopifyResource || 'product';
  const details = request.shopifyDetails || {};
  const ResourceIcon = shopifyResourceIcons[resource] || Package;
  const operationLabel = shopifyOperationLabels[operation];
  const resourceLabel = shopifyResourceLabels[resource];
  
  // Build display name for what's being operated on
  const getTargetName = () => {
    if (details.title) return `"${details.title}"`;
    if (details.productId) return `product #${details.productId}`;
    if (details.variantId) return `variant #${details.variantId}`;
    if (resource === 'inventory' && details.quantity !== undefined) return `to ${details.quantity} units`;
    return resourceLabel.toLowerCase();
  };

  // Build the command-style display
  const displayCommand = [
    `shopify_${operation}_${resource}`,
    details.title ? `title="${details.title}"` : null,
    details.price ? `price="${details.price}"` : null,
    details.quantity !== undefined ? `quantity=${details.quantity}` : null,
    details.status ? `status="${details.status}"` : null,
  ].filter(Boolean).join(' ');

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="rounded-xl border border-border bg-card p-4 my-3"
    >
      {/* Title */}
      <p className="text-base text-foreground mb-1">
        Allow ShopOS to <span className="font-semibold">{operationLabel}</span>{' '}
        {resourceLabel}{' '}
        <code className="text-sm bg-muted px-1.5 py-0.5 rounded font-mono">
          {getTargetName()}
        </code>
        ?
      </p>
      
      {/* Price info if updating price */}
      {details.price && (
        <p className="text-sm text-muted-foreground mb-3">
          {operation === 'create' ? 'Price:' : 'New price:'} {details.price}
        </p>
      )}
      
      {/* Command preview box */}
      <div className="rounded-lg border border-border bg-muted/30 p-3 mb-4 font-mono text-sm text-foreground overflow-x-auto">
        <div className="flex items-center gap-2">
          <ResourceIcon className="h-4 w-4 text-muted-foreground shrink-0" />
          <code className="break-all">{displayCommand}</code>
        </div>
      </div>
      
      {/* Action buttons */}
      <div className="flex items-center justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onRespond(false)}
          disabled={isLoading}
          className="gap-2"
        >
          Deny
          <KbdBadge>Esc</KbdBadge>
        </Button>
        
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onRespond(true, { rememberSession: true })}
          disabled={isLoading}
          className="gap-2"
        >
          Always allow for session
          <KbdBadge>⌘</KbdBadge>
          <KbdBadge>↵</KbdBadge>
        </Button>
        
        <Button
          variant="outline"
          size="sm"
          onClick={() => onRespond(true)}
          disabled={isLoading}
          className="gap-2 bg-background"
        >
          Allow once
          <KbdBadge>↵</KbdBadge>
        </Button>
      </div>
    </motion.div>
  );
}

/**
 * Main InlinePermission Component
 * Routes to Question, Tool, File, or Shopify Permission UI based on request type
 */
export function InlinePermission(props: InlinePermissionProps) {
  const { request } = props;
  
  if (request.type === 'question') {
    return <QuestionUI {...props} />;
  }
  
  if (request.type === 'tool') {
    return <ToolPermissionUI {...props} />;
  }
  
  if (request.type === 'file') {
    return <FilePermissionUI {...props} />;
  }
  
  if (request.type === 'shopify') {
    return <ShopifyPermissionUI {...props} />;
  }
  
  // Fallback for other permission types
  return <ToolPermissionUI {...props} />;
}

export default InlinePermission;
