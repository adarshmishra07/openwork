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
 * Extended brand memory for AI-powered spaces
 * This is the full brand context used by image generation spaces
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
