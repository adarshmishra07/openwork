/**
 * Provider and model configuration types for multi-provider support
 */

export type ProviderType = 'anthropic' | 'openai' | 'openrouter' | 'google' | 'xai' | 'ollama' | 'deepseek' | 'zai' | 'custom' | 'kimi' | 'minimax' | 'litellm';

export interface ProviderConfig {
  id: ProviderType;
  name: string;
  models: ModelConfig[];
  requiresApiKey: boolean;
  apiKeyEnvVar?: string;
  baseUrl?: string;
}

export interface ModelConfig {
  id: string; // e.g., "claude-sonnet-4-5"
  displayName: string; // e.g., "Claude Sonnet 4.5"
  provider: ProviderType;
  fullId: string; // e.g., "anthropic/claude-sonnet-4-5"
  contextWindow?: number;
  maxOutputTokens?: number;
  supportsVision?: boolean;
}

export interface SelectedModel {
  provider: ProviderType;
  model: string; // Full ID: "anthropic/claude-sonnet-4-5"
  baseUrl?: string;  // For Ollama: the server URL
}

/**
 * Ollama model info from API
 */
export interface OllamaModelInfo {
  id: string;        // e.g., "qwen3:latest"
  displayName: string;
  size: number;
}

/**
 * Ollama server configuration
 */
export interface OllamaConfig {
  baseUrl: string;
  enabled: boolean;
  lastValidated?: number;
  models?: OllamaModelInfo[];  // Discovered models from Ollama API
}

/**
 * OpenRouter model info from API
 */
export interface OpenRouterModel {
  id: string;           // e.g., "anthropic/claude-3.5-sonnet"
  name: string;         // e.g., "Claude 3.5 Sonnet"
  provider: string;     // e.g., "anthropic" (extracted from id)
  contextLength: number;
}

/**
 * OpenRouter configuration
 */
export interface OpenRouterConfig {
  models: OpenRouterModel[];
  lastFetched?: number;
}

/**
 * LiteLLM model info from API
 */
export interface LiteLLMModel {
  id: string;           // e.g., "openai/gpt-4"
  name: string;         // Display name (same as id for LiteLLM)
  provider: string;     // Extracted from model ID
  contextLength: number;
}

/**
 * LiteLLM configuration
 */
export interface LiteLLMConfig {
  baseUrl: string;      // e.g., "http://localhost:4000"
  enabled: boolean;
  lastValidated?: number;
  models?: LiteLLMModel[];
}

/**
 * Default providers and models
 */
