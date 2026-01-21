/**
 * Product Photography Space
 * 
 * AI-powered product image generation using Fal.ai
 * Generates lifestyle, studio, and styled product photos
 */

import { fal } from '@fal-ai/client';
import { getApiKey } from '../store/secureStorage';
import { generateBrandContext, getActiveBrandProfile } from '../store/brandMemory';

// Image style presets
export type ImageStyle = 'lifestyle' | 'studio' | 'flatlay' | 'model' | 'contextual';

export interface ProductPhotoRequest {
  productDescription: string;
  style: ImageStyle;
  backgroundHint?: string;
  aspectRatio?: '1:1' | '4:3' | '16:9' | '9:16';
  numImages?: number;
}

export interface GeneratedImage {
  url: string;
  seed: number;
  width: number;
  height: number;
}

export interface ProductPhotoResult {
  success: boolean;
  images?: GeneratedImage[];
  error?: string;
  metadata?: {
    style: ImageStyle;
    prompt: string;
    model: string;
    generationTime: number;
  };
}

// Style-specific prompt templates
const STYLE_PROMPTS: Record<ImageStyle, (product: string, background?: string) => string> = {
  lifestyle: (product, background) => 
    `Professional lifestyle product photography of ${product}. ${background || 'Natural setting with soft ambient lighting'}. Shot on high-end DSLR, shallow depth of field, warm tones, magazine quality, commercial photography.`,
  
  studio: (product, _background) => 
    `Professional studio product photography of ${product}. Clean white background, soft box lighting, no shadows, e-commerce quality, high resolution, centered composition, professional lighting setup.`,
  
  flatlay: (product, background) => 
    `Flatlay product photography of ${product}. Top-down view, ${background || 'minimalist surface with subtle props'}. Instagram-worthy, organized layout, soft diffused lighting, lifestyle flatlay aesthetic.`,
  
  model: (product, _background) => 
    `Professional fashion photography featuring ${product}. Model wearing/holding the product, natural pose, editorial style, soft studio lighting, fashion magazine quality.`,
  
  contextual: (product, background) => 
    `Product photography of ${product} in real-world context. ${background || 'Being used in its natural environment'}. Authentic lifestyle moment, natural lighting, storytelling composition, relatable setting.`,
};

/**
 * Initialize the Fal.ai client with API key
 */
async function initFalClient(): Promise<boolean> {
  const apiKey = await getApiKey('fal');
  if (!apiKey) {
    console.error('[ProductPhotography] No Fal.ai API key found');
    return false;
  }
  
  fal.config({
    credentials: apiKey,
  });
  
  return true;
}

/**
 * Generate product photos using Fal.ai
 */
export async function generateProductPhotos(
  request: ProductPhotoRequest
): Promise<ProductPhotoResult> {
  const startTime = Date.now();
  
  // Initialize client
  const initialized = await initFalClient();
  if (!initialized) {
    return {
      success: false,
      error: 'Fal.ai API key not configured. Please add your API key in Settings.',
    };
  }

  try {
    // Get brand context for enhanced prompts
    const brandProfile = getActiveBrandProfile();
    let brandContext = '';
    if (brandProfile) {
      brandContext = ` Brand style: ${brandProfile.style.imageStyle}, ${brandProfile.voice.template} aesthetic.`;
    }

    // Build the prompt
    const basePrompt = STYLE_PROMPTS[request.style](
      request.productDescription,
      request.backgroundHint
    );
    const fullPrompt = basePrompt + brandContext;

    // Determine dimensions based on aspect ratio
    const dimensions = getImageDimensions(request.aspectRatio || '1:1');

    console.log('[ProductPhotography] Generating images with prompt:', fullPrompt);

    // Call Fal.ai FLUX model (fast and high quality)
    const result = await fal.subscribe('fal-ai/flux/schnell', {
      input: {
        prompt: fullPrompt,
        image_size: {
          width: dimensions.width,
          height: dimensions.height,
        },
        num_images: request.numImages || 4,
        enable_safety_checker: true,
      },
      logs: true,
      onQueueUpdate: (update) => {
        if (update.status === 'IN_PROGRESS') {
          console.log('[ProductPhotography] Generation in progress...');
        }
      },
    });

    const generationTime = Date.now() - startTime;

    // Extract images from result
    const images: GeneratedImage[] = (result.data.images || []).map((img: { url: string; seed?: number; width?: number; height?: number }) => ({
      url: img.url,
      seed: img.seed || 0,
      width: img.width || dimensions.width,
      height: img.height || dimensions.height,
    }));

    console.log('[ProductPhotography] Generated', images.length, 'images in', generationTime, 'ms');

    return {
      success: true,
      images,
      metadata: {
        style: request.style,
        prompt: fullPrompt,
        model: 'fal-ai/flux/schnell',
        generationTime,
      },
    };
  } catch (error) {
    console.error('[ProductPhotography] Generation failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Image generation failed',
    };
  }
}

/**
 * Get image dimensions for aspect ratio
 */
function getImageDimensions(aspectRatio: string): { width: number; height: number } {
  switch (aspectRatio) {
    case '1:1':
      return { width: 1024, height: 1024 };
    case '4:3':
      return { width: 1024, height: 768 };
    case '16:9':
      return { width: 1024, height: 576 };
    case '9:16':
      return { width: 576, height: 1024 };
    default:
      return { width: 1024, height: 1024 };
  }
}

/**
 * Get available image styles with descriptions
 */
export function getImageStyles(): Array<{ id: ImageStyle; name: string; description: string }> {
  return [
    { id: 'lifestyle', name: 'Lifestyle', description: 'Product in a real-world setting with ambient lighting' },
    { id: 'studio', name: 'Studio', description: 'Clean white background, professional e-commerce style' },
    { id: 'flatlay', name: 'Flat Lay', description: 'Top-down view with curated props, Instagram-style' },
    { id: 'model', name: 'On Model', description: 'Product being worn or held by a model' },
    { id: 'contextual', name: 'Contextual', description: 'Product being used in its natural environment' },
  ];
}
