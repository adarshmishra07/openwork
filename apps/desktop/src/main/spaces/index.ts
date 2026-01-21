/**
 * Spaces - BrandWork Tool Library
 * 
 * Spaces are pre-built workflows that the AI agent can call to accomplish specific tasks.
 * They provide structured inputs/outputs and integrate with brand context.
 */

export * from './product-photography';
export * from './catalog-generator';
export * from './competitor-research';

// Space definitions for discovery
export interface SpaceDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: 'content' | 'images' | 'research' | 'shopify';
  requiresApiKey?: string;
}

export const AVAILABLE_SPACES: SpaceDefinition[] = [
  {
    id: 'product-photography',
    name: 'Product Photography',
    description: 'Generate AI product photos in various styles (lifestyle, studio, flatlay)',
    icon: 'camera',
    category: 'images',
    requiresApiKey: 'fal',
  },
  {
    id: 'catalog-generator',
    name: 'Catalog Generator',
    description: 'Generate product titles, descriptions, and SEO content in your brand voice',
    icon: 'file-text',
    category: 'content',
  },
  {
    id: 'competitor-research',
    name: 'Competitor Research',
    description: 'Analyze competitor websites, pricing, and strategies',
    icon: 'search',
    category: 'research',
  },
  {
    id: 'shopify-manager',
    name: 'Shopify Manager',
    description: 'Read and update products, inventory, and orders in your Shopify store',
    icon: 'shopping-bag',
    category: 'shopify',
    requiresApiKey: 'shopify',
  },
];

/**
 * Get all available spaces
 */
export function getAvailableSpaces(): SpaceDefinition[] {
  return AVAILABLE_SPACES;
}

/**
 * Check if a space is ready to use (has required API keys)
 */
export async function isSpaceReady(spaceId: string): Promise<boolean> {
  const space = AVAILABLE_SPACES.find(s => s.id === spaceId);
  if (!space) return false;
  
  if (!space.requiresApiKey) return true;
  
  // Dynamic import to avoid circular dependencies
  const { getApiKey } = await import('../store/secureStorage');
  const apiKey = await getApiKey(space.requiresApiKey);
  return Boolean(apiKey);
}
