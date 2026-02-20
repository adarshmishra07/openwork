#!/usr/bin/env node
/**
 * Space Runtime MCP Skill
 *
 * Exposes BrandWork spaces as MCP tools that Claude Code can call.
 * Automatically discovers spaces from the registry - adding a new space
 * to the registry automatically makes it available as an MCP tool.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';

// Space Runtime API URL - configurable via environment
// Old API Gateway URL (30s timeout limit): https://8yivyeg6kd.execute-api.ap-south-1.amazonaws.com
// Using Lambda Function URL for no timeout limit (Lambda timeout is 5 minutes)
const SPACE_RUNTIME_URL = process.env.SPACE_RUNTIME_URL || 'https://mp3a5rmdpmpqphordszcahy5bm0okvjt.lambda-url.ap-south-1.on.aws';

// BYOK: API keys passed via environment from config-generator
function getApiHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (process.env.GEMINI_API_KEY) headers['X-Gemini-Api-Key'] = process.env.GEMINI_API_KEY;
  if (process.env.OPENAI_API_KEY) headers['X-OpenAI-Api-Key'] = process.env.OPENAI_API_KEY;
  return headers;
}

// Types matching the registry
interface SpaceInput {
  name: string;
  type: string;
  required: boolean;
  description: string;
  default?: unknown;
}

interface SpaceDefinition {
  id: string;
  name: string;
  description: string;
  category: string;
  keywords: string[];
  inputs: SpaceInput[];
  outputs: string[];
  estimatedDuration: string;
}

// Hardcoded space definitions - avoids Lambda fetch during MCP startup (saves 10-30s cold start)
// These are updated when the registry changes. Execution still hits Lambda.
const BUILTIN_SPACES: SpaceDefinition[] = [
  {
    id: 'product-swap',
    name: 'Product Swap',
    description: 'Swap products between different backgrounds or contexts. Extract a product from one image and place it naturally into another scene.',
    category: 'images',
    keywords: ['swap', 'product swap', 'replace product', 'place product', 'put product in', 'composite', 'background swap', 'scene swap', 'product placement', 'insert product', 'move product to'],
    inputs: [
      { name: 'product_image', type: 'image', required: true, description: 'Image containing the product to extract' },
      { name: 'reference_image', type: 'image', required: true, description: 'Scene/background to place the product into' },
      { name: 'additional_instructions', type: 'string', required: false, description: 'Additional instructions for the swap' },
      { name: 'num_variations', type: 'number', required: false, description: 'Number of variations to generate', default: 2 },
    ],
    outputs: ['image'],
    estimatedDuration: '30-60s',
  },
  {
    id: 'steal-the-look',
    name: 'Steal the Look',
    description: 'Editorial style transfer - generate variations that match the visual vibe of a reference image while featuring your product naturally.',
    category: 'images',
    keywords: ['steal the look', 'style transfer', 'editorial style', 'match style', 'same vibe', 'campaign style', 'fashion editorial', 'look and feel', 'visual style', 'aesthetic match', 'inspired by', 'similar style to'],
    inputs: [
      { name: 'product_image', type: 'image', required: true, description: 'Product image to feature' },
      { name: 'reference_image', type: 'image', required: true, description: 'Reference image defining the editorial vibe' },
      { name: 'custom_description', type: 'string', required: false, description: 'Custom styling instructions' },
      { name: 'num_variations', type: 'number', required: false, description: 'Number of variations to generate', default: 2 },
    ],
    outputs: ['image'],
    estimatedDuration: '45-90s',
  },
  {
    id: 'sketch-to-product',
    name: 'Sketch to Product',
    description: 'Transform conceptual sketches into production-ready photorealistic 2K renders. Supports multiple sketches, material references, and logos.',
    category: 'images',
    keywords: ['sketch to product', 'sketch to render', 'concept to product', 'drawing to photo', 'sketch to photo', 'render sketch', 'visualize sketch', 'product visualization', 'concept render', 'design to product', 'mockup from sketch'],
    inputs: [
      { name: 'product_sketches', type: 'image[]', required: true, description: 'Sketch image(s) to transform' },
      { name: 'additional_images', type: 'image[]', required: false, description: 'Reference images (logos, textures, materials)' },
      { name: 'core_material', type: 'string', required: false, description: 'Primary material for the product' },
      { name: 'accent_color', type: 'string', required: false, description: 'Accent color (HEX/RAL code)' },
      { name: 'dimensions', type: 'string', required: false, description: 'Product dimensions' },
      { name: 'custom_description', type: 'string', required: false, description: 'Additional instructions' },
      { name: 'num_variations', type: 'number', required: false, description: 'Number of variations/views to generate', default: 2 },
    ],
    outputs: ['image'],
    estimatedDuration: '60-120s',
  },
  {
    id: 'background-remover',
    name: 'Background Remover',
    description: 'Remove background from product images to create clean cutouts with transparent backgrounds.',
    category: 'images',
    keywords: ['remove background', 'background removal', 'cutout', 'transparent background', 'isolate product', 'extract product', 'no background', 'white background', 'clean background', 'product cutout'],
    inputs: [
      { name: 'input_image', type: 'image', required: true, description: 'Image to remove background from' },
    ],
    outputs: ['image'],
    estimatedDuration: '5-15s',
  },
  {
    id: 'store-display-banner',
    name: 'Store Display Banner',
    description: 'Generate large-format poster and store display visuals. Creates cinematic, atmospheric promotional materials optimized for in-store impact and print clarity.',
    category: 'images',
    keywords: ['store display', 'banner', 'poster', 'promotional', 'display banner', 'store poster', 'retail display', 'point of sale', 'POS', 'in-store', 'campaign visual', 'sale banner', 'promotional poster', 'window display', 'floor display'],
    inputs: [
      { name: 'product_images', type: 'image[]', required: false, description: 'Product images to feature in the poster' },
      { name: 'user_query', type: 'string', required: true, description: 'Campaign message, offer details, or style direction' },
      { name: 'aspect_ratio', type: 'string', required: false, description: 'Aspect ratio (1:1, 2:3, 3:2, 4:5, 16:9)' },
      { name: 'output_format', type: 'string', required: false, description: 'Output format (jpeg, png)' },
      { name: 'reference_image', type: 'image', required: false, description: 'Reference/moodboard image for style extraction' },
      { name: 'num_variations', type: 'number', required: false, description: 'Number of poster variations to generate (1-10)', default: 2 },
    ],
    outputs: ['image'],
    estimatedDuration: '60-120s',
  },
  {
    id: 'multiproduct-tryon',
    name: 'Multi-Product Try-On',
    description: 'Generate authentic editorial magazine photographs (GQ/Vogue style) featuring a model wearing multiple product items simultaneously.',
    category: 'images',
    keywords: ['try on', 'tryon', 'model wearing', 'put on model', 'fashion editorial', 'editorial photo', 'magazine style', 'GQ style', 'Vogue style', 'lifestyle shot', 'model photoshoot', 'wear products', 'outfit photo', 'multiple products', 'styled look', 'fashion shoot', 'lookbook'],
    inputs: [
      { name: 'product_images', type: 'image[]', required: true, description: 'Product images to be worn by the model (at least 1 required)' },
      { name: 'reference_images', type: 'image[]', required: false, description: 'Reference images for style/setting (highest priority for replication)' },
      { name: 'custom_description', type: 'string', required: false, description: 'Custom creative direction (model type, setting, mood, etc.)' },
      { name: 'aspect_ratio', type: 'string', required: false, description: 'Aspect ratio (1:1, 2:3, 3:2, 3:4, 4:3, 16:9, 9:16)' },
      { name: 'output_format', type: 'string', required: false, description: 'Output format (jpeg, png)' },
      { name: 'num_variations', type: 'number', required: false, description: 'Number of editorial variations to generate (1-15)', default: 2 },
    ],
    outputs: ['image'],
    estimatedDuration: '60-120s',
  },
];

/**
 * Get spaces - returns hardcoded definitions instantly, refreshes from API in background
 */
