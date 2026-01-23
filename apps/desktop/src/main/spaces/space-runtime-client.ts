/**
 * Space Runtime Client - Calls the Python Lambda service
 */

import { SpaceDefinition } from './space-registry';
import type { BrandMemory } from '@brandwork/shared';

export interface SpaceExecutionInput {
  [key: string]: unknown;
  /** Brand memory context for spaces that use it */
  brand_memory?: BrandMemory;
}

export interface SpaceOutputAsset {
  type: 'image' | 'text' | 'file';
  url?: string;
  content?: string;
  metadata?: Record<string, unknown>;
}

export interface SpaceExecutionResult {
  success: boolean;
  outputAssets: SpaceOutputAsset[];
  error?: string;
  metadata?: {
    matched_space?: string;
    confidence?: number;
    matched_keywords?: string[];
    execution_time_ms?: number;
  };
}

export interface SpaceRuntimeConfig {
  baseUrl: string;
  timeout: number;
}

// Default configuration - can be overridden
// Use Lambda Function URL for direct invocation (faster, no API Gateway overhead)
const DEFAULT_CONFIG: SpaceRuntimeConfig = {
  baseUrl: process.env.SPACE_RUNTIME_URL || 'https://mp3a5rmdpmpqphordszcahy5bm0okvjt.lambda-url.ap-south-1.on.aws',
  timeout: 300000, // 5 minutes for long-running image generation
};

let config = { ...DEFAULT_CONFIG };

/**
 * Configure the Space Runtime client
 */
export function configureSpaceRuntime(newConfig: Partial<SpaceRuntimeConfig>): void {
  config = { ...config, ...newConfig };
}

/**
 * Get current configuration
 */
export function getSpaceRuntimeConfig(): SpaceRuntimeConfig {
  return { ...config };
}

/**
 * Check if the Space Runtime service is available
 */
export async function isSpaceRuntimeAvailable(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch(`${config.baseUrl}/health`, {
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * List all available spaces from the runtime service
 */
export async function listSpacesFromRuntime(): Promise<SpaceDefinition[]> {
  const response = await fetch(`${config.baseUrl}/spaces`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });
  
  if (!response.ok) {
    throw new Error(`Failed to list spaces: ${response.statusText}`);
  }
  
  return response.json();
}

/**
 * Execute a space with the given inputs
 * @param spaceId - The space ID to execute
 * @param inputs - Space-specific inputs
 * @param options - Additional options including brand memory
 * @param onProgress - Progress callback for streaming updates
 */
export async function executeSpace(
  spaceId: string,
  inputs: SpaceExecutionInput,
  options?: {
    brandMemory?: BrandMemory;
  },
  onProgress?: (event: ProgressEvent) => void
): Promise<SpaceExecutionResult> {
  const startTime = Date.now();
  
  console.log(`[SpaceRuntime] Executing space: ${spaceId}`);
  console.log(`[SpaceRuntime] Inputs:`, JSON.stringify(inputs, null, 2));
  
  // Inject brand memory if provided
  const finalInputs: SpaceExecutionInput = { ...inputs };
  if (options?.brandMemory) {
    finalInputs.brand_memory = options.brandMemory;
    console.log(`[SpaceRuntime] Brand memory injected for space: ${spaceId}`);
  }
  
  try {
    const response = await fetch(`${config.baseUrl}/spaces/${spaceId}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inputs: finalInputs }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Space execution failed: ${response.status} - ${errorText}`);
    }
    
    const result: SpaceExecutionResult = await response.json();
    
    // Add execution time
    result.metadata = {
      ...result.metadata,
      execution_time_ms: Date.now() - startTime,
    };
    
    console.log(`[SpaceRuntime] Execution completed in ${result.metadata.execution_time_ms}ms`);
    console.log(`[SpaceRuntime] Result:`, JSON.stringify(result, null, 2));
    
    return result;
  } catch (error) {
    console.error(`[SpaceRuntime] Execution failed:`, error);
    return {
      success: false,
      outputAssets: [],
      error: error instanceof Error ? error.message : 'Unknown error',
      metadata: {
        execution_time_ms: Date.now() - startTime,
      },
    };
  }
}

/**
 * Match a prompt and execute the matched space
 */
export async function matchAndExecute(
  prompt: string,
  inputs: SpaceExecutionInput
): Promise<SpaceExecutionResult> {
  const response = await fetch(`${config.baseUrl}/match-and-execute?prompt=${encodeURIComponent(prompt)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ inputs }),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Match and execute failed: ${response.status} - ${errorText}`);
  }
  
  return response.json();
}

/**
 * Match a prompt to a space (without executing)
 */
