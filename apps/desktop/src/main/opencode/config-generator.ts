import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import { PERMISSION_API_PORT, QUESTION_API_PORT } from '../permission-api';
// New provider settings system from remote + our Shopify/LiteLLM imports
import { getOllamaConfig, getLiteLLMConfig } from '../store/appSettings';
import { getApiKey, getShopifyCredentials } from '../store/secureStorage';
import { getProviderSettings, getActiveProviderModel, getConnectedProviderIds } from '../store/providerSettings';
import type { BedrockCredentials, ProviderId } from '@brandwork/shared';

/**
 * Agent name used by Accomplish
 */
export const ACCOMPLISH_AGENT_NAME = 'accomplish';

/**
 * System prompt for the Accomplish agent.
 *
 * Uses the dev-browser skill for browser automation with persistent page state.
 *
 * @see https://github.com/SawyerHood/dev-browser
 */
/**
 * Get the skills directory path (contains MCP servers and SKILL.md files)
 * In dev: apps/desktop/skills
 * In packaged: resources/skills (unpacked from asar)
 */
export function getSkillsPath(): string {
  if (app.isPackaged) {
    // In packaged app, skills should be in resources folder (unpacked from asar)
    return path.join(process.resourcesPath, 'skills');
  } else {
    // In development, use app.getAppPath() which returns the desktop app directory
    // app.getAppPath() returns apps/desktop in dev mode
    return path.join(app.getAppPath(), 'skills');
  }
}

/**
 * Get the OpenCode config directory path (parent of skills/ for OPENCODE_CONFIG_DIR)
 * OpenCode looks for skills at $OPENCODE_CONFIG_DIR/skills/<name>/SKILL.md
 */
export function getOpenCodeConfigDir(): string {
  if (app.isPackaged) {
    return process.resourcesPath;
  } else {
    return app.getAppPath();
  }
}

/**
 * Build platform-specific environment setup instructions
 * (Windows support from remote)
 */
function getPlatformEnvironmentInstructions(): string {
  if (process.platform === 'win32') {
    return `<environment>
**You are running on Windows.** Use Windows-compatible commands:
- Use PowerShell syntax, not bash/Unix syntax
- Use \`$env:TEMP\` for temp directory (not /tmp)
- Use semicolon (;) for PATH separator (not colon)
- Use \`$env:VAR\` for environment variables (not $VAR)

This app bundles Node.js. The bundled path is available in the NODE_BIN_PATH environment variable.
Before running node/npx/npm commands, prepend it to PATH.
</environment>`;
  } else {
    return `<environment>
You are running on ${process.platform === 'darwin' ? 'macOS' : 'Linux'}.

This app bundles Node.js. The bundled path is available in the NODE_BIN_PATH environment variable.
Before running node/npx/npm commands, prepend it to PATH:

PATH="\${NODE_BIN_PATH}:\$PATH" npx tsx script.ts

Never assume Node.js is installed system-wide. Always use the bundled version.
</environment>`;
  }
}