export const DEFAULT_PROVIDERS: ProviderConfig[] = [
  {
    id: 'anthropic',
    name: 'Anthropic',
    requiresApiKey: true,
    apiKeyEnvVar: 'ANTHROPIC_API_KEY',
    models: [
      {
        id: 'claude-haiku-4-5',
        displayName: 'Claude Haiku 4.5',
        provider: 'anthropic',
        fullId: 'anthropic/claude-haiku-4-5',
        contextWindow: 200000,
        supportsVision: true,
      },
      {
        id: 'claude-sonnet-4-5',
        displayName: 'Claude Sonnet 4.5',
        provider: 'anthropic',
        fullId: 'anthropic/claude-sonnet-4-5',
        contextWindow: 200000,
        supportsVision: true,
      },
      {
        id: 'claude-opus-4-5',
        displayName: 'Claude Opus 4.5',
        provider: 'anthropic',
        fullId: 'anthropic/claude-opus-4-5',
        contextWindow: 200000,
        supportsVision: true,
      },
      {
        id: 'claude-opus-4-6',
        displayName: 'Claude Opus 4.6',
        provider: 'anthropic',
        fullId: 'anthropic/claude-opus-4-6',
        contextWindow: 200000,
        supportsVision: true,
      },
    ],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    requiresApiKey: true,
    apiKeyEnvVar: 'OPENAI_API_KEY',
    models: [
      {
        id: 'gpt-5-codex',
        displayName: 'GPT 5 Codex',
        provider: 'openai',
        fullId: 'openai/gpt-5-codex',
        contextWindow: 1000000,
        supportsVision: true,
      },
    ],
  },
  {
    id: 'google',
    name: 'Google AI',
    requiresApiKey: true,
    apiKeyEnvVar: 'GOOGLE_GENERATIVE_AI_API_KEY',
    models: [
      {
        id: 'gemini-3-pro-preview',
        displayName: 'Gemini 3 Pro',
        provider: 'google',
        fullId: 'google/gemini-3-pro-preview',
        contextWindow: 2000000,
        supportsVision: true,
      },
      {
        id: 'gemini-3-flash-preview',
        displayName: 'Gemini 3 Flash',
        provider: 'google',
        fullId: 'google/gemini-3-flash-preview',
        contextWindow: 1000000,
        supportsVision: true,
      },
    ],
  },
  {
    id: 'xai',
    name: 'xAI',
    requiresApiKey: true,
    apiKeyEnvVar: 'XAI_API_KEY',
    baseUrl: 'https://api.x.ai',
    models: [
      {
        id: 'grok-4',
        displayName: 'Grok 4',
        provider: 'xai',
        fullId: 'xai/grok-4',
        contextWindow: 256000,
        supportsVision: true,
      },
      {
        id: 'grok-3',
        displayName: 'Grok 3',
        provider: 'xai',
        fullId: 'xai/grok-3',
        contextWindow: 131000,
        supportsVision: false,
      },
    ],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    requiresApiKey: true,
    apiKeyEnvVar: 'DEEPSEEK_API_KEY',
    baseUrl: 'https://api.deepseek.com',
    models: [
      {
        id: 'deepseek-chat',
        displayName: 'DeepSeek Chat (V3)',
        provider: 'deepseek',
        fullId: 'deepseek/deepseek-chat',
        contextWindow: 64000,
        supportsVision: false,
      },
      {
        id: 'deepseek-reasoner',
        displayName: 'DeepSeek Reasoner (R1)',
        provider: 'deepseek',
        fullId: 'deepseek/deepseek-reasoner',
        contextWindow: 64000,
        supportsVision: false,
      },
    ],
  },
  {
    id: 'zai',
    name: 'Z.AI Coding Plan',
    requiresApiKey: true,
    apiKeyEnvVar: 'ZAI_API_KEY',
    baseUrl: 'https://open.bigmodel.cn',
    models: [
      {
        id: 'glm-4.7-flashx',
        displayName: 'GLM-4.7 FlashX (Latest)',
        provider: 'zai',
        fullId: 'zai/glm-4.7-flashx',
        contextWindow: 200000,
        supportsVision: false,
      },
      {
        id: 'glm-4.7',
        displayName: 'GLM-4.7',
        provider: 'zai',
        fullId: 'zai/glm-4.7',
        contextWindow: 200000,
        supportsVision: false,
      },
      {
        id: 'glm-4.7-flash',
        displayName: 'GLM-4.7 Flash',
        provider: 'zai',
        fullId: 'zai/glm-4.7-flash',
        contextWindow: 200000,
        supportsVision: false,
      },
      {
        id: 'glm-4.6',
        displayName: 'GLM-4.6',
        provider: 'zai',
        fullId: 'zai/glm-4.6',
        contextWindow: 200000,
        supportsVision: false,
      },
      {
        id: 'glm-4.5-flash',
        displayName: 'GLM-4.5 Flash',
        provider: 'zai',
        fullId: 'zai/glm-4.5-flash',
        contextWindow: 128000,
        supportsVision: false,
      },
    ],
  },
  {
    id: 'kimi',
    name: 'Kimi',
    requiresApiKey: true,
    apiKeyEnvVar: 'MOONSHOT_API_KEY',
    baseUrl: 'https://api.moonshot.ai',
    models: [
      {
        id: 'kimi-k2.5',
        displayName: 'Kimi K2.5',
        provider: 'kimi',
        fullId: 'kimi/kimi-k2.5',
        contextWindow: 128000,
        supportsVision: true,
      },
      {
        id: 'kimi-k2-0905-preview',
        displayName: 'Kimi K2 0905 Preview',
        provider: 'kimi',
        fullId: 'kimi/kimi-k2-0905-preview',
        contextWindow: 128000,
        supportsVision: false,
      },
      {
        id: 'kimi-k2-turbo-preview',
        displayName: 'Kimi K2 Turbo Preview',
        provider: 'kimi',
        fullId: 'kimi/kimi-k2-turbo-preview',
        contextWindow: 128000,
        supportsVision: false,
      },
      {
        id: 'kimi-k2-thinking',
        displayName: 'Kimi K2 Thinking',
        provider: 'kimi',
        fullId: 'kimi/kimi-k2-thinking',
        contextWindow: 128000,
        supportsVision: false,
      },
      {
        id: 'kimi-k2-thinking-turbo',
        displayName: 'Kimi K2 Thinking Turbo',
        provider: 'kimi',
        fullId: 'kimi/kimi-k2-thinking-turbo',
        contextWindow: 128000,
        supportsVision: false,
      },
    ],
  },
  {
    id: 'minimax',
    name: 'Minimax',
    requiresApiKey: true,
    apiKeyEnvVar: 'MINIMAX_API_KEY',
    baseUrl: 'https://api.minimax.io',
    models: [
      {
        id: 'minimax-m2.5',
        displayName: 'Minimax M2.5',
        provider: 'minimax',
        fullId: 'minimax/minimax-m2.5',
        contextWindow: 128000,
        supportsVision: false,
      },
      {
        id: 'minimax-m2.5-highspeed',
        displayName: 'Minimax M2.5 Highspeed',
        provider: 'minimax',
        fullId: 'minimax/minimax-m2.5-highspeed',
        contextWindow: 128000,
        supportsVision: false,
      },
    ],
  },
];

export const DEFAULT_MODEL: SelectedModel = {
  provider: 'anthropic',
  model: 'anthropic/claude-opus-4-5',
};
