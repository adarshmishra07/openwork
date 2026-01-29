/**
 * Permission API Server
 *
 * HTTP server that the file-permission MCP server calls to request
 * user permission for file operations. This bridges the MCP server
 * (separate process) with the Electron UI.
 */

import http from 'http';
import type { IncomingMessage, ServerResponse } from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import type { BrowserWindow } from 'electron';
import type { PermissionRequest, FileOperation, RiskLevel, ShopifyOperation, ShopifyResource } from '@shopos/shared';
import { uploadGeneratedImage } from './spaces/space-runtime-client';
import { getPermissionPreferences } from './store/permissionPreferences';

export const PERMISSION_API_PORT = 9226;
export const QUESTION_API_PORT = 9227;
export const SHOPIFY_PERMISSION_API_PORT = 9228;

interface PendingPermission {
  resolve: (allowed: boolean) => void;
  timeoutId: NodeJS.Timeout;
}

interface PendingQuestion {
  resolveWithData: (data: { selectedOptions?: string[]; customText?: string; denied?: boolean }) => void;
  timeoutId: NodeJS.Timeout;
  mcpTimeoutId: NodeJS.Timeout;  // Timer to detect when MCP has timed out (10s)
  taskId: string;                 // Needed for late response handling
}

/**
 * Timed-out question that's still waiting for user response
 * The MCP HTTP request timed out, but the question UI is still visible
 */
interface TimedOutQuestion {
  taskId: string;
  requestId: string;
  question: string;
  header?: string;
  options?: Array<{ label: string; description?: string }>;
  createdAt: Date;
}

/**
 * Result of resolving a question - either immediate or late response
 */
export interface QuestionResolveResult {
  resolved: boolean;
  lateResponse?: boolean;
  taskId?: string;
  response?: { selectedOptions?: string[]; customText?: string; denied?: boolean };
}

interface PendingShopifyPermission {
  resolve: (allowed: boolean) => void;
  timeoutId: NodeJS.Timeout;
  /** Track session-based "always allow" for specific operation types */
  operation: ShopifyOperation;
  resource: ShopifyResource;
}

// Store pending permission requests waiting for user response
const pendingPermissions = new Map<string, PendingPermission>();

// Store pending question requests waiting for user response
const pendingQuestions = new Map<string, PendingQuestion>();

// Store questions where the MCP HTTP request timed out but user hasn't answered yet
// These questions are still visible in the UI and user can still respond
const timedOutQuestions = new Map<string, TimedOutQuestion>();

// Store pending Shopify permission requests waiting for user response
const pendingShopifyPermissions = new Map<string, PendingShopifyPermission>();

// Track session-based "always allow" for Shopify operations (e.g., "always allow create product")
const shopifySessionAllowedOperations = new Set<string>();

// Store reference to main window and task manager
let mainWindow: BrowserWindow | null = null;
let getActiveTaskId: (() => string | null) | null = null;

/**
 * Initialize the permission API with dependencies
 */
export function initPermissionApi(
  window: BrowserWindow,
  taskIdGetter: () => string | null
): void {
  mainWindow = window;
  getActiveTaskId = taskIdGetter;
}

/**
 * Resolve a pending permission request from the MCP server
 * Called when user responds via the UI
 */
export function resolvePermission(requestId: string, allowed: boolean): boolean {
  const pending = pendingPermissions.get(requestId);
  if (!pending) {
    return false;
  }

  clearTimeout(pending.timeoutId);
  pending.resolve(allowed);
  pendingPermissions.delete(requestId);
  return true;
}

/**
 * Resolve a pending question request from the MCP server
 * Called when user responds via the UI
 * 
 * Returns:
 * - { resolved: true } if answered in time (HTTP response sent, MCP still waiting)
 * - { resolved: true, lateResponse: true, taskId, response } if answered after MCP timeout
 * - { resolved: false } if request not found
 */