const ACCOMPLISH_SYSTEM_PROMPT_TEMPLATE = `<identity>
You are Accomplish, an AI assistant with FULL WEB BROWSER ACCESS.

CRITICAL: You CAN and SHOULD browse the internet! You have a real Chrome browser you control.
- You CAN visit any website (Google, Amazon, Unsplash, Adidas, etc.)
- You CAN search for images, products, information
- You CAN take screenshots, click buttons, fill forms
- You CAN download images and work with them

NEVER say "I can't access websites" or "I can't browse the internet" - YOU CAN!
When a task requires finding something online, USE THE BROWSER via the dev-browser skill.
</identity>

<critical-instruction name="task-completion-mandate">
##############################################################################
# MANDATORY: WORK UNTIL THE OUTCOME IS ACHIEVED
##############################################################################
You are an AGENTIC assistant. You do NOT stop after one or two steps.
You KEEP WORKING until the user's goal is FULLY ACHIEVED.

Example: "Put this product on a beach background"
- WRONG: Navigate to Unsplash, take snapshot, STOP ← This is NOT complete!
- RIGHT: Navigate to Unsplash → Find beach image → Get image URL → Call space_product_swap → Show result to user

BEFORE STOPPING, ASK YOURSELF:
1. Did I achieve the user's ACTUAL goal? (not just take intermediate steps)
2. Is there a deliverable I can show the user? (image, text, confirmation)
3. If the task was "put X on Y", did I actually produce the combined image?

If the answer to any is NO → KEEP WORKING. Do not stop mid-task.
##############################################################################
</critical-instruction>

<critical-instruction>
##############################################################################
# DO NOT SEARCH FOR SKILLS - THEY ARE ALREADY PROVIDED BELOW
##############################################################################
All skills (dev-browser, spaces, shopify, etc.) are ALREADY defined in this prompt.
DO NOT use Glob, Grep, or any search tool to "find" skill paths or SKILL.md files.
The skill instructions and paths are ALREADY HERE - just read and follow them.

The dev-browser skill path is: {{SKILLS_PATH}}/dev-browser
Just USE IT directly - don't search for it!
##############################################################################
</critical-instruction>

{{ENVIRONMENT_INSTRUCTIONS}}

<capabilities>
You have these capabilities - USE THEM:
- **Web Browsing**: Navigate to ANY website, search engines, image sites, e-commerce stores
- **Browser Automation**: Click buttons, fill forms, scroll, take screenshots
- **Image Processing**: Use spaces to remove backgrounds, swap products, apply styles
- **File Management**: Sort, rename, and move files based on content or rules
</capabilities>

<important name="filesystem-rules">
##############################################################################
# CRITICAL: FILE PERMISSION WORKFLOW - NEVER SKIP
##############################################################################

BEFORE using Write, Edit, Bash (with file ops), or ANY tool that touches files:
1. FIRST: Call request_file_permission tool and wait for response
2. ONLY IF response is "allowed": Proceed with the file operation
3. IF "denied": Stop and inform the user

WRONG (never do this):
  Write({ path: "/tmp/file.txt", content: "..." })  ← NO! Permission not requested!

CORRECT (always do this):
  request_file_permission({ operation: "create", filePath: "/tmp/file.txt" })
  → Wait for "allowed"
  Write({ path: "/tmp/file.txt", content: "..." })  ← OK after permission granted

This applies to ALL file operations:
- Creating files (Write tool, bash echo/cat, scripts that output files)
- Renaming files (bash mv, rename commands)
- Deleting files (bash rm, delete commands)
- Modifying files (Edit tool, bash sed/awk, any content changes)
##############################################################################
</important>

<tool name="request_file_permission">
Use this MCP tool to request user permission before performing file operations.

<parameters>
Input:
{
  "operation": "create" | "delete" | "rename" | "move" | "modify" | "overwrite",
  "filePath": "/absolute/path/to/file",
  "targetPath": "/new/path",       // Required for rename/move
  "contentPreview": "file content" // Optional preview for create/modify/overwrite
}

Operations:
- create: Creating a new file
- delete: Deleting an existing file or folder
- rename: Renaming a file (provide targetPath)
- move: Moving a file to different location (provide targetPath)
- modify: Modifying existing file content
- overwrite: Replacing entire file content

Returns: "allowed" or "denied" - proceed only if allowed
</parameters>

<example>
request_file_permission({
  operation: "create",
  filePath: "/Users/john/Desktop/report.txt"
})
// Wait for response, then proceed only if "allowed"
</example>
</tool>

<important name="user-communication">
CRITICAL: The user CANNOT see your text output or CLI prompts!
To ask ANY question or get user input, you MUST use the AskUserQuestion MCP tool.
See the ask-user-question skill for full documentation and examples.
</important>


<behavior>
- Use AskUserQuestion tool for clarifying questions before starting ambiguous tasks
- Use MCP tools directly - browser_navigate, browser_snapshot, browser_click, browser_type, browser_screenshot, browser_sequence
- **NEVER use shell commands (open, xdg-open, start, subprocess, webbrowser) to open browsers or URLs** - these open the user's default browser, not the automation-controlled Chrome. ALL browser operations MUST use browser_* MCP tools.

**BROWSER ACTION VERBOSITY - Be descriptive about web interactions:**
- Before each browser action, briefly explain what you're about to do in user terms
- After navigation: mention the page title and what you see
- After clicking: describe what you clicked and what happened (new page loaded, form appeared, etc.)
- After typing: confirm what you typed and where
- When analyzing a snapshot: describe the key elements you found
- If something unexpected happens, explain what you see and how you'll adapt

Example good narration:
"I'll navigate to Google... The search page is loaded. I can see the search box. Let me search for 'cute animals'... Typing in the search field and pressing Enter... The search results page is now showing with images and links about animals."

Example bad narration (too terse):
"Done." or "Navigated." or "Clicked."

- After each action, evaluate the result before deciding next steps
- Use browser_sequence for efficiency when you need to perform multiple actions in quick succession (e.g., filling a form with multiple fields)
- Don't announce server checks or startup - proceed directly to the task
- Only use AskUserQuestion when you genuinely need user input or decisions

**TASK COMPLETION - CRITICAL:**
##############################################################################
# YOU ARE AGENTIC - KEEP WORKING UNTIL DONE
##############################################################################

You may ONLY stop when ONE of these conditions is met:

1. **SUCCESS**: The user's ACTUAL GOAL is achieved with a DELIVERABLE
   - For "put product on beach" → You produced the composite image
   - For "create email sequence" → You wrote out the full sequence
   - For "update Shopify product" → The product is updated and confirmed
   - ALWAYS end with: "Task completed. Here's what I did: [summary]"

2. **BLOCKED**: You hit an unresolvable issue
   - Explain what you tried and what's blocking you
   - State what remains: "Unable to complete [X] because [reason]"

INTERMEDIATE STEPS ARE NOT COMPLETION:
- Taking a screenshot ≠ done
- Navigating to a page ≠ done  
- Finding an image ≠ done
- Loading a skill ≠ done

These are STEPS. Keep going until you have a RESULT the user can use.

If unsure whether you're done → YOU'RE NOT DONE. Keep working.
##############################################################################
</behavior>

<skill name="shopify-integration">
You have DIRECT ACCESS to the user's Shopify store via MCP tools. When Shopify is connected, you can:

<available-tools>
- **shopify_get_products** - List products (with filters for status, type, vendor)
- **shopify_get_product** - Get detailed info about a specific product
- **shopify_search_products** - Search products by title
- **shopify_create_product** - Create a NEW product (title, description, price, image, status)
- **shopify_update_product** - Update product details (title, description, tags, status)
- **shopify_update_variant_price** - Change product pricing
- **shopify_get_orders** - List recent orders (filter by status, payment, fulfillment)
- **shopify_get_order** - Get details of a specific order
- **shopify_get_inventory** - Check inventory levels
- **shopify_set_inventory** - Set inventory quantity at a location
- **shopify_get_locations** - List inventory locations
- **shopify_add_product_image** - Add image to a product from URL
- **shopify_get_shop** - Get store information
</available-tools>

<workflow>
For Shopify tasks:
1. If the task involves products, orders, or inventory - USE THE SHOPIFY TOOLS directly
2. No need to browse the admin panel - you have API access
3. After making changes, confirm with the user what was updated
4. For bulk operations, work through products one at a time or in batches
</workflow>

<examples>
User: "Update the description for my Blue T-Shirt"
→ Use shopify_search_products to find it, then shopify_update_product to update

User: "How many orders did I get this week?"
→ Use shopify_get_orders with appropriate status filters

User: "Set all jackets to 10% off"
→ Search for jackets, then update each variant price with shopify_update_variant_price
</examples>
</skill>

<skill name="brandwork-spaces">
BrandWork Spaces are specialized AI workflows optimized for e-commerce image tasks.

<critical-rule>
WHEN USER WANTS TO PLACE A PRODUCT IN A NEW SCENE OR CHANGE BACKGROUND:
→ USE space_product_swap (NOT background_remover)

space_background_remover ONLY removes backgrounds to create transparent cutouts.
space_product_swap places a product INTO a new scene/background - THIS IS WHAT YOU WANT FOR:
- "Put product on [location]"
- "Place product in front of [scene]"  
- "Change background to [scene]"
- "Show product at [location]"
</critical-rule>

<available-spaces>
| Tool | Use Case | Required Inputs |
|------|----------|-----------------|
| **space_product_swap** | Place product in new scene/background | product_image (URL), reference_image (URL) |
| **space_steal_the_look** | Match editorial/lifestyle style | product_image (URL), reference_image (URL) |
| **space_sketch_to_product** | Convert sketches to realistic renders | product_sketches (URL) |
| **space_background_remover** | ONLY for transparent cutouts (no new background) | input_image (URL) |
</available-spaces>

<workflow name="background-swap">
When user wants to place a product in a new scene/background (e.g., "put shoes on Gateway of India"):

1. **Get product image URL** - from Shopify product or user-provided
2. **Get reference/background image URL** - browse web to find the scene image (e.g., Gateway of India photo)
3. **Call space_product_swap** with both URLs:
   - product_image: URL of the product (e.g., shoe image)
   - reference_image: URL of the background/scene (e.g., Gateway of India)
4. **Upload result to Shopify** if requested

IMPORTANT: space_product_swap composites the product INTO the reference scene. 
The reference_image is the BACKGROUND, and the product is placed on/in it.
</workflow>

<decision-tree>
User wants to:
├── Place product in a scene/location → space_product_swap
├── Change/swap background → space_product_swap
├── Put product "on" or "in front of" something → space_product_swap
├── Match a style/aesthetic → space_steal_the_look
├── Get transparent cutout (no new background) → space_background_remover
└── Convert sketch to render → space_sketch_to_product
</decision-tree>

<examples>
"Put the shoes on Gateway of India" → space_product_swap (product=shoes, reference=Gateway photo)
"Place product in front of Mumbai skyline" → space_product_swap
"Put this sneaker on a beach" → space_product_swap (product=sneaker, reference=beach photo)
"Show this t-shirt in a studio setting" → space_product_swap
"Remove the background" → space_background_remover
"Make it look editorial" → space_steal_the_look
</examples>

<space-tool-reference>
SPACE TOOLS AVAILABLE (use when appropriate):

**space_product_swap**: Places a PRODUCT into a new scene/background
- Input: product_image (the product to extract), reference_image (the scene to place it in)
- Use for: Shoes, clothing items, accessories, packaged products
- NOT for: Changing a person's/model's background (will replace the person!)
- Example: "Put this sneaker on a beach" ✓
- Example: "Show this handbag in a luxury setting" ✓
- Example: "Change this model's background" ✗ (use Gemini instead - the person will be replaced if you use this!)

**space_background_remover**: Removes background from any image
- Input: input_image
- Use for: Products OR people - creates transparent background
- Example: "Remove the background from this product photo" ✓
- Example: "Give me a cutout of this person" ✓

**space_steal_the_look**: Applies editorial/lifestyle styling to product shots
- Input: product_image, reference_image (style reference)
- Use for: Making product photos look more editorial/professional

**space_sketch_to_product**: Converts sketches to realistic product images
- Input: sketch_image
- Use for: Turning hand-drawn sketches into product visualizations

TECHNICAL NOTES:
- Space tools take 60-90 seconds to complete - this is normal
- If a space tool fails, retry up to 3 times before trying alternatives
- URLs must be HTTPS and publicly accessible
</space-tool-reference>

<space-tool-behavior>
##############################################################################
# CRITICAL: COMMUNICATE BEFORE LONG-RUNNING SPACE OPERATIONS
##############################################################################

BEFORE calling any space_* tool, ALWAYS write a brief message explaining:
1. What you're about to do
2. What inputs you're using

Example:
"I'll now place the product on the beach background using Product Swap.
- Product: The H&M summer outfit
- Scene: Tropical beach with blue water

This generates high-quality composite images."

Then call the tool. This keeps the user informed during long-running operations.
Never call a Space tool without first explaining what you're doing.
##############################################################################
</space-tool-behavior>
</skill>

<skill name="image-generation">
##############################################################################
# GEMINI IMAGE GENERATION
##############################################################################

Use Gemini API for image generation tasks. This is a powerful tool for:

<when-to-use>
✅ Generating NEW images from text descriptions (pure creation)
✅ Editing/modifying images with a person (changing backgrounds, styling, etc.)
✅ Creative image manipulation that doesn't fit a specific space tool
✅ When a space tool is NOT the right fit for the task

Examples:
- "Generate a futuristic sneaker design" → Gemini (pure creation)
- "Create an illustration of a cat" → Gemini (pure creation)
- "Change this model's background to a studio" → Gemini (person + new background)
- "Put this person in a beach setting" → Gemini (person editing, NOT space_product_swap)
</when-to-use>

<how-to-generate>
\`\`\`bash
curl -s "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp-image-generation:generateContent?key=$GOOGLE_GENERATIVE_AI_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "contents": [{"parts": [{"text": "YOUR_PROMPT_HERE"}]}],
    "generationConfig": {
      "temperature": 1.0,
      "responseModalities": ["image", "text"]
    }
  }' | jq -r '.candidates[0].content.parts[] | select(.inlineData) | .inlineData.data' | base64 -d > output.png
\`\`\`
</how-to-generate>

<consistency-for-model-shoots>
##############################################################################
# CRITICAL: MAINTAINING CONSISTENCY FOR MODEL/PRODUCT PHOTOSHOOTS
##############################################################################

When generating multiple product images with the SAME model (person), follow this workflow:

1. **FIRST IMAGE - Establish the model reference:**
   Generate ONE high-quality image with very detailed model description:
   "Professional product photo of [detailed model description: ethnicity, age, hair color/style, 
   body type, facial features]. Model wearing [product]. Studio lighting, white background."
   
   SAVE this exact model description for ALL subsequent images.

2. **SUBSEQUENT IMAGES - Maintain consistency:**
   Use THE EXACT SAME model description for every product:
   "Professional product photo of [SAME detailed model description from step 1]. 
   Model wearing [different product]. Studio lighting, white background."

3. **Key consistency elements to specify:**
   - Exact same ethnicity and age range
   - Same hair color, length, and style
   - Same body type/build
   - Same lighting setup (e.g., "soft studio lighting, white backdrop")
   - Same pose style (e.g., "standing straight, facing camera")
   - Same expression type (e.g., "neutral confident expression")

EXAMPLE consistent prompt pattern:
Image 1: "Professional photo of a Caucasian male model, mid-20s, short brown hair, 
athletic build, clean-shaven, confident expression. Wearing navy blue polo shirt. 
Studio lighting, white background, full body shot."

Image 2: "Professional photo of a Caucasian male model, mid-20s, short brown hair, 
athletic build, clean-shaven, confident expression. Wearing black jogger pants. 
Studio lighting, white background, full body shot."

(Same model description, different product)

WITHOUT this consistency, each image will have a different random model!
##############################################################################
</consistency-for-model-shoots>
</skill>

<marketing-skills>
##############################################################################
# MARKETING SKILLS - Expert Frameworks for E-commerce Marketing Tasks
##############################################################################

You have access to 23 specialized marketing skills via the skill-loader MCP server.
These skills provide expert frameworks, templates, checklists, and step-by-step guidance
for marketing tasks commonly needed by e-commerce brands.

<when-to-load-a-skill>
Load a marketing skill when the user asks for help with:
- Copywriting (landing pages, product descriptions, emails, ads)
- SEO (audits, schema markup, programmatic SEO)
- Conversion optimization (CRO for pages, forms, popups, onboarding, signup flows)
- Marketing strategy (pricing, launches, referrals, competitor analysis)
- Content creation (social media, paid ads)
- Analytics and testing (tracking setup, A/B tests)

For complex marketing tasks, ALWAYS load the relevant skill first - the frameworks
significantly improve output quality. For simple questions, use your judgment.
</when-to-load-a-skill>

<how-to-use>
1. Identify which skill matches the user's marketing request
2. Call load_skill(skill_name) to get the full expert framework
3. Follow the skill's methodology to complete the task
4. Some skills reference other skills (e.g., "use copy-editing after drafting") - follow these naturally
</how-to-use>

<available-marketing-skills>
| Skill | Use When User Wants To... |
|-------|---------------------------|
| copywriting | Write/improve marketing copy for pages, headlines, CTAs |
| copy-editing | Polish, edit, and refine existing copy |
| email-sequence | Create email campaigns, drip sequences, newsletters |
| seo-audit | Audit SEO issues, technical SEO, on-page optimization |
| schema-markup | Add structured data/JSON-LD for rich snippets |
| programmatic-seo | Build landing pages at scale for keyword targeting |
| page-cro | Optimize landing/product page conversion rates |
| form-cro | Optimize form design and completion rates |
| popup-cro | Design effective popups, modals, slide-ins |
| onboarding-cro | Improve user onboarding and activation flows |
| signup-flow-cro | Optimize signup/registration conversions |
| paywall-upgrade-cro | Optimize upgrade flows and paywall conversions |
| pricing-strategy | Set, test, or optimize pricing and packaging |
| competitor-alternatives | Create comparison pages, "vs" pages, alternative pages |
| launch-strategy | Plan and execute product/feature launches |
| referral-program | Design viral referral and word-of-mouth programs |
| free-tool-strategy | Create free tools as marketing/lead-gen assets |
| marketing-ideas | Generate creative marketing and growth ideas |
| marketing-psychology | Apply psychological principles to marketing |
| social-content | Create social media content and strategies |
| paid-ads | Create paid ad campaigns (Google, Meta, etc.) |
| analytics-tracking | Set up analytics, tracking, and attribution |
| ab-test-setup | Design and run A/B tests properly |
</available-marketing-skills>

<example-usage>
User: "Help me write copy for my product landing page"
→ Call load_skill("copywriting"), then follow its framework

User: "Audit my site's SEO"
→ Call load_skill("seo-audit"), then systematically check each area

User: "Create an email welcome sequence"
→ Call load_skill("email-sequence"), then design using its templates

User: "How should I price my SaaS product?"
→ Call load_skill("pricing-strategy"), then apply its methodology
</example-usage>
</marketing-skills>
`;

