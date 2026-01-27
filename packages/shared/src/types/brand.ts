/**
 * Brand-related types for BrandWork
 */

/**
 * Brand voice template options
 */
export type BrandVoiceTemplate = 
  | 'professional'
  | 'friendly'
  | 'playful'
  | 'luxury'
  | 'minimal'
  | 'custom';

/**
 * Brand voice configuration
 */
export interface BrandVoice {
  template: BrandVoiceTemplate;
  tone: string;
  personality: string[];
  vocabulary: {
    preferred: string[];
    avoided: string[];
  };
  examples: string[];
}

/**
 * Brand visual style (simple version for onboarding)
 */
export interface BrandStyle {
  primaryColor: string;
  secondaryColor: string;
  fontStyle: 'modern' | 'classic' | 'bold' | 'elegant';
  imageStyle: 'lifestyle' | 'studio' | 'minimal' | 'vibrant';
}

/**
 * Brand compliance rules
 */
export interface BrandRules {
  doStatements: string[];
  dontStatements: string[];
  legalDisclaimer?: string;
  priceFormat?: string;
  currencySymbol?: string;
}

// ============================================
// Extended Brand Memory Types (for AI spaces)
// ============================================

/**
 * Color with label
 */
export interface BrandColor {
  hex: string;
  label: string;
}

/**
 * Brand color palette
 */
export interface BrandPalette {
  primary: BrandColor[];
  secondary: BrandColor[];
  other?: BrandColor[];
}

/**
 * Brand logo configuration
 */
export interface BrandLogo {
  urls: string[];
  colors: string[];
}

/**
 * Brand tagline
 */
export interface BrandTagline {
  text: string;
  tones: string[];
}

/**
 * Brand font specification
 */
export interface BrandFont {
  family: string;
  size?: string;
  weight: string;
  color: string;
  fileUrl?: string;
}

/**
 * Brand character/model
 */
export interface BrandCharacter {
  url: string;
  metadata: {
    name: string;
    description: string;
    ageGroup?: string;
    gender?: string;
    ethnicity?: string;
    appearance?: string;
    outfit?: string;
  };
}

/**
 * Brand scene/background
 */
export interface BrandScene {
  url: string;
  metadata: {
    name: string;
    description: string;
    type: 'studio' | 'lifestyle' | 'outdoor' | 'abstract' | 'home' | 'other';
  };
}

/**
 * Brand voice configuration for BrandMemory (optional, for standalone JSON imports)
 * This allows BrandMemory JSON files to be self-contained with voice/tone info
 */
export interface BrandMemoryVoice {
  /** Voice template type */
  template?: BrandVoiceTemplate;
  /** Tone description (e.g., "warm, approachable, and confident") */
  tone?: string;
  /** Personality traits (e.g., ["innovative", "trustworthy", "bold"]) */
  personality?: string[];
  /** Vocabulary preferences */
  vocabulary?: {
    /** Words to use */
    preferred?: string[];
    /** Words to avoid */
    avoided?: string[];
  };
  /** Example outputs in brand voice */
  examples?: string[];
}

/**
 * Brand rules for BrandMemory (optional, for standalone JSON imports)
 */
export interface BrandMemoryRules {
  /** Things the brand should do */
  doStatements?: string[];
  /** Things the brand should avoid */
  dontStatements?: string[];
  /** Legal disclaimer text */
  legalDisclaimer?: string;
}

/**
 * Extended brand memory for AI-powered spaces
 * This is the full brand context used by image generation spaces and content creation.
 * Can be imported as standalone JSON or embedded in BrandProfile.
 */
export interface BrandMemory {
  /** Brand site reference images */
  site_images?: string[];
  /** Brand name */
  name: string;
  /** Brand overview/description */
  overview?: string;
  /** Brand logos */
  logo?: BrandLogo;
  /** Brand tagline */
  tagline?: BrandTagline;
  /** Full color palette */
  palette?: BrandPalette;
  /** Brand fonts */
  fonts?: BrandFont[];
  /** Brand characters/models */
  characters?: BrandCharacter[];
  /** Brand scenes/backgrounds */
  scenes?: BrandScene[];
  
  // ============================================
  // Extended fields for voice, rules, and context
  // These allow BrandMemory JSON to be self-contained
  // ============================================
  
  /** Brand voice and tone (optional - for standalone JSON imports) */
  voice?: BrandMemoryVoice;
  /** Brand rules and guidelines (optional - for standalone JSON imports) */
  rules?: BrandMemoryRules;
  /** Industry/vertical (e.g., "Fashion & Apparel", "Food & Beverage") */
  industry?: string;
  /** Target audience description */
  targetAudience?: string;
}

/**
 * Complete brand profile (includes both simple and extended data)
 */
export interface BrandProfile {
  id: string;
  name: string;
  description: string;
  industry: string;
  targetAudience: string;
  voice: BrandVoice;
  style: BrandStyle;
  rules: BrandRules;
  shopifyConnected: boolean;
  shopifyStoreUrl?: string;
  createdAt: string;
  updatedAt: string;
  /** Extended brand memory for AI spaces (optional, imported from JSON) */
  memory?: BrandMemory;
}

/**
 * Onboarding step types
 */
export type OnboardingStep = 
  | 'welcome'
  | 'brand-basics'
  | 'brand-voice'
  | 'brand-style'
  | 'shopify-connect'
  | 'complete';

/**
 * Onboarding state
 */
export interface OnboardingState {
  currentStep: OnboardingStep;
  brandProfile: Partial<BrandProfile>;
  completed: boolean;
}