export function resolveQuestion(
  requestId: string,
  response: { selectedOptions?: string[]; customText?: string; denied?: boolean }
): QuestionResolveResult {
  console.log(`[Question API] resolveQuestion called for ${requestId}`, response);
  console.log(`[Question API] Current pending questions: ${Array.from(pendingQuestions.keys()).join(', ') || 'none'}`);
  console.log(`[Question API] Current timed-out questions: ${Array.from(timedOutQuestions.keys()).join(', ') || 'none'}`);
  
  // Check if this question exists in pending
  const pending = pendingQuestions.get(requestId);
  
  // Check if this question was marked as timed out (MCP already received "waiting" message)
  const isTimedOut = timedOutQuestions.has(requestId);
  
  if (pending) {
    console.log(`[Question API] Found pending request ${requestId}`);
    console.log(`[Question API]   - isTimedOut: ${isTimedOut}`);
    
    // Clear both timeouts
    clearTimeout(pending.timeoutId);
    clearTimeout(pending.mcpTimeoutId);
    
    // Resolve the HTTP promise (sends response to MCP, though it may have already timed out)
    pending.resolveWithData(response);
    pendingQuestions.delete(requestId);
    
    if (isTimedOut) {
      // MCP already timed out and received "waiting" message
      // This is a late response - need to resume session
      console.log(`[Question API] Question ${requestId} was timed out - returning late response for session resume`);
      timedOutQuestions.delete(requestId);
      return { 
        resolved: true, 
        lateResponse: true, 
        taskId: pending.taskId,
        response 
      };
    }
    
    // Normal resolution - MCP was still waiting
    console.log(`[Question API] Request ${requestId} resolved normally (MCP still waiting)`);
    return { resolved: true };
  }

  // Check if this is ONLY in timed-out (pendingQuestions was already cleaned up somehow)
  const timedOut = timedOutQuestions.get(requestId);
  if (timedOut) {
    console.log(`[Question API] Found timed-out request ${requestId} (not in pending), returning late response`);
    timedOutQuestions.delete(requestId);
    return { 
      resolved: true, 
      lateResponse: true, 
      taskId: timedOut.taskId,
      response 
    };
  }

  console.log(`[Question API] !!! Request ${requestId} NOT found in pending or timed-out questions`);
  return { resolved: false };
}

/**
 * Mark a question as timed out (MCP HTTP request closed, but UI still showing)
 * Called when the HTTP response is sent due to MCP timeout
 */
export function markQuestionAsTimedOut(
  requestId: string, 
  taskId: string,
  question: string,
  header?: string,
  options?: Array<{ label: string; description?: string }>
): void {
  console.log(`[Question API] Marking question ${requestId} as timed out (task: ${taskId})`);
  timedOutQuestions.set(requestId, {
    taskId,
    requestId,
    question,
    header,
    options,
    createdAt: new Date(),
  });
  console.log(`[Question API] Timed-out questions count: ${timedOutQuestions.size}`);
}

/**
 * Clear a timed-out question (e.g., when task is cancelled)
 */
export function clearTimedOutQuestion(requestId: string): boolean {
  return timedOutQuestions.delete(requestId);
}

/**
 * Get all timed-out questions for a task
 */
export function getTimedOutQuestionsForTask(taskId: string): TimedOutQuestion[] {
  return Array.from(timedOutQuestions.values()).filter(q => q.taskId === taskId);
}

/**
 * Classify the risk level of a file operation based on operation type and paths
 */
