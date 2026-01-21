/**
 * Mock task flow utilities for E2E testing.
 * Simulates IPC events without spawning real PTY processes.
 */
import { BrowserWindow } from 'electron';
import type { Task, TaskMessage, TaskStatus } from '@brandwork/shared';
import { updateTaskStatus } from '../store/taskHistory';

// ============================================================================
// Types
// ============================================================================

export type MockScenario =
  | 'success'
  | 'with-tool'
  | 'permission-required'
  | 'question'
  | 'error'
  | 'interrupted'
  // Space-related scenarios (from PRD)
  | 'space-match-execute'      // Direct space execution (high confidence match)
  | 'space-no-match-orchestrate' // No space match, falls back to Claude Code orchestration
  | 'space-complex-planning';   // Complex task requiring planning + multiple space calls

export interface MockTaskConfig {
  taskId: string;
  prompt: string;
  scenario: MockScenario;
  /** Delay between events in milliseconds */
  delayMs?: number;
}

// ============================================================================
// E2E Mode Detection
// ============================================================================

/**
 * Check if mock task events mode is enabled.
 * Can be set via global flag, CLI arg, or environment variable.
 */
export function isMockTaskEventsEnabled(): boolean {
  return (
    (global as Record<string, unknown>).E2E_MOCK_TASK_EVENTS === true ||
    process.env.E2E_MOCK_TASK_EVENTS === '1'
  );
}

// ============================================================================
// Scenario Detection
// ============================================================================

/**
 * Keywords that trigger specific test scenarios.
 * Using explicit prefixes to avoid false positives from natural language.
 */
const SCENARIO_KEYWORDS: Record<MockScenario, string[]> = {
  success: ['__e2e_success__', 'test success'],
  'with-tool': ['__e2e_tool__', 'use tool', 'search files'],
  'permission-required': ['__e2e_permission__', 'write file', 'create file'],
  question: ['__e2e_question__'],
  error: ['__e2e_error__', 'cause error', 'trigger failure'],
  interrupted: ['__e2e_interrupt__', 'stop task', 'cancel task'],
  // Space-related scenarios (from PRD)
  'space-match-execute': ['__e2e_space_match__', 'remove background', 'swap product', 'steal the look'],
  'space-no-match-orchestrate': ['__e2e_space_no_match__', 'analyze my competitors'],
  'space-complex-planning': ['__e2e_space_planning__', 'create a catalog', 'build product collection'],
};

/**
 * Detect the appropriate mock scenario from the prompt text.
 * Checks for explicit keywords in priority order.
 */
export function detectScenarioFromPrompt(prompt: string): MockScenario {
  const promptLower = prompt.toLowerCase();

  // Check scenarios in priority order (error/interrupt first to handle edge cases)
  const priorityOrder: MockScenario[] = [
    'error',
    'interrupted',
    'question',
    'permission-required',
    'with-tool',
    'success',
  ];

  for (const scenario of priorityOrder) {
    const keywords = SCENARIO_KEYWORDS[scenario];
    if (keywords.some(keyword => promptLower.includes(keyword.toLowerCase()))) {
      return scenario;
    }
  }

  // Default to success
  return 'success';
}

// ============================================================================
// Utility Functions
// ============================================================================

function createMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// Mock Task Execution
// ============================================================================

/**
 * Execute a mock task flow by emitting simulated IPC events.
 * This allows E2E tests to verify UI behavior without real API calls.
 */
export async function executeMockTaskFlow(
  window: BrowserWindow,
  config: MockTaskConfig
): Promise<void> {
  const { taskId, prompt, scenario, delayMs = 100 } = config;

  // Verify window is still valid
  if (window.isDestroyed()) {
    console.warn('[MockTaskFlow] Window destroyed, skipping mock flow');
    return;
  }

  const sendEvent = (channel: string, data: unknown) => {
    if (!window.isDestroyed()) {
      window.webContents.send(channel, data);
    }
  };

  // Initial progress event
  sendEvent('task:progress', { taskId, stage: 'init' });
  await sleep(delayMs);

  // Assistant acknowledgment message
  sendEvent('task:update', {
    taskId,
    type: 'message',
    message: {
      id: createMessageId(),
      type: 'assistant',
      content: `I'll help you with: ${prompt}`,
      timestamp: new Date().toISOString(),
    },
  });
  await sleep(delayMs);

  // Execute scenario-specific flow
  await executeScenario(sendEvent, taskId, scenario, delayMs);
}