export async function matchPromptRemote(prompt: string): Promise<{
  matched: boolean;
  space?: SpaceDefinition;
  confidence: number;
  matchedKeywords: string[];
}> {
  const response = await fetch(`${config.baseUrl}/match?prompt=${encodeURIComponent(prompt)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  
  if (!response.ok) {
    throw new Error(`Match failed: ${response.statusText}`);
  }
  
  return response.json();
}

// Progress event type for streaming updates
interface ProgressEvent {
  type: 'progress' | 'image' | 'complete' | 'error';
  id?: string;
  status?: string;
  url?: string;
  label?: string;
  message?: string;
}

/**
 * Brand asset upload input
 */
export interface BrandAssetUploadInput {
  brandId: string;
  assetType: 'logos' | 'characters' | 'scenes' | 'site-images';
  filename: string;
  contentType: string;
  imageBase64: string;
}

/**
 * Brand asset upload result
 */
export interface BrandAssetUploadResult {
  success: boolean;
  url?: string;
  error?: string;
}

/**
 * Upload a brand asset (logo, character, scene, site image) to S3
 * @param input - Asset upload details
 * @returns The public S3 URL of the uploaded asset
 */
export async function uploadBrandAsset(
  input: BrandAssetUploadInput
): Promise<BrandAssetUploadResult> {
  console.log(`[SpaceRuntime] Uploading brand asset: ${input.assetType}/${input.filename}`);
  
  try {
    const response = await fetch(`${config.baseUrl}/upload-brand-asset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        brand_id: input.brandId,
        asset_type: input.assetType,
        filename: input.filename,
        content_type: input.contentType,
        image_base64: input.imageBase64,
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Upload failed: ${response.status} - ${errorText}`);
    }
    
    const result = await response.json();
    
    if (result.success) {
      console.log(`[SpaceRuntime] Asset uploaded successfully: ${result.url}`);
      return { success: true, url: result.url };
    } else {
      throw new Error(result.error || 'Upload failed');
    }
  } catch (error) {
    console.error(`[SpaceRuntime] Asset upload failed:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ============================================
// Chat Attachment Upload
// ============================================

/**
 * Chat attachment upload input
 */
export interface ChatAttachmentUploadInput {
  taskId: string;
  filename: string;
  contentType: string;
  base64Data: string;
}

/**
 * Chat attachment upload result
 */
export interface ChatAttachmentUploadResult {
  success: boolean;
  url?: string;
  fileId?: string;
  error?: string;
}

/**
 * Upload a chat attachment to S3
 * Files are stored in: chat-attachments/{taskId}/{filename}
 * Files auto-delete after 7 days via S3 lifecycle policy
 * 
 * @param input - Attachment upload details
 * @returns The public S3 URL and file ID
 */
export async function uploadChatAttachment(
  input: ChatAttachmentUploadInput
): Promise<ChatAttachmentUploadResult> {
  console.log(`[SpaceRuntime] Uploading chat attachment: ${input.filename} for task ${input.taskId}`);
  
  try {
    const response = await fetch(`${config.baseUrl}/upload-chat-attachment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        task_id: input.taskId,
        filename: input.filename,
        content_type: input.contentType,
        base64_data: input.base64Data,
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Upload failed: ${response.status} - ${errorText}`);
    }
    
    const result = await response.json();
    
    if (result.success) {
      console.log(`[SpaceRuntime] Chat attachment uploaded: ${result.url}`);
      return { success: true, url: result.url, fileId: result.file_id };
    } else {
      throw new Error(result.error || 'Upload failed');
    }
  } catch (error) {
    console.error(`[SpaceRuntime] Chat attachment upload failed:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ============================================
// Generated Image Upload
// ============================================

/**
 * Generated image upload input
 */
export interface GeneratedImageUploadInput {
  taskId: string;
  filename: string;
  base64Data: string;
}

/**
 * Generated image upload result
 */
export interface GeneratedImageUploadResult {
  success: boolean;
  url?: string;
  error?: string;
}

/**
 * Upload an AI-generated image to S3 for persistence
 * Files are stored in: generated-images/{taskId}/{filename}
 * Files auto-delete after 7 days via S3 lifecycle policy
 * 
 * @param input - Generated image upload details
 * @returns The public S3 URL
 */
export async function uploadGeneratedImage(
  input: GeneratedImageUploadInput
): Promise<GeneratedImageUploadResult> {
  console.log(`[SpaceRuntime] Uploading generated image: ${input.filename} for task ${input.taskId}`);
  
  try {
    const response = await fetch(`${config.baseUrl}/upload-generated-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        task_id: input.taskId,
        filename: input.filename,
        base64_data: input.base64Data,
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Upload failed: ${response.status} - ${errorText}`);
    }
    
    const result = await response.json();
    
    if (result.success) {
      console.log(`[SpaceRuntime] Generated image uploaded: ${result.url}`);
      return { success: true, url: result.url };
    } else {
      throw new Error(result.error || 'Upload failed');
    }
  } catch (error) {
    console.error(`[SpaceRuntime] Generated image upload failed:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
