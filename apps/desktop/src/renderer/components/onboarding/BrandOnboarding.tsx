/**
 * Brand Onboarding Wizard
 *
 * Multi-step wizard to capture brand information:
 * 1. Welcome - Introduction to Shop OS
 * 2. Brand Basics - Name, industry, target audience, tagline
 * 3. Brand Logo - Logo upload with color extraction
 * 4. Brand Palette - Color palette configuration
 * 5. Brand Typography - Font settings (optional)
 * 6. Brand Voice - Tone, personality, vocabulary
 * 7. Brand Assets - Characters, scenes, site images (optional)
 * 8. Shopify Connect - OAuth connection (optional)
 * 9. Complete - Summary and finish
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  ArrowLeft,
  Building2,
  MessageSquare,
  Palette,
  ShoppingBag,
  CheckCircle2,
  XCircle,
  Loader2,
  Upload,
  Image as ImageIcon,
  Type,
  Users,
  Home,
  X,
  Plus,
  Trash2,
  Sparkles,
  Key,
} from "lucide-react";
import logoImage from "/assets/shopos-logo.svg";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getAccomplish } from "@/lib/accomplish";
import type {
  BrandProfile,
  BrandVoiceTemplate,
  BrandMemory,
  BrandColor,
  BrandTagline,
  ProviderId,
} from "@shopos/shared";
import { DEFAULT_MODELS } from "@shopos/shared";

interface BrandOnboardingProps {
  onComplete: (brandProfile: BrandProfile) => void;
}

const VOICE_TEMPLATES: {
  id: BrandVoiceTemplate;
  name: string;
  description: string;
  example: string;
}[] = [
  {
    id: "professional",
    name: "Professional",
    description: "Formal, authoritative, trustworthy",
    example: "Discover our curated collection of premium products...",
  },
  {
    id: "friendly",
    name: "Friendly",
    description: "Warm, conversational, approachable",
    example: "Hey there! You're gonna love what we have in store...",
  },
  {
    id: "playful",
    name: "Playful",
    description: "Fun, witty, energetic",
    example: "Warning: These deals are seriously addictive...",
  },
  {
    id: "luxury",
    name: "Luxury",
    description: "Sophisticated, exclusive, refined",
    example: "Introducing the epitome of elegance...",
  },
  {
    id: "minimal",
    name: "Minimal",
    description: "Direct, understated, clean",
    example: "Simple. Beautiful. Yours.",
  },
];

const TAGLINE_TONES = [
  "minimal",
  "bold",
  "professional",
  "playful",
  "luxury",
  "modern",
  "elegant",
  "casual",
];
const PERSONALITY_TRAITS = [
  "innovative",
  "trustworthy",
  "friendly",
  "bold",
  "sophisticated",
  "playful",
  "authentic",
  "expert",
  "caring",
  "adventurous",
];
const FONT_FAMILIES = [
  "Manrope",
  "Inter",
  "Poppins",
  "Roboto",
  "Open Sans",
  "Lato",
  "Montserrat",
  "Playfair Display",
  "Raleway",
  "Work Sans",
];
const FONT_WEIGHTS = ["300", "400", "500", "600", "700", "800"];

type OnboardingStepId =
  | "welcome"
  | "beta-info"
  | "api-setup"
  | "brand-basics"
  | "brand-logo"
  | "brand-palette"
  | "brand-typography"
  | "brand-voice"
  | "brand-rules"
  | "brand-assets"
  | "shopify-connect"
  | "complete";

const STEPS: {
  id: OnboardingStepId;
  title: string;
  icon: React.ElementType;
  optional?: boolean;
}[] = [
  { id: "beta-info", title: "Preview", icon: Sparkles },
  { id: "welcome", title: "Welcome", icon: Home },
  { id: "brand-basics", title: "Basics", icon: Building2 },
  { id: "brand-logo", title: "Logo", icon: ImageIcon },
  { id: "brand-palette", title: "Colors", icon: Palette },
  { id: "brand-typography", title: "Fonts", icon: Type, optional: true },
  { id: "brand-voice", title: "Voice", icon: MessageSquare },
  { id: "brand-rules", title: "Rules", icon: CheckCircle2, optional: true },
  { id: "brand-assets", title: "Assets", icon: Users, optional: true },
  {
    id: "shopify-connect",
    title: "Shopify",
    icon: ShoppingBag,
    optional: true,
  },
  { id: "api-setup", title: "Intelligence", icon: Key },
  { id: "complete", title: "Complete", icon: CheckCircle2 },
];

// Extended brand data to hold all onboarding fields
interface OnboardingBrandData {
  id: string;
  name: string;
  description: string;
  industry: string;
  targetAudience: string;
  tagline: BrandTagline;
  logos: { url: string; colors: string[] }[];
  palette: {
    primary: BrandColor[];
    secondary: BrandColor[];
    other: BrandColor[];
  };
  typography: {
    family: string;
    weight: string;
    color: string;
  } | null;
  voice: {
    template: BrandVoiceTemplate;
    tone: string;
    personality: string[];
    vocabulary: { preferred: string[]; avoided: string[] };
    examples: string[];
  };
  rules: {
    doStatements: string[];
    dontStatements: string[];
    legalDisclaimer: string;
  };
  characters: { url: string; name: string; description: string }[];
  scenes: { url: string; name: string; description: string; type: string }[];
  siteImages: string[];
  shopifyConnected: boolean;
  shopifyStoreUrl?: string;
}

export function BrandOnboarding({ onComplete }: BrandOnboardingProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [setupMode, setSetupMode] = useState<"choose" | "manual" | "import">(
    "choose",
  );
  const [brandMemory, setBrandMemory] = useState<BrandMemory | null>(null);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [brandData, setBrandData] = useState<OnboardingBrandData>({
    id: crypto.randomUUID(),
    name: "",
    description: "",
    industry: "",
    targetAudience: "",
    tagline: { text: "", tones: [] },
    logos: [],
    palette: {
      primary: [{ hex: "#6366F1", label: "Primary" }],
      secondary: [],
      other: [],
    },
    typography: null,
    voice: {
      template: "friendly",
      tone: "",
      personality: [],
      vocabulary: { preferred: [], avoided: [] },
      examples: [],
    },
    rules: {
      doStatements: [],
      dontStatements: [],
      legalDisclaimer: "",
    },
    characters: [],
    scenes: [],
    siteImages: [],
    shopifyConnected: false,
  });

  const currentStep = STEPS[currentStepIndex];
  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === STEPS.length - 1;

  const goNext = () => {
    if (!isLastStep) {
      // If in import mode and we're at welcome, skip to shopify-connect
      if (
        setupMode === "import" &&
        currentStep.id === "welcome" &&
        brandMemory
      ) {
        const shopifyIndex = STEPS.findIndex((s) => s.id === "shopify-connect");
        setCurrentStepIndex(shopifyIndex);
      } else {
        setCurrentStepIndex(currentStepIndex + 1);
      }
    } else {
      // Complete onboarding - convert to BrandProfile
      const memory: BrandMemory = {
        name: brandData.name,
        overview: brandData.description,
        tagline: brandData.tagline.text ? brandData.tagline : undefined,
        logo:
          brandData.logos.length > 0
            ? {
                urls: brandData.logos.map((l) => l.url),
                colors: brandData.logos.flatMap((l) => l.colors),
              }
            : undefined,
        palette: {
          primary: brandData.palette.primary,
          secondary: brandData.palette.secondary,
          other: brandData.palette.other,
        },
        fonts: brandData.typography
          ? [
              {
                family: brandData.typography.family,
                weight: brandData.typography.weight,
                color: brandData.typography.color,
              },
            ]
          : undefined,
        characters: brandData.characters.map((c) => ({
          url: c.url,
          metadata: { name: c.name, description: c.description },
        })),
        scenes: brandData.scenes.map((s) => ({
          url: s.url,
          metadata: {
            name: s.name,
            description: s.description,
            type: s.type as
              | "studio"
              | "lifestyle"
              | "outdoor"
              | "abstract"
              | "home"
              | "other",
          },
        })),
        site_images:
          brandData.siteImages.length > 0 ? brandData.siteImages : undefined,
        // Include voice in BrandMemory for self-contained JSON exports
        voice: {
          template: brandData.voice.template,
          tone: brandData.voice.tone || undefined,
          personality:
            brandData.voice.personality.length > 0
              ? brandData.voice.personality
              : undefined,
          vocabulary:
            brandData.voice.vocabulary.preferred.length > 0 ||
            brandData.voice.vocabulary.avoided.length > 0
              ? {
                  preferred:
                    brandData.voice.vocabulary.preferred.length > 0
                      ? brandData.voice.vocabulary.preferred
                      : undefined,
                  avoided:
                    brandData.voice.vocabulary.avoided.length > 0
                      ? brandData.voice.vocabulary.avoided
                      : undefined,
                }
              : undefined,
          examples:
            brandData.voice.examples.length > 0
              ? brandData.voice.examples
              : undefined,
        },
        // Include rules in BrandMemory
        rules:
          brandData.rules.doStatements.length > 0 ||
          brandData.rules.dontStatements.length > 0 ||
          brandData.rules.legalDisclaimer
            ? {
                doStatements:
                  brandData.rules.doStatements.length > 0
                    ? brandData.rules.doStatements
                    : undefined,
                dontStatements:
                  brandData.rules.dontStatements.length > 0
                    ? brandData.rules.dontStatements
                    : undefined,
                legalDisclaimer: brandData.rules.legalDisclaimer || undefined,
              }
            : undefined,
        // Include context fields
        industry: brandData.industry || undefined,
        targetAudience: brandData.targetAudience || undefined,
      };

      const completedProfile: BrandProfile = {
        id: brandData.id,
        name: brandMemory?.name || brandData.name || "My Brand",
        description: brandMemory?.overview || brandData.description || "",
        industry: brandData.industry || brandMemory?.industry || "",
        targetAudience:
          brandData.targetAudience || brandMemory?.targetAudience || "",
        voice: brandData.voice,
        style: {
          primaryColor: brandData.palette.primary[0]?.hex || "#6366F1",
          secondaryColor: brandData.palette.secondary[0]?.hex || "#8B5CF6",
          fontStyle: "modern",
          imageStyle: "lifestyle",
        },
        rules: {
          doStatements: brandData.rules.doStatements,
          dontStatements: brandData.rules.dontStatements,
          legalDisclaimer: brandData.rules.legalDisclaimer || undefined,
        },
        memory: brandMemory || memory,
        shopifyConnected: brandData.shopifyConnected,
        shopifyStoreUrl: brandData.shopifyStoreUrl,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      onComplete(completedProfile);
    }
  };

  const goBack = () => {
    if (!isFirstStep) {
      setCurrentStepIndex(currentStepIndex - 1);
    }
  };

  const skipStep = () => {
    if (!isLastStep) {
      setCurrentStepIndex(currentStepIndex + 1);
    }
  };

  const updateBrandData = useCallback(
    (updates: Partial<OnboardingBrandData>) => {
      setBrandData((prev) => ({ ...prev, ...updates }));
    },
    [],
  );

  // Determine if current step can proceed
  const canProceed = () => {
    switch (currentStep.id) {
      case "welcome":
        return setupMode !== "choose";
      case "beta-info":
        return true; // User just needs to acknowledge
      case "api-setup":
        return hasApiKey;
      case "brand-basics":
        return !!brandData.name.trim();
      case "brand-logo":
        return brandData.logos.length > 0;
      case "brand-palette":
        return brandData.palette.primary.length > 0;
      case "brand-voice":
        // Validation: require at least 2 personality traits and 1 preferred word
        return (
          brandData.voice.template &&
          brandData.voice.personality.length >= 2 &&
          brandData.voice.vocabulary.preferred.length >= 1
        );
      default:
        return true;
    }
  };

  // Get validation message for current step
  const getValidationMessage = () => {
    if (currentStep.id === "brand-voice") {
      const issues: string[] = [];
      if (brandData.voice.personality.length < 2) {
        issues.push(
          `Select at least 2 personality traits (${brandData.voice.personality.length}/2)`,
        );
      }
      if (brandData.voice.vocabulary.preferred.length < 1) {
        issues.push("Add at least 1 preferred word");
      }
      return issues.length > 0 ? issues.join(" • ") : null;
    }
    return null;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex flex-col">
      {/* Progress bar */}
      <div className="p-4">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between mb-2">
            {STEPS.map((step, index) => (
              <div key={step.id} className="flex items-center">
                <div
                  className={`
                    w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium transition-colors
                    ${
                      index <= currentStepIndex
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    }
                  `}
                >
                  {index < currentStepIndex ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : (
                    <step.icon className="w-4 h-4" />
                  )}
                </div>
                {index < STEPS.length - 1 && (
                  <div
                    className={`
                      w-8 h-0.5 mx-0.5 transition-colors
                      ${index < currentStepIndex ? "bg-primary" : "bg-muted"}
                    `}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center p-8 overflow-y-auto">
        <div className="w-full max-w-xl">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep.id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              {currentStep.id === "beta-info" && <BetaInfoStep />}
              {currentStep.id === "welcome" && (
                <WelcomeStep
                  setupMode={setupMode}
                  onSetupModeChange={setSetupMode}
                  brandMemory={brandMemory}
                  onBrandMemoryChange={setBrandMemory}
                />
              )}
              {currentStep.id === "brand-basics" && (
                <BrandBasicsStep data={brandData} onChange={updateBrandData} />
              )}
              {currentStep.id === "brand-logo" && (
                <BrandLogoStep data={brandData} onChange={updateBrandData} />
              )}
              {currentStep.id === "brand-palette" && (
                <BrandPaletteStep data={brandData} onChange={updateBrandData} />
              )}
              {currentStep.id === "brand-typography" && (
                <BrandTypographyStep
                  data={brandData}
                  onChange={updateBrandData}
                />
              )}
              {currentStep.id === "brand-voice" && (
                <BrandVoiceStep data={brandData} onChange={updateBrandData} />
              )}
              {currentStep.id === "brand-rules" && (
                <BrandRulesStep data={brandData} onChange={updateBrandData} />
              )}
              {currentStep.id === "brand-assets" && (
                <BrandAssetsStep data={brandData} onChange={updateBrandData} />
              )}
              {currentStep.id === "shopify-connect" && (
                <ShopifyConnectStep
                  data={brandData}
                  onChange={updateBrandData}
                />
              )}
              {currentStep.id === "api-setup" && (
                <ApiSetupStep
                  hasApiKey={hasApiKey}
                  onValidityChange={setHasApiKey}
                />
              )}
              {currentStep.id === "complete" && (
                <CompleteStep data={brandData} brandMemory={brandMemory} />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Navigation */}
      <div className="p-8">
        <div className="max-w-xl mx-auto flex justify-between">
          {/* Hide Back button on Welcome and Early Preview steps */}
          {currentStep.id !== "welcome" && currentStep.id !== "beta-info" ? (
            <Button variant="ghost" onClick={goBack} className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              Back
            </Button>
          ) : (
            <div /> // Empty placeholder for flex spacing
          )}
          <div className="flex gap-2">
            {currentStep.optional && !isLastStep && (
              <Button variant="ghost" onClick={skipStep}>
                Skip
              </Button>
            )}
            <Button onClick={goNext} className="gap-2" disabled={!canProceed()}>
              {isLastStep ? "Get Started" : "Continue"}
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// Step Components
// ============================================

interface WelcomeStepProps {
  setupMode: "choose" | "manual" | "import";
  onSetupModeChange: (mode: "choose" | "manual" | "import") => void;
  brandMemory: BrandMemory | null;
  onBrandMemoryChange: (memory: BrandMemory | null) => void;
}

function WelcomeStep({
  setupMode,
  onSetupModeChange,
  brandMemory,
  onBrandMemoryChange,
}: WelcomeStepProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const accomplish = getAccomplish();

  const handleImportJson = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await accomplish.openJsonFilePicker();
      if (result.canceled || !result.data) {
        setIsLoading(false);
        return;
      }

      const memoryData = result.data as BrandMemory;

      if (!memoryData.name) {
        throw new Error("Brand memory must have a name");
      }

      onBrandMemoryChange(memoryData);
      onSetupModeChange("import");
    } catch (err) {
      console.error("Failed to import brand memory:", err);
      setError(
        err instanceof Error ? err.message : "Failed to parse JSON file",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleManualSetup = () => {
    onSetupModeChange("manual");
  };

  const handleRemoveImport = () => {
    onBrandMemoryChange(null);
    onSetupModeChange("choose");
  };

  if (setupMode === "import" && brandMemory) {
    const memorySummary = {
      hasLogo: !!brandMemory.logo?.urls?.length,
      hasTagline: !!brandMemory.tagline?.text,
      hasColors: !!brandMemory.palette?.primary?.length,
      hasFonts: !!brandMemory.fonts?.length,
      hasCharacters: !!brandMemory.characters?.length,
      hasScenes: !!brandMemory.scenes?.length,
    };

    return (
      <div className="text-center space-y-6">
        <div className="w-20 h-20 mx-auto rounded-2xl bg-foreground/10 flex items-center justify-center">
          <CheckCircle2 className="w-10 h-10 text-foreground" />
        </div>
        <div>
          <h1 className="text-3xl font-bold mb-3">Brand Memory Imported</h1>
          <p className="text-lg text-muted-foreground">
            We've loaded <strong>{brandMemory.name}</strong>'s brand data
          </p>
        </div>

        <div className="p-6 rounded-lg border-2 border-foreground/20 bg-foreground/5 text-left">
          <div className="grid grid-cols-2 gap-3">
            {memorySummary.hasLogo && (
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="w-4 h-4 text-foreground" />
                <span>Logo</span>
              </div>
            )}
            {memorySummary.hasTagline && (
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="w-4 h-4 text-foreground" />
                <span>Tagline</span>
              </div>
            )}
            {memorySummary.hasColors && (
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="w-4 h-4 text-foreground" />
                <span>{brandMemory.palette?.primary?.length || 0} colors</span>
              </div>
            )}
            {memorySummary.hasFonts && (
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="w-4 h-4 text-foreground" />
                <span>{brandMemory.fonts?.length || 0} fonts</span>
              </div>
            )}
            {memorySummary.hasCharacters && (
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="w-4 h-4 text-foreground" />
                <span>{brandMemory.characters?.length || 0} characters</span>
              </div>
            )}
            {memorySummary.hasScenes && (
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="w-4 h-4 text-foreground" />
                <span>{brandMemory.scenes?.length || 0} scenes</span>
              </div>
            )}
          </div>
        </div>

        <Button variant="ghost" size="sm" onClick={handleRemoveImport}>
          Use different file
        </Button>
      </div>
    );
  }

  return (
    <div className="text-center space-y-6">
      <div className="w-20 h-20 mx-auto rounded-2xl flex items-center justify-center">
        <img
          src={logoImage}
          alt="Shop OS"
          className="w-16 h-16 object-contain"
        />
      </div>
      <div>
        <h1 className="text-3xl font-bold mb-3">Welcome to Shop OS</h1>
        <p className="text-lg text-muted-foreground">
          Your AI work companion that learns your brand and does real commerce
          work.
        </p>
      </div>

      <div className="space-y-3 pt-4">
        <p className="text-sm text-muted-foreground mb-4">
          How would you like to set up your brand?
        </p>

        <button
          onClick={handleManualSetup}
          disabled={isLoading}
          className={`w-full p-4 rounded-lg border-2 transition-all text-left flex items-center gap-4 ${
            setupMode === "manual"
              ? "border-primary bg-primary/10"
              : "border-border hover:border-primary/50 hover:bg-muted/30"
          }`}
        >
          <Building2 className="w-8 h-8 text-primary" />
          <div className="flex-1">
            <h3 className="font-medium">Enter Details Manually</h3>
            <p className="text-sm text-muted-foreground">
              Set up your brand step by step
            </p>
          </div>
          {setupMode === "manual" && (
            <CheckCircle2 className="w-6 h-6 text-primary shrink-0" />
          )}
        </button>

        <button
          onClick={handleImportJson}
          disabled={isLoading}
          className="w-full p-4 rounded-lg border-2 border-border hover:border-primary/50 hover:bg-muted/30 transition-all text-left flex items-center gap-4"
        >
          {isLoading ? (
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          ) : (
            <Upload className="w-8 h-8 text-primary" />
          )}
          <div>
            <h3 className="font-medium">Import Brand Memory JSON</h3>
            <p className="text-sm text-muted-foreground">
              Upload your brand's visual DNA file
            </p>
          </div>
        </button>

        {error && (
          <div className="flex items-center gap-2 text-sm text-destructive justify-center pt-2">
            <XCircle className="w-4 h-4" />
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================
// Beta Info Step
// ============================================

function BetaInfoStep() {
  return (
    <div className="text-center space-y-6">
      <div className="w-20 h-20 mx-auto rounded-2xl bg-amber-500/20 flex items-center justify-center">
        <Sparkles className="w-10 h-10 text-amber-500" />
      </div>
      <div>
        <h1 className="text-3xl font-bold mb-3">Early Preview</h1>
        <p className="text-lg text-muted-foreground">
          You're using an early preview version of Shop OS
        </p>
      </div>

      <div className="p-6 rounded-lg border-2 border-amber-500/30 bg-amber-500/10 text-left space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
            <span className="text-amber-500 text-sm font-bold">1</span>
          </div>
          <div>
            <h3 className="font-medium">Work in Progress</h3>
            <p className="text-sm text-muted-foreground">
              Features may change, break, or be removed as we iterate
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <div className="w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
            <span className="text-amber-500 text-sm font-bold">2</span>
          </div>
          <div>
            <h3 className="font-medium">Your Feedback Matters</h3>
            <p className="text-sm text-muted-foreground">
              Help shape Shop OS by sharing what works and what doesn't
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <div className="w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
            <span className="text-amber-500 text-sm font-bold">3</span>
          </div>
          <div>
            <h3 className="font-medium">API Costs</h3>
            <p className="text-sm text-muted-foreground">
              You'll need your own API key. Usage costs are billed by the
              provider
            </p>
          </div>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        By continuing, you acknowledge this is pre-release software
      </p>
    </div>
  );
}

// ============================================
// API Setup Step - BYOK (Bring Your Own Key)
// ============================================

type ApiProvider = "anthropic" | "openai" | "google" | "xai" | "deepseek" | "openrouter";

const AGENT_PROVIDERS: {
  id: ApiProvider;
  name: string;
  description: string;
  features: string[];
}[] = [
  {
    id: "anthropic",
    name: "Anthropic",
    description: "Claude models",
    features: ["AI agent for complex multi-step tasks"],
  },
  {
    id: "openai",
    name: "OpenAI",
    description: "GPT models",
    features: [
      "AI agent for task orchestration",
      "Enhanced Sketch-to-Product & Banners",
    ],
  },
  {
    id: "xai",
    name: "xAI",
    description: "Grok models",
    features: ["AI agent with Grok"],
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    description: "DeepSeek models",
    features: ["Cost-effective AI agent"],
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    description: "Multi-provider access",
    features: ["Access multiple model providers"],
  },
];

interface ApiSetupStepProps {
  hasApiKey: boolean;
  onValidityChange: (valid: boolean) => void;
}

function ApiSetupStep({ onValidityChange }: ApiSetupStepProps) {
  const [section, setSection] = useState<"gemini" | "agent">("gemini");
  const [agentProvider, setAgentProvider] = useState<ApiProvider>("anthropic");
  const [key, setKey] = useState("");
  const [saved, setSaved] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const accomplish = getAccomplish();

  const hasGemini = saved.includes("google");

  // Check for existing API keys on mount
  useEffect(() => {
    const checkExistingKeys = async () => {
      try {
        const keys = await accomplish.getApiKeys();
        const providers = keys.map(
          (k: { provider: string }) => k.provider,
        );
        setSaved(providers);
        if (providers.includes("google")) {
          onValidityChange(true);
          setSection("agent");
        }
      } catch (err) {
        console.error("Failed to fetch API keys:", err);
      }
    };
    checkExistingKeys();
  }, [accomplish, onValidityChange]);

  const currentProvider: ApiProvider =
    section === "gemini" ? "google" : agentProvider;

  const handleAdd = async () => {
    if (!key.trim()) return;
    setLoading(true);
    setError(null);

    try {
      // 1. Validate the API key
      const validation = await accomplish.validateApiKeyForProvider(
        currentProvider,
        key.trim(),
      );
      if (!validation.valid) {
        setError(validation.error || "Invalid API key");
        setLoading(false);
        return;
      }

      // 2. Store the API key
      await accomplish.addApiKey(currentProvider, key.trim());

      // 3. Connect the provider with default model
      const providerId = currentProvider as ProviderId;
      const defaultModel = DEFAULT_MODELS[providerId] || null;
      await accomplish.setConnectedProvider(providerId, {
        providerId,
        connectionStatus: "connected",
        selectedModelId: defaultModel,
        credentials: {
          type: "api_key",
          keyPrefix: key.trim().substring(0, 8),
        },
        lastConnectedAt: new Date().toISOString(),
      });

      // 4. Set as active provider for agent execution
      //    Always set if no active provider exists (e.g., user only adds Gemini key)
      const currentSettings = await accomplish.getProviderSettings();
      if (section === "agent" || !currentSettings.activeProviderId) {
        await accomplish.setActiveProvider(providerId);
      }

      // 5. Set legacy selectedModel
      if (defaultModel) {
        await accomplish.setSelectedModel({
          provider: providerId,
          model: defaultModel,
        });
      }

      // Update UI
      const keys = await accomplish.getApiKeys();
      const providers = keys.map(
        (k: { provider: string }) => k.provider,
      );
      setSaved(providers);
      setKey("");

      // Gemini key added - mark as valid and move to agent section
      if (section === "gemini") {
        onValidityChange(true);
        setSection("agent");
      }
    } catch (e) {
      console.error("Failed to add API key:", e);
      setError("Failed to add API key. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold mb-2">Connect Your API Keys</h2>
        <p className="text-muted-foreground text-sm">
          Shop OS uses your own API keys. Your keys are stored securely on your
          device.
        </p>
      </div>

      {/* Section: Required - Gemini */}
      <div
        className={`p-4 rounded-xl border-2 transition-all ${
          section === "gemini" && !hasGemini
            ? "border-primary bg-primary/5"
            : hasGemini
              ? "border-green-500/50 bg-green-500/5"
              : "border-border"
        }`}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-primary">
              Required
            </span>
            <h3 className="font-semibold text-sm">Google AI (Gemini)</h3>
          </div>
          {hasGemini && <CheckCircle2 className="w-5 h-5 text-green-500" />}
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Powers all image generation spaces: Product Swap, Steal the Look,
          Background Remover, Try-On, Banners, and more.
        </p>

        {!hasGemini && section === "gemini" && (
          <div className="space-y-2">
            <div className="flex gap-2">
              <Input
                type="password"
                value={key}
                onChange={(e) => {
                  setKey(e.target.value);
                  setError(null);
                }}
                placeholder="Enter your Google AI / Gemini API key"
                className="flex-1 text-sm"
                disabled={loading}
              />
              <Button
                size="sm"
                onClick={handleAdd}
                disabled={!key.trim() || loading}
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  "Add"
                )}
              </Button>
            </div>
            {error && (
              <div className="flex items-center gap-2 text-xs text-destructive">
                <XCircle className="w-3 h-3" />
                {error}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Section: Optional - Agent Provider */}
      <div
        className={`p-4 rounded-xl border-2 transition-all ${
          section === "agent"
            ? "border-border bg-background"
            : "border-border/50 opacity-60"
        }`}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Optional
            </span>
            <h3 className="font-semibold text-sm">AI Agent Provider</h3>
          </div>
          {saved.some((s) =>
            ["anthropic", "openai", "xai"].includes(s),
          ) && <CheckCircle2 className="w-5 h-5 text-green-500" />}
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Your Gemini key will also power the AI agent by default. Add a
          different provider below if you prefer, or skip and change it later
          in Settings.
        </p>

        {section === "agent" && (
          <>
            {/* Agent Provider Selection */}
            <div className="grid grid-cols-3 gap-1.5 mb-3">
              {AGENT_PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    setAgentProvider(p.id);
                    setError(null);
                    setKey("");
                  }}
                  className={`p-2.5 rounded-lg border-2 text-left transition-all ${
                    agentProvider === p.id
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-medium text-xs">{p.name}</h4>
                      <p className="text-[10px] text-muted-foreground">
                        {p.description}
                      </p>
                    </div>
                    {saved.includes(p.id) && (
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                    )}
                  </div>
                </button>
              ))}
            </div>

            {/* Features list */}
            <div className="text-[11px] text-muted-foreground mb-3 pl-1">
              {AGENT_PROVIDERS.find((p) => p.id === agentProvider)?.features.map(
                (f) => (
                  <div key={f} className="flex items-center gap-1.5">
                    <span className="text-primary">+</span> {f}
                  </div>
                ),
              )}
            </div>

            {/* Key Input */}
            <div className="space-y-2">
              <div className="flex gap-2">
                <Input
                  type="password"
                  value={key}
                  onChange={(e) => {
                    setKey(e.target.value);
                    setError(null);
                  }}
                  placeholder={`Enter your ${AGENT_PROVIDERS.find((p) => p.id === agentProvider)?.name} API key`}
                  className="flex-1 text-sm"
                  disabled={loading}
                />
                <Button
                  size="sm"
                  onClick={handleAdd}
                  disabled={!key.trim() || loading}
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    "Add"
                  )}
                </Button>
              </div>
              {error && (
                <div className="flex items-center gap-2 text-xs text-destructive">
                  <XCircle className="w-3 h-3" />
                  {error}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Connected Keys Summary */}
      {saved.length > 0 && (
        <div className="flex flex-wrap gap-2 justify-center">
          {saved.map((s) => (
            <span
              key={s}
              className="px-2.5 py-1 rounded-full bg-green-500/10 text-green-600 text-xs font-medium capitalize flex items-center gap-1"
            >
              <CheckCircle2 className="w-3 h-3" />
              {s === "google" ? "Gemini" : s}
            </span>
          ))}
        </div>
      )}

      <p className="text-[11px] text-muted-foreground text-center">
        {hasGemini
          ? "Gemini key connected. You can add an agent key now or skip and add it later."
          : "A Google AI (Gemini) key is required for image generation features."}
      </p>
    </div>
  );
}

interface StepProps {
  data: OnboardingBrandData;
  onChange: (updates: Partial<OnboardingBrandData>) => void;
}

function BrandBasicsStep({ data, onChange }: StepProps) {
  const toggleTaglineTone = (tone: string) => {
    const current = data.tagline.tones || [];
    const newTones = current.includes(tone)
      ? current.filter((t) => t !== tone)
      : [...current, tone];
    onChange({ tagline: { ...data.tagline, tones: newTones } });
  };

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold mb-2">Tell us about your brand</h2>
        <p className="text-muted-foreground">
          We'll use this to personalize your experience
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <Label htmlFor="brandName">Brand Name *</Label>
          <Input
            id="brandName"
            value={data.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="e.g., Acme Fashion Co."
            className="mt-1.5"
          />
        </div>

        <div>
          <Label htmlFor="tagline">Tagline</Label>
          <Input
            id="tagline"
            value={data.tagline.text}
            onChange={(e) =>
              onChange({ tagline: { ...data.tagline, text: e.target.value } })
            }
            placeholder="e.g., Style that speaks"
            className="mt-1.5"
          />
        </div>

        <div>
          <Label>Tagline Tones</Label>
          <div className="flex flex-wrap gap-2 mt-2">
            {TAGLINE_TONES.map((tone) => (
              <button
                key={tone}
                onClick={() => toggleTaglineTone(tone)}
                className={`px-3 py-1.5 rounded-full text-sm capitalize transition-all ${
                  data.tagline.tones?.includes(tone)
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted hover:bg-muted/80"
                }`}
              >
                {tone}
              </button>
            ))}
          </div>
        </div>

        <div>
          <Label htmlFor="industry">Industry</Label>
          <Input
            id="industry"
            value={data.industry}
            onChange={(e) => onChange({ industry: e.target.value })}
            placeholder="e.g., Fashion, Electronics, Home Goods"
            className="mt-1.5"
          />
        </div>

        <div>
          <Label htmlFor="targetAudience">Target Audience</Label>
          <Input
            id="targetAudience"
            value={data.targetAudience}
            onChange={(e) => onChange({ targetAudience: e.target.value })}
            placeholder="e.g., Young professionals aged 25-35"
            className="mt-1.5"
          />
        </div>

        <div>
          <Label htmlFor="description">Brief Description</Label>
          <textarea
            id="description"
            value={data.description}
            onChange={(e) => onChange({ description: e.target.value })}
            placeholder="What makes your brand unique?"
            rows={3}
            className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      </div>
    </div>
  );
}

// Max file size: 4MB (Lambda has 6MB limit, base64 adds ~33% overhead)
const MAX_FILE_SIZE_MB = 4;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

/**
 * Convert technical error messages to human-readable ones
 */
function humanizeUploadError(error: string): string {
  if (
    error.includes("413") ||
    error.includes("6291456") ||
    error.includes("Request must be smaller")
  ) {
    return `File is too large. Please use an image smaller than ${MAX_FILE_SIZE_MB}MB.`;
  }
  if (error.includes("Failed to fetch") || error.includes("NetworkError")) {
    return "Network error. Please check your internet connection and try again.";
  }
  if (error.includes("timeout") || error.includes("Timeout")) {
    return "Upload timed out. Please try again with a smaller file.";
  }
  if (error.includes("403") || error.includes("Forbidden")) {
    return "Permission denied. Please try again later.";
  }
  if (error.includes("500") || error.includes("Internal Server Error")) {
    return "Server error. Please try again later.";
  }
  // Return original if no match, but clean up technical details
  return (
    error
      .replace(/\d{3}\s*-\s*/, "")
      .replace(/[{}"]/g, "")
      .trim() || "Upload failed. Please try again."
  );
}

function BrandLogoStep({ data, onChange }: StepProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const accomplish = getAccomplish();

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    setError(null);

    try {
      for (const file of Array.from(files)) {
        // Check file size before uploading
        if (file.size > MAX_FILE_SIZE_BYTES) {
          const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
          setError(
            `File "${file.name}" is too large (${sizeMB}MB). Please use an image smaller than ${MAX_FILE_SIZE_MB}MB.`,
          );
          continue;
        }

        // Read file as base64
        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve, reject) => {
          reader.onload = () => {
            const result = reader.result as string;
            const base64 = result.split(",")[1];
            resolve(base64);
          };
          reader.onerror = reject;
        });
        reader.readAsDataURL(file);
        const base64 = await base64Promise;

        // Upload to S3
        const result = await accomplish.uploadBrandAsset(
          data.id,
          "logos",
          file.name,
          file.type,
          base64,
        );

        if (result.success && result.url) {
          onChange({
            logos: [...data.logos, { url: result.url, colors: [] }],
          });
        } else {
          setError(
            humanizeUploadError(result.error || "Failed to upload logo"),
          );
        }
      }
    } catch (err) {
      console.error("Failed to upload logo:", err);
      const errorMsg =
        err instanceof Error ? err.message : "Failed to upload logo";
      setError(humanizeUploadError(errorMsg));
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const removeLogo = (index: number) => {
    onChange({
      logos: data.logos.filter((_, i) => i !== index),
    });
  };

  const updateLogoColor = (
    logoIndex: number,
    colorIndex: number,
    color: string,
  ) => {
    const newLogos = [...data.logos];
    newLogos[logoIndex].colors[colorIndex] = color;
    onChange({ logos: newLogos });
  };

  const addLogoColor = (logoIndex: number) => {
    const newLogos = [...data.logos];
    newLogos[logoIndex].colors.push("#000000");
    onChange({ logos: newLogos });
  };

  const removeLogoColor = (logoIndex: number, colorIndex: number) => {
    const newLogos = [...data.logos];
    newLogos[logoIndex].colors = newLogos[logoIndex].colors.filter(
      (_, i) => i !== colorIndex,
    );
    onChange({ logos: newLogos });
  };

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold mb-2">Upload your logo</h2>
        <p className="text-muted-foreground">
          Add your brand logo and identify its colors
        </p>
      </div>

      <div className="space-y-4">
        {/* Upload Zone */}
        <div
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-all"
        >
          {isUploading ? (
            <Loader2 className="w-10 h-10 mx-auto text-muted-foreground animate-spin mb-3" />
          ) : (
            <Upload className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          )}
          <h3 className="font-medium mb-1">
            {isUploading ? "Uploading..." : "Click to upload logo"}
          </h3>
          <p className="text-sm text-muted-foreground">
            PNG, JPG, SVG up to {MAX_FILE_SIZE_MB}MB
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />
        </div>

        {error && (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <XCircle className="w-4 h-4" />
            {error}
          </div>
        )}

        {/* Uploaded Logos */}
        {data.logos.length > 0 && (
          <div className="space-y-4">
            {data.logos.map((logo, logoIndex) => (
              <div
                key={logoIndex}
                className="p-4 rounded-lg border-2 border-border bg-muted/30"
              >
                <div className="flex items-start gap-4">
                  <div className="w-20 h-20 rounded-lg bg-white flex items-center justify-center overflow-hidden">
                    <img
                      src={logo.url}
                      alt="Logo"
                      className="max-w-full max-h-full object-contain"
                    />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-2">
                      <Label>Logo Colors</Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeLogo(logoIndex)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {logo.colors.map((color, colorIndex) => (
                        <div
                          key={colorIndex}
                          className="flex items-center gap-1"
                        >
                          <input
                            type="color"
                            value={color}
                            onChange={(e) =>
                              updateLogoColor(
                                logoIndex,
                                colorIndex,
                                e.target.value,
                              )
                            }
                            className="w-8 h-8 rounded cursor-pointer border border-border"
                          />
                          <button
                            onClick={() =>
                              removeLogoColor(logoIndex, colorIndex)
                            }
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                      <button
                        onClick={() => addLogoColor(logoIndex)}
                        className="w-8 h-8 rounded border-2 border-dashed border-border flex items-center justify-center hover:border-primary/50"
                      >
                        <Plus className="w-4 h-4 text-muted-foreground" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="text-xs text-muted-foreground text-center">
          At least one logo is required
        </p>
      </div>
    </div>
  );
}

function BrandPaletteStep({ data, onChange }: StepProps) {
  const addColor = (type: "primary" | "secondary" | "other") => {
    const newColor: BrandColor = { hex: "#000000", label: "" };
    onChange({
      palette: {
        ...data.palette,
        [type]: [...data.palette[type], newColor],
      },
    });
  };

  const updateColor = (
    type: "primary" | "secondary" | "other",
    index: number,
    updates: Partial<BrandColor>,
  ) => {
    const newColors = [...data.palette[type]];
    newColors[index] = { ...newColors[index], ...updates };
    onChange({
      palette: {
        ...data.palette,
        [type]: newColors,
      },
    });
  };

  const removeColor = (
    type: "primary" | "secondary" | "other",
    index: number,
  ) => {
    onChange({
      palette: {
        ...data.palette,
        [type]: data.palette[type].filter((_, i) => i !== index),
      },
    });
  };

  const renderColorSection = (
    title: string,
    type: "primary" | "secondary" | "other",
    required?: boolean,
  ) => (
    <div>
      <div className="flex items-center justify-between mb-2">
        <Label>
          {title} {required && "*"}
        </Label>
        <Button variant="ghost" size="sm" onClick={() => addColor(type)}>
          <Plus className="w-4 h-4 mr-1" />
          Add
        </Button>
      </div>
      <div className="space-y-2">
        {data.palette[type].map((color, index) => (
          <div key={index} className="flex items-center gap-2">
            <input
              type="color"
              value={color.hex}
              onChange={(e) =>
                updateColor(type, index, { hex: e.target.value })
              }
              className="w-10 h-10 rounded cursor-pointer border-2 border-border"
            />
            <Input
              value={color.hex}
              onChange={(e) =>
                updateColor(type, index, { hex: e.target.value })
              }
              placeholder="#000000"
              className="w-28"
            />
            <Input
              value={color.label}
              onChange={(e) =>
                updateColor(type, index, { label: e.target.value })
              }
              placeholder="Label (e.g., Brand Blue)"
              className="flex-1"
            />
            {!(type === "primary" && data.palette.primary.length === 1) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeColor(type, index)}
                className="text-destructive hover:text-destructive"
              >
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>
        ))}
        {data.palette[type].length === 0 && (
          <p className="text-sm text-muted-foreground italic">
            No colors added
          </p>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold mb-2">Color palette</h2>
        <p className="text-muted-foreground">
          Define your brand's color scheme
        </p>
      </div>

      <div className="space-y-6">
        {renderColorSection("Primary Colors", "primary", true)}
        {renderColorSection("Secondary Colors", "secondary")}
        {renderColorSection("Accent Colors", "other")}
      </div>

      <p className="text-xs text-muted-foreground text-center">
        At least one primary color is required
      </p>
    </div>
  );
}

function BrandTypographyStep({ data, onChange }: StepProps) {
  const typography = data.typography || {
    family: "Inter",
    weight: "400",
    color: "#000000",
  };

  const updateTypography = (updates: Partial<typeof typography>) => {
    onChange({ typography: { ...typography, ...updates } });
  };

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold mb-2">Typography (Optional)</h2>
        <p className="text-muted-foreground">
          Set your brand's font preferences
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <Label>Font Family</Label>
          <select
            value={typography.family}
            onChange={(e) => updateTypography({ family: e.target.value })}
            className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {FONT_FAMILIES.map((font) => (
              <option key={font} value={font}>
                {font}
              </option>
            ))}
          </select>
        </div>

        <div>
          <Label>Font Weight</Label>
          <select
            value={typography.weight}
            onChange={(e) => updateTypography({ weight: e.target.value })}
            className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {FONT_WEIGHTS.map((weight) => (
              <option key={weight} value={weight}>
                {weight}
              </option>
            ))}
          </select>
        </div>

        <div>
          <Label>Font Color</Label>
          <div className="flex items-center gap-3 mt-2">
            <input
              type="color"
              value={typography.color}
              onChange={(e) => updateTypography({ color: e.target.value })}
              className="w-12 h-12 rounded-lg cursor-pointer border-2 border-border"
            />
            <Input
              value={typography.color}
              onChange={(e) => updateTypography({ color: e.target.value })}
              placeholder="#000000"
              className="flex-1"
            />
          </div>
        </div>

        {/* Preview */}
        <div className="p-4 rounded-lg bg-muted/50">
          <Label className="text-xs text-muted-foreground mb-2 block">
            Preview
          </Label>
          <p
            style={{
              fontFamily: typography.family,
              fontWeight: typography.weight,
              color: typography.color,
            }}
            className="text-2xl"
          >
            The quick brown fox jumps over the lazy dog
          </p>
        </div>
      </div>
    </div>
  );
}

function BrandVoiceStep({ data, onChange }: StepProps) {
  const selectedTemplate = data.voice.template;
  const [preferredInput, setPreferredInput] = useState("");
  const [avoidedInput, setAvoidedInput] = useState("");

  const handleTemplateSelect = (template: BrandVoiceTemplate) => {
    onChange({
      voice: { ...data.voice, template },
    });
  };

  const togglePersonality = (trait: string) => {
    const current = data.voice.personality || [];
    const newPersonality = current.includes(trait)
      ? current.filter((t) => t !== trait)
      : [...current, trait];
    onChange({ voice: { ...data.voice, personality: newPersonality } });
  };

  const addPreferredWord = () => {
    if (!preferredInput.trim()) return;
    onChange({
      voice: {
        ...data.voice,
        vocabulary: {
          ...data.voice.vocabulary,
          preferred: [
            ...data.voice.vocabulary.preferred,
            preferredInput.trim(),
          ],
        },
      },
    });
    setPreferredInput("");
  };

  const addAvoidedWord = () => {
    if (!avoidedInput.trim()) return;
    onChange({
      voice: {
        ...data.voice,
        vocabulary: {
          ...data.voice.vocabulary,
          avoided: [...data.voice.vocabulary.avoided, avoidedInput.trim()],
        },
      },
    });
    setAvoidedInput("");
  };

  const removePreferredWord = (word: string) => {
    onChange({
      voice: {
        ...data.voice,
        vocabulary: {
          ...data.voice.vocabulary,
          preferred: data.voice.vocabulary.preferred.filter((w) => w !== word),
        },
      },
    });
  };

  const removeAvoidedWord = (word: string) => {
    onChange({
      voice: {
        ...data.voice,
        vocabulary: {
          ...data.voice.vocabulary,
          avoided: data.voice.vocabulary.avoided.filter((w) => w !== word),
        },
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold mb-2">Brand voice</h2>
        <p className="text-muted-foreground">
          Define how your brand communicates
        </p>
      </div>

      {/* Voice Template */}
      <div>
        <Label className="mb-2 block">Voice Template *</Label>
        <div className="space-y-2">
          {VOICE_TEMPLATES.map((template) => (
            <button
              key={template.id}
              onClick={() => handleTemplateSelect(template.id)}
              className={`
                w-full p-3 rounded-lg border-2 text-left transition-all
                ${
                  selectedTemplate === template.id
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50"
                }
              `}
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-medium">{template.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    {template.description}
                  </p>
                </div>
                {selectedTemplate === template.id && (
                  <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Tone */}
      <div>
        <Label htmlFor="tone">Tone Description</Label>
        <Input
          id="tone"
          value={data.voice.tone}
          onChange={(e) =>
            onChange({ voice: { ...data.voice, tone: e.target.value } })
          }
          placeholder="e.g., Warm and approachable, yet authoritative"
          className="mt-1.5"
        />
      </div>

      {/* Personality Traits */}
      <div>
        <Label>Personality Traits</Label>
        <div className="flex flex-wrap gap-2 mt-2">
          {PERSONALITY_TRAITS.map((trait) => (
            <button
              key={trait}
              onClick={() => togglePersonality(trait)}
              className={`px-3 py-1.5 rounded-full text-sm capitalize transition-all ${
                data.voice.personality?.includes(trait)
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted hover:bg-muted/80"
              }`}
            >
              {trait}
            </button>
          ))}
        </div>
      </div>

      {/* Vocabulary */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Preferred Words</Label>
          <div className="flex gap-2 mt-1.5">
            <Input
              value={preferredInput}
              onChange={(e) => setPreferredInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addPreferredWord()}
              placeholder="Add word"
              className="flex-1"
            />
            <Button size="sm" onClick={addPreferredWord}>
              <Plus className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex flex-wrap gap-1 mt-2">
            {data.voice.vocabulary.preferred.map((word) => (
              <span
                key={word}
                className="px-2 py-1 rounded bg-green-500/20 text-green-700 dark:text-green-300 text-xs flex items-center gap-1"
              >
                {word}
                <button onClick={() => removePreferredWord(word)}>
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        </div>

        <div>
          <Label>Avoided Words</Label>
          <div className="flex gap-2 mt-1.5">
            <Input
              value={avoidedInput}
              onChange={(e) => setAvoidedInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addAvoidedWord()}
              placeholder="Add word"
              className="flex-1"
            />
            <Button size="sm" onClick={addAvoidedWord}>
              <Plus className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex flex-wrap gap-1 mt-2">
            {data.voice.vocabulary.avoided.map((word) => (
              <span
                key={word}
                className="px-2 py-1 rounded bg-red-500/20 text-red-700 dark:text-red-300 text-xs flex items-center gap-1"
              >
                {word}
                <button onClick={() => removeAvoidedWord(word)}>
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function BrandRulesStep({ data, onChange }: StepProps) {
  const [doInput, setDoInput] = useState("");
  const [dontInput, setDontInput] = useState("");

  const addDoStatement = () => {
    if (!doInput.trim()) return;
    onChange({
      rules: {
        ...data.rules,
        doStatements: [...data.rules.doStatements, doInput.trim()],
      },
    });
    setDoInput("");
  };

  const addDontStatement = () => {
    if (!dontInput.trim()) return;
    onChange({
      rules: {
        ...data.rules,
        dontStatements: [...data.rules.dontStatements, dontInput.trim()],
      },
    });
    setDontInput("");
  };

  const removeDoStatement = (statement: string) => {
    onChange({
      rules: {
        ...data.rules,
        doStatements: data.rules.doStatements.filter((s) => s !== statement),
      },
    });
  };

  const removeDontStatement = (statement: string) => {
    onChange({
      rules: {
        ...data.rules,
        dontStatements: data.rules.dontStatements.filter(
          (s) => s !== statement,
        ),
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold mb-2">Brand rules</h2>
        <p className="text-muted-foreground">
          Define what your brand should and shouldn't do
        </p>
      </div>

      {/* Do Statements */}
      <div>
        <Label className="text-green-600 dark:text-green-400 flex items-center gap-2 mb-2">
          <CheckCircle2 className="w-4 h-4" />
          Do's - Things your brand should always do
        </Label>
        <div className="flex gap-2">
          <Input
            value={doInput}
            onChange={(e) => setDoInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addDoStatement()}
            placeholder="e.g., Always use inclusive language"
            className="flex-1"
          />
          <Button size="sm" onClick={addDoStatement}>
            <Plus className="w-4 h-4" />
          </Button>
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          {data.rules.doStatements.map((statement, index) => (
            <span
              key={index}
              className="px-3 py-1.5 rounded-lg bg-green-500/20 text-green-700 dark:text-green-300 text-sm flex items-center gap-2"
            >
              {statement}
              <button
                onClick={() => removeDoStatement(statement)}
                className="hover:bg-green-500/30 rounded p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
        {data.rules.doStatements.length === 0 && (
          <p className="text-sm text-muted-foreground mt-2">
            No do's added yet
          </p>
        )}
      </div>

      {/* Don't Statements */}
      <div>
        <Label className="text-red-600 dark:text-red-400 flex items-center gap-2 mb-2">
          <XCircle className="w-4 h-4" />
          Don'ts - Things your brand should never do
        </Label>
        <div className="flex gap-2">
          <Input
            value={dontInput}
            onChange={(e) => setDontInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addDontStatement()}
            placeholder="e.g., Never use slang or profanity"
            className="flex-1"
          />
          <Button size="sm" onClick={addDontStatement}>
            <Plus className="w-4 h-4" />
          </Button>
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          {data.rules.dontStatements.map((statement, index) => (
            <span
              key={index}
              className="px-3 py-1.5 rounded-lg bg-red-500/20 text-red-700 dark:text-red-300 text-sm flex items-center gap-2"
            >
              {statement}
              <button
                onClick={() => removeDontStatement(statement)}
                className="hover:bg-red-500/30 rounded p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
        {data.rules.dontStatements.length === 0 && (
          <p className="text-sm text-muted-foreground mt-2">
            No don'ts added yet
          </p>
        )}
      </div>

      {/* Legal Disclaimer */}
      <div>
        <Label htmlFor="legalDisclaimer">Legal Disclaimer (Optional)</Label>
        <p className="text-xs text-muted-foreground mb-2">
          Text to append to product descriptions for compliance
        </p>
        <textarea
          id="legalDisclaimer"
          value={data.rules.legalDisclaimer}
          onChange={(e) =>
            onChange({
              rules: { ...data.rules, legalDisclaimer: e.target.value },
            })
          }
          placeholder="e.g., Results may vary. Not intended to diagnose, treat, or cure any disease."
          className="w-full min-h-[100px] rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
        />
      </div>

      {/* Summary */}
      <div className="p-4 rounded-lg bg-muted/50">
        <Label className="text-xs text-muted-foreground mb-2 block">
          Summary
        </Label>
        <div className="text-sm space-y-1">
          <p>
            <span className="text-green-600 dark:text-green-400">
              {data.rules.doStatements.length}
            </span>{" "}
            do's defined
          </p>
          <p>
            <span className="text-red-600 dark:text-red-400">
              {data.rules.dontStatements.length}
            </span>{" "}
            don'ts defined
          </p>
          {data.rules.legalDisclaimer && (
            <p className="text-muted-foreground">Legal disclaimer added</p>
          )}
        </div>
      </div>
    </div>
  );
}

function BrandAssetsStep({ data, onChange }: StepProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadType, setUploadType] = useState<
    "characters" | "scenes" | "siteImages"
  >("characters");
  const [newAssetName, setNewAssetName] = useState("");
  const [newAssetDesc, setNewAssetDesc] = useState("");
  const [newAssetType, setNewAssetType] = useState("studio");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const accomplish = getAccomplish();

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    setError(null);

    try {
      for (const file of Array.from(files)) {
        // Check file size before uploading
        if (file.size > MAX_FILE_SIZE_BYTES) {
          const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
          setError(
            `File "${file.name}" is too large (${sizeMB}MB). Please use an image smaller than ${MAX_FILE_SIZE_MB}MB.`,
          );
          continue;
        }

        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve, reject) => {
          reader.onload = () => {
            const result = reader.result as string;
            const base64 = result.split(",")[1];
            resolve(base64);
          };
          reader.onerror = reject;
        });
        reader.readAsDataURL(file);
        const base64 = await base64Promise;

        const assetTypeMap = {
          characters: "characters",
          scenes: "scenes",
          siteImages: "site-images",
        } as const;

        const result = await accomplish.uploadBrandAsset(
          data.id,
          assetTypeMap[uploadType],
          file.name,
          file.type,
          base64,
        );

        if (result.success && result.url) {
          if (uploadType === "siteImages") {
            onChange({ siteImages: [...data.siteImages, result.url] });
          } else if (uploadType === "characters") {
            onChange({
              characters: [
                ...data.characters,
                {
                  url: result.url,
                  name: newAssetName,
                  description: newAssetDesc,
                },
              ],
            });
          } else {
            onChange({
              scenes: [
                ...data.scenes,
                {
                  url: result.url,
                  name: newAssetName,
                  description: newAssetDesc,
                  type: newAssetType,
                },
              ],
            });
          }
          setNewAssetName("");
          setNewAssetDesc("");
        } else {
          setError(
            humanizeUploadError(result.error || "Failed to upload asset"),
          );
        }
      }
    } catch (err) {
      console.error("Failed to upload asset:", err);
      const errorMsg =
        err instanceof Error ? err.message : "Failed to upload asset";
      setError(humanizeUploadError(errorMsg));
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const removeCharacter = (index: number) => {
    onChange({ characters: data.characters.filter((_, i) => i !== index) });
  };

  const removeScene = (index: number) => {
    onChange({ scenes: data.scenes.filter((_, i) => i !== index) });
  };

  const removeSiteImage = (index: number) => {
    onChange({ siteImages: data.siteImages.filter((_, i) => i !== index) });
  };

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold mb-2">Visual Assets (Optional)</h2>
        <p className="text-muted-foreground">
          Add characters, scenes, and reference images
        </p>
      </div>

      {/* Asset Type Tabs */}
      <div className="flex gap-2 border-b border-border">
        {(["characters", "scenes", "siteImages"] as const).map((type) => (
          <button
            key={type}
            onClick={() => setUploadType(type)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              uploadType === type
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {type === "characters" && `Characters (${data.characters.length})`}
            {type === "scenes" && `Scenes (${data.scenes.length})`}
            {type === "siteImages" && `Site Images (${data.siteImages.length})`}
          </button>
        ))}
      </div>

      {/* Metadata inputs for characters/scenes */}
      {uploadType !== "siteImages" && (
        <div className="space-y-2">
          <Input
            value={newAssetName}
            onChange={(e) => setNewAssetName(e.target.value)}
            placeholder={
              uploadType === "characters" ? "Character name" : "Scene name"
            }
          />
          <Input
            value={newAssetDesc}
            onChange={(e) => setNewAssetDesc(e.target.value)}
            placeholder="Description"
          />
          {uploadType === "scenes" && (
            <select
              value={newAssetType}
              onChange={(e) => setNewAssetType(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="studio">Studio</option>
              <option value="lifestyle">Lifestyle</option>
              <option value="outdoor">Outdoor</option>
              <option value="home">Home</option>
              <option value="abstract">Abstract</option>
              <option value="other">Other</option>
            </select>
          )}
        </div>
      )}

      {/* Upload Zone */}
      <div
        onClick={() => fileInputRef.current?.click()}
        className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-all"
      >
        {isUploading ? (
          <Loader2 className="w-8 h-8 mx-auto text-muted-foreground animate-spin mb-2" />
        ) : (
          <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
        )}
        <p className="text-sm text-muted-foreground">
          {isUploading ? "Uploading..." : "Click to upload"}
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-destructive">
          <XCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      {/* Asset Lists */}
      {uploadType === "characters" && data.characters.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {data.characters.map((char, index) => (
            <div key={index} className="relative group">
              <img
                src={char.url}
                alt={char.name}
                className="w-full h-24 object-cover rounded-lg"
              />
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                <button
                  onClick={() => removeCharacter(index)}
                  className="text-white"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
              <p className="text-xs mt-1 truncate">{char.name}</p>
            </div>
          ))}
        </div>
      )}

      {uploadType === "scenes" && data.scenes.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {data.scenes.map((scene, index) => (
            <div key={index} className="relative group">
              <img
                src={scene.url}
                alt={scene.name}
                className="w-full h-24 object-cover rounded-lg"
              />
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                <button
                  onClick={() => removeScene(index)}
                  className="text-white"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
              <p className="text-xs mt-1 truncate">{scene.name}</p>
            </div>
          ))}
        </div>
      )}

      {uploadType === "siteImages" && data.siteImages.length > 0 && (
        <div className="grid grid-cols-4 gap-2">
          {data.siteImages.map((url, index) => (
            <div key={index} className="relative group">
              <img
                src={url}
                alt={`Site ${index + 1}`}
                className="w-full h-20 object-cover rounded-lg"
              />
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                <button
                  onClick={() => removeSiteImage(index)}
                  className="text-white"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ShopifyConnectStep({ data, onChange }: StepProps) {
  const [shopDomain, setShopDomain] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shopName, setShopName] = useState<string | null>(null);

  const handleTestConnection = async () => {
    if (!shopDomain.trim() || !accessToken.trim()) return;

    setIsTesting(true);
    setError(null);
    setShopName(null);

    try {
      const accomplish = getAccomplish();
      const result = await accomplish.testShopifyConnection({
        shopDomain: shopDomain.trim(),
        accessToken: accessToken.trim(),
      });

      if (result.success && result.shop) {
        setShopName(result.shop.name);
      } else {
        setError(result.error || "Connection failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setIsTesting(false);
    }
  };

  const handleConnect = async () => {
    if (!shopDomain.trim() || !accessToken.trim()) return;

    setIsConnecting(true);
    setError(null);

    try {
      const accomplish = getAccomplish();

      const testResult = await accomplish.testShopifyConnection({
        shopDomain: shopDomain.trim(),
        accessToken: accessToken.trim(),
      });

      if (!testResult.success) {
        setError(testResult.error || "Invalid credentials");
        setIsConnecting(false);
        return;
      }

      await accomplish.connectShopify({
        shopDomain: shopDomain.trim(),
        accessToken: accessToken.trim(),
      });

      onChange({
        shopifyConnected: true,
        shopifyStoreUrl: shopDomain.trim(),
      });
      setShopName(testResult.shop?.name || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect");
    } finally {
      setIsConnecting(false);
    }
  };

  if (data.shopifyConnected) {
    return (
      <div className="space-y-6">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold mb-2">Shopify Connected!</h2>
          <p className="text-muted-foreground">
            Your store is ready to be managed by Shop OS
          </p>
        </div>

        <div className="p-6 rounded-lg border-2 border-foreground/20 bg-foreground/5">
          <div className="text-center space-y-4">
            <div className="w-12 h-12 mx-auto rounded-full bg-foreground/10 flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6 text-foreground" />
            </div>
            <div>
              <h3 className="font-medium">
                {shopName || data.shopifyStoreUrl}
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                Successfully connected to your Shopify store
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold mb-2">Connect Shopify (Optional)</h2>
        <p className="text-muted-foreground">
          This allows Shop OS to read and update your products
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <Label htmlFor="shopDomain">Store Domain</Label>
          <Input
            id="shopDomain"
            value={shopDomain}
            onChange={(e) => {
              setShopDomain(e.target.value);
              setError(null);
              setShopName(null);
            }}
            placeholder="your-store.myshopify.com"
            className="mt-1.5"
          />
        </div>

        <div>
          <Label htmlFor="accessToken">Admin API Access Token</Label>
          <Input
            id="accessToken"
            type="password"
            value={accessToken}
            onChange={(e) => {
              setAccessToken(e.target.value);
              setError(null);
            }}
            placeholder="shpat_..."
            className="mt-1.5"
          />
          <p className="text-xs text-muted-foreground mt-1.5">
            Create a custom app in your Shopify admin to get an access token.{" "}
            <a
              href="https://help.shopify.com/en/manual/apps/app-types/custom-apps"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Learn how
            </a>
          </p>
        </div>

        {shopName && !error && (
          <div className="flex items-center gap-2 text-sm text-foreground">
            <CheckCircle2 className="w-4 h-4" />
            Connection verified: {shopName}
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <XCircle className="w-4 h-4" />
            {error}
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <Button
            variant="outline"
            onClick={handleTestConnection}
            disabled={isTesting || !shopDomain.trim() || !accessToken.trim()}
            className="gap-2"
          >
            {isTesting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Testing...
              </>
            ) : (
              "Test Connection"
            )}
          </Button>
          <Button
            onClick={handleConnect}
            disabled={isConnecting || !shopDomain.trim() || !accessToken.trim()}
            className="flex-1 gap-2"
          >
            {isConnecting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Connecting...
              </>
            ) : (
              <>
                <ShoppingBag className="w-4 h-4" />
                Connect Store
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

function CompleteStep({
  data,
  brandMemory,
}: {
  data: OnboardingBrandData;
  brandMemory: BrandMemory | null;
}) {
  const displayName = brandMemory?.name || data.name || "Your Brand";

  return (
    <div className="text-center space-y-6">
      <div className="w-20 h-20 mx-auto rounded-full bg-foreground/10 flex items-center justify-center">
        <CheckCircle2 className="w-10 h-10 text-foreground" />
      </div>
      <div>
        <h2 className="text-2xl font-bold mb-2">You're all set!</h2>
        <p className="text-muted-foreground">
          Shop OS is ready to help <strong>{displayName}</strong>
        </p>
      </div>

      {/* Summary */}
      <div className="p-4 rounded-lg bg-muted/50 text-left space-y-3">
        {data.logos.length > 0 && (
          <div className="flex items-center gap-3">
            <div className="flex -space-x-2">
              {data.logos.slice(0, 3).map((logo, i) => (
                <div
                  key={i}
                  className="w-8 h-8 rounded-full bg-white border-2 border-background overflow-hidden"
                >
                  <img
                    src={logo.url}
                    alt=""
                    className="w-full h-full object-contain"
                  />
                </div>
              ))}
            </div>
            <span className="text-sm">{data.logos.length} logo(s)</span>
          </div>
        )}

        {data.palette.primary.length > 0 && (
          <div className="flex items-center gap-3">
            <div className="flex -space-x-1">
              {data.palette.primary.slice(0, 5).map((color, i) => (
                <div
                  key={i}
                  className="w-6 h-6 rounded-full border-2 border-background"
                  style={{ backgroundColor: color.hex }}
                />
              ))}
            </div>
            <span className="text-sm">
              {data.palette.primary.length + data.palette.secondary.length}{" "}
              color(s)
            </span>
          </div>
        )}

        <div className="flex items-center gap-3">
          <MessageSquare className="w-5 h-5 text-muted-foreground" />
          <span className="text-sm capitalize">
            {data.voice.template} voice
          </span>
        </div>

        {data.shopifyConnected && (
          <div className="flex items-center gap-3">
            <ShoppingBag className="w-5 h-5 text-muted-foreground" />
            <span className="text-sm">Shopify connected</span>
          </div>
        )}
      </div>

      <div className="grid gap-3 text-left">
        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
          <CheckCircle2 className="w-5 h-5 text-foreground" />
          <span>Writing product descriptions in your voice</span>
        </div>
        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
          <CheckCircle2 className="w-5 h-5 text-foreground" />
          <span>Generating product photography</span>
        </div>
        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
          <CheckCircle2 className="w-5 h-5 text-foreground" />
          <span>Researching competitors</span>
        </div>
        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
          <CheckCircle2 className="w-5 h-5 text-foreground" />
          <span>Managing your Shopify catalog</span>
        </div>
      </div>
    </div>
  );
}

export default BrandOnboarding;