export function classifyRiskLevel(
  operation: FileOperation,
  filePath?: string,
  filePaths?: string[]
): RiskLevel {
  const paths = filePaths || (filePath ? [filePath] : []);
  const pathCount = paths.length;
  const tmpDir = os.tmpdir();
  
  // Helper to check if all paths are in /tmp or other safe directories
  const allInSafeDir = paths.every(p => 
    p.startsWith(tmpDir) || 
    p.startsWith('/tmp') || 
    p.startsWith('/var/tmp') ||
    p.includes('/tmp/')
  );
  
  // Read operations: Low risk if in safe dir, Medium otherwise
  if (operation === 'read') {
    return allInSafeDir ? 'low' : 'medium';
  }

  // Critical: Delete operations outside safe directories or bulk deletes
  if (operation === 'delete') {
    if (pathCount > 5) return 'critical';
    if (!allInSafeDir) return 'high';
    return 'medium';
  }
  
  // High: Overwrite existing files (potential data loss)
  if (operation === 'overwrite') {
    if (pathCount > 3) return 'high';
    if (!allInSafeDir) return 'medium';
    return 'low';
  }
  
  // Medium: Modify existing files
  if (operation === 'modify') {
    if (pathCount > 3) return 'high';
    if (!allInSafeDir) return 'medium';
    return 'low';
  }
  
  // Low-Medium: Move/rename operations
  if (operation === 'move' || operation === 'rename') {
    if (pathCount > 3) return 'medium';
    return allInSafeDir ? 'low' : 'medium';
  }
  
  // Low: Create new files (generally safe)
  if (operation === 'create') {
    if (pathCount > 10) return 'medium';
    return allInSafeDir ? 'low' : 'medium';
  }
  
  // Default to medium for unknown operations
  return 'medium';
}

/**
 * Generate a unique request ID for file permissions
 */
function generateRequestId(): string {
  return `filereq_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Generate a unique request ID for questions
 */
function generateQuestionRequestId(): string {
  return `questionreq_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Handle POST /upload-to-s3 - upload local image file to S3
 * Used by the file-permission MCP server to let the agent upload generated images
 */
async function handleUploadToS3(req: IncomingMessage, res: ServerResponse): Promise<void> {
  console.log('[Permission API] >>> Received POST /upload-to-s3 request');

  // Parse request body
  let body = '';
  for await (const chunk of req) {
    body += chunk;
  }

  let data: { file_path?: string; task_id?: string };
  try {
    data = JSON.parse(body);
    console.log('[Permission API] Upload request:', { file_path: data.file_path, task_id: data.task_id });
  } catch {
    console.error('[Permission API] Invalid JSON in upload request');
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: 'Invalid JSON' }));
    return;
  }

  // Validate required fields
  if (!data.file_path) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: 'file_path is required' }));
    return;
  }

  // Get task ID from request or active task
  let taskId = data.task_id;
  if (!taskId && getActiveTaskId) {
    taskId = getActiveTaskId() || `upload_${Date.now()}`;
  }
  if (!taskId) {
    taskId = `upload_${Date.now()}`;
  }

  try {
    // Check if file exists
    if (!fs.existsSync(data.file_path)) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: `File not found: ${data.file_path}` }));
      return;
    }

    // Read file and convert to base64
    const fileBuffer = fs.readFileSync(data.file_path);
    
    // Validate file size (must be > 10KB for a real image)
    if (fileBuffer.length < 10000) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        success: false, 
        error: `File too small (${fileBuffer.length} bytes) - likely corrupt or empty` 
      }));
      return;
    }

    const base64Data = fileBuffer.toString('base64');
    const filename = path.basename(data.file_path);

    console.log(`[Permission API] Uploading ${filename} (${(fileBuffer.length / 1024).toFixed(1)}KB) to S3...`);

    // Upload to S3
    const result = await uploadGeneratedImage({
      taskId,
      filename,
      base64Data,
    });

    if (result.success && result.url) {
      console.log(`[Permission API] Upload successful: ${result.url}`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, url: result.url }));
    } else {
      console.error('[Permission API] Upload failed:', result.error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: result.error || 'Upload failed' }));
    }
  } catch (error) {
    console.error('[Permission API] Error uploading to S3:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }));
  }
}

/**
 * Create and start the HTTP server for permission requests
 */