function getSpaces(): SpaceDefinition[] {
  return BUILTIN_SPACES;
}

// Background refresh - update cache if API has new spaces (non-blocking)
let remoteSpaces: SpaceDefinition[] | null = null;
function refreshSpacesInBackground() {
  fetch(`${SPACE_RUNTIME_URL}/spaces`)
    .then(r => r.ok ? r.json() : null)
    .then(data => { if (data) remoteSpaces = data; })
    .catch(() => {}); // Silent fail - builtin definitions are fine
}
// Kick off background refresh after startup
setTimeout(refreshSpacesInBackground, 5000);

/**
 * Convert a space input type to JSON Schema type
 */
function toJsonSchemaType(inputType: string): { type: string; items?: { type: string } } {
  switch (inputType) {
    case 'image':
    case 'string':
      return { type: 'string' };
    case 'image[]':
    case 'string[]':
      return { type: 'array', items: { type: 'string' } };
    case 'number':
      return { type: 'number' };
    case 'boolean':
      return { type: 'boolean' };
    default:
      return { type: 'string' };
  }
}

/**
 * Convert a space definition to an MCP tool
 */
function spaceToTool(space: SpaceDefinition): Tool {
  const properties: { [key: string]: object } = {};
  const required: string[] = [];

  for (const input of space.inputs) {
    const schemaType = toJsonSchemaType(input.type);
    properties[input.name] = {
      ...schemaType,
      description: input.description + (input.type.includes('image') ? ' (URL to image)' : ''),
    } as object;
    if (input.required) {
      required.push(input.name);
    }
  }

  return {
    name: `space_${space.id.replace(/-/g, '_')}`,
    description: `[BrandWork Space] ${space.name}: ${space.description}\n\nEstimated time: ${space.estimatedDuration}\nCategory: ${space.category}`,
    inputSchema: {
      type: 'object' as const,
      properties,
      required,
    },
  };
}