/**
 * Execute the scenario-specific event sequence.
 */
async function executeScenario(
  sendEvent: (channel: string, data: unknown) => void,
  taskId: string,
  scenario: MockScenario,
  delayMs: number
): Promise<void> {
  switch (scenario) {
    case 'success':
      await executeSuccessScenario(sendEvent, taskId, delayMs);
      break;

    case 'with-tool':
      await executeToolScenario(sendEvent, taskId, delayMs);
      break;

    case 'permission-required':
      executePermissionScenario(sendEvent, taskId);
      break;

    case 'question':
      executeQuestionScenario(sendEvent, taskId);
      break;

    case 'error':
      executeErrorScenario(sendEvent, taskId);
      break;

    case 'interrupted':
      await executeInterruptedScenario(sendEvent, taskId, delayMs);
      break;

    case 'space-match-execute':
      await executeSpaceMatchScenario(sendEvent, taskId, delayMs);
      break;

    case 'space-no-match-orchestrate':
      await executeSpaceOrchestrationScenario(sendEvent, taskId, delayMs);
      break;

    case 'space-complex-planning':
      await executeSpaceComplexPlanningScenario(sendEvent, taskId, delayMs);
      break;
  }
}

/**
 * Execute space match scenario - direct space execution with high confidence
 */
async function executeSpaceMatchScenario(
  sendEvent: (channel: string, data: unknown) => void,
  taskId: string,
  delayMs: number
): Promise<void> {
  // Simulate space matching
  sendEvent('task:update', {
    taskId,
    type: 'message',
    message: {
      id: createMessageId(),
      type: 'assistant',
      content: 'I detected this is a background removal request. Using the Background Remover space...',
      timestamp: new Date().toISOString(),
    },
  });
  await sleep(delayMs);

  // Simulate space tool call
  sendEvent('task:update:batch', {
    taskId,
    messages: [
      {
        id: createMessageId(),
        type: 'tool',
        content: 'Executing space: background-remover',
        toolName: 'space_background_remover',
        timestamp: new Date().toISOString(),
      },
    ],
  });
  await sleep(delayMs * 3);

  // Simulate space result with image
  sendEvent('task:update', {
    taskId,
    type: 'message',
    message: {
      id: createMessageId(),
      type: 'assistant',
      content: 'Done! Here\'s your product with the background removed:\n\n![Result](https://example.com/result.png)',
      timestamp: new Date().toISOString(),
    },
  });
  await sleep(delayMs);

  updateTaskStatus(taskId, 'completed', new Date().toISOString());

  sendEvent('task:update', {
    taskId,
    type: 'complete',
    result: { status: 'success', sessionId: `session_${taskId}` },
  });
}

/**
 * Execute space orchestration scenario - no direct match, uses Claude Code with space tools
 */
async function executeSpaceOrchestrationScenario(
  sendEvent: (channel: string, data: unknown) => void,
  taskId: string,
  delayMs: number
): Promise<void> {
  // No direct space match - starting orchestration
  sendEvent('task:update', {
    taskId,
    type: 'message',
    message: {
      id: createMessageId(),
      type: 'assistant',
      content: 'This is a complex request. Let me plan how to approach this...',
      timestamp: new Date().toISOString(),
    },
  });
  await sleep(delayMs);

  // Simulate planning
  sendEvent('task:update:batch', {
    taskId,
    messages: [
      {
        id: createMessageId(),
        type: 'tool',
        content: 'Checking available spaces...',
        toolName: 'space_list_all',
        timestamp: new Date().toISOString(),
      },
    ],
  });
  await sleep(delayMs * 2);

  // Simulate browsing for research
  sendEvent('task:update:batch', {
    taskId,
    messages: [
      {
        id: createMessageId(),
        type: 'tool',
        content: 'Browsing competitor website for reference images',
        toolName: 'dev-browser',
        timestamp: new Date().toISOString(),
      },
    ],
  });
  await sleep(delayMs * 2);

  // Now use a space
  sendEvent('task:update:batch', {
    taskId,
    messages: [
      {
        id: createMessageId(),
        type: 'tool',
        content: 'Applying style from reference to your product',
        toolName: 'space_steal_the_look',
        timestamp: new Date().toISOString(),
      },
    ],
  });
  await sleep(delayMs * 3);

  sendEvent('task:update', {
    taskId,
    type: 'message',
    message: {
      id: createMessageId(),
      type: 'assistant',
      content: 'I\'ve analyzed the competitor and applied their style to your product. Here are the results:\n\n![Styled Product](https://example.com/styled.png)',
      timestamp: new Date().toISOString(),
    },
  });
  await sleep(delayMs);

  updateTaskStatus(taskId, 'completed', new Date().toISOString());

  sendEvent('task:update', {
    taskId,
    type: 'complete',
    result: { status: 'success', sessionId: `session_${taskId}` },
  });
}