export function startPermissionApiServer(): http.Server {
  const server = http.createServer(async (req, res) => {
    // CORS headers for local requests
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    // Handle POST /upload-to-s3 - upload local image to S3
    if (req.method === 'POST' && req.url === '/upload-to-s3') {
      await handleUploadToS3(req, res);
      return;
    }

    // Only handle POST /permission
    if (req.method !== 'POST' || req.url !== '/permission') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }

    // Parse request body
    let body = '';
    for await (const chunk of req) {
      body += chunk;
    }

    let data: {
      operation?: string;
      filePath?: string;
      filePaths?: string[];
      targetPath?: string;
      contentPreview?: string;
    };

    try {
      data = JSON.parse(body);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
      return;
    }

    // Validate required fields
    if (!data.operation || (!data.filePath && (!data.filePaths || data.filePaths.length === 0))) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'operation and either filePath or filePaths are required' }));
      return;
    }

    // Validate operation type
    const validOperations = ['read', 'create', 'delete', 'rename', 'move', 'modify', 'overwrite'];
    if (!validOperations.includes(data.operation)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Invalid operation. Must be one of: ${validOperations.join(', ')}` }));
      return;
    }

    // Check if we have the necessary dependencies
    if (!mainWindow || mainWindow.isDestroyed() || !getActiveTaskId) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Permission API not initialized' }));
      return;
    }

    const taskId = getActiveTaskId();
    if (!taskId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'No active task' }));
      return;
    }

    const requestId = generateRequestId();
    const operation = data.operation as FileOperation;
    const riskLevel = classifyRiskLevel(operation, data.filePath, data.filePaths);
    const pathCount = (data.filePaths?.length || 0) + (data.filePath ? 1 : 0);

    // Auto-approve low-risk operations if enabled
    const prefs = getPermissionPreferences();
    if (riskLevel === 'low' && prefs.autoApproveLowRisk) {
      console.log(`[Permission API] Auto-approving low-risk operation: ${operation} (Affected: ${pathCount})`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ allowed: true }));
      return;
    }

    // Create permission request for the UI
    const permissionRequest: PermissionRequest = {
      id: requestId,
      taskId,
      type: 'file',
      riskLevel,
      fileOperation: operation,
      filePath: data.filePath,
      filePaths: data.filePaths,
      targetPath: data.targetPath,
      contentPreview: data.contentPreview?.substring(0, 500),
      affectedCount: pathCount,
      reversible: operation !== 'delete', // Most operations except delete are reversible
      createdAt: new Date().toISOString(),
    };

    // Send to renderer
    mainWindow.webContents.send('permission:request', permissionRequest);

    // Wait for user response (with 5 minute timeout)
    const PERMISSION_TIMEOUT_MS = 5 * 60 * 1000;

    try {
      const allowed = await new Promise<boolean>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          pendingPermissions.delete(requestId);
          reject(new Error('Permission request timed out'));
        }, PERMISSION_TIMEOUT_MS);

        pendingPermissions.set(requestId, { resolve, timeoutId });
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ allowed }));
    } catch (error) {
      res.writeHead(408, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Request timed out', allowed: false }));
    }
  });

  server.listen(PERMISSION_API_PORT, '127.0.0.1', () => {
    console.log(`[Permission API] Server listening on port ${PERMISSION_API_PORT}`);
  });

  server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      console.warn(`[Permission API] Port ${PERMISSION_API_PORT} already in use, skipping server start`);
    } else {
      console.error('[Permission API] Server error:', error);
    }
  });

  return server;
}

/**
 * Create and start the HTTP server for question requests
 */
export function startQuestionApiServer(): http.Server {
  const server = http.createServer(async (req, res) => {
    // CORS headers for local requests
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    // Only handle POST /question
    if (req.method !== 'POST' || req.url !== '/question') {
      console.log(`[Question API] Received ${req.method} ${req.url} - returning 404`);
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }

    console.log('[Question API] >>> Received POST /question request');

    // Parse request body
    let body = '';
    for await (const chunk of req) {
      body += chunk;
    }

    let data: {
      question?: string;
      header?: string;
      options?: Array<{ label: string; description?: string }>;
      multiSelect?: boolean;
    };

    try {
      data = JSON.parse(body);
      console.log('[Question API] Parsed request data:', { 
        question: data.question?.substring(0, 50), 
        optionCount: data.options?.length,
        header: data.header 
      });
    } catch {
      console.error('[Question API] Invalid JSON in request body');
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
      return;
    }

    // Validate required fields
    if (!data.question) {
      console.error('[Question API] Missing question field');
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'question is required' }));
      return;
    }

    // Check if we have the necessary dependencies
    if (!mainWindow || mainWindow.isDestroyed() || !getActiveTaskId) {
      console.error('[Question API] Not initialized - missing mainWindow or getActiveTaskId');
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Question API not initialized' }));
      return;
    }

    const taskId = getActiveTaskId();
    if (!taskId) {
      console.error('[Question API] No active task');
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'No active task' }));
      return;
    }

    const requestId = generateQuestionRequestId();
    console.log(`[Question API] Generated requestId: ${requestId} for taskId: ${taskId}`);

    // Create question request for the UI
    const questionRequest: PermissionRequest = {
      id: requestId,
      taskId,
      type: 'question',
      question: data.question,
      header: data.header,
      options: data.options,
      multiSelect: data.multiSelect,
      createdAt: new Date().toISOString(),
    };

    // Send to renderer
    console.log('[Question API] >>> Sending permission:request IPC to renderer');
    mainWindow.webContents.send('permission:request', questionRequest);

    // Wait for user response (with 6 minute timeout - slightly longer than MCP's 5 min)
    const QUESTION_TIMEOUT_MS = 6 * 60 * 1000;
    // MCP server times out at 5 minutes, so after 5 min 10s we know it definitely timed out
    // This is a fallback for edge cases - normally MCP will receive response in time
    const MCP_TIMEOUT_DETECTION_MS = 5 * 60 * 1000 + 10 * 1000; // 5 min 10 sec
    
    console.log(`[Question API] Waiting for user response (timeout: ${QUESTION_TIMEOUT_MS}ms)...`);

    try {
      const response = await new Promise<{ selectedOptions?: string[]; customText?: string; denied?: boolean }>((resolve, reject) => {
        // 5-minute overall timeout
        const timeoutId = setTimeout(() => {
          console.log(`[Question API] !!! Request ${requestId} timed out after ${QUESTION_TIMEOUT_MS}ms`);
          pendingQuestions.delete(requestId);
          timedOutQuestions.delete(requestId); // Clean up if it was marked as timed out
          reject(new Error('Question request timed out'));
        }, QUESTION_TIMEOUT_MS);

        // Timer to detect MCP timeout (5 min 10s)
        // After MCP times out (5 min), if user answers we need to resume session
        // Mark the question so we know to handle late responses
        const mcpTimeoutId = setTimeout(() => {
          if (pendingQuestions.has(requestId)) {
            console.log(`[Question API] MCP timeout detected for ${requestId} - marking as timed out`);
            markQuestionAsTimedOut(requestId, taskId, data.question!, data.header, data.options);
          }
        }, MCP_TIMEOUT_DETECTION_MS);

        pendingQuestions.set(requestId, { 
          resolveWithData: resolve, 
          timeoutId,
          mcpTimeoutId,
          taskId,
        });
        console.log(`[Question API] Added ${requestId} to pendingQuestions (total pending: ${pendingQuestions.size})`);
      });

      console.log('[Question API] <<< User response received:', response);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(response));
      console.log('[Question API] HTTP response sent to MCP server');
    } catch (error) {
      console.error('[Question API] !!! Error waiting for response:', error);
      res.writeHead(408, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Request timed out', denied: true }));
    }
  });

  server.listen(QUESTION_API_PORT, '127.0.0.1', () => {
    console.log(`[Question API] === Server listening on port ${QUESTION_API_PORT} ===`);
  });

  server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      console.warn(`[Question API] Port ${QUESTION_API_PORT} already in use, skipping server start`);
    } else {
      console.error('[Question API] Server error:', error);
    }
  });

  return server;
}

/**
 * Check if a request ID is a file permission request from the MCP server
 */
export function isFilePermissionRequest(requestId: string): boolean {
  return requestId.startsWith('filereq_');
}

/**
 * Check if a request ID is a question request from the MCP server
 */
export function isQuestionRequest(requestId: string): boolean {
  return requestId.startsWith('questionreq_');
}

/**
 * Check if a request ID is a Shopify permission request from the MCP server
 */
export function isShopifyPermissionRequest(requestId: string): boolean {
  return requestId.startsWith('shopifyreq_');
}

/**
 * Generate a unique request ID for Shopify permissions
 */
function generateShopifyRequestId(): string {
  return `shopifyreq_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Get the session key for a Shopify operation (for "always allow" tracking)
 */
function getShopifySessionKey(operation: ShopifyOperation, resource: ShopifyResource): string {
  return `${operation}:${resource}`;
}

/**
 * Check if a Shopify operation is allowed for this session
 */
export function isShopifyOperationAllowedForSession(operation: ShopifyOperation, resource: ShopifyResource): boolean {
  return shopifySessionAllowedOperations.has(getShopifySessionKey(operation, resource));
}

/**
 * Allow a Shopify operation for the rest of this session
 */
export function allowShopifyOperationForSession(operation: ShopifyOperation, resource: ShopifyResource): void {
  shopifySessionAllowedOperations.add(getShopifySessionKey(operation, resource));
  console.log(`[Shopify Permission API] Session allow added for ${operation} ${resource}`);
}

/**
 * Clear all session-based Shopify permissions (called on app restart or session end)
 */
export function clearShopifySessionPermissions(): void {
  shopifySessionAllowedOperations.clear();
  console.log('[Shopify Permission API] Session permissions cleared');
}

/**
 * Resolve a pending Shopify permission request from the MCP server
 * Called when user responds via the UI
 */
export function resolveShopifyPermission(requestId: string, allowed: boolean, rememberSession?: boolean): boolean {
  console.log(`[Shopify Permission API] resolveShopifyPermission called for ${requestId}, allowed: ${allowed}, rememberSession: ${rememberSession}`);
  
  const pending = pendingShopifyPermissions.get(requestId);
  if (!pending) {
    console.log(`[Shopify Permission API] !!! Request ${requestId} NOT found in pendingShopifyPermissions`);
    return false;
  }

  // If user chose "always allow for session", remember this
  if (allowed && rememberSession) {
    allowShopifyOperationForSession(pending.operation, pending.resource);
  }

  console.log(`[Shopify Permission API] Found pending request ${requestId}, resolving with allowed=${allowed}`);
  clearTimeout(pending.timeoutId);
  pending.resolve(allowed);
  pendingShopifyPermissions.delete(requestId);
  console.log(`[Shopify Permission API] Request ${requestId} resolved and removed from pending`);
  return true;
}

/**
 * Create and start the HTTP server for Shopify permission requests
 */
export function startShopifyPermissionApiServer(): http.Server {
  const server = http.createServer(async (req, res) => {
    // CORS headers for local requests
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    // Only handle POST /shopify-permission
    if (req.method !== 'POST' || req.url !== '/shopify-permission') {
      console.log(`[Shopify Permission API] Received ${req.method} ${req.url} - returning 404`);
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }

    console.log('[Shopify Permission API] >>> Received POST /shopify-permission request');

    // Parse request body
    let body = '';
    for await (const chunk of req) {
      body += chunk;
    }

    let data: {
      operation?: ShopifyOperation;
      resource?: ShopifyResource;
      details?: {
        title?: string;
        price?: string;
        productId?: number;
        variantId?: number;
        quantity?: number;
        status?: string;
      };
    };

    try {
      data = JSON.parse(body);
      console.log('[Shopify Permission API] Parsed request data:', data);
    } catch {
      console.error('[Shopify Permission API] Invalid JSON in request body');
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
      return;
    }

    // Validate required fields
    if (!data.operation || !data.resource) {
      console.error('[Shopify Permission API] Missing operation or resource field');
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'operation and resource are required' }));
      return;
    }

    // Check if we have the necessary dependencies
    if (!mainWindow || mainWindow.isDestroyed() || !getActiveTaskId) {
      console.error('[Shopify Permission API] Not initialized - missing mainWindow or getActiveTaskId');
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Shopify Permission API not initialized' }));
      return;
    }

    const taskId = getActiveTaskId();
    if (!taskId) {
      console.error('[Shopify Permission API] No active task');
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'No active task' }));
      return;
    }

    // Check if this operation is already allowed for the session
    if (isShopifyOperationAllowedForSession(data.operation, data.resource)) {
      console.log(`[Shopify Permission API] Operation ${data.operation} ${data.resource} is allowed for session, auto-approving`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ allowed: true, sessionAllowed: true }));
      return;
    }

    const requestId = generateShopifyRequestId();
    console.log(`[Shopify Permission API] Generated requestId: ${requestId} for taskId: ${taskId}`);

    // Create permission request for the UI
    const permissionRequest: PermissionRequest = {
      id: requestId,
      taskId,
      type: 'shopify',
      riskLevel: 'high', // Shopify write operations are always high risk
      shopifyOperation: data.operation,
      shopifyResource: data.resource,
      shopifyDetails: data.details,
      createdAt: new Date().toISOString(),
    };

    // Send to renderer
    console.log('[Shopify Permission API] >>> Sending permission:request IPC to renderer');
    mainWindow.webContents.send('permission:request', permissionRequest);

    // Wait for user response (with 5 minute timeout)
    const SHOPIFY_TIMEOUT_MS = 5 * 60 * 1000;
    console.log(`[Shopify Permission API] Waiting for user response (timeout: ${SHOPIFY_TIMEOUT_MS}ms)...`);

    try {
      const allowed = await new Promise<boolean>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          console.log(`[Shopify Permission API] !!! Request ${requestId} timed out after ${SHOPIFY_TIMEOUT_MS}ms`);
          pendingShopifyPermissions.delete(requestId);
          reject(new Error('Shopify permission request timed out'));
        }, SHOPIFY_TIMEOUT_MS);

        pendingShopifyPermissions.set(requestId, { 
          resolve, 
          timeoutId,
          operation: data.operation!,
          resource: data.resource!,
        });
        console.log(`[Shopify Permission API] Added ${requestId} to pendingShopifyPermissions (total pending: ${pendingShopifyPermissions.size})`);
      });

      console.log('[Shopify Permission API] <<< User response received:', allowed);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ allowed }));
      console.log('[Shopify Permission API] HTTP response sent to MCP server');
    } catch (error) {
      console.error('[Shopify Permission API] !!! Error waiting for response:', error);
      res.writeHead(408, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Request timed out', allowed: false }));
    }
  });

  server.listen(SHOPIFY_PERMISSION_API_PORT, '127.0.0.1', () => {
    console.log(`[Shopify Permission API] === Server listening on port ${SHOPIFY_PERMISSION_API_PORT} ===`);
  });

  server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      console.warn(`[Shopify Permission API] Port ${SHOPIFY_PERMISSION_API_PORT} already in use, skipping server start`);
    } else {
      console.error('[Shopify Permission API] Server error:', error);
    }
  });

  return server;
}