type SpaceResult = {
  success: boolean;
  outputAssets: Array<{ type: string; url?: string; content?: string }>;
  error?: string;
};

/**
 * Execute a space via SSE streaming endpoint for real-time progress.
 * Falls back to non-streaming endpoint on failure.
 */
async function executeSpaceStreaming(
  spaceId: string,
  inputs: Record<string, unknown>,
  progressToken?: string | number
): Promise<SpaceResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 150000);
  const startTime = Date.now();

  console.error(`[space-runtime] Executing space (streaming): ${spaceId}`);
  console.error(`[space-runtime] Inputs: ${JSON.stringify(inputs, null, 2)}`);

  try {
    const response = await fetch(`${SPACE_RUNTIME_URL}/spaces/${spaceId}/execute/stream`, {
      method: 'POST',
      headers: getApiHeaders(),
      body: JSON.stringify({ inputs }),
      signal: controller.signal,
    });

    if (!response.ok || !response.body) {
      console.error(`[space-runtime] SSE failed (${response.status}), falling back to non-streaming`);
      clearTimeout(timeoutId);
      return executeSpace(spaceId, inputs);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let step = 0;
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const parts = buffer.split('\n\n');
      buffer = parts.pop() || '';

      for (const part of parts) {
        if (!part.startsWith('data: ')) continue;
        try {
          const event = JSON.parse(part.slice(6));

          if (event.type === 'progress') {
            step++;
            const msg = event.message || event.id?.replace(/-/g, ' ') || 'Processing';
            console.error(`[space-runtime] Progress: ${msg} (${event.status})`);
            if (progressToken !== undefined) {
              await server.notification({
                method: 'notifications/progress',
                params: { progressToken, progress: step, message: msg },
              });
            }
          } else if (event.type === 'image') {
            step++;
            console.error(`[space-runtime] Image ready: ${event.label}`);
            if (progressToken !== undefined) {
              await server.notification({
                method: 'notifications/progress',
                params: { progressToken, progress: step, message: `Generated: ${event.label}` },
              });
            }
          } else if (event.type === 'result') {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            console.error(`[space-runtime] Space ${spaceId} completed in ${elapsed}s (streamed). Success: ${event.success}`);
            return event as SpaceResult;
          }
        } catch {
          // Skip malformed SSE events
        }
      }
    }

    return { success: false, outputAssets: [], error: 'Stream ended without result' };
  } catch (error) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    if (error instanceof Error && error.name === 'AbortError') {
      console.error(`[space-runtime] Space ${spaceId} timed out after ${elapsed}s`);
      return { success: false, outputAssets: [], error: 'Request timed out after 150 seconds.' };
    }
    console.error(`[space-runtime] Streaming error, falling back: ${error instanceof Error ? error.message : String(error)}`);
    return executeSpace(spaceId, inputs);
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Execute a space via the runtime API (non-streaming fallback)
 */
