# Amazon Bedrock Provider Support

**Date:** 2026-01-17
**Status:** Approved

## Overview

Add Amazon Bedrock as a cloud provider to the Openwork desktop app settings page, enabling users to use Claude models hosted on AWS Bedrock.

## Requirements

1. Support two authentication methods:
   - AWS Access Key ID + Secret Access Key
   - AWS Profile name (from `~/.aws/credentials`)
2. User-configurable region with `us-east-1` as default
3. Validate credentials using Bedrock ListFoundationModels API
4. Support Claude 4.5 models (Opus, Sonnet, Haiku)

## Authentication & Storage

### Authentication Methods

**Access Keys:**
- AWS Access Key ID (text input, placeholder: `AKIA...`)
- AWS Secret Access Key (password input)
- Region (text input, default: `us-east-1`)

**AWS Profile:**
- Profile Name (text input, default: `default`)
- Region (text input, default: `us-east-1`)

### Secure Storage

Store credentials in `secureStorage.ts` using existing AES-256-GCM encryption.

**Access Keys format:**
```typescript
{
  authType: 'accessKeys',
  accessKeyId: string,
  secretAccessKey: string,
  region: string
}
```

**Profile format:**
```typescript
{
  authType: 'profile',
  profileName: string,
  region: string
}
```

Storage key: `apiKey:bedrock`

### Type Updates

Add `'bedrock'` to:
- `ProviderType` union in `packages/shared/src/types/provider.ts`
- `ApiKeyProvider` type in `secureStorage.ts`

## Models

Add to `DEFAULT_PROVIDERS` in `provider.ts`:

```typescript
{
  id: 'bedrock',
  name: 'Amazon Bedrock',
  requiresApiKey: false, // Uses AWS credentials
  models: [
    {
      id: 'anthropic.claude-opus-4-5-20251101-v1:0',
      displayName: 'Claude Opus 4.5',
      provider: 'bedrock',
      fullId: 'amazon-bedrock/anthropic.claude-opus-4-5-20251101-v1:0',
      contextWindow: 200000,
      supportsVision: true,
    },
    {
      id: 'anthropic.claude-sonnet-4-5-20250929-v1:0',
      displayName: 'Claude Sonnet 4.5',
      provider: 'bedrock',
      fullId: 'amazon-bedrock/anthropic.claude-sonnet-4-5-20250929-v1:0',
      contextWindow: 200000,
      supportsVision: true,
    },
    {
      id: 'anthropic.claude-haiku-4-5-20251001-v1:0',
      displayName: 'Claude Haiku 4.5',
      provider: 'bedrock',
      fullId: 'amazon-bedrock/anthropic.claude-haiku-4-5-20251001-v1:0',
      contextWindow: 200000,
      supportsVision: true,
    },
  ],
}
```

## Validation

When user saves Bedrock credentials:
1. Build AWS credentials from either Access Keys or Profile
2. Call Bedrock `ListFoundationModels` API in the specified region
3. Check response for success
4. Return success or specific error:
   - Invalid credentials
   - No Bedrock access/permissions
   - Region not enabled for Bedrock

## Environment Variables

In `adapter.ts`, when Bedrock model is selected, set:

**For Access Keys:**
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION`

**For Profile:**
- `AWS_PROFILE`
- `AWS_REGION`

## UI Design

### Provider Selection

Add Bedrock button to provider grid alongside Anthropic, OpenAI, Google, xAI.

### Bedrock Credential Form

```
┌─────────────────────────────────────────┐
│  [Access Keys]  [AWS Profile]           │  ← Tabs
├─────────────────────────────────────────┤
│  Access Keys tab:                       │
│  ┌─────────────────────────────────┐    │
│  │ Access Key ID                   │    │
│  │ [AKIA________________]          │    │
│  └─────────────────────────────────┘    │
│  ┌─────────────────────────────────┐    │
│  │ Secret Access Key               │    │
│  │ [••••••••••••••••••]            │    │
│  └─────────────────────────────────┘    │
│  ┌─────────────────────────────────┐    │
│  │ Region                          │    │
│  │ [us-east-1_________]            │    │
│  └─────────────────────────────────┘    │
│                                         │
│  AWS Profile tab:                       │
│  ┌─────────────────────────────────┐    │
│  │ Profile Name                    │    │
│  │ [default___________]            │    │
│  └─────────────────────────────────┘    │
│  ┌─────────────────────────────────┐    │
│  │ Region                          │    │
│  │ [us-east-1_________]            │    │
│  └─────────────────────────────────┘    │
│                                         │
│  [Save Bedrock Credentials]             │
└─────────────────────────────────────────┘
```

### Model Dropdown

Bedrock models appear under "Amazon Bedrock" group, enabled when credentials are saved.

## Testing Strategy

### Unit Tests

**`secureStorage.test.ts`:**
- Store/retrieve access key credentials
- Store/retrieve profile-based credentials
- Delete Bedrock credentials
- Encryption/decryption of complex JSON objects

**`handlers.test.ts`:**
- Bedrock validation with mock AWS SDK
- Error handling for invalid credentials
- Error handling for region not enabled

### E2E Tests

**`settings-bedrock.spec.ts`:**
- Navigate to settings, select Bedrock provider
- Switch between Access Keys and AWS Profile tabs
- Fill in access key credentials and save
- Fill in profile credentials and save
- Verify saved credentials appear in list
- Delete Bedrock credentials
- Select Bedrock model from dropdown (when credentials saved)

### Mocking Strategy

- Mock AWS SDK `BedrockClient` for unit tests
- Use `E2E_SKIP_AUTH=1` pattern for E2E tests with mock validation responses

### Coverage Goals

- New code should have >80% line coverage
- All error paths tested

## Files to Modify

1. `packages/shared/src/types/provider.ts` - Add Bedrock provider type and models
2. `packages/shared/src/types/auth.ts` - Add Bedrock credential types
3. `apps/desktop/src/main/store/secureStorage.ts` - Add Bedrock to ApiKeyProvider
4. `apps/desktop/src/main/ipc/handlers.ts` - Add Bedrock validation handler
5. `apps/desktop/src/main/opencode/adapter.ts` - Set AWS env vars for Bedrock
6. `apps/desktop/src/renderer/components/layout/SettingsDialog.tsx` - Add Bedrock UI
7. `apps/desktop/src/preload/index.ts` - Update types if needed

## New Files

1. `apps/desktop/e2e/settings-bedrock.spec.ts` - E2E tests
2. Unit test files for new functionality

## Dependencies

- `@aws-sdk/client-bedrock` - For ListFoundationModels API validation
