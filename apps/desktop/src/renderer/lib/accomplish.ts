/**
 * Accomplish API - Interface to the Electron main process
 *
 * This module provides type-safe access to the accomplish API
 * exposed by the preload script via contextBridge.
 */

import type {
  Task,
  TaskConfig,
  TaskUpdateEvent,
  TaskStatus,
  PermissionRequest,
  PermissionResponse,
  TaskProgress,
  ApiKeyConfig,
  TaskMessage,
  BedrockCredentials,
  ProviderSettings,
  ProviderId,
  ConnectedProvider,
  BrandProfile,
  BrandMemory,
} from '@brandwork/shared';

// Define the API interface
interface AccomplishAPI {
  // App info
  getVersion(): Promise<string>;
  getPlatform(): Promise<string>;

  // Shell
  openExternal(url: string): Promise<void>;
  openPath(filePath: string): Promise<string>;

  // Task operations
  startTask(config: TaskConfig): Promise<Task>;
  cancelTask(taskId: string): Promise<void>;
  interruptTask(taskId: string): Promise<void>;
  getTask(taskId: string): Promise<Task | null>;
  listTasks(): Promise<Task[]>;
  deleteTask(taskId: string): Promise<void>;
  clearTaskHistory(): Promise<void>;

  // Permission responses
  respondToPermission(response: PermissionResponse): Promise<void>;

  // Session management
  resumeSession(sessionId: string, prompt: string, taskId?: string, attachments?: Array<{ filename: string; contentType: string; url: string; size: number }>): Promise<Task>;

  // Settings
  getApiKeys(): Promise<ApiKeyConfig[]>;
  addApiKey(provider: 'anthropic' | 'openai' | 'openrouter' | 'google' | 'xai' | 'deepseek' | 'zai' | 'custom' | 'bedrock' | 'litellm', key: string, label?: string): Promise<ApiKeyConfig>;
  removeApiKey(id: string): Promise<void>;
  getDebugMode(): Promise<boolean>;
  setDebugMode(enabled: boolean): Promise<void>;
  getAppSettings(): Promise<{ debugMode: boolean; onboardingComplete: boolean }>;

  // API Key management
  hasApiKey(): Promise<boolean>;
  setApiKey(key: string): Promise<void>;
  getApiKey(): Promise<string | null>;
  validateApiKey(key: string): Promise<{ valid: boolean; error?: string }>;
  validateApiKeyForProvider(provider: string, key: string): Promise<{ valid: boolean; error?: string }>;
  clearApiKey(): Promise<void>;

  // Multi-provider API keys
  getAllApiKeys(): Promise<Record<string, { exists: boolean; prefix?: string }>>;
  hasAnyApiKey(): Promise<boolean>;

  // Onboarding
  getOnboardingComplete(): Promise<boolean>;
  setOnboardingComplete(complete: boolean): Promise<void>;

  // Claude CLI
  checkClaudeCli(): Promise<{ installed: boolean; version: string | null; installCommand: string }>;
  getClaudeVersion(): Promise<string | null>;

  // Model selection
  getSelectedModel(): Promise<{ provider: string; model: string; baseUrl?: string } | null>;
  setSelectedModel(model: { provider: string; model: string; baseUrl?: string }): Promise<void>;

  // Ollama configuration
  testOllamaConnection(url: string): Promise<{
    success: boolean;
    models?: Array<{ id: string; displayName: string; size: number }>;
    error?: string;
  }>;
  getOllamaConfig(): Promise<{ baseUrl: string; enabled: boolean; lastValidated?: number; models?: Array<{ id: string; displayName: string; size: number }> } | null>;
  setOllamaConfig(config: { baseUrl: string; enabled: boolean; lastValidated?: number; models?: Array<{ id: string; displayName: string; size: number }> } | null): Promise<void>;

