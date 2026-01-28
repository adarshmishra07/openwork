/**
 * Task Todo MCP Server
 *
 * Provides tools to manage an agent's todo list for the current task.
 * These todos are rendered inline in the chat UI to show progress.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

interface TodoItem {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  priority: 'high' | 'medium' | 'low';
}

// In-memory store for todos (scoped to this process/task)
let todos: TodoItem[] = [];

// Create MCP server
const server = new Server(
  {
    name: 'task-todo',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'TodoWrite',
        description: 'Update the structured todo list for the current task. Replaces the entire list with the new set of todos provided.',
        inputSchema: {
          type: 'object',
          properties: {
            todos: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', description: 'Unique identifier for the todo item' },
                  content: { type: 'string', description: 'Description of the task' },
                  status: { 
                    type: 'string', 
                    enum: ['pending', 'in_progress', 'completed', 'cancelled'],
                    description: 'Current status of the task'
                  },
                  priority: {
                    type: 'string',
                    enum: ['high', 'medium', 'low'],
                    description: 'Priority level'
                  }
                },
                required: ['id', 'content', 'status', 'priority']
              }
            }
          },
          required: ['todos']
        },
      },
      {
        name: 'TodoRead',
        description: 'Read the current todo list for the task.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === 'TodoWrite') {
    const newTodos = (args as { todos: TodoItem[] }).todos;
    todos = newTodos;
    console.error(`[task-todo] Updated todos: ${todos.length} items`);
    return {
      content: [
        {
          type: 'text',
          text: `Todo list updated with ${todos.length} items.`,
        },
      ],
    };
  }

  if (name === 'TodoRead') {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(todos, null, 2),
        },
      ],
    };
  }

  return {
    content: [
      {
        type: 'text',
        text: `Unknown tool: ${name}`,
      },
    ],
    isError: true,
  };
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[task-todo] MCP server started');
}

main().catch((error) => {
  console.error('[task-todo] Fatal error:', error);
  process.exit(1);
});
