/**
 * Configuration builder for Claude Agent SDK
 * 
 * Builds the SDK options from app settings, including:
 * - MCP server configurations
 * - Model selection
 * - System prompt customization
 * - Permission mode
 */

import path from 'path';
import { app } from 'electron';
import { getSkillsPath } from '../opencode/config-generator';
import { getAllApiKeys, getBedrockCredentials } from '../store/secureStorage';
import { generateBrandContext } from '../store/brandMemory';
import { getActiveProviderModel } from '../store/providerSettings';
import { getSelectedModel } from '../store/appSettings';
import { getBundledNodePaths } from '../utils/bundled-node';
import type { McpServerConfig, McpServerStdio, McpServerHttp } from './types';
import { DEV_BROWSER_PORT } from '@brandwork/shared';

// Space Runtime URL - defaults to Lambda endpoint
const SPACE_RUNTIME_URL = process.env.SPACE_RUNTIME_URL || 'https://mp3a5rmdpmpqphordszcahy5bm0okvjt.lambda-url.ap-south-1.on.aws';

/**
 * Build MCP server configurations for the SDK
 */
export function buildMcpServers(): Record<string, McpServerConfig> {
  const skillsPath = getSkillsPath();
  const bundledNode = getBundledNodePaths();
  const nodePath = bundledNode?.nodePath || 'node';
  
  // Build environment with bundled node
  const nodeEnv: Record<string, string> = {};
  if (bundledNode) {
    const delimiter = process.platform === 'win32' ? ';' : ':';
    nodeEnv.PATH = `${bundledNode.binDir}${delimiter}${process.env.PATH || ''}`;
    nodeEnv.NODE_BIN_PATH = bundledNode.binDir;
  }

  const servers: Record<string, McpServerConfig> = {
    // Dev Browser MCP - local stdio server for browser automation
    'dev-browser-mcp': {
      command: nodePath,
      args: [path.join(skillsPath, 'dev-browser-mcp', 'dist', 'index.js')],
      env: {
        ...nodeEnv,
        DEV_BROWSER_URL: `http://localhost:${DEV_BROWSER_PORT}`,
      },
    } as McpServerStdio,

    // File Permission MCP - local stdio server for permission API
    'file-permission': {
      command: nodePath,
      args: [path.join(skillsPath, 'file-permission', 'dist', 'index.js')],
      env: nodeEnv,
    } as McpServerStdio,

    // Ask User Question MCP - local stdio server for user prompts
    'ask-user-question': {
      command: nodePath,
      args: [path.join(skillsPath, 'ask-user-question', 'dist', 'index.js')],
      env: nodeEnv,
    } as McpServerStdio,

    // Skill Loader MCP - local stdio server for marketing skills
    'skill-loader': {
      command: nodePath,
      args: [path.join(skillsPath, 'skill-loader', 'dist', 'index.js')],
      env: nodeEnv,
    } as McpServerStdio,
  };

  // Add Space Runtime if configured (remote HTTP server)
  if (SPACE_RUNTIME_URL) {
    servers['space-runtime'] = {
      type: 'http',
      url: SPACE_RUNTIME_URL,
      headers: {
        'Content-Type': 'application/json',
      },
    } as McpServerHttp;
  }

  return servers;
}

/**
 * Build allowed tools list for the SDK
 */
export function buildAllowedTools(): string[] {
  return [
    // Built-in SDK tools
    'Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep',
    'WebSearch', 'WebFetch', 'TodoWrite',
    
    // Skills support
    'Skill',
    
    // Task/subagent support
    'Task',
    
    // MCP tools (wildcard patterns)
    'mcp__dev-browser-mcp__*',
    'mcp__file-permission__*',
    'mcp__ask-user-question__*',
    'mcp__skill-loader__*',
    'mcp__space-runtime__*',
  ];
}

/**
 * Get the model string for the SDK based on provider settings
 */
export async function getModelForSdk(): Promise<string | undefined> {
  const activeModel = getActiveProviderModel();
  const selectedModel = activeModel || getSelectedModel();
  
  if (!selectedModel?.model) {
    return undefined;
  }

  // Map provider to SDK-compatible model string
  const { provider, model } = selectedModel;
  
  switch (provider) {
    case 'anthropic':
      // SDK uses model ID directly for Anthropic
      return model;
    
    case 'bedrock':
      // Bedrock models need region prefix
      const region = getBedrockCredentials()?.region || 'us-east-1';
      return `bedrock/${region}/${model}`;
    
    case 'glm':
      // GLM/Zhipu models use glm/ prefix
      // Model might already include prefix, handle both cases
      if (model.startsWith('glm/')) {
        return model;
      }
      return `glm/${model}`;
    
    case 'deepseek':
      // DeepSeek models use deepseek/ prefix
      if (model.startsWith('deepseek/')) {
        return model;
      }
      return `deepseek/${model}`;
    
    case 'zai':
      // Z.AI Coding Plan uses zai-coding-plan/ prefix
      if (model.startsWith('zai-coding-plan/')) {
        return model;
      }
      const modelId = model.split('/').pop();
      return `zai-coding-plan/${modelId}`;
    
    case 'xai':
      // xAI/Grok models use xai/ prefix
      if (model.startsWith('xai/')) {
        return model;
      }
      return `xai/${model}`;
    
    case 'google':
      // Google/Gemini models use google/ prefix
      if (model.startsWith('google/')) {
        return model;
      }
      return `google/${model}`;
    
    case 'openai':
      // OpenAI models use openai/ prefix
      if (model.startsWith('openai/')) {
        return model;
      }
      return `openai/${model}`;
    
    case 'openrouter':
    case 'ollama':
    case 'litellm':
      // These pass through directly (already have provider prefix)
      return model;
    
    default:
      return model;
  }
}