  // OpenRouter configuration
  fetchOpenRouterModels(): Promise<{
    success: boolean;
    models?: Array<{ id: string; name: string; provider: string; contextLength: number }>;
    error?: string;
  }>;

  // LiteLLM configuration
  testLiteLLMConnection(url: string, apiKey?: string): Promise<{
    success: boolean;
    models?: Array<{ id: string; name: string; provider: string; contextLength: number }>;
    error?: string;
  }>;
  fetchLiteLLMModels(): Promise<{
    success: boolean;
    models?: Array<{ id: string; name: string; provider: string; contextLength: number }>;
    error?: string;
  }>;
  getLiteLLMConfig(): Promise<{ baseUrl: string; enabled: boolean; lastValidated?: number; models?: Array<{ id: string; name: string; provider: string; contextLength: number }> } | null>;
  setLiteLLMConfig(config: { baseUrl: string; enabled: boolean; lastValidated?: number; models?: Array<{ id: string; name: string; provider: string; contextLength: number }> } | null): Promise<void>;

  // Bedrock configuration
  validateBedrockCredentials(credentials: string): Promise<{ valid: boolean; error?: string }>;
  saveBedrockCredentials(credentials: string): Promise<ApiKeyConfig>;
  getBedrockCredentials(): Promise<BedrockCredentials | null>;
  fetchBedrockModels(credentials: string): Promise<{ success: boolean; models: Array<{ id: string; name: string; provider: string }>; error?: string }>;

  // E2E Testing
  isE2EMode(): Promise<boolean>;

  // Shopify configuration
  connectShopify(credentials: { shopDomain: string; accessToken: string }): Promise<{ success: boolean; shopDomain: string }>;
  disconnectShopify(): Promise<{ success: boolean }>;
  testShopifyConnection(credentials?: { shopDomain: string; accessToken: string }): Promise<{
    success: boolean;
    shop?: { name: string; domain: string; email: string };
    error?: string;
  }>;
  getShopifyStatus(): Promise<{ connected: boolean; shopDomain?: string }>;

  // File Picker
  openFilePicker(): Promise<{ canceled: boolean; filePaths: string[] }>;
  openJsonFilePicker(): Promise<{ canceled: boolean; filePath: string | null; data?: unknown }>;

  // Media File Loading
  loadLocalFile(filePath: string): Promise<{ dataUrl: string; mimeType: string; size: number; fileName: string }>;

  // Brand Memory
  saveBrandProfile(profile: BrandProfile): Promise<{ success: boolean }>;
  getActiveBrandProfile(): Promise<BrandProfile | null>;
  getBrandProfile(id: string): Promise<BrandProfile | null>;
  listBrandProfiles(): Promise<BrandProfile[]>;
  updateBrandProfile(id: string, updates: Partial<BrandProfile>): Promise<{ success: boolean }>;
  deleteBrandProfile(id: string): Promise<{ success: boolean }>;
  setActiveBrandProfile(id: string): Promise<{ success: boolean }>;
  hasBrandProfile(): Promise<boolean>;
  getBrandContext(brandId?: string): Promise<string>;
  addBrandExample(brandId: string, exampleType: string, inputText: string | null, outputText: string, rating?: number): Promise<{ success: boolean }>;
  importBrandMemory(brandId: string, memoryData: BrandMemory): Promise<{ success: boolean; error?: string }>;
  getBrandMemory(brandId?: string): Promise<BrandMemory | null>;
  uploadBrandAsset(
    brandId: string,
    assetType: 'logos' | 'characters' | 'scenes' | 'site-images',
    filename: string,
    contentType: string,
    imageBase64: string
  ): Promise<{ success: boolean; url?: string; error?: string }>;