/**
 * Execute complex planning scenario - multi-step task with planning loop
 */
async function executeSpaceComplexPlanningScenario(
  sendEvent: (channel: string, data: unknown) => void,
  taskId: string,
  delayMs: number
): Promise<void> {
  // Complex task - create a plan first
  sendEvent('task:update', {
    taskId,
    type: 'message',
    message: {
      id: createMessageId(),
      type: 'assistant',
      content: 'This is a multi-step task. Let me create a plan:\n\n1. Browse the reference website\n2. Gather inspiration images\n3. Remove backgrounds from your products\n4. Apply the gathered style\n5. Generate variations',
      timestamp: new Date().toISOString(),
    },
  });
  await sleep(delayMs);

  // Step 1: Browse
  sendEvent('task:update:batch', {
    taskId,
    messages: [
      {
        id: createMessageId(),
        type: 'tool',
        content: 'Step 1/5: Browsing reference website',
        toolName: 'dev-browser',
        timestamp: new Date().toISOString(),
      },
    ],
  });
  await sleep(delayMs * 2);

  // Step 2: Analyze
  sendEvent('task:update', {
    taskId,
    type: 'message',
    message: {
      id: createMessageId(),
      type: 'assistant',
      content: 'Step 2/5: Found 5 reference images. Analyzing their style...',
      timestamp: new Date().toISOString(),
    },
  });
  await sleep(delayMs);

  // Step 3: Background removal
  sendEvent('task:update:batch', {
    taskId,
    messages: [
      {
        id: createMessageId(),
        type: 'tool',
        content: 'Step 3/5: Removing backgrounds from your products',
        toolName: 'space_background_remover',
        timestamp: new Date().toISOString(),
      },
    ],
  });
  await sleep(delayMs * 2);

  // Step 4: Style transfer
  sendEvent('task:update:batch', {
    taskId,
    messages: [
      {
        id: createMessageId(),
        type: 'tool',
        content: 'Step 4/5: Applying editorial style to products',
        toolName: 'space_steal_the_look',
        timestamp: new Date().toISOString(),
      },
    ],
  });
  await sleep(delayMs * 3);

  // Step 5: Variations
  sendEvent('task:update:batch', {
    taskId,
    messages: [
      {
        id: createMessageId(),
        type: 'tool',
        content: 'Step 5/5: Generating product variations in different scenes',
        toolName: 'space_product_swap',
        timestamp: new Date().toISOString(),
      },
    ],
  });
  await sleep(delayMs * 3);

  // Final result
  sendEvent('task:update', {
    taskId,
    type: 'message',
    message: {
      id: createMessageId(),
      type: 'assistant',
      content: 'Done! I\'ve completed all 5 steps. Here\'s your catalog:\n\n![Product 1](https://example.com/p1.png)\n![Product 2](https://example.com/p2.png)\n![Product 3](https://example.com/p3.png)\n\nAll images match the reference style and are ready for your store.',
      timestamp: new Date().toISOString(),
    },
  });
  await sleep(delayMs);

  updateTaskStatus(taskId, 'completed', new Date().toISOString());

  sendEvent('task:update', {
    taskId,
    type: 'complete',
    result: { status: 'success', sessionId: `session_${taskId}` },
  });
}