interface AgentConfig {
  description?: string;
  prompt?: string;
  mode?: 'primary' | 'subagent' | 'all';
}

interface McpServerConfig {
  type?: 'local' | 'remote';
  command?: string[];
  url?: string;
  enabled?: boolean;
  environment?: Record<string, string>;
  timeout?: number;
}

interface OllamaProviderModelConfig {
  name: string;
  tools?: boolean;
}

interface OllamaProviderConfig {
  npm: string;
  name: string;
  options: {
    baseURL: string;
  };
  models: Record<string, OllamaProviderModelConfig>;
}

interface BedrockProviderConfig {
  options: {
    region: string;
    profile?: string;
  };
}

interface OpenRouterProviderModelConfig {
  name: string;
  tools?: boolean;
}

interface OpenRouterProviderConfig {
  npm: string;
  name: string;
  options: {
    baseURL: string;
  };
  models: Record<string, OpenRouterProviderModelConfig>;
}

interface LiteLLMProviderModelConfig {
  name: string;
  tools?: boolean;
}

interface LiteLLMProviderConfig {
  npm: string;
  name: string;
  options: {
    baseURL: string;
    apiKey?: string;
  };
  models: Record<string, LiteLLMProviderModelConfig>;
}

interface ZaiProviderModelConfig {
  name: string;
  tools?: boolean;
}

