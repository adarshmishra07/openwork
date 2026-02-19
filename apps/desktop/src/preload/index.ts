/**
 * Preload Script for Local Renderer
 *
 * This preload script exposes a secure API to the local React renderer
 * for communicating with the Electron main process via IPC.
 */

import { contextBridge, ipcRenderer } from 'electron';

// Expose the accomplish API to the renderer
const accomplishAPI = {
  // App info
  getVersion: (): Promise<string> => ipcRenderer.invoke('app:version'),
  getPlatform: (): Promise<string> => ipcRenderer.invoke('app:platform'),

  // Shell
  openExternal: (url: string): Promise<void> =>
    ipcRenderer.invoke('shell:open-external', url),
  
  // Open local file with system default application (for PDFs, etc.)
  openPath: (filePath: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('shell:open-path', filePath),

  // Task operations
  startTask: (config: { description: string }): Promise<unknown> =>
    ipcRenderer.invoke('task:start', config),
  cancelTask: (taskId: string): Promise<void> =>
    ipcRenderer.invoke('task:cancel', taskId),
  interruptTask: (taskId: string): Promise<void> =>
    ipcRenderer.invoke('task:interrupt', taskId),
  getTask: (taskId: string): Promise<unknown> =>
    ipcRenderer.invoke('task:get', taskId),
  listTasks: (): Promise<unknown[]> => ipcRenderer.invoke('task:list'),
  deleteTask: (taskId: string): Promise<void> =>
    ipcRenderer.invoke('task:delete', taskId),
  clearTaskHistory: (): Promise<void> => ipcRenderer.invoke('task:clear-history'),

  // Permission responses
  respondToPermission: (response: { taskId: string; allowed: boolean }): Promise<void> =>
    ipcRenderer.invoke('permission:respond', response),

  // Session management
  resumeSession: (sessionId: string, prompt: string, taskId?: string, attachments?: Array<{ filename: string; contentType: string; url: string; size: number }>): Promise<unknown> =>
    ipcRenderer.invoke('session:resume', sessionId, prompt, taskId, attachments),

  // Settings
  getApiKeys: (): Promise<unknown[]> => ipcRenderer.invoke('settings:api-keys'),
  addApiKey: (
    provider: 'anthropic' | 'openai' | 'openrouter' | 'google' | 'xai' | 'deepseek' | 'zai' | 'custom' | 'kimi' | 'minimax' | 'litellm',
    key: string,
    label?: string
  ): Promise<unknown> =>
    ipcRenderer.invoke('settings:add-api-key', provider, key, label),
  removeApiKey: (id: string): Promise<void> =>
    ipcRenderer.invoke('settings:remove-api-key', id),
  getDebugMode: (): Promise<boolean> =>
    ipcRenderer.invoke('settings:debug-mode'),
  setDebugMode: (enabled: boolean): Promise<void> =>
    ipcRenderer.invoke('settings:set-debug-mode', enabled),
  getIntentAnalysisEnabled: (): Promise<boolean> =>
    ipcRenderer.invoke('settings:intent-analysis-enabled'),
  setIntentAnalysisEnabled: (enabled: boolean): Promise<void> =>
    ipcRenderer.invoke('settings:set-intent-analysis-enabled', enabled),
  getAppSettings: (): Promise<{ debugMode: boolean; onboardingComplete: boolean }> =>
    ipcRenderer.invoke('settings:app-settings'),

  // API Key management (new simplified handlers)
  hasApiKey: (): Promise<boolean> =>
    ipcRenderer.invoke('api-key:exists'),
  setApiKey: (key: string): Promise<void> =>
    ipcRenderer.invoke('api-key:set', key),
  getApiKey: (): Promise<string | null> =>
    ipcRenderer.invoke('api-key:get'),
  validateApiKey: (key: string): Promise<{ valid: boolean; error?: string }> =>
    ipcRenderer.invoke('api-key:validate', key),
  validateApiKeyForProvider: (provider: string, key: string): Promise<{ valid: boolean; error?: string }> =>
    ipcRenderer.invoke('api-key:validate-provider', provider, key),
  clearApiKey: (): Promise<void> =>
    ipcRenderer.invoke('api-key:clear'),

  // Onboarding
  getOnboardingComplete: (): Promise<boolean> =>
    ipcRenderer.invoke('onboarding:complete'),
  setOnboardingComplete: (complete: boolean): Promise<void> =>
    ipcRenderer.invoke('onboarding:set-complete', complete),

  // App Factory Reset
  factoryReset: (): Promise<void> =>
    ipcRenderer.invoke('app:factory-reset'),

  // OpenCode CLI status
  checkOpenCodeCli: (): Promise<{
    installed: boolean;
    version: string | null;
    installCommand: string;
  }> => ipcRenderer.invoke('opencode:check'),
  getOpenCodeVersion: (): Promise<string | null> =>
    ipcRenderer.invoke('opencode:version'),

  // Model selection
  getSelectedModel: (): Promise<{ provider: string; model: string; baseUrl?: string } | null> =>
    ipcRenderer.invoke('model:get'),
  setSelectedModel: (model: { provider: string; model: string; baseUrl?: string }): Promise<void> =>
    ipcRenderer.invoke('model:set', model),

  // Multi-provider API keys
  getAllApiKeys: (): Promise<Record<string, { exists: boolean; prefix?: string }>> =>
    ipcRenderer.invoke('api-keys:all'),
  hasAnyApiKey: (): Promise<boolean> =>
    ipcRenderer.invoke('api-keys:has-any'),

  // Ollama configuration
  testOllamaConnection: (url: string): Promise<{
    success: boolean;
    models?: Array<{ id: string; displayName: string; size: number }>;
    error?: string;
  }> => ipcRenderer.invoke('ollama:test-connection', url),

  getOllamaConfig: (): Promise<{ baseUrl: string; enabled: boolean; lastValidated?: number; models?: Array<{ id: string; displayName: string; size: number }> } | null> =>
    ipcRenderer.invoke('ollama:get-config'),

  setOllamaConfig: (config: { baseUrl: string; enabled: boolean; lastValidated?: number; models?: Array<{ id: string; displayName: string; size: number }> } | null): Promise<void> =>
    ipcRenderer.invoke('ollama:set-config', config),

  // OpenRouter configuration
  fetchOpenRouterModels: (): Promise<{
    success: boolean;
    models?: Array<{ id: string; name: string; provider: string; contextLength: number }>;
    error?: string;
  }> => ipcRenderer.invoke('openrouter:fetch-models'),

  // LiteLLM configuration
  testLiteLLMConnection: (url: string, apiKey?: string): Promise<{
    success: boolean;
    models?: Array<{ id: string; name: string; provider: string; contextLength: number }>;
    error?: string;
  }> => ipcRenderer.invoke('litellm:test-connection', url, apiKey),

  fetchLiteLLMModels: (): Promise<{
    success: boolean;
    models?: Array<{ id: string; name: string; provider: string; contextLength: number }>;
    error?: string;
  }> => ipcRenderer.invoke('litellm:fetch-models'),

  getLiteLLMConfig: (): Promise<{ baseUrl: string; enabled: boolean; lastValidated?: number; models?: Array<{ id: string; name: string; provider: string; contextLength: number }> } | null> =>
    ipcRenderer.invoke('litellm:get-config'),

  setLiteLLMConfig: (config: { baseUrl: string; enabled: boolean; lastValidated?: number; models?: Array<{ id: string; name: string; provider: string; contextLength: number }> } | null): Promise<void> =>
    ipcRenderer.invoke('litellm:set-config', config),

  // Kimi (Moonshot) API validation
  validateKimiApiKey: (apiKey: string): Promise<{ valid: boolean; error?: string }> =>
    ipcRenderer.invoke('kimi:validate', apiKey),

  // Minimax API validation
  validateMinimaxApiKey: (apiKey: string): Promise<{ valid: boolean; error?: string }> =>
    ipcRenderer.invoke('minimax:validate', apiKey),

  // E2E Testing
  isE2EMode: (): Promise<boolean> =>
    ipcRenderer.invoke('app:is-e2e-mode'),

  // New Provider Settings API
  getProviderSettings: (): Promise<unknown> =>
    ipcRenderer.invoke('provider-settings:get'),
  setActiveProvider: (providerId: string | null): Promise<void> =>
    ipcRenderer.invoke('provider-settings:set-active', providerId),
  getConnectedProvider: (providerId: string): Promise<unknown> =>
    ipcRenderer.invoke('provider-settings:get-connected', providerId),
  setConnectedProvider: (providerId: string, provider: unknown): Promise<void> =>
    ipcRenderer.invoke('provider-settings:set-connected', providerId, provider),
  removeConnectedProvider: (providerId: string): Promise<void> =>
    ipcRenderer.invoke('provider-settings:remove-connected', providerId),
  updateProviderModel: (providerId: string, modelId: string | null): Promise<void> =>
    ipcRenderer.invoke('provider-settings:update-model', providerId, modelId),
  setProviderDebugMode: (enabled: boolean): Promise<void> =>
    ipcRenderer.invoke('provider-settings:set-debug', enabled),
  getProviderDebugMode: (): Promise<boolean> =>
    ipcRenderer.invoke('provider-settings:get-debug'),

  // Shopify
  connectShopify: (credentials: { shopDomain: string; accessToken: string }): Promise<{ success: boolean; shopDomain: string }> =>
    ipcRenderer.invoke('shopify:connect', credentials),
  disconnectShopify: (): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('shopify:disconnect'),
  testShopifyConnection: (credentials?: { shopDomain: string; accessToken: string }): Promise<{
    success: boolean;
    shop?: { name: string; domain: string; email: string };
    error?: string;
  }> => ipcRenderer.invoke('shopify:test-connection', credentials),
  getShopifyStatus: (): Promise<{ connected: boolean; shopDomain?: string }> =>
    ipcRenderer.invoke('shopify:status'),

  // Event subscriptions
  onTaskUpdate: (callback: (event: unknown) => void) => {
    const listener = (_: unknown, event: unknown) => callback(event);
    ipcRenderer.on('task:update', listener);
    return () => ipcRenderer.removeListener('task:update', listener);
  },
  // Batched task updates for performance - multiple messages in single IPC call
  onTaskUpdateBatch: (callback: (event: { taskId: string; messages: unknown[] }) => void) => {
    const listener = (_: unknown, event: { taskId: string; messages: unknown[] }) => callback(event);
    ipcRenderer.on('task:update:batch', listener);
    return () => ipcRenderer.removeListener('task:update:batch', listener);
  },
  onPermissionRequest: (callback: (request: unknown) => void) => {
    const listener = (_: unknown, request: unknown) => callback(request);
    ipcRenderer.on('permission:request', listener);
    return () => ipcRenderer.removeListener('permission:request', listener);
  },
  onTaskProgress: (callback: (progress: unknown) => void) => {
    const listener = (_: unknown, progress: unknown) => callback(progress);
    ipcRenderer.on('task:progress', listener);
    return () => ipcRenderer.removeListener('task:progress', listener);
  },
  onDebugLog: (callback: (log: unknown) => void) => {
    const listener = (_: unknown, log: unknown) => callback(log);
    ipcRenderer.on('debug:log', listener);
    return () => ipcRenderer.removeListener('debug:log', listener);
  },
  // Debug mode setting changes
  onDebugModeChange: (callback: (data: { enabled: boolean }) => void) => {
    const listener = (_: unknown, data: { enabled: boolean }) => callback(data);
    ipcRenderer.on('settings:debug-mode-changed', listener);
    return () => ipcRenderer.removeListener('settings:debug-mode-changed', listener);
  },
  // Task status changes (e.g., queued -> running)
  onTaskStatusChange: (callback: (data: { taskId: string; status: string }) => void) => {
    const listener = (_: unknown, data: { taskId: string; status: string }) => callback(data);
    ipcRenderer.on('task:status-change', listener);
    return () => ipcRenderer.removeListener('task:status-change', listener);
  },
  // Task summary updates (AI-generated summary)
  onTaskSummary: (callback: (data: { taskId: string; summary: string }) => void) => {
    const listener = (_: unknown, data: { taskId: string; summary: string }) => callback(data);
    ipcRenderer.on('task:summary', listener);
    return () => ipcRenderer.removeListener('task:summary', listener);
  },
  // Late question response - user answered after MCP timeout, need to resume session
  onQuestionLateResponse: (callback: (data: { taskId: string; sessionId: string; answer: string }) => void) => {
    const listener = (_: unknown, data: { taskId: string; sessionId: string; answer: string }) => callback(data);
    ipcRenderer.on('question:late-response', listener);
    return () => ipcRenderer.removeListener('question:late-response', listener);
  },
  // Intent analysis status updates
  onIntentAnalysis: (
    callback: (data: {
      taskId: string;
      status: 'analyzing' | 'complete';
      result?: unknown;
      error?: string;
    }) => void
  ) => {
    const listener = (
      _: unknown,
      data: { taskId: string; status: 'analyzing' | 'complete'; result?: unknown; error?: string }
    ) => callback(data);
    ipcRenderer.on('task:intent-analysis', listener);
    return () => ipcRenderer.removeListener('task:intent-analysis', listener);
  },

  logEvent: (payload: { level?: string; message: string; context?: Record<string, unknown> }) =>
    ipcRenderer.invoke('log:event', payload),

  // ============================================
  // Brand Memory API
  // ============================================
  
  // Save brand profile
  saveBrandProfile: (profile: unknown): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('brand:save', profile),
  
  // Get active brand profile
  getActiveBrandProfile: (): Promise<unknown | null> =>
    ipcRenderer.invoke('brand:get-active'),
  
  // Get brand profile by ID
  getBrandProfile: (id: string): Promise<unknown | null> =>
    ipcRenderer.invoke('brand:get', id),
  
  // Get all brand profiles
  listBrandProfiles: (): Promise<unknown[]> =>
    ipcRenderer.invoke('brand:list'),
  
  // Update brand profile
  updateBrandProfile: (id: string, updates: unknown): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('brand:update', id, updates),
  
  // Delete brand profile
  deleteBrandProfile: (id: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('brand:delete', id),
  
  // Set active brand profile
  setActiveBrandProfile: (id: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('brand:set-active', id),
  
  // Check if any brand profile exists
  hasBrandProfile: (): Promise<boolean> =>
    ipcRenderer.invoke('brand:has-profile'),
  
  // Get brand context for prompts
  getBrandContext: (brandId?: string): Promise<string> =>
    ipcRenderer.invoke('brand:get-context', brandId),
  
  // Add example for learning
  addBrandExample: (brandId: string, exampleType: string, inputText: string | null, outputText: string, rating?: number): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('brand:add-example', brandId, exampleType, inputText, outputText, rating),
  
  // Import brand memory from JSON
  importBrandMemory: (brandId: string, memoryData: unknown): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('brand:import-memory', brandId, memoryData),
  
  // Get brand memory
  getBrandMemory: (brandId?: string): Promise<unknown | null> =>
    ipcRenderer.invoke('brand:get-memory', brandId),

  // ============================================
  // Space Runtime API (Python Lambda Spaces)
  // ============================================

  // Match a prompt to the best space
  matchPromptToSpace: (prompt: string): Promise<{
    matched: boolean;
    space: unknown | null;
    confidence: number;
    matchedKeywords: string[];
    matchedPatterns: string[];
  }> => ipcRenderer.invoke('space-runtime:match', prompt),

  // Get suggested spaces for a prompt
  getSuggestedSpaces: (prompt: string): Promise<Array<{
    space: unknown;
    confidence: number;
    matchedKeywords: string[];
  }>> => ipcRenderer.invoke('space-runtime:suggestions', prompt),

  // Check if space runtime is available
  isSpaceRuntimeAvailable: (): Promise<boolean> =>
    ipcRenderer.invoke('space-runtime:is-available'),

  // Check which API keys are available for space runtime
  getSpaceRuntimeKeys: (): Promise<{ gemini: { exists: boolean }; openai: { exists: boolean } }> =>
    ipcRenderer.invoke('space-runtime:required-keys'),

  // List spaces from remote runtime
  listRemoteSpaces: (): Promise<unknown[]> =>
    ipcRenderer.invoke('space-runtime:list-remote'),

  // Execute a space
  executeSpace: (spaceId: string, inputs: Record<string, unknown>): Promise<{
    success: boolean;
    outputAssets: Array<{ type: string; url?: string; content?: string }>;
    error?: string;
    metadata?: Record<string, unknown>;
  }> => ipcRenderer.invoke('space-runtime:execute', spaceId, inputs),

  // Get local space registry
  getSpaceRegistry: (): Promise<unknown> =>
    ipcRenderer.invoke('space-runtime:registry'),

  // ============================================
  // File Picker API (User File Attachment)
  // ============================================

  // Open native file picker dialog for attaching files to messages
  openFilePicker: (): Promise<{
    canceled: boolean;
    filePaths: string[];
  }> => ipcRenderer.invoke('dialog:open-file'),

  // Open native file picker dialog for JSON files (brand memory import)
  openJsonFilePicker: (): Promise<{
    canceled: boolean;
    filePath: string | null;
    data?: unknown;
  }> => ipcRenderer.invoke('dialog:open-json'),

  // ============================================
  // Media File API (Local File Loading)
  // ============================================

  // Load a local file as base64 data URL
  // Used to display local images/videos that Claude creates
  loadLocalFile: (filePath: string): Promise<{
    dataUrl: string;
    mimeType: string;
    size: number;
    fileName: string;
  }> => ipcRenderer.invoke('media:load-local-file', filePath),

  // ============================================
  // Brand Asset Upload API
  // ============================================

  // Upload a brand asset (logo, character, scene, site-image) to S3
  uploadBrandAsset: (
    brandId: string,
    assetType: 'logos' | 'characters' | 'scenes' | 'site-images',
    filename: string,
    contentType: string,
    imageBase64: string
  ): Promise<{
    success: boolean;
    url?: string;
    error?: string;
  }> => ipcRenderer.invoke('brand:upload-asset', brandId, assetType, filename, contentType, imageBase64),

  // ============================================
  // Chat Attachment Upload API
  // ============================================

  // Upload a chat attachment from file path
  uploadChatAttachment: (
    taskId: string,
    filePath: string
  ): Promise<{
    success: boolean;
    url?: string;
    fileId?: string;
    error?: string;
  }> => ipcRenderer.invoke('attachment:upload', taskId, filePath),

  // Upload a chat attachment from base64 data
  uploadChatAttachmentBase64: (
    taskId: string,
    filename: string,
    contentType: string,
    base64Data: string
  ): Promise<{
    success: boolean;
    url?: string;
    fileId?: string;
    error?: string;
  }> => ipcRenderer.invoke('attachment:upload-base64', taskId, filename, contentType, base64Data),

  // Upload a generated image to S3 for persistence
  uploadGeneratedImage: (
    taskId: string,
    localPath: string
  ): Promise<{
    success: boolean;
    url?: string;
    error?: string;
  }> => ipcRenderer.invoke('generated-image:upload', taskId, localPath),
};

// Expose the API to the renderer
contextBridge.exposeInMainWorld('accomplish', accomplishAPI);

// Also expose shell info for compatibility checks
const packageVersion = process.env.npm_package_version;
if (!packageVersion) {
  throw new Error('Package version is not defined. Build is misconfigured.');
}
contextBridge.exposeInMainWorld('accomplishShell', {
  version: packageVersion,
  platform: process.platform,
  isElectron: true,
});

// Type declarations
export type AccomplishAPI = typeof accomplishAPI;