async function executeSuccessScenario(
  sendEvent: (channel: string, data: unknown) => void,
  taskId: string,
  delayMs: number
): Promise<void> {
  sendEvent('task:update', {
    taskId,
    type: 'message',
    message: {
      id: createMessageId(),
      type: 'assistant',
      content: 'Task completed successfully.',
      timestamp: new Date().toISOString(),
    },
  });
  await sleep(delayMs);

  // Update task history status before sending completion event
  updateTaskStatus(taskId, 'completed', new Date().toISOString());

  sendEvent('task:update', {
    taskId,
    type: 'complete',
    result: { status: 'success', sessionId: `session_${taskId}` },
  });
}

async function executeToolScenario(
  sendEvent: (channel: string, data: unknown) => void,
  taskId: string,
  delayMs: number
): Promise<void> {
  // Simulate tool usage
  sendEvent('task:update:batch', {
    taskId,
    messages: [
      {
        id: createMessageId(),
        type: 'tool',
        content: 'Reading files',
        toolName: 'Read',
        timestamp: new Date().toISOString(),
      },
      {
        id: createMessageId(),
        type: 'tool',
        content: 'Searching code',
        toolName: 'Grep',
        timestamp: new Date().toISOString(),
      },
    ],
  });
  await sleep(delayMs * 2);

  sendEvent('task:update', {
    taskId,
    type: 'message',
    message: {
      id: createMessageId(),
      type: 'assistant',
      content: 'Found the information using available tools.',
      timestamp: new Date().toISOString(),
    },
  });
  await sleep(delayMs);

  // Update task history status before sending completion event
  updateTaskStatus(taskId, 'completed', new Date().toISOString());

  sendEvent('task:update', {
    taskId,
    type: 'complete',
    result: { status: 'success', sessionId: `session_${taskId}` },
  });
}

function executePermissionScenario(
  sendEvent: (channel: string, data: unknown) => void,
  taskId: string
): void {
  // Send permission request - task waits for user response
  // Tests should call permission:respond to continue the flow
  sendEvent('permission:request', {
    id: `perm_${Date.now()}`,
    taskId,
    type: 'file',
    question: 'Allow file write?',
    toolName: 'Write',
    fileOperation: 'create',
    filePath: '/test/output.txt',
    timestamp: new Date().toISOString(),
  });
}

function executeQuestionScenario(
  sendEvent: (channel: string, data: unknown) => void,
  taskId: string
): void {
  // Send question permission request - task waits for user to select an option
  sendEvent('permission:request', {
    id: `perm_${Date.now()}`,
    taskId,
    type: 'question',
    header: 'Test Question',
    question: 'Which option do you prefer?',
    options: [
      { label: 'Option A', description: 'First option for testing' },
      { label: 'Option B', description: 'Second option for testing' },
      { label: 'Other', description: 'Enter a custom response' },
    ],
    multiSelect: false,
    timestamp: new Date().toISOString(),
  });
}

function executeErrorScenario(
  sendEvent: (channel: string, data: unknown) => void,
  taskId: string
): void {
  // Update task history status before sending error event
  updateTaskStatus(taskId, 'failed', new Date().toISOString());

  sendEvent('task:update', {
    taskId,
    type: 'error',
    error: 'Command execution failed: File not found',
  });
}

async function executeInterruptedScenario(
  sendEvent: (channel: string, data: unknown) => void,
  taskId: string,
  delayMs: number
): Promise<void> {
  sendEvent('task:update', {
    taskId,
    type: 'message',
    message: {
      id: createMessageId(),
      type: 'assistant',
      content: 'Task was interrupted by user.',
      timestamp: new Date().toISOString(),
    },
  });
  await sleep(delayMs);

  // Update task history status before sending completion event
  updateTaskStatus(taskId, 'interrupted', new Date().toISOString());

  sendEvent('task:update', {
    taskId,
    type: 'complete',
    result: { status: 'interrupted', sessionId: `session_${taskId}` },
  });
}

// ============================================================================
// Task Creation
// ============================================================================

/**
 * Create a mock Task object for immediate return from task:start handler.
 */
export function createMockTask(taskId: string, prompt: string): Task {
  const initialMessage: TaskMessage = {
    id: createMessageId(),
    type: 'user',
    content: prompt,
    timestamp: new Date().toISOString(),
  };

  return {
    id: taskId,
    prompt,
    status: 'running',
    messages: [initialMessage],
    createdAt: new Date().toISOString(),
    startedAt: new Date().toISOString(),
  };
}
