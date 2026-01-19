# Provider Settings Redesign

## Overview

Replace the existing tabbed settings dialog with a new provider-centric design. Users will see a visual grid of AI providers, connect to multiple providers, and select one as active. The settings dialog will auto-pop when launching a task if no provider is "ready" (connected + model selected).

## Provider Categories

| Category | Providers | Auth Method | Model Source |
|----------|-----------|-------------|--------------|
| Classic (API Key) | Anthropic, OpenAI, Gemini, DeepSeek, Z-AI, XAI | API Key | Preset from config file |
| AWS | Bedrock | Access Key OR AWS Profile | Fetched from AWS |
| Local Server | Ollama | Server URL | Fetched from server |
| Proxy Service | OpenRouter | API Key | Fetched from API |
| Hybrid | LiteLLM | Server URL + Optional API Key | Fetched from server |

## Connection States

| State | Definition | Ready to Run? |
|-------|------------|---------------|
| Not Connected | No credentials stored | No |
| Connected (No Model) | Credentials valid, no model selected | No |
| Ready | Credentials valid AND model selected | Yes |

## Data Model

```typescript
interface ProviderSettings {
  activeProviderId: ProviderId | null;
  connectedProviders: Record<ProviderId, ConnectedProvider>;
  debugMode: boolean;
}

type ProviderId = 'anthropic' | 'openai' | 'google' | 'xai' | 'deepseek' |
                  'zai' | 'bedrock' | 'ollama' | 'openrouter' | 'litellm';

interface ConnectedProvider {
  providerId: ProviderId;
  connectionStatus: 'connected' | 'error';
  selectedModelId: string | null;
  credentials: ProviderCredentials;
  lastConnectedAt: string;
}

type ProviderCredentials =
  | ApiKeyCredentials
  | BedrockCredentials
  | OllamaCredentials
  | OpenRouterCredentials
  | LiteLLMCredentials;

interface ApiKeyCredentials {
  type: 'api_key';
  keyPrefix: string;
}

interface BedrockCredentials {
  type: 'bedrock';
  authMethod: 'accessKey' | 'profile';
  region: string;
  accessKeyIdPrefix?: string;
  profileName?: string;
}

interface OllamaCredentials {
  type: 'ollama';
  serverUrl: string;
}

interface OpenRouterCredentials {
  type: 'openrouter';
  keyPrefix: string;
}

interface LiteLLMCredentials {
  type: 'litellm';
  serverUrl: string;
  hasApiKey: boolean;
  keyPrefix?: string;
}
```

## Ready-to-Run Logic

```typescript
function isProviderReady(provider: ConnectedProvider): boolean {
  return provider.connectionStatus === 'connected'
      && provider.selectedModelId !== null;
}

function hasAnyReadyProvider(settings: ProviderSettings): boolean {
  return Object.values(settings.connectedProviders).some(isProviderReady);
}
```

## UI Behavior

### Settings Dialog Auto-Pop Trigger

The settings dialog automatically opens when:
- User launches a task AND no provider is "ready" (connected + model selected)

It does NOT auto-pop on app launch.

### Provider Card States

| State | Visual | Click Behavior |
|-------|--------|----------------|
| Not Connected | Logo + name + "Service" label | Expand settings panel |
| Connected (no model) | Logo + name + key badge | Expand settings, show model dropdown with error |
| Ready | Logo + name + key badge | Expand settings |
| Active & Ready | Green border + key badge | Already expanded |

### Closing the Dialog

- Both "Done" button and X close button have the same behavior: save and close
- Dialog CANNOT be closed if no provider is "ready"
- If no ready provider: Model dropdown shows red border, "Missing Model" error

### Provider Grid

- Search input filters providers by name
- "Show All" expands to full grid (3 columns, all providers)
- Default view shows one row of providers
- Clicking a provider card:
  - Collapses grid to single row
  - Expands that provider's settings panel below

## User Flows

### Connect Classic Provider (Anthropic, OpenAI, etc.)

