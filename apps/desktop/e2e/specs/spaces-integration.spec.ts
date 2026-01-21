/**
 * Spaces Integration E2E Tests
 * 
 * Tests the intelligent intent-based space matching and execution flow:
 * 
 * 1. Simple Tasks (Direct Space Execution):
 *    - User enters a prompt that clearly maps to a space
 *    - System intelligently detects intent (not just keywords)
 *    - Space executes directly, returns results
 * 
 * 2. Complex Tasks (Orchestration):
 *    - User enters a complex request that needs multiple steps
 *    - System creates a plan using LLM
 *    - Claude Code orchestrates, calling spaces as MCP tools
 *    - Loop until planning is complete
 * 
 * Based on PRD: "Spaces are pre-built workflows that the AI agent can call"
 * Flow: Check spaces first → Execute directly OR → Orchestration with planning loop
 */

import { test, expect } from '../fixtures';
import { HomePage, ExecutionPage } from '../pages';
import { captureForAI } from '../utils';
import { TEST_TIMEOUTS } from '../config';

/**
 * Test prompts that should intelligently match to spaces.
 * These use natural language, NOT keywords - the LLM should understand intent.
 */
const INTELLIGENT_PROMPTS = {
  // Background Remover - various ways users might ask
  backgroundRemover: [
    'I need a clean product shot with no background',
    'Make this image transparent so I can put it on my website',
    'Get rid of everything behind my product',
    'I want just the product, nothing else in the photo',
    'Create a PNG with alpha channel for this item',
  ],
  
  // Product Swap - placing products in scenes
  productSwap: [
    'Put my handbag on a marble table in a luxury setting',
    'I want my sneakers to look like they\'re on a beach',
    'Place this watch in an executive office environment',
    'Show my product in a cozy living room setting',
    'Can you put this bottle on a picnic blanket outdoors?',
  ],
  
  // Steal the Look - style transfer
  stealTheLook: [
    'Make my product photos look like Apple\'s marketing',
    'I want the same vibe as this Gucci campaign',
    'Style my images like a Vogue fashion editorial',
    'Copy the aesthetic from this Nike ad for my product',
    'Give my product the same look and feel as this reference',
  ],
  
  // Sketch to Product - concept visualization
  sketchToProduct: [
    'Turn my hand-drawn design into a real product image',
    'I sketched this on paper, make it look photorealistic',
    'Visualize my concept drawing as an actual product',
    'Convert this napkin sketch into a professional render',
    'Make my rough drawing look like a finished product',
  ],
  
  // Complex tasks that need orchestration (NO single space match)
  complexOrchestration: [
    'Create a complete product catalog with 10 items inspired by Zara\'s latest collection',
    'Research my top 3 competitors, analyze their product photography style, and apply it to my products',
    'Build a seasonal campaign: browse Pinterest for inspiration, then create matching product shots',
    'Generate a full e-commerce listing with photos, descriptions, and SEO tags',
    'Create lifestyle shots for my entire summer collection based on what\'s trending on Instagram',
  ],
};

