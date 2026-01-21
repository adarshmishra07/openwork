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

// Cache for spaces
let spacesCache: SpaceDefinition[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60000; // 1 minute

/**
 * Fetch spaces from the runtime API
 */
async function fetchSpaces(): Promise<SpaceDefinition[]> {
  const now = Date.now();
  if (spacesCache && now - cacheTimestamp < CACHE_TTL) {
    return spacesCache;
  }

  try {
    const response = await fetch(`${SPACE_RUNTIME_URL}/spaces`);
    if (!response.ok) {
      throw new Error(`Failed to fetch spaces: ${response.status}`);
    }
    spacesCache = await response.json();
    cacheTimestamp = now;
    return spacesCache!;
  } catch (error) {
    console.error('Error fetching spaces:', error);
    // Return cached if available, even if stale
    if (spacesCache) return spacesCache;
    return [];
  }
}

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

/**
 * Execute a space via the runtime API
 * Includes 150s timeout (slightly less than MCP timeout to return error message)
 */
async function executeSpace(spaceId: string, inputs: Record<string, unknown>): Promise<{
  success: boolean;
  outputAssets: Array<{ type: string; url?: string; content?: string }>;
  error?: string;
}> {
  // 150s timeout - spaces can take 60-90s, leave buffer for MCP timeout (180s)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 150000);

  console.error(`[space-runtime] Executing space: ${spaceId}`);
  console.error(`[space-runtime] Inputs: ${JSON.stringify(inputs, null, 2)}`);
  const startTime = Date.now();

  try {
    const response = await fetch(`${SPACE_RUNTIME_URL}/spaces/${spaceId}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inputs }),
      signal: controller.signal,
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[space-runtime] Space ${spaceId} failed after ${elapsed}s: ${response.status} - ${errorText}`);
      return {
        success: false,
        outputAssets: [],
        error: `API error ${response.status}: ${errorText}`,
      };
    }

    const result = await response.json();
    console.error(`[space-runtime] Space ${spaceId} completed in ${elapsed}s. Success: ${result.success}`);
    if (result.outputAssets?.length > 0) {
      console.error(`[space-runtime] Output URLs: ${result.outputAssets.map((a: { url?: string }) => a.url).join(', ')}`);
    }
    return result;
  } catch (error) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    
    if (error instanceof Error && error.name === 'AbortError') {
      console.error(`[space-runtime] Space ${spaceId} timed out after ${elapsed}s (150s limit)`);
      return {
        success: false,
        outputAssets: [],
        error: `Request timed out after 150 seconds. The space may still be processing on the server. You can retry the request.`,
      };
    }
    
    console.error(`[space-runtime] Space ${spaceId} error after ${elapsed}s: ${error instanceof Error ? error.message : String(error)}`);
    return {
      success: false,
      outputAssets: [],
      error: error instanceof Error ? error.message : String(error),
    };
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
  const spaces = await fetchSpaces();
  
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
        { method: 'POST' }
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
    const spaces = await fetchSpaces();
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
    
    console.error(`Executing space: ${spaceId} with inputs:`, JSON.stringify(args, null, 2));
    
    const result = await executeSpace(spaceId, args);
    
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
