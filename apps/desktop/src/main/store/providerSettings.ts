// apps/desktop/src/main/store/providerSettings.ts

import Store from 'electron-store';
import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import type { ProviderSettings, ProviderId, ConnectedProvider, SubscriptionCredentials } from '@shopos/shared';
import { DEFAULT_MODELS } from '@shopos/shared';

const DEFAULT_SETTINGS: ProviderSettings = {
  activeProviderId: null,
  connectedProviders: {},
  debugMode: false,
};

const providerSettingsStore = new Store<ProviderSettings>({
  name: 'provider-settings',
  defaults: DEFAULT_SETTINGS,
});

export function getProviderSettings(): ProviderSettings {
  return {
    activeProviderId: providerSettingsStore.get('activeProviderId') ?? null,
    connectedProviders: providerSettingsStore.get('connectedProviders') ?? {},
    debugMode: providerSettingsStore.get('debugMode') ?? false,
  };
}

export function setActiveProvider(providerId: ProviderId | null): void {
  providerSettingsStore.set('activeProviderId', providerId);
}

export function getActiveProviderId(): ProviderId | null {
  return providerSettingsStore.get('activeProviderId');
}

export function getConnectedProvider(providerId: ProviderId): ConnectedProvider | null {
  const providers = providerSettingsStore.get('connectedProviders');
  return providers[providerId] ?? null;
}

export function setConnectedProvider(providerId: ProviderId, provider: ConnectedProvider): void {
  const providers = providerSettingsStore.get('connectedProviders');
  providerSettingsStore.set('connectedProviders', {
    ...providers,
    [providerId]: provider,
  });
}

export function removeConnectedProvider(providerId: ProviderId): void {
  const providers = providerSettingsStore.get('connectedProviders');
  const { [providerId]: _, ...rest } = providers;
  providerSettingsStore.set('connectedProviders', rest);

  // If this was the active provider, clear it
  if (providerSettingsStore.get('activeProviderId') === providerId) {
    providerSettingsStore.set('activeProviderId', null);
  }
}

export function updateProviderModel(providerId: ProviderId, modelId: string | null): void {
  const provider = getConnectedProvider(providerId);
  if (provider) {
    setConnectedProvider(providerId, {
      ...provider,
      selectedModelId: modelId,
    });
  }
}

export function setProviderDebugMode(enabled: boolean): void {
  providerSettingsStore.set('debugMode', enabled);
}

export function getProviderDebugMode(): boolean {
  return providerSettingsStore.get('debugMode');
}

export function clearProviderSettings(): void {
  providerSettingsStore.clear();
}

/**
 * Get the active provider's model for CLI args
 * Returns null if no active provider or no model selected
 */
export function getActiveProviderModel(): { provider: ProviderId; model: string; baseUrl?: string } | null {
  const settings = getProviderSettings();
  const activeId = settings.activeProviderId;

  if (!activeId) return null;

  const activeProvider = settings.connectedProviders[activeId];
  if (!activeProvider || !activeProvider.selectedModelId) return null;

  const result: { provider: ProviderId; model: string; baseUrl?: string } = {
    provider: activeId,
    model: activeProvider.selectedModelId,
  };

  // Add baseUrl for Ollama/LiteLLM (safely check credentials exists)
  if (activeProvider.credentials?.type === 'ollama') {
    result.baseUrl = activeProvider.credentials.serverUrl;
  } else if (activeProvider.credentials?.type === 'litellm') {
    result.baseUrl = activeProvider.credentials.serverUrl;
  }

  return result;
}

/**
 * Check if any provider is ready (connected with model selected)
 */
export function hasReadyProvider(): boolean {
  const settings = getProviderSettings();
  return Object.values(settings.connectedProviders).some(
    p => p && p.connectionStatus === 'connected' && p.selectedModelId !== null
  );
}

/**
 * Get all connected provider IDs for enabled_providers config
 */
export function getConnectedProviderIds(): ProviderId[] {
  const settings = getProviderSettings();
  return Object.values(settings.connectedProviders)
    .filter((p): p is ConnectedProvider => p !== undefined && p.connectionStatus === 'connected')
    .map(p => p.providerId);
}

/**
 * Get the path to global OpenCode CLI auth.json
 * This is where OpenCode stores OAuth tokens from `opencode login`
 */
function getGlobalOpenCodeAuthPath(): string {
  const xdgDataHome = process.env.XDG_DATA_HOME || path.join(app.getPath('home'), '.local', 'share');
  return path.join(xdgDataHome, 'opencode', 'auth.json');
}

/**
 * Check if OpenCode CLI has Anthropic OAuth authentication configured globally
 * Returns true if auth.json exists and has anthropic with type: 'oauth'
 */
export function hasOpenCodeAnthropicSubscription(): boolean {
  try {
    const authPath = getGlobalOpenCodeAuthPath();
    if (!fs.existsSync(authPath)) {
      console.log('[ProviderSettings] No global OpenCode auth.json found at:', authPath);
      return false;
    }
    
    const authData = JSON.parse(fs.readFileSync(authPath, 'utf-8'));
    const hasAnthropicOAuth = authData?.anthropic?.type === 'oauth' && authData?.anthropic?.access;
    
    if (hasAnthropicOAuth) {
      console.log('[ProviderSettings] Found Anthropic OAuth subscription in global OpenCode auth');
    } else {
      console.log('[ProviderSettings] No Anthropic OAuth found in global OpenCode auth');
    }
    
    return hasAnthropicOAuth;
  } catch (error) {
    console.error('[ProviderSettings] Error checking OpenCode subscription:', error);
    return false;
  }
}

/**
 * Initialize subscription-based provider if:
 * 1. App is packaged (production build)
 * 2. No provider is currently configured
 * 3. OpenCode CLI has Anthropic OAuth subscription
 * 
 * This allows users with OpenCode subscription to use the app immediately
 * without manually configuring an API key.
 */
export function initializeSubscriptionProviderIfNeeded(): boolean {
  // Always disabled - we only use user-provided API keys, never global subscriptions
  const useSubscriptionMode = false;
    
  if (!useSubscriptionMode) {
    console.log('[ProviderSettings] Subscription mode not active, skipping auto-init');
    return false;
  }
  
  // Check if any provider is already configured
  const settings = getProviderSettings();
  const hasAnyProvider = Object.keys(settings.connectedProviders).length > 0;
  
  if (hasAnyProvider) {
    console.log('[ProviderSettings] Providers already configured, skipping subscription auto-init');
    return false;
  }
  
  // Check if OpenCode has Anthropic OAuth
  if (!hasOpenCodeAnthropicSubscription()) {
    console.log('[ProviderSettings] No OpenCode Anthropic subscription found, skipping auto-init');
    return false;
  }
  
  // Auto-configure Anthropic provider with subscription credentials
  console.log('[ProviderSettings] Auto-configuring Anthropic provider from OpenCode subscription');
  
  const subscriptionCredentials: SubscriptionCredentials = {
    type: 'subscription',
  };
  
  const anthropicProvider: ConnectedProvider = {
    providerId: 'anthropic',
    connectionStatus: 'connected',
    selectedModelId: DEFAULT_MODELS.anthropic || 'anthropic/claude-sonnet-4-5',
    credentials: subscriptionCredentials,
    lastConnectedAt: new Date().toISOString(),
  };
  
  setConnectedProvider('anthropic', anthropicProvider);
  setActiveProvider('anthropic');
  
  console.log('[ProviderSettings] Anthropic provider auto-configured with subscription auth');
  return true;
}