/**
 * Build environment variables for the SDK
 * API keys are passed via environment
 */
export async function buildEnvironment(): Promise<Record<string, string>> {
  const env: Record<string, string> = {};
  
  // Load all API keys
  const apiKeys = await getAllApiKeys();
  
  // Anthropic
  if (apiKeys.anthropic) {
    env.ANTHROPIC_API_KEY = apiKeys.anthropic;
  }
  
  // OpenAI
  if (apiKeys.openai) {
    env.OPENAI_API_KEY = apiKeys.openai;
  }
  
  // Google (Gemini)
  if (apiKeys.google) {
    env.GOOGLE_GENERATIVE_AI_API_KEY = apiKeys.google;
  }
  
  // xAI (Grok)
  if (apiKeys.xai) {
    env.XAI_API_KEY = apiKeys.xai;
  }
  
  // DeepSeek
  if (apiKeys.deepseek) {
    env.DEEPSEEK_API_KEY = apiKeys.deepseek;
  }
  
  // Z.AI
  if (apiKeys.zai) {
    env.ZAI_API_KEY = apiKeys.zai;
  }
  
  // GLM (Zhipu AI)
  if (apiKeys.glm) {
    env.GLM_API_KEY = apiKeys.glm;
    env.ZHIPU_API_KEY = apiKeys.glm; // Alternative env var name
  }
  
  // OpenRouter
  if (apiKeys.openrouter) {
    env.OPENROUTER_API_KEY = apiKeys.openrouter;
  }
  
  // LiteLLM
  if (apiKeys.litellm) {
    env.LITELLM_API_KEY = apiKeys.litellm;
  }
  
  // Bedrock credentials
  const bedrockCredentials = getBedrockCredentials();
  if (bedrockCredentials) {
    if (bedrockCredentials.authType === 'accessKeys') {
      env.AWS_ACCESS_KEY_ID = bedrockCredentials.accessKeyId || '';
      env.AWS_SECRET_ACCESS_KEY = bedrockCredentials.secretAccessKey || '';
      if (bedrockCredentials.sessionToken) {
        env.AWS_SESSION_TOKEN = bedrockCredentials.sessionToken;
      }
    } else if (bedrockCredentials.authType === 'profile' && bedrockCredentials.profileName) {
      env.AWS_PROFILE = bedrockCredentials.profileName;
    }
    if (bedrockCredentials.region) {
      env.AWS_REGION = bedrockCredentials.region;
    }
  }
  
  // Provider-specific base URLs
  const activeModel = getActiveProviderModel();
  
  // Ollama host
  if (activeModel?.provider === 'ollama' && activeModel.baseUrl) {
    env.OLLAMA_HOST = activeModel.baseUrl;
  }
  
  // LiteLLM base URL
  if (activeModel?.provider === 'litellm' && activeModel.baseUrl) {
    env.LITELLM_BASE_URL = activeModel.baseUrl;
  }
  
  // GLM base URL (if custom)
  if (activeModel?.provider === 'glm' && activeModel.baseUrl) {
    env.GLM_BASE_URL = activeModel.baseUrl;
  }
  
  return env;
}

/**
 * Get the system prompt for the agent
 * This is appended to the Claude Code preset prompt
 */
export function getSystemPrompt(): string {
  // Get active brand context
  const brandContext = generateBrandContext();

  // Return brand-specific instructions that augment Claude Code's default
  return `
You are an AI assistant for e-commerce brands. When working with this user:

1. **Brand Voice**: Maintain consistency with the brand guidelines below.
2. **E-commerce Focus**: Prioritize solutions that work well for online retail
3. **Shopify Awareness**: When working with Shopify, use best practices for the platform
4. **Image Generation**: Use the space-runtime tools for product photography and image generation
5. **Browser Automation**: Use the dev-browser tools for web scraping, competitor research, and testing

${brandContext}

Always be helpful, accurate, and respect the user's time.
`.trim();
}

/**
 * Get the working directory for SDK operations
 * Uses temp directory to avoid macOS TCC permission prompts
 */
export function getWorkingDirectory(customDir?: string): string {
  return customDir || app.getPath('temp');
}
