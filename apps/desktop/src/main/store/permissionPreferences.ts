/**
 * Permission Preferences Store
 * 
 * Stores user preferences for permission handling:
 * - Auto-approve low-risk operations
 * - Remembered decisions (permanent and session-based)
 */

import Store from 'electron-store';
import type { PermissionPreferences } from '@shopos/shared';

const store = new Store<{ permissionPreferences: PermissionPreferences }>({
  name: 'permission-preferences',
  defaults: {
    permissionPreferences: {
      autoApproveLowRisk: true, // Default: auto-approve low-risk operations
      rememberedDecisions: {},
      sessionDecisions: {},
    },
  },
});

// Session decisions are stored in memory (cleared on app restart)
let sessionDecisions: Record<string, 'allow' | 'deny'> = {};

/**
 * Get permission preferences
 */
export function getPermissionPreferences(): PermissionPreferences {
  const stored = store.get('permissionPreferences');
  return {
    ...stored,
    sessionDecisions, // Use in-memory session decisions
  };
}

/**
 * Set permission preferences
 */
export function setPermissionPreferences(prefs: Partial<PermissionPreferences>): void {
  const current = store.get('permissionPreferences');
  store.set('permissionPreferences', { 
    ...current, 
    ...prefs,
    // Don't persist session decisions
    sessionDecisions: current.sessionDecisions,
  });
}

/**
 * Remember a decision for a specific operation
 * @param operationKey - Key like "file:create:/tmp/*" or "file:delete:/Users/*"
 * @param decision - The decision to remember
 * @param permanent - If true, persists across sessions; if false, only for current session
 */
export function rememberDecision(
  operationKey: string,
  decision: 'allow' | 'deny',
  permanent: boolean
): void {
  if (permanent) {
    const current = store.get('permissionPreferences');
    store.set('permissionPreferences', {
      ...current,
      rememberedDecisions: {
        ...current.rememberedDecisions,
        [operationKey]: decision,
      },
    });
    console.log(`[PermissionPrefs] Permanently remembered: ${operationKey} = ${decision}`);
  } else {
    sessionDecisions[operationKey] = decision;
    console.log(`[PermissionPrefs] Session remembered: ${operationKey} = ${decision}`);
  }
}

/**
 * Get remembered decision for an operation
 * Returns undefined if no decision is remembered
 */
export function getRememberedDecision(operationKey: string): 'allow' | 'deny' | undefined {
  // Check session decisions first (higher priority)
  if (sessionDecisions[operationKey] !== undefined) {
    return sessionDecisions[operationKey];
  }
  
  // Then check permanent decisions
  const prefs = store.get('permissionPreferences');
  return prefs.rememberedDecisions[operationKey];
}

/**
 * Generate an operation key for remembering decisions
 * Format: "file:{operation}:{path_pattern}"
 */
export function generateOperationKey(
  type: 'file' | 'tool' | 'question',
  operation?: string,
  filePath?: string
): string {
  if (type === 'file' && operation) {
    // For file operations, create a pattern-based key
    // e.g., "file:create:/tmp/*" or "file:delete:/Users/*/Desktop/*"
    const pathPattern = filePath 
      ? filePath.replace(/\/[^/]+$/, '/*') // Replace filename with wildcard
      : '*';
    return `${type}:${operation}:${pathPattern}`;
  }
  
  // For other types, just use type and operation
  return `${type}:${operation || 'unknown'}`;
}

/**
 * Clear session decisions (called on app restart)
 */
export function clearSessionDecisions(): void {
  sessionDecisions = {};
  console.log('[PermissionPrefs] Cleared session decisions');
}

/**
 * Clear all remembered decisions
 */
export function clearAllRememberedDecisions(): void {
  store.set('permissionPreferences', {
    ...store.get('permissionPreferences'),
    rememberedDecisions: {},
  });
  sessionDecisions = {};
  console.log('[PermissionPrefs] Cleared all remembered decisions');
}

/**
 * Set auto-approve preference for low-risk operations
 */
export function setAutoApproveLowRisk(enabled: boolean): void {
  const current = store.get('permissionPreferences');
  store.set('permissionPreferences', {
    ...current,
    autoApproveLowRisk: enabled,
  });
  console.log(`[PermissionPrefs] Auto-approve low-risk: ${enabled}`);
}
