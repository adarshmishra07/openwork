#!/usr/bin/env node
/**
 * AskUserQuestion MCP Server
 *
 * Exposes an `AskUserQuestion` tool that the agent calls to ask users
 * questions via the UI. Communicates with Electron main process via HTTP.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
} from '@modelcontextprotocol/sdk/types.js';

const QUESTION_API_PORT = process.env.QUESTION_API_PORT || '9227';
const QUESTION_API_URL = `http://localhost:${QUESTION_API_PORT}/question`;
const TASK_ID = process.env.ACCOMPLISH_TASK_ID;

// Logging helper - uses stderr so it doesn't interfere with MCP stdio
const log = (msg: string, data?: unknown) => {
  const timestamp = new Date().toISOString();
  console.error(`[AskUserQuestion MCP ${timestamp}] ${msg}`, data ? JSON.stringify(data, null, 2) : '');
};

interface QuestionOption {
  label: string;
  description?: string;
}

interface AskUserQuestionInput {
  questions: Array<{
    question: string;
    header?: string;
    options?: QuestionOption[];
    multiSelect?: boolean;
  }>;
}

const server = new Server(
  { name: 'ask-user-question', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'AskUserQuestion',
      description:
        'Ask the user a question and wait for their response. Use this for clarifications, confirmations before sensitive actions, or when you need user input to proceed. Returns the user\'s selected option(s) or custom text response.',
      inputSchema: {
        type: 'object',
        properties: {
          questions: {
            type: 'array',
            description: 'Array of questions to ask (typically just one)',
            items: {
              type: 'object',
              properties: {
                question: {
                  type: 'string',
                  description: 'The question to ask the user',
                },
                header: {
                  type: 'string',
                  description: 'Short header/category for the question (max 12 chars)',
                },
                options: {
                  type: 'array',
                  description: 'Available choices for the user (2-4 options)',
                  items: {
                    type: 'object',
                    properties: {
                      label: {
                        type: 'string',
                        description: 'Display text for this option',
                      },
                      description: {
                        type: 'string',
                        description: 'Explanation of what this option means',
                      },
                    },
                    required: ['label'],
                  },
                },
                multiSelect: {
                  type: 'boolean',
                  description: 'Allow selecting multiple options',
                  default: false,
                },
              },
              required: ['question'],
            },
            minItems: 1,
            maxItems: 4,
          },
        },
        required: ['questions'],
      },
    },
  ],
}));

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
  log('>>> Tool call received', { toolName: request.params.name });
  
  if (request.params.name !== 'AskUserQuestion') {
    log('Unknown tool requested', { toolName: request.params.name });
    return {
      content: [{ type: 'text', text: `Error: Unknown tool: ${request.params.name}` }],
      isError: true,
    };
  }

  const args = request.params.arguments as AskUserQuestionInput;
  const { questions } = args;
  
  log('AskUserQuestion called', { questionCount: questions?.length, firstQuestion: questions?.[0]?.question?.substring(0, 50) });

  // Validate required fields
  if (!questions || questions.length === 0) {
    log('Validation failed: no questions');
    return {
      content: [{ type: 'text', text: 'Error: At least one question is required' }],
      isError: true,
    };
  }

  const question = questions[0];
  if (!question.question) {
    log('Validation failed: empty question text');
    return {
      content: [{ type: 'text', text: 'Error: Question text is required' }],
      isError: true,
    };
  }

  try {
    log('>>> Sending HTTP request to Question API', { url: QUESTION_API_URL, question: question.question.substring(0, 50) });
    
    // Create abort controller with 5-minute timeout
    // This matches the MCP config timeout, giving users plenty of time to respond.
    // The agent will wait for the user's answer before continuing.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      log('>>> Timeout reached after 5 minutes - user did not respond');
      controller.abort();
    }, 300000); // 5 minutes - match MCP config timeout
    
    // Call Electron main process HTTP endpoint
    let response: Response;
    try {
      response = await fetch(QUESTION_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: question.question,
          header: question.header,
          options: question.options,
          multiSelect: question.multiSelect,
          taskId: TASK_ID, // Pass task ID to main process for correct routing
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    log('<<< HTTP response received', { status: response.status, ok: response.ok });

    if (!response.ok) {
      const errorText = await response.text();
      log('HTTP error response', { status: response.status, errorText });
      return {
        content: [{ type: 'text', text: `Error: Question API returned ${response.status}: ${errorText}` }],
        isError: true,
      };
    }

    const result = (await response.json()) as {
      answered: boolean;
      selectedOptions?: string[];
      customText?: string;
      denied?: boolean;
    };
    
    log('<<< Question API result', result);

    if (result.denied) {
      log('User denied/skipped question');
      return {
        content: [{ type: 'text', text: 'User declined to answer the question.' }],
      };
    }

    // Format response for the agent
    if (result.selectedOptions && result.selectedOptions.length > 0) {
      log('User selected options', { selectedOptions: result.selectedOptions });
      return {
        content: [{ type: 'text', text: `User selected: ${result.selectedOptions.join(', ')}` }],
      };
    }

    if (result.customText) {
      log('User provided custom text', { customText: result.customText.substring(0, 50) });
      return {
        content: [{ type: 'text', text: `User responded: ${result.customText}` }],
      };
    }

    log('No user response received');
    return {
      content: [{ type: 'text', text: 'User provided no response.' }],
    };
  } catch (error) {
    // Handle abort/timeout - this means user didn't respond within 5 minutes
    if (error instanceof Error && error.name === 'AbortError') {
      log('>>> Question timed out after 5 minutes - user did not respond');
      return {
        content: [{ 
          type: 'text', 
          text: 'Question timed out - user did not respond within 5 minutes. Please proceed without this input or ask a simpler question.' 
        }],
        isError: true,  // This is now a true timeout failure
      };
    }
    
    const errorMessage = error instanceof Error ? error.message : String(error);
    log('!!! HTTP request failed', { error: errorMessage });
    return {
      content: [{ type: 'text', text: `Error: Failed to ask question: ${errorMessage}` }],
      isError: true,
    };
  }
});

// Start the MCP server
async function main() {
  log('=== Starting AskUserQuestion MCP Server ===');
  log('Configuration', { QUESTION_API_PORT, QUESTION_API_URL });
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log('=== AskUserQuestion MCP Server connected and ready ===');
}

main().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
