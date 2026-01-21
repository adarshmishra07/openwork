/**
 * Catalog Generator Space
 * 
 * Generates product titles, descriptions, and metadata in brand voice
 * Uses the brand context to ensure consistent messaging
 */

import { generateBrandContext, getActiveBrandProfile, addBrandExample } from '../store/brandMemory';
import { getApiKey } from '../store/secureStorage';
import { getSelectedModel } from '../store/appSettings';

export interface ProductInput {
  name?: string;
  category?: string;
  features?: string[];
  materials?: string[];
  price?: number;
  images?: string[];
  existingDescription?: string;
}

export interface CatalogOutput {
  title: string;
  description: string;
  shortDescription: string;
  seoTitle: string;
  seoDescription: string;
  tags: string[];
  bulletPoints: string[];
}

export interface CatalogGeneratorRequest {
  products: ProductInput[];
  outputType: 'full' | 'titles-only' | 'descriptions-only' | 'seo-only';
  tone?: string;
  maxLength?: {
    title?: number;
    description?: number;
    shortDescription?: number;
  };
}

export interface CatalogGeneratorResult {
  success: boolean;
  outputs?: CatalogOutput[];
  error?: string;
  brandContext?: string;
  processingTime?: number;
}

/**
 * Generate catalog content for products
 * This builds the prompt with brand context and can be used with any LLM
 */
export async function generateCatalogContent(
  request: CatalogGeneratorRequest
): Promise<CatalogGeneratorResult> {
  const startTime = Date.now();

  try {
    // Get brand context
    const brandProfile = getActiveBrandProfile();
    const brandContext = generateBrandContext();
    
    if (!brandProfile) {
      return {
        success: false,
        error: 'No brand profile found. Please complete brand onboarding first.',
      };
    }

    // Build the system prompt
    const systemPrompt = buildCatalogSystemPrompt(brandContext, request);
    
    // Build the user prompt for products
    const userPrompt = buildProductPrompt(request.products, request.outputType);

    console.log('[CatalogGenerator] Generating content for', request.products.length, 'products');
    console.log('[CatalogGenerator] Output type:', request.outputType);

    // For now, return the prompts that can be used with the agent
    // The actual LLM call will be made by the OpenCode agent
    const outputs: CatalogOutput[] = request.products.map((product, index) => ({
      title: `[Generated Title for ${product.name || `Product ${index + 1}`}]`,
      description: `[Generated Description - Use the following prompt with the agent]\n\n${userPrompt}`,
      shortDescription: '',
      seoTitle: '',
      seoDescription: '',
      tags: [],
      bulletPoints: [],
    }));

    const processingTime = Date.now() - startTime;

    return {
      success: true,
      outputs,
      brandContext,
      processingTime,
    };
  } catch (error) {
    console.error('[CatalogGenerator] Generation failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Catalog generation failed',
    };
  }
}

/**
 * Build the system prompt for catalog generation
 */
function buildCatalogSystemPrompt(brandContext: string, request: CatalogGeneratorRequest): string {
  const maxLengths = request.maxLength || {};
  
  return `You are a professional e-commerce copywriter. Your task is to generate compelling product catalog content.

${brandContext}

## Output Requirements

${request.outputType === 'full' || request.outputType === 'titles-only' ? `
### Titles
- ${maxLengths.title || 60} characters max
- Include key product identifier
- SEO-friendly but natural sounding
` : ''}

${request.outputType === 'full' || request.outputType === 'descriptions-only' ? `
### Descriptions  
- ${maxLengths.description || 500} characters for full description
- ${maxLengths.shortDescription || 150} characters for short description
- Focus on benefits, not just features
- Use sensory language where appropriate
- Include call-to-action
` : ''}

${request.outputType === 'full' || request.outputType === 'seo-only' ? `
### SEO Content
- SEO Title: 50-60 characters, include primary keyword
- SEO Description: 150-160 characters, compelling and keyword-rich
- Tags: 5-10 relevant keywords
` : ''}

## Format
Return JSON with the following structure for each product:
{
  "title": "...",
  "description": "...",
  "shortDescription": "...",
  "seoTitle": "...",
  "seoDescription": "...",
  "tags": ["...", "..."],
  "bulletPoints": ["...", "..."]
}
`;
}

/**
 * Build the user prompt for products
 */
function buildProductPrompt(products: ProductInput[], outputType: string): string {
  const productDescriptions = products.map((product, index) => {
    const parts = [`Product ${index + 1}:`];
    
    if (product.name) parts.push(`Name: ${product.name}`);
    if (product.category) parts.push(`Category: ${product.category}`);
    if (product.features?.length) parts.push(`Features: ${product.features.join(', ')}`);
    if (product.materials?.length) parts.push(`Materials: ${product.materials.join(', ')}`);
    if (product.price) parts.push(`Price: $${product.price}`);
    if (product.existingDescription) parts.push(`Current Description: ${product.existingDescription}`);
    
    return parts.join('\n');
  }).join('\n\n---\n\n');

  return `Generate ${outputType === 'full' ? 'complete catalog content' : outputType.replace('-', ' ')} for the following product(s):

${productDescriptions}

Remember to write in the brand voice defined in the system prompt.`;
}

/**
 * Save a successful output as a brand example for learning
 */
export async function saveCatalogExample(
  brandId: string,
  input: ProductInput,
  output: CatalogOutput,
  rating?: number
): Promise<void> {
  const inputText = JSON.stringify(input);
  const outputText = JSON.stringify(output);
  
  addBrandExample(brandId, 'catalog', inputText, outputText, rating);
  console.log('[CatalogGenerator] Saved example for brand learning');
}

/**
 * Get template prompts for common catalog tasks
 */
export function getCatalogTemplates(): Array<{
  id: string;
  name: string;
  description: string;
  prompt: string;
}> {
  return [
    {
      id: 'new-product',
      name: 'New Product Launch',
      description: 'Generate complete content for a new product',
      prompt: 'Write compelling product copy for my new [PRODUCT]. Include title, description, and key selling points.',
    },
    {
      id: 'refresh-description',
      name: 'Refresh Description',
      description: 'Rewrite an existing product description in brand voice',
      prompt: 'Rewrite this product description in our brand voice: [PASTE EXISTING DESCRIPTION]',
    },
    {
      id: 'bulk-titles',
      name: 'Bulk Title Generation',
      description: 'Generate SEO-friendly titles for multiple products',
      prompt: 'Generate SEO-optimized product titles for these items: [LIST PRODUCTS]',
    },
    {
      id: 'seasonal-update',
      name: 'Seasonal Update',
      description: 'Add seasonal messaging to product descriptions',
      prompt: 'Update these product descriptions for [SEASON/HOLIDAY]: [PASTE DESCRIPTIONS]',
    },
  ];
}