async function executeSpace(spaceId: string, inputs: Record<string, unknown>): Promise<SpaceResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 150000);

  console.error(`[space-runtime] Executing space (non-streaming): ${spaceId}`);
  const startTime = Date.now();

  try {
    const response = await fetch(`${SPACE_RUNTIME_URL}/spaces/${spaceId}/execute`, {
      method: 'POST',
      headers: getApiHeaders(),
      body: JSON.stringify({ inputs }),
      signal: controller.signal,
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[space-runtime] Space ${spaceId} failed after ${elapsed}s: ${response.status} - ${errorText}`);
      return { success: false, outputAssets: [], error: `API error ${response.status}: ${errorText}` };
    }

    const result = await response.json();
    console.error(`[space-runtime] Space ${spaceId} completed in ${elapsed}s. Success: ${result.success}`);
    return result;
  } catch (error) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    if (error instanceof Error && error.name === 'AbortError') {
      console.error(`[space-runtime] Space ${spaceId} timed out after ${elapsed}s`);
      return { success: false, outputAssets: [], error: 'Request timed out after 150 seconds.' };
    }
    console.error(`[space-runtime] Space ${spaceId} error after ${elapsed}s: ${error instanceof Error ? error.message : String(error)}`);
    return { success: false, outputAssets: [], error: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timeoutId);
  }
}

// Create MCP server
const server = new Server(
  { name: 'space-runtime', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

// List available tools - dynamically generated from spaces registry
server.setRequestHandler(ListToolsRequestSchema, async () => {
  const spaces = getSpaces();
  
  // Convert each space to an MCP tool
  const tools = spaces.map(spaceToTool);
  
  // Add a helper tool to match prompts to spaces
  tools.push({
    name: 'space_match_prompt',
    description: 'Match a user prompt to the best BrandWork space. Use this to find which space (if any) can handle a specific request.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'The user prompt or task description to match',
        },
      },
      required: ['prompt'],
    },
  });

  // Add a tool to list all available spaces
  tools.push({
    name: 'space_list_all',
    description: 'List all available BrandWork spaces with their descriptions and required inputs.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  });

  return { tools };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
  const toolName = request.params.name;
  const args = request.params.arguments as Record<string, unknown>;

  // Handle special tools
  if (toolName === 'space_match_prompt') {
    const prompt = args.prompt as string;
    try {
      const response = await fetch(
        `${SPACE_RUNTIME_URL}/match?prompt=${encodeURIComponent(prompt)}`,
        { method: 'POST', headers: getApiHeaders() }
      );
      const result = await response.json();
      
      if (result.matched && result.space) {
        return {
          content: [{
            type: 'text',
            text: `Matched space: ${result.space.name} (${result.space.id})\nConfidence: ${Math.round(result.confidence * 100)}%\nDescription: ${result.space.description}\n\nTo execute, use the tool: space_${result.space.id.replace(/-/g, '_')}`,
          }],
        };
      } else {
        return {
          content: [{
            type: 'text',
            text: 'No matching space found for this prompt. You may need to handle this task using other tools (browsing, APIs, etc.) or break it down into steps that match available spaces.',
          }],
        };
      }
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Error matching prompt: ${error instanceof Error ? error.message : String(error)}`,
        }],
        isError: true,
      };
    }
  }

  if (toolName === 'space_list_all') {
    const spaces = getSpaces();
    const spaceList = spaces.map(s => 
      `- **${s.name}** (space_${s.id.replace(/-/g, '_')})\n  ${s.description}\n  Inputs: ${s.inputs.map(i => `${i.name}${i.required ? '*' : ''}`).join(', ')}`
    ).join('\n\n');
    
    return {
      content: [{
        type: 'text',
        text: `Available BrandWork Spaces:\n\n${spaceList}\n\n(* = required input)`,
      }],
    };
  }

  // Handle space execution tools (space_xxx)
  if (toolName.startsWith('space_')) {
    const spaceId = toolName.replace('space_', '').replace(/_/g, '-');
    const progressToken = (request.params as { _meta?: { progressToken?: string | number } })._meta?.progressToken;

    console.error(`Executing space: ${spaceId} with inputs:`, JSON.stringify(args, null, 2));

    const result = await executeSpaceStreaming(spaceId, args, progressToken);
    
    if (result.success) {
      const outputs = result.outputAssets.map((asset, i) => {
        if (asset.url) {
          return `Output ${i + 1}: ${asset.type} - ${asset.url}`;
        }
        if (asset.content) {
          return `Output ${i + 1}: ${asset.type}\n${asset.content}`;
        }
        return `Output ${i + 1}: ${asset.type}`;
      }).join('\n\n');

      if (result.outputAssets.length === 0) {
        console.error(`[space-runtime] WARNING: Space succeeded but returned 0 output assets`);
        console.error(`[space-runtime] Full result: ${JSON.stringify(result)}`);
        return {
          content: [{
            type: 'text',
            text: `Space "${spaceId}" completed but generated no output images. This may be due to API rate limits or temporary service issues. Please try again.`,
          }],
          isError: true,
        };
      }

      return {
        content: [{
          type: 'text',
          text: `Space "${spaceId}" executed successfully!\n\n${outputs}`,
        }],
      };
    } else {
      return {
        content: [{
          type: 'text',
          text: `Space "${spaceId}" failed: ${result.error}`,
        }],
        isError: true,
      };
    }
  }

  return {
    content: [{ type: 'text', text: `Unknown tool: ${toolName}` }],
    isError: true,
  };
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`Space Runtime MCP Server started (API: ${SPACE_RUNTIME_URL})`);
}

main().catch((error) => {
  console.error('Failed to start Space Runtime MCP server:', error);
  process.exit(1);
});
