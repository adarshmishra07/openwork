/**
 * Centralized timeout constants for E2E tests.
 * Adjust these based on CI environment performance.
 */
export const TEST_TIMEOUTS = {
  /** Time for CSS animations to complete */
  ANIMATION: 300,

  /** Short wait for React state updates */
  STATE_UPDATE: 500,

  /** Time for React hydration after page load */
  HYDRATION: 1500,

  /** Time between app close and next launch (single-instance lock release) */
  APP_RESTART: 1000,

  /** Task completion with mock flow */
  TASK_COMPLETION: 3000,

  /** Navigation between pages */
  NAVIGATION: 5000,

  /** Permission modal appearance */
  PERMISSION_MODAL: 10000,

  /** Wait for task to reach completed/failed/stopped state */
  TASK_COMPLETE_WAIT: 20000,

  /** Space execution (image generation can take 30-90s) */
  SPACE_EXECUTION: 120000,

  /** Space matching (quick API call) */
  SPACE_MATCHING: 5000,
} as const;

/**
 * Test scenario definitions with explicit keywords.
 * Using prefixed keywords to avoid false positives.
 */
export const TEST_SCENARIOS = {
  SUCCESS: {
    keyword: '__e2e_success__',
    description: 'Task completes successfully',
  },
  WITH_TOOL: {
    keyword: '__e2e_tool__',
    description: 'Task uses tools (Read, Grep)',
  },
  PERMISSION: {
    keyword: '__e2e_permission__',
    description: 'Task requires file permission',
  },
  ERROR: {
    keyword: '__e2e_error__',
    description: 'Task fails with error',
  },
  INTERRUPTED: {
    keyword: '__e2e_interrupt__',
    description: 'Task is interrupted by user',
  },
  QUESTION: {
    keyword: '__e2e_question__',
    description: 'Task requires user question/choice',
  },
  // Space-related scenarios (from PRD)
  SPACE_BACKGROUND_REMOVE: {
    keyword: '__e2e_space_bg__',
    description: 'Space: Remove background from product image',
    spaceId: 'background-remover',
  },
  SPACE_PRODUCT_SWAP: {
    keyword: '__e2e_space_swap__',
    description: 'Space: Swap product into a new scene',
    spaceId: 'product-swap',
  },
  SPACE_STEAL_LOOK: {
    keyword: '__e2e_space_style__',
    description: 'Space: Apply editorial style from reference image',
    spaceId: 'steal-the-look',
  },
  SPACE_SKETCH_TO_PRODUCT: {
    keyword: '__e2e_space_sketch__',
    description: 'Space: Convert sketch to photorealistic render',
    spaceId: 'sketch-to-product',
  },
} as const;

/**
 * Example prompts for spaces (from PRD)
 * These are real prompts users would enter
 */
export const SPACE_PROMPTS = {
  BACKGROUND_REMOVE: [
    'Remove the background from this image',
    'Make the background transparent',
    'Create a cutout of this product',
  ],
  PRODUCT_SWAP: [
    'Swap my product into this lifestyle scene',
    'Place this product on that background',
    'Put my watch in this bedroom setting',
  ],
  STEAL_LOOK: [
    'Steal the look from this campaign photo',
    'Match the style of this editorial',
    'Make my product look like this vibe',
  ],
  SKETCH_TO_PRODUCT: [
    'Turn this sketch into a product render',
    'Convert my drawing to a photorealistic image',
    'Visualize this concept sketch',
  ],
} as const;

export type TestScenario = keyof typeof TEST_SCENARIOS;
