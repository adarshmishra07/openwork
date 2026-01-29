/**
 * Permission and interactive prompt types
 */

/** File operation types for RequestFilePermission tool */
export type FileOperation = 'read' | 'create' | 'delete' | 'rename' | 'move' | 'modify' | 'overwrite';

/** Shopify operation types for permission requests */
export type ShopifyOperation = 'create' | 'update' | 'delete';

/** Shopify resource types */
export type ShopifyResource = 'product' | 'variant' | 'inventory';

/** 
 * Risk levels for permission requests
 * - low: Safe operations (read, create in /tmp) - can auto-approve
 * - medium: Moderate risk (modify files, SEO updates) - ask once, can remember
 * - high: High risk (bulk updates, create products) - always ask with details
 * - critical: Destructive operations (delete, refunds) - always ask + double confirm
 */
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface PermissionRequest {
  id: string;
  taskId: string;
  type: 'tool' | 'question' | 'file' | 'shopify';
  /** Risk level determines UI treatment and auto-approve behavior */
  riskLevel?: RiskLevel;
  /** Tool name if type is 'tool' */
  toolName?: string;
  /** Tool input if type is 'tool' */
  toolInput?: unknown;
  /** Question text if type is 'question', or description for 'file' */
  question?: string;
  /** Short header/title for the question */
  header?: string;
  /** Available options for selection */
  options?: PermissionOption[];
  /** Allow multiple selections */
  multiSelect?: boolean;
  /** File operation type if type is 'file' */
  fileOperation?: FileOperation;
  /** File path being operated on if type is 'file' */
  filePath?: string;
  /** Multiple file paths for batch operations (e.g., deleting multiple files) */
  filePaths?: string[];
  /** Target path for rename/move operations */
  targetPath?: string;
  /** Preview of content (truncated) for create/modify/overwrite */
  contentPreview?: string;
  /** Number of items affected (for bulk operations) */
  affectedCount?: number;
  /** Whether operation is reversible */
  reversible?: boolean;
  /** Timeout in milliseconds */
  timeoutMs?: number;
  /** Shopify operation type if type is 'shopify' */
  shopifyOperation?: ShopifyOperation;
  /** Shopify resource being affected if type is 'shopify' */
  shopifyResource?: ShopifyResource;
  /** Shopify resource details for preview if type is 'shopify' */
  shopifyDetails?: {
    title?: string;
    price?: string;
    productId?: number;
    variantId?: number;
    quantity?: number;
    status?: string;
  };
  createdAt: string;
}

export interface PermissionOption {
  label: string;
  description?: string;
}

export interface PermissionResponse {
  requestId: string;
  /** Task ID to route response to the correct task */
  taskId: string;
  decision: 'allow' | 'deny';
  /** User message/reason */
  message?: string;
  /** Selected options for questions */
  selectedOptions?: string[];
  /** Custom text response for "Other" option */
  customText?: string;
  /** Remember this decision for the session */
  rememberSession?: boolean;
  /** Remember this decision permanently */
  rememberPermanent?: boolean;
}

/**
 * Permission preferences stored per-user
 */
export interface PermissionPreferences {
  /** Auto-approve low-risk operations */
  autoApproveLowRisk: boolean;
  /** Remembered decisions by operation key (e.g., "file:create:/tmp/*") */
  rememberedDecisions: Record<string, 'allow' | 'deny'>;
  /** Session-specific decisions (cleared on app restart) */
  sessionDecisions: Record<string, 'allow' | 'deny'>;
}