interface ZaiProviderConfig {
  npm: string;
  name: string;
  options: {
    baseURL: string;
  };
  models: Record<string, ZaiProviderModelConfig>;
}

type ProviderConfig = OllamaProviderConfig | BedrockProviderConfig | OpenRouterProviderConfig | LiteLLMProviderConfig | ZaiProviderConfig;

interface OpenCodeConfig {
  $schema?: string;
  model?: string;
  default_agent?: string;
  enabled_providers?: string[];
  permission?: string | Record<string, string | Record<string, string>>;
  agent?: Record<string, AgentConfig>;
  mcp?: Record<string, McpServerConfig>;
  provider?: Record<string, ProviderConfig>;
}

/**
 * Generate OpenCode configuration file
 * OpenCode reads config from .opencode.json in the working directory or
 * from ~/.config/opencode/opencode.json
 */
export async function generateOpenCodeConfig(): Promise<string> {
  const configDir = path.join(app.getPath('userData'), 'opencode');
  const configPath = path.join(configDir, 'opencode.json');

  // Ensure directory exists
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  // Get skills directory path
  const skillsPath = getSkillsPath();

  // Build platform-specific system prompt by replacing placeholders
  const systemPrompt = ACCOMPLISH_SYSTEM_PROMPT_TEMPLATE
    .replace(/\{\{SKILLS_PATH\}\}/g, skillsPath)
    .replace(/\{\{ENVIRONMENT_INSTRUCTIONS\}\}/g, getPlatformEnvironmentInstructions());

  // Get OpenCode config directory (parent of skills/) for OPENCODE_CONFIG_DIR
  const openCodeConfigDir = getOpenCodeConfigDir();

  console.log('[OpenCode Config] Skills path:', skillsPath);
  console.log('[OpenCode Config] OpenCode config dir:', openCodeConfigDir);

  // Build file-permission MCP server command
  const filePermissionServerPath = path.join(skillsPath, 'file-permission', 'src', 'index.ts');

  // Get connected providers from new settings (with legacy fallback)
  const providerSettings = getProviderSettings();
  const connectedIds = getConnectedProviderIds();
  const activeModel = getActiveProviderModel();

  // Map our provider IDs to OpenCode CLI provider names
  const providerIdToOpenCode: Record<ProviderId, string> = {
    anthropic: 'anthropic',
    openai: 'openai',
    google: 'google',
    xai: 'xai',
    deepseek: 'deepseek',
    zai: 'zai-coding-plan',
    bedrock: 'amazon-bedrock',
    ollama: 'ollama',
    openrouter: 'openrouter',
    litellm: 'litellm',
  };

  // Build enabled providers list from new settings or fall back to base providers
  const baseProviders = ['anthropic', 'openai', 'openrouter', 'google', 'xai', 'deepseek', 'zai-coding-plan', 'amazon-bedrock'];
  let enabledProviders = baseProviders;

  // If we have connected providers in the new settings, use those
  if (connectedIds.length > 0) {
    const mappedProviders = connectedIds.map(id => providerIdToOpenCode[id]);
    // Always include base providers to allow switching
    enabledProviders = [...new Set([...baseProviders, ...mappedProviders])];
    console.log('[OpenCode Config] Using connected providers from new settings:', mappedProviders);
  } else {
    // Legacy fallback: add ollama if configured in old settings
    const ollamaConfig = getOllamaConfig();
    if (ollamaConfig?.enabled) {
      enabledProviders = [...baseProviders, 'ollama'];
    }
  }

  // Build provider configurations
  const providerConfig: Record<string, ProviderConfig> = {};

  // Configure Ollama if connected (check new settings first, then legacy)
  const ollamaProvider = providerSettings.connectedProviders.ollama;
  if (ollamaProvider?.connectionStatus === 'connected' && ollamaProvider.credentials?.type === 'ollama') {
    // New provider settings: Ollama is connected
    if (ollamaProvider.selectedModelId) {
      providerConfig.ollama = {
        npm: '@ai-sdk/openai-compatible',
        name: 'Ollama (local)',
        options: {
          baseURL: `${ollamaProvider.credentials.serverUrl}/v1`,
        },
        models: {
          [ollamaProvider.selectedModelId]: {
            name: ollamaProvider.selectedModelId,
            tools: true,
          },
        },
      };
      console.log('[OpenCode Config] Ollama configured from new settings:', ollamaProvider.selectedModelId);
    }
  } else {
    // Legacy fallback: use old Ollama config
    const ollamaConfig = getOllamaConfig();
    if (ollamaConfig?.enabled && ollamaConfig.models && ollamaConfig.models.length > 0) {
      const ollamaModels: Record<string, OllamaProviderModelConfig> = {};
      for (const model of ollamaConfig.models) {
        ollamaModels[model.id] = {
          name: model.displayName,
          tools: true,
        };
      }

      providerConfig.ollama = {
        npm: '@ai-sdk/openai-compatible',
        name: 'Ollama (local)',
        options: {
          baseURL: `${ollamaConfig.baseUrl}/v1`,
        },
        models: ollamaModels,
      };

      console.log('[OpenCode Config] Ollama configured from legacy settings:', Object.keys(ollamaModels));
    }
  }

  // Configure OpenRouter if connected (check new settings first, then legacy)
  const openrouterProvider = providerSettings.connectedProviders.openrouter;
  if (openrouterProvider?.connectionStatus === 'connected' && activeModel?.provider === 'openrouter') {
    // New provider settings: OpenRouter is connected and active
    const modelId = activeModel.model.replace('openrouter/', '');
    providerConfig.openrouter = {
      npm: '@ai-sdk/openai-compatible',
      name: 'OpenRouter',
      options: {
        baseURL: 'https://openrouter.ai/api/v1',
      },
      models: {
        [modelId]: {
          name: modelId,
          tools: true,
        },
      },
    };
    console.log('[OpenCode Config] OpenRouter configured from new settings:', modelId);
  } else {
    // Legacy fallback: use old OpenRouter config
    const openrouterKey = getApiKey('openrouter');
    if (openrouterKey) {
      const { getSelectedModel } = await import('../store/appSettings');
      const selectedModel = getSelectedModel();

      const openrouterModels: Record<string, OpenRouterProviderModelConfig> = {};

      if (selectedModel?.provider === 'openrouter' && selectedModel.model) {
        const modelId = selectedModel.model.replace('openrouter/', '');
        openrouterModels[modelId] = {
          name: modelId,
          tools: true,
        };
      }

      if (Object.keys(openrouterModels).length > 0) {
        providerConfig.openrouter = {
          npm: '@ai-sdk/openai-compatible',
          name: 'OpenRouter',
          options: {
            baseURL: 'https://openrouter.ai/api/v1',
          },
          models: openrouterModels,
        };
        console.log('[OpenCode Config] OpenRouter configured from legacy settings:', Object.keys(openrouterModels));
      }
    }
  }

  // Configure Bedrock if connected (check new settings first, then legacy)
  const bedrockProvider = providerSettings.connectedProviders.bedrock;
  if (bedrockProvider?.connectionStatus === 'connected' && bedrockProvider.credentials?.type === 'bedrock') {
    // New provider settings: Bedrock is connected
    const creds = bedrockProvider.credentials;
    const bedrockOptions: BedrockProviderConfig['options'] = {
      region: creds.region || 'us-east-1',
    };
    if (creds.authMethod === 'profile' && creds.profileName) {
      bedrockOptions.profile = creds.profileName;
    }
    providerConfig['amazon-bedrock'] = {
      options: bedrockOptions,
    };
    console.log('[OpenCode Config] Bedrock configured from new settings:', bedrockOptions);
  } else {
    // Legacy fallback: use old Bedrock config
    const bedrockCredsJson = getApiKey('bedrock');
    if (bedrockCredsJson) {
      try {
        const creds = JSON.parse(bedrockCredsJson) as BedrockCredentials;

        const bedrockOptions: BedrockProviderConfig['options'] = {
          region: creds.region || 'us-east-1',
        };

        if (creds.authType === 'profile' && creds.profileName) {
          bedrockOptions.profile = creds.profileName;
        }

        providerConfig['amazon-bedrock'] = {
          options: bedrockOptions,
        };

        console.log('[OpenCode Config] Bedrock configured from legacy settings:', bedrockOptions);
      } catch (e) {
        console.warn('[OpenCode Config] Failed to parse Bedrock credentials:', e);
      }
    }
  }

  // Configure LiteLLM if connected (check new settings first, then legacy)
  const litellmProvider = providerSettings.connectedProviders.litellm;
  if (litellmProvider?.connectionStatus === 'connected' && litellmProvider.credentials?.type === 'litellm') {
    if (litellmProvider.selectedModelId) {
      providerConfig.litellm = {
        npm: '@ai-sdk/openai-compatible',
        name: 'LiteLLM',
        options: {
          baseURL: `${litellmProvider.credentials.serverUrl}/v1`,
        },
        models: {
          [litellmProvider.selectedModelId]: {
            name: litellmProvider.selectedModelId,
            tools: true,
          },
        },
      };
      console.log('[OpenCode Config] LiteLLM configured from new settings:', litellmProvider.selectedModelId);
    }
  } else {
    // Legacy fallback: use old LiteLLM config
    const litellmConfig = getLiteLLMConfig();
    if (litellmConfig?.enabled && litellmConfig.models && litellmConfig.models.length > 0) {
      const { getSelectedModel } = await import('../store/appSettings');
      const selectedModel = getSelectedModel();

      if (selectedModel?.provider === 'litellm' && selectedModel.model) {
        const modelId = selectedModel.model.replace('litellm/', '');
        
        const litellmApiKey = getApiKey('litellm');
        const litellmOptions: LiteLLMProviderConfig['options'] = {
          baseURL: `${litellmConfig.baseUrl}/v1`,
        };
        if (litellmApiKey) {
          litellmOptions.apiKey = litellmApiKey;
        }

        providerConfig.litellm = {
          npm: '@ai-sdk/openai-compatible',
          name: 'LiteLLM',
          options: litellmOptions,
          models: {
            [modelId]: {
              name: modelId,
              tools: true,
            },
          },
        };
        console.log('[OpenCode Config] LiteLLM configured from legacy settings:', modelId);
      }
    }
  }

  // Add Z.AI Coding Plan provider configuration with all supported models
  // This is needed because OpenCode's built-in zai-coding-plan provider may not have all models
  const zaiKey = getApiKey('zai');
  if (zaiKey) {
    const zaiModels: Record<string, ZaiProviderModelConfig> = {
      'glm-4.7-flashx': { name: 'GLM-4.7 FlashX (Latest)', tools: true },
      'glm-4.7': { name: 'GLM-4.7', tools: true },
      'glm-4.7-flash': { name: 'GLM-4.7 Flash', tools: true },
      'glm-4.6': { name: 'GLM-4.6', tools: true },
      'glm-4.5-flash': { name: 'GLM-4.5 Flash', tools: true },
    };

    providerConfig['zai-coding-plan'] = {
      npm: '@ai-sdk/openai-compatible',
      name: 'Z.AI Coding Plan',
      options: {
        baseURL: 'https://open.bigmodel.cn/api/paas/v4',
      },
      models: zaiModels,
    };
    console.log('[OpenCode Config] Z.AI Coding Plan provider configured with models:', Object.keys(zaiModels));
  }

  const config: OpenCodeConfig = {
    $schema: 'https://opencode.ai/config.json',
    default_agent: ACCOMPLISH_AGENT_NAME,
    // Enable all supported providers - providers auto-configure when API keys are set via env vars
    enabled_providers: enabledProviders,
    // Auto-allow all tool permissions - the system prompt instructs the agent to use
    // AskUserQuestion for user confirmations, which shows in the UI as an interactive modal.
    // CLI-level permission prompts don't show in the UI and would block task execution.
    permission: 'allow',
    provider: Object.keys(providerConfig).length > 0 ? providerConfig : undefined,
    agent: {
      [ACCOMPLISH_AGENT_NAME]: {
        description: 'Browser automation assistant using dev-browser',
        prompt: systemPrompt,
        mode: 'primary',
      },
    },
    // MCP servers for additional tools
    mcp: {
      'file-permission': {
        type: 'local',
        command: ['npx', 'tsx', filePermissionServerPath],
        enabled: true,
        environment: {
          PERMISSION_API_PORT: String(PERMISSION_API_PORT),
        },
        timeout: 10000,
      },
      'ask-user-question': {
        type: 'local',
        command: ['npx', 'tsx', path.join(skillsPath, 'ask-user-question', 'src', 'index.ts')],
        enabled: true,
        environment: {
          QUESTION_API_PORT: String(QUESTION_API_PORT),
        },
        timeout: 10000,
      },
      // Browser automation MCP server (from remote)
      'dev-browser-mcp': {
        type: 'local',
        command: ['npx', 'tsx', path.join(skillsPath, 'dev-browser-mcp', 'src', 'index.ts')],
        enabled: true,
        timeout: 30000,  // Longer timeout for browser operations
      },
      // Space runtime for AI image workflows (our feature)
      'space-runtime': {
        type: 'local',
        command: ['npx', 'tsx', path.join(skillsPath, 'space-runtime', 'src', 'index.ts')],
        enabled: true,
        environment: {
          // Old API Gateway URL (30s timeout limit): https://8yivyeg6kd.execute-api.ap-south-1.amazonaws.com
          // Using Lambda Function URL for no timeout limit
          SPACE_RUNTIME_URL: process.env.SPACE_RUNTIME_URL || 'https://mp3a5rmdpmpqphordszcahy5bm0okvjt.lambda-url.ap-south-1.on.aws',
        },
        timeout: 180000, // 3 minutes - spaces can take 60-90s plus network variance
      },
      // Marketing skill loader (our feature)
      'skill-loader': {
        type: 'local',
        command: ['npx', 'tsx', path.join(skillsPath, 'skill-loader', 'src', 'index.ts')],
        enabled: true,
        environment: {
          MARKETING_SKILLS_PATH: path.join(skillsPath, 'marketing-skills'),
        },
        timeout: 10000,
      },
    },
  };

  // Conditionally add Shopify MCP server if connected (our feature)
  const shopifyCredentials = getShopifyCredentials();
  if (shopifyCredentials && config.mcp) {
    config.mcp['shopify'] = {
      type: 'local',
      command: ['npx', 'tsx', path.join(skillsPath, 'shopify', 'src', 'index.ts')],
      enabled: true,
      environment: {
        SHOPIFY_CREDENTIALS: JSON.stringify(shopifyCredentials),
      },
      timeout: 15000,
    };
    console.log('[OpenCode Config] Shopify MCP server configured for:', shopifyCredentials.shopDomain);
  }

  // Write config file
  const configJson = JSON.stringify(config, null, 2);
  fs.writeFileSync(configPath, configJson);

  // Set environment variables for OpenCode to find the config and skills
  process.env.OPENCODE_CONFIG = configPath;
  process.env.OPENCODE_CONFIG_DIR = openCodeConfigDir;

  console.log('[OpenCode Config] Generated config at:', configPath);
  console.log('[OpenCode Config] Full config:', configJson);
  console.log('[OpenCode Config] OPENCODE_CONFIG env set to:', process.env.OPENCODE_CONFIG);
  console.log('[OpenCode Config] OPENCODE_CONFIG_DIR env set to:', process.env.OPENCODE_CONFIG_DIR);

  return configPath;
}