test.describe('Spaces Integration - Intelligent Intent Matching', () => {
  
  test.describe('Background Remover Space', () => {
    for (const prompt of INTELLIGENT_PROMPTS.backgroundRemover.slice(0, 2)) {
      test(`should intelligently match: "${prompt.substring(0, 50)}..."`, async ({ window }) => {
        const homePage = new HomePage(window);

        await window.waitForLoadState('domcontentloaded');

        // Enter the natural language prompt
        await homePage.enterTask(prompt);
        
        // Capture the state before submission
        await captureForAI(
          window,
          'spaces-intent-match',
          'background-remover-prompt',
          [
            'Natural language prompt entered',
            'No explicit keywords used',
            'System should understand intent',
          ]
        );

        await homePage.submitTask();

        // Wait for navigation to execution page
        await window.waitForURL(/.*#\/execution.*/, { timeout: TEST_TIMEOUTS.NAVIGATION });

        // The system should:
        // 1. Intelligently detect this is a background removal task
        // 2. Match to background-remover space with high confidence
        // 3. Either execute directly or show space execution UI
        
        await captureForAI(
          window,
          'spaces-intent-match',
          'background-remover-execution',
          [
            'Task started execution',
            'Space should be matched via intent detection',
            'Background remover space should be identified',
          ]
        );

        // Verify we're on the execution page
        expect(window.url()).toContain('#/execution');
      });
    }
  });

  test.describe('Product Swap Space', () => {
    for (const prompt of INTELLIGENT_PROMPTS.productSwap.slice(0, 2)) {
      test(`should intelligently match: "${prompt.substring(0, 50)}..."`, async ({ window }) => {
        const homePage = new HomePage(window);

        await window.waitForLoadState('domcontentloaded');

        await homePage.enterTask(prompt);
        
        await captureForAI(
          window,
          'spaces-intent-match',
          'product-swap-prompt',
          [
            'Scene/context placement request',
            'Should match product-swap space',
            'Intent: place product in different environment',
          ]
        );

        await homePage.submitTask();
        await window.waitForURL(/.*#\/execution.*/, { timeout: TEST_TIMEOUTS.NAVIGATION });

        await captureForAI(
          window,
          'spaces-intent-match',
          'product-swap-execution',
          [
            'Product swap task initiated',
            'Should require product and scene images',
          ]
        );

        expect(window.url()).toContain('#/execution');
      });
    }
  });

  test.describe('Steal the Look Space', () => {
    for (const prompt of INTELLIGENT_PROMPTS.stealTheLook.slice(0, 2)) {
      test(`should intelligently match: "${prompt.substring(0, 50)}..."`, async ({ window }) => {
        const homePage = new HomePage(window);

        await window.waitForLoadState('domcontentloaded');

        await homePage.enterTask(prompt);
        
        await captureForAI(
          window,
          'spaces-intent-match',
          'steal-look-prompt',
          [
            'Style transfer / aesthetic matching request',
            'Should match steal-the-look space',
            'Intent: apply reference style to product',
          ]
        );

        await homePage.submitTask();
        await window.waitForURL(/.*#\/execution.*/, { timeout: TEST_TIMEOUTS.NAVIGATION });

        expect(window.url()).toContain('#/execution');
      });
    }
  });

  test.describe('Sketch to Product Space', () => {
    for (const prompt of INTELLIGENT_PROMPTS.sketchToProduct.slice(0, 2)) {
      test(`should intelligently match: "${prompt.substring(0, 50)}..."`, async ({ window }) => {
        const homePage = new HomePage(window);

        await window.waitForLoadState('domcontentloaded');

        await homePage.enterTask(prompt);
        
        await captureForAI(
          window,
          'spaces-intent-match',
          'sketch-product-prompt',
          [
            'Sketch/drawing to render request',
            'Should match sketch-to-product space',
            'Intent: visualize concept as real product',
          ]
        );

        await homePage.submitTask();
        await window.waitForURL(/.*#\/execution.*/, { timeout: TEST_TIMEOUTS.NAVIGATION });

        expect(window.url()).toContain('#/execution');
      });
    }
  });
});

test.describe('Spaces Integration - Complex Orchestration', () => {
  
  test.describe('Multi-Step Tasks Requiring Planning', () => {
    for (const prompt of INTELLIGENT_PROMPTS.complexOrchestration.slice(0, 2)) {
      test(`should trigger orchestration for: "${prompt.substring(0, 40)}..."`, async ({ window }) => {
        const homePage = new HomePage(window);
        const executionPage = new ExecutionPage(window);

        await window.waitForLoadState('domcontentloaded');

        await homePage.enterTask(prompt);
        
        await captureForAI(
          window,
          'spaces-orchestration',
          'complex-task-prompt',
          [
            'Complex multi-step task entered',
            'No single space can handle this',
            'Should trigger orchestration flow',
            'Claude Code should create a plan',
          ]
        );

        await homePage.submitTask();
        await window.waitForURL(/.*#\/execution.*/, { timeout: TEST_TIMEOUTS.NAVIGATION });

        // For complex tasks, the system should:
        // 1. Detect no single space matches with high confidence
        // 2. Fall back to Claude Code orchestration
        // 3. Create a multi-step plan
        // 4. Execute plan, calling spaces as MCP tools where needed

        // Wait for thinking indicator or status badge
        await Promise.race([
          executionPage.thinkingIndicator.waitFor({ state: 'visible', timeout: TEST_TIMEOUTS.NAVIGATION }),
          executionPage.statusBadge.waitFor({ state: 'visible', timeout: TEST_TIMEOUTS.NAVIGATION }),
        ]);

        await captureForAI(
          window,
          'spaces-orchestration',
          'planning-in-progress',
          [
            'Orchestration started',
            'System is planning the task',
            'May show multiple steps',
            'Will call spaces as tools during execution',
          ]
        );

        expect(window.url()).toContain('#/execution');
      });
    }
  });
});

test.describe('Spaces Integration - Edge Cases', () => {
  
  test('should handle ambiguous prompts by asking for clarification', async ({ window }) => {
    const homePage = new HomePage(window);

    await window.waitForLoadState('domcontentloaded');

    // Ambiguous prompt that could match multiple spaces
    const ambiguousPrompt = 'Make my product image look better';
    
    await homePage.enterTask(ambiguousPrompt);
    
    await captureForAI(
      window,
      'spaces-edge-cases',
      'ambiguous-prompt',
      [
        'Ambiguous request entered',
        'Could mean: remove background, swap scene, or style transfer',
        'System might ask for clarification',
      ]
    );

    await homePage.submitTask();
    await window.waitForURL(/.*#\/execution.*/, { timeout: TEST_TIMEOUTS.NAVIGATION });

    // System should either:
    // 1. Ask for clarification (via question modal)
    // 2. Or proceed with orchestration to explore options

    await captureForAI(
      window,
      'spaces-edge-cases',
      'ambiguous-handling',
      [
        'System is handling ambiguous request',
        'May ask user for clarification',
        'Or proceed with best-guess approach',
      ]
    );

    expect(window.url()).toContain('#/execution');
  });

  test('should handle prompts with no space match gracefully', async ({ window }) => {
    const homePage = new HomePage(window);

    await window.waitForLoadState('domcontentloaded');

    // Request that doesn't match any space
    const noMatchPrompt = 'What is the weather like today?';
    
    await homePage.enterTask(noMatchPrompt);
    
    await captureForAI(
      window,
      'spaces-edge-cases',
      'no-match-prompt',
      [
        'Non-commerce request entered',
        'Should not match any space',
        'System should handle gracefully',
      ]
    );

    await homePage.submitTask();
    await window.waitForURL(/.*#\/execution.*/, { timeout: TEST_TIMEOUTS.NAVIGATION });

    // System should:
    // 1. Detect no space matches
    // 2. Either inform user or proceed with general orchestration

    await captureForAI(
      window,
      'spaces-edge-cases',
      'no-match-handling',
      [
        'System detected no space match',
        'May proceed with general assistant capabilities',
        'Or inform user about available spaces',
      ]
    );

    expect(window.url()).toContain('#/execution');
  });

  test('should handle mixed intent with multiple spaces', async ({ window }) => {
    const homePage = new HomePage(window);

    await window.waitForLoadState('domcontentloaded');

    // Request that needs multiple spaces
    const mixedPrompt = 'Remove the background from my product and then place it in a beach scene';
    
    await homePage.enterTask(mixedPrompt);
    
    await captureForAI(
      window,
      'spaces-edge-cases',
      'mixed-intent-prompt',
      [
        'Multi-space request entered',
        'Needs: background-remover THEN product-swap',
        'Should trigger orchestration with plan',
      ]
    );

    await homePage.submitTask();
    await window.waitForURL(/.*#\/execution.*/, { timeout: TEST_TIMEOUTS.NAVIGATION });

    // System should:
    // 1. Detect multiple intents
    // 2. Create a plan with sequential space calls
    // 3. Execute background-remover first, then product-swap

    await captureForAI(
      window,
      'spaces-edge-cases',
      'mixed-intent-execution',
      [
        'Multi-step execution started',
        'Should call multiple spaces in sequence',
        'Background removal -> Scene placement',
      ]
    );

    expect(window.url()).toContain('#/execution');
  });
});

test.describe('Spaces Integration - Brand Context', () => {
  
  test('should apply brand voice when using spaces', async ({ window }) => {
    const homePage = new HomePage(window);

    await window.waitForLoadState('domcontentloaded');

    // Request that should incorporate brand context
    const brandPrompt = 'Create product photos that match our brand aesthetic';
    
    await homePage.enterTask(brandPrompt);
    
    await captureForAI(
      window,
      'spaces-brand-context',
      'brand-aware-prompt',
      [
        'Brand-aware request entered',
        'Should use stored brand profile',
        'Results should match brand aesthetic',
      ]
    );

    await homePage.submitTask();
    await window.waitForURL(/.*#\/execution.*/, { timeout: TEST_TIMEOUTS.NAVIGATION });

    // System should:
    // 1. Load active brand profile
    // 2. Inject brand context into space execution
    // 3. Generate results that match brand guidelines

    await captureForAI(
      window,
      'spaces-brand-context',
      'brand-aware-execution',
      [
        'Execution with brand context',
        'Brand memory should influence output',
        'Results should be brand-consistent',
      ]
    );

    expect(window.url()).toContain('#/execution');
  });
});