  // Provider Settings API
  getProviderSettings(): Promise<ProviderSettings>;
  setActiveProvider(providerId: ProviderId | null): Promise<void>;
  getConnectedProvider(providerId: ProviderId): Promise<ConnectedProvider | null>;
  setConnectedProvider(providerId: ProviderId, provider: ConnectedProvider): Promise<void>;
  removeConnectedProvider(providerId: ProviderId): Promise<void>;
  updateProviderModel(providerId: ProviderId, modelId: string | null): Promise<void>;
  setProviderDebugMode(enabled: boolean): Promise<void>;
  getProviderDebugMode(): Promise<boolean>;

  // Claude SDK Settings (Experimental)
  getUseClaudeSdk(): Promise<boolean>;
  setUseClaudeSdk(enabled: boolean): Promise<{ success: boolean }>;

  // Event subscriptions
  onTaskUpdate(callback: (event: TaskUpdateEvent) => void): () => void;
  onTaskUpdateBatch?(callback: (event: { taskId: string; messages: TaskMessage[] }) => void): () => void;
  onPermissionRequest(callback: (request: PermissionRequest) => void): () => void;
  onTaskProgress(callback: (progress: TaskProgress) => void): () => void;
  onDebugLog(callback: (log: unknown) => void): () => void;
  onDebugModeChange?(callback: (data: { enabled: boolean }) => void): () => void;
  onTaskStatusChange?(callback: (data: { taskId: string; status: TaskStatus }) => void): () => void;
  onTaskSummary?(callback: (data: { taskId: string; summary: string }) => void): () => void;

  // Logging
  logEvent(payload: { level?: string; message: string; context?: Record<string, unknown> }): Promise<unknown>;

  // Chat Attachment Upload
  uploadChatAttachment(
    taskId: string,
    filePath: string
  ): Promise<{
    success: boolean;
    url?: string;
    fileId?: string;
    error?: string;
  }>;

  uploadChatAttachmentBase64(
    taskId: string,
    filename: string,
    contentType: string,
    base64Data: string
  ): Promise<{
    success: boolean;
    url?: string;
    fileId?: string;
    error?: string;
  }>;

  // Generated Image Upload
  uploadGeneratedImage(
    taskId: string,
    localPath: string
  ): Promise<{
    success: boolean;
    url?: string;
    error?: string;
  }>;
}

interface AccomplishShell {
  version: string;
  platform: string;
  isElectron: true;
}

// Extend Window interface
declare global {
  interface Window {
    accomplish?: AccomplishAPI;
    accomplishShell?: AccomplishShell;
  }
}

/**
 * Get the accomplish API
 * Throws if not running in Electron
 */
export function getAccomplish() {
  if (!window.accomplish) {
    throw new Error('Accomplish API not available - not running in Electron');
  }
  return {
    ...window.accomplish,

    validateBedrockCredentials: async (credentials: BedrockCredentials): Promise<{ valid: boolean; error?: string }> => {
      return window.accomplish!.validateBedrockCredentials(JSON.stringify(credentials));
    },

    saveBedrockCredentials: async (credentials: BedrockCredentials): Promise<ApiKeyConfig> => {
      return window.accomplish!.saveBedrockCredentials(JSON.stringify(credentials));
    },

    getBedrockCredentials: async (): Promise<BedrockCredentials | null> => {
      return window.accomplish!.getBedrockCredentials();
    },

    fetchBedrockModels: (credentials: string) => window.accomplish!.fetchBedrockModels(credentials),
  };
}

/**
 * Check if running in Electron shell
 */
export function isRunningInElectron(): boolean {
  return window.accomplishShell?.isElectron === true;
}

/**
 * Get shell version if available
 */
export function getShellVersion(): string | null {
  return window.accomplishShell?.version ?? null;
}

/**
 * Get shell platform if available
 */
export function getShellPlatform(): string | null {
  return window.accomplishShell?.platform ?? null;
}

/**
 * React hook to use the accomplish API
 */
export function useAccomplish(): AccomplishAPI {
  const api = window.accomplish;
  if (!api) {
    throw new Error('Accomplish API not available - not running in Electron');
  }
  return api;
}