1. User clicks provider card
2. Settings panel expands: API Key input, "How can I find it?" link, Connect button
3. User enters API key, clicks Connect
4. System validates key with provider API
5. Success: Shows "Connected" (green), trash icon, Model dropdown appears
6. User selects model from preset list
7. Provider is "ready"

### Connect Bedrock

1. User clicks Bedrock card
2. Settings panel shows toggle: `[Access Key] [AWS Profile]`
3. Access Key mode: Access Key ID, Secret Access Key, Session Token (optional), Region
4. AWS Profile mode: Profile Name, Region
5. User clicks Connect
6. System validates with AWS SDK
7. Success: Model dropdown appears (fetched from AWS)
8. User selects model

### Connect Ollama

1. User clicks Ollama card
2. Settings panel: Server URL input (default: `https://localhost:12345`)
3. User clicks Connect
4. System fetches models from `/api/tags`
5. Success: Model dropdown populated with discovered models
6. Error: Shows error message, can retry

### Connect OpenRouter

1. User clicks OpenRouter card
2. Settings panel: API Key input, Connect button
3. User enters key, clicks Connect
4. System validates and fetches available models
5. Success: Model dropdown populated

### Connect LiteLLM

1. User clicks LiteLLM card
2. Settings panel: Server URL input, API Key input (optional)
3. User clicks Connect
4. System fetches models from server
5. Success: Model dropdown populated

### Switch Active Provider

1. User has Provider A active (green border)
2. Provider B is also connected with model selected
3. User clicks Provider B card
4. Provider B's settings panel expands
5. User clicks Done
6. Provider B becomes active (green border moves)

## Component Architecture

```
components/settings/
├── SettingsDialog.tsx           # Main dialog container
├── ProviderGrid.tsx             # Provider cards grid with search
├── ProviderCard.tsx             # Individual provider card
├── ProviderSettings.tsx         # Settings panel router
│
├── providers/
│   ├── ClassicProviderForm.tsx  # Anthropic, OpenAI, Gemini, DeepSeek, Z-AI, XAI
│   ├── BedrockProviderForm.tsx  # AWS Bedrock with auth tabs
│   ├── OllamaProviderForm.tsx   # Local Ollama
│   ├── OpenRouterProviderForm.tsx
│   └── LiteLLMProviderForm.tsx
│
├── shared/
│   ├── ModelSelector.tsx        # Dropdown for models
│   ├── ConnectionStatus.tsx     # Connected/Connecting/Error
│   ├── ApiKeyInput.tsx          # Password input + help link
│   └── RegionSelector.tsx       # AWS region dropdown
│
└── hooks/
    ├── useProviderConnection.ts # Connect/disconnect logic
    ├── useModelFetch.ts         # Fetch models for dynamic providers
    └── useProviderSettings.ts   # Read/write settings
```

## Files to Create/Modify

### New Files

- `components/settings/ProviderGrid.tsx`
- `components/settings/ProviderCard.tsx`
- `components/settings/ProviderSettings.tsx`
- `components/settings/providers/ClassicProviderForm.tsx`
- `components/settings/providers/BedrockProviderForm.tsx`
- `components/settings/providers/OllamaProviderForm.tsx`
- `components/settings/providers/OpenRouterProviderForm.tsx`
- `components/settings/providers/LiteLLMProviderForm.tsx`
- `components/settings/shared/ModelSelector.tsx`
- `components/settings/shared/ConnectionStatus.tsx`
- `components/settings/shared/ApiKeyInput.tsx`
- `components/settings/shared/RegionSelector.tsx`
- `components/settings/hooks/useProviderConnection.ts`
- `components/settings/hooks/useModelFetch.ts`
- `components/settings/hooks/useProviderSettings.ts`
- `main/store/providerSettings.ts`
- `shared/types/providerSettings.ts`

### Modify

- `components/layout/SettingsDialog.tsx` - Replace internals with new components
- `preload/index.ts` - Add new IPC methods for provider settings
- `main/ipc/handlers.ts` - Add handlers for provider operations
- Task launch logic - Add check for ready provider, trigger settings dialog

## Migration

No migration from existing settings. Users will need to reconfigure their providers.

## Out of Scope

- Periodic credential validation
- API key expiry detection
- Credential refresh/rotation