/**
 * Get the path where OpenCode config is stored
 */
export function getOpenCodeConfigPath(): string {
  return path.join(app.getPath('userData'), 'opencode', 'opencode.json');
}

/**
 * Get the path to OpenCode CLI's auth.json
 * OpenCode stores credentials in ~/.local/share/opencode/auth.json
 */
export function getOpenCodeAuthPath(): string {
  const homeDir = app.getPath('home');
  if (process.platform === 'win32') {
    return path.join(homeDir, 'AppData', 'Local', 'opencode', 'auth.json');
  }
  return path.join(homeDir, '.local', 'share', 'opencode', 'auth.json');
}

/**
 * Sync API keys from Openwork's secure storage to OpenCode CLI's auth.json
 * This allows OpenCode CLI to recognize DeepSeek and Z.AI providers
 */
export async function syncApiKeysToOpenCodeAuth(): Promise<void> {
  const { getAllApiKeys } = await import('../store/secureStorage');
  const apiKeys = await getAllApiKeys();

  const authPath = getOpenCodeAuthPath();
  const authDir = path.dirname(authPath);

  // Ensure directory exists
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }

  // Read existing auth.json or create empty object
  let auth: Record<string, { type: string; key: string }> = {};
  if (fs.existsSync(authPath)) {
    try {
      auth = JSON.parse(fs.readFileSync(authPath, 'utf-8'));
    } catch (e) {
      console.warn('[OpenCode Auth] Failed to parse existing auth.json, creating new one');
      auth = {};
    }
  }

  let updated = false;

  // Sync DeepSeek API key
  if (apiKeys.deepseek) {
    if (!auth['deepseek'] || auth['deepseek'].key !== apiKeys.deepseek) {
      auth['deepseek'] = { type: 'api', key: apiKeys.deepseek };
      updated = true;
      console.log('[OpenCode Auth] Synced DeepSeek API key');
    }
  }

  // Sync Z.AI Coding Plan API key (maps to 'zai-coding-plan' provider in OpenCode CLI)
  if (apiKeys.zai) {
    if (!auth['zai-coding-plan'] || auth['zai-coding-plan'].key !== apiKeys.zai) {
      auth['zai-coding-plan'] = { type: 'api', key: apiKeys.zai };
      updated = true;
      console.log('[OpenCode Auth] Synced Z.AI Coding Plan API key');
    }
  }

  // Write updated auth.json
  if (updated) {
    fs.writeFileSync(authPath, JSON.stringify(auth, null, 2));
    console.log('[OpenCode Auth] Updated auth.json at:', authPath);
  }
}
