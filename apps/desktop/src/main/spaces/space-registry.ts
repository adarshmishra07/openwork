/**
 * Space Registry - Local registry for space matching
 * 
 * This mirrors the Python service registry for client-side matching
 */

export interface SpaceInput {
  name: string;
  type: 'image' | 'image[]' | 'string' | 'number' | 'boolean';
  required: boolean;
  description: string;
  default?: unknown;
}

export interface SpaceDefinition {
  id: string;
  name: string;
  description: string;
  category: 'images' | 'content' | 'research' | 'shopify';
  keywords: string[];
  patterns: string[];
  inputs: SpaceInput[];
  outputs: string[];
  estimatedDuration: string;
  apiProviders: string[];
  /** Whether this space uses brand memory for styling/context */
  usesBrandMemory?: boolean;
}

export interface SpaceRegistry {
  version: string;
  spaces: SpaceDefinition[];
}

/**
 * Local space registry - kept in sync with services/space-runtime/spaces/registry.json
 */
export const SPACE_REGISTRY: SpaceRegistry = {
  version: "1.0.0",
  spaces: [
    {
      id: "product-swap",
      name: "Product Swap",
      description: "Swap products between different backgrounds or contexts. Extract a product from one image and place it naturally into another scene.",
      category: "images",
      keywords: [
        "swap", "product swap", "replace product", "place product", "put product in",
        "composite", "background swap", "scene swap", "product placement",
        "insert product", "move product to"
      ],
      patterns: [
        "swap.*product", "place.*product.*in", "put.*product.*on",
        "replace.*background", "product.*different.*background", "move.*product.*to"
      ],
      inputs: [
        { name: "product_image", type: "image", required: true, description: "Image containing the product to extract" },
        { name: "reference_image", type: "image", required: true, description: "Scene/background to place the product into" },
        { name: "additional_instructions", type: "string", required: false, description: "Additional instructions for the swap" },
        { name: "num_variations", type: "number", required: false, description: "Number of variations to generate", default: 2 }
      ],
      outputs: ["image"],
      estimatedDuration: "30-60s",
      apiProviders: ["gemini"]
    },
    {
      id: "steal-the-look",
      name: "Steal the Look",
      description: "Editorial style transfer - generate variations that match the visual vibe of a reference image while featuring your product naturally.",
      category: "images",
      keywords: [
        "steal the look", "style transfer", "editorial style", "match style",
        "same vibe", "campaign style", "fashion editorial", "look and feel",
        "visual style", "aesthetic match", "inspired by", "similar style to"
      ],
      patterns: [
        "steal.*look", "style.*transfer", "match.*style", "same.*vibe",
        "like.*this.*image", "inspired.*by", "editorial.*style", "campaign.*style"
      ],
      inputs: [
        { name: "product_image", type: "image", required: true, description: "Product image to feature" },
        { name: "reference_image", type: "image", required: true, description: "Reference image defining the editorial vibe" },
        { name: "custom_description", type: "string", required: false, description: "Custom styling instructions" },
        { name: "num_variations", type: "number", required: false, description: "Number of variations to generate", default: 2 }
      ],
      outputs: ["image"],
      estimatedDuration: "45-90s",
      apiProviders: ["gemini"]
    },
    {
      id: "sketch-to-product",
      name: "Sketch to Product",
      description: "Transform conceptual sketches into production-ready photorealistic 2K renders. Supports multiple sketches, material references, and logos.",
      category: "images",
      keywords: [
        "sketch to product", "sketch to render", "concept to product",
        "drawing to photo", "sketch to photo", "render sketch", "visualize sketch",
        "product visualization", "concept render", "design to product", "mockup from sketch"
      ],
      patterns: [
        "sketch.*to.*(product|render|photo)", "render.*sketch", "visualize.*sketch",
        "turn.*sketch.*into", "convert.*sketch", "design.*to.*product", "concept.*to.*product"
      ],
      inputs: [
        { name: "product_sketches", type: "image[]", required: true, description: "Sketch image(s) to transform" },
        { name: "additional_images", type: "image[]", required: false, description: "Reference images (logos, textures, materials)" },
        { name: "core_material", type: "string", required: false, description: "Primary material for the product" },
        { name: "accent_color", type: "string", required: false, description: "Accent color (HEX/RAL code)" },
        { name: "dimensions", type: "string", required: false, description: "Product dimensions" },
        { name: "custom_description", type: "string", required: false, description: "Additional instructions" },
        { name: "num_variations", type: "number", required: false, description: "Number of variations/views to generate", default: 5 }
      ],
      outputs: ["image"],
      estimatedDuration: "60-120s",
      apiProviders: ["openai", "gemini"]
    },
    {
      id: "background-remover",
      name: "Background Remover",
      description: "Remove background from product images to create clean cutouts with transparent backgrounds.",
      category: "images",
      keywords: [
        "remove background", "background removal", "cutout", "transparent background",
        "isolate product", "extract product", "no background", "white background",
        "clean background", "product cutout"
      ],
      patterns: [
        "remove.*background", "background.*removal", "transparent.*background",
        "cutout", "isolate.*product", "extract.*from.*background", "no.*background"
      ],
      inputs: [
        { name: "input_image", type: "image", required: true, description: "Image to remove background from" }
      ],
      outputs: ["image"],
      estimatedDuration: "5-15s",
      apiProviders: ["prodia"]
    },
    {
      id: "store-display-banner",
      name: "Store Display Banner",
      description: "Generate large-format promotional posters and store display banners. Creates cinematic, atmospheric visuals optimized for in-store impact with dramatic product staging and integrated typography.",
      category: "images",
      keywords: [
        "store display", "banner", "poster", "promotional", "signage", "display banner",
        "store poster", "retail display", "promotional banner", "large format",
        "window display", "store signage", "sale poster", "campaign poster",
        "marketing banner", "retail poster", "shop display"
      ],
      patterns: [
        "store.*display", "display.*banner", "promotional.*poster", "retail.*banner",
        "store.*poster", "shop.*signage", "sale.*banner", "campaign.*poster",
        "window.*display", "large.*format.*poster", "marketing.*banner"
      ],
      inputs: [
        { name: "product_images", type: "image[]", required: false, description: "Product images to feature in the banner" },
        { name: "user_query", type: "string", required: true, description: "Campaign message, offer text, or style direction (e.g., 'End of Season Sale 50% Off')" },
        { name: "aspect_ratio", type: "string", required: false, description: "Aspect ratio (e.g., '2:3', '16:9', '1:1')", default: "1:1" },
        { name: "output_format", type: "string", required: false, description: "Output format (jpeg, png)", default: "png" },
        { name: "reference_image", type: "image", required: false, description: "Reference/moodboard image for style extraction" },
        { name: "num_variations", type: "number", required: false, description: "Number of design variations to generate", default: 4 }
      ],
      outputs: ["image"],
      estimatedDuration: "60-120s",
      apiProviders: ["openai", "gemini"],
      usesBrandMemory: true
    }
  ]
};

/**
 * Get all available spaces
 */
export function getSpaces(): SpaceDefinition[] {
  return SPACE_REGISTRY.spaces;
}

/**
 * Get a space by ID
 */
export function getSpaceById(id: string): SpaceDefinition | undefined {
  return SPACE_REGISTRY.spaces.find(s => s.id === id);
}
