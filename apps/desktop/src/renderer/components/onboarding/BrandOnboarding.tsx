/**
 * Brand Onboarding Wizard
 * 
 * Multi-step wizard to capture brand information:
 * 1. Welcome - Introduction to BrandWork
 * 2. Brand Basics - Name, industry, target audience
 * 3. Brand Voice - Tone, personality, vocabulary
 * 4. Brand Style - Colors, visual preferences
 * 5. Shopify Connect - OAuth connection (optional)
 * 6. Complete - Summary and finish
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ArrowRight, 
  ArrowLeft, 
  Sparkles, 
  Building2, 
  MessageSquare, 
  Palette,
  ShoppingBag,
  CheckCircle2,
  XCircle,
  Loader2,
  Upload,
  FileJson,
  Image,
  Type,
  Users
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getAccomplish } from '@/lib/accomplish';
import type { 
  OnboardingStep, 
  BrandProfile, 
  BrandVoiceTemplate,
  BrandMemory
} from '@brandwork/shared';

interface BrandOnboardingProps {
  onComplete: (brandProfile: BrandProfile) => void;
}

const VOICE_TEMPLATES: { id: BrandVoiceTemplate; name: string; description: string; example: string }[] = [
  { 
    id: 'professional', 
    name: 'Professional', 
    description: 'Formal, authoritative, trustworthy',
    example: 'Discover our curated collection of premium products...'
  },
  { 
    id: 'friendly', 
    name: 'Friendly', 
    description: 'Warm, conversational, approachable',
    example: "Hey there! You're gonna love what we have in store..."
  },
  { 
    id: 'playful', 
    name: 'Playful', 
    description: 'Fun, witty, energetic',
    example: 'Warning: These deals are seriously addictive...'
  },
  { 
    id: 'luxury', 
    name: 'Luxury', 
    description: 'Sophisticated, exclusive, refined',
    example: 'Introducing the epitome of elegance...'
  },
  { 
    id: 'minimal', 
    name: 'Minimal', 
    description: 'Direct, understated, clean',
    example: 'Simple. Beautiful. Yours.'
  },
];

type ExtendedOnboardingStep = OnboardingStep | 'brand-memory';

const STEPS: { id: ExtendedOnboardingStep; title: string; icon: React.ElementType }[] = [
  { id: 'welcome', title: 'Welcome', icon: Sparkles },
  { id: 'brand-basics', title: 'Brand Basics', icon: Building2 },
  { id: 'brand-voice', title: 'Voice', icon: MessageSquare },
  { id: 'brand-style', title: 'Style', icon: Palette },
  { id: 'brand-memory', title: 'Memory', icon: FileJson },
  { id: 'shopify-connect', title: 'Shopify', icon: ShoppingBag },
  { id: 'complete', title: 'Complete', icon: CheckCircle2 },
];

export function BrandOnboarding({ onComplete }: BrandOnboardingProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [setupMode, setSetupMode] = useState<'choose' | 'manual' | 'import'>('choose');
  const [brandMemory, setBrandMemory] = useState<BrandMemory | null>(null);
  const [brandData, setBrandData] = useState<Partial<BrandProfile>>({
    name: '',
    description: '',
    industry: '',
    targetAudience: '',
    voice: {
      template: 'friendly',
      tone: '',
      personality: [],
      vocabulary: { preferred: [], avoided: [] },
      examples: [],
    },
    style: {
      primaryColor: '#6366F1',
      secondaryColor: '#8B5CF6',
      fontStyle: 'modern',
      imageStyle: 'lifestyle',
    },
    rules: {
      doStatements: [],
      dontStatements: [],
    },
    shopifyConnected: false,
  });

  const currentStep = STEPS[currentStepIndex];
  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === STEPS.length - 1;

  const goNext = () => {
    if (!isLastStep) {
      // If in import mode and we're at welcome, skip to shopify-connect (index 5)
      if (setupMode === 'import' && currentStepIndex === 0 && brandMemory) {
        // Skip manual steps, go directly to Shopify connect
        const shopifyIndex = STEPS.findIndex(s => s.id === 'shopify-connect');
        setCurrentStepIndex(shopifyIndex);
      } else {
        setCurrentStepIndex(currentStepIndex + 1);
      }
    } else {
      // Complete onboarding
      const completedProfile: BrandProfile = {
        id: `brand_${Date.now()}`,
        name: brandMemory?.name || brandData.name || 'My Brand',
        description: brandMemory?.overview || brandData.description || '',
        industry: brandData.industry || '',
        targetAudience: brandData.targetAudience || '',
        voice: brandData.voice!,
        style: brandData.style!,
        rules: brandData.rules!,
        memory: brandMemory || undefined,
        shopifyConnected: brandData.shopifyConnected || false,
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

  const updateBrandData = (updates: Partial<BrandProfile>) => {
    setBrandData(prev => ({ ...prev, ...updates }));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex flex-col">
      {/* Progress bar */}
      <div className="p-4">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-2">
            {STEPS.map((step, index) => (
              <div 
                key={step.id}
                className="flex items-center"
              >
                <div 
                  className={`
                    w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium transition-colors
                    ${index <= currentStepIndex 
                      ? 'bg-primary text-primary-foreground' 
                      : 'bg-muted text-muted-foreground'}
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
                      w-12 h-0.5 mx-1 transition-colors
                      ${index < currentStepIndex ? 'bg-primary' : 'bg-muted'}
                    `}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-xl">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep.id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              {currentStep.id === 'welcome' && (
                <WelcomeStep 
                  setupMode={setupMode}
                  onSetupModeChange={setSetupMode}
                  brandMemory={brandMemory}
                  onBrandMemoryChange={setBrandMemory}
                />
              )}
              {currentStep.id === 'brand-basics' && (
                <BrandBasicsStep 
                  data={brandData} 
                  onChange={updateBrandData} 
                />
              )}
              {currentStep.id === 'brand-voice' && (
                <BrandVoiceStep 
                  data={brandData} 
                  onChange={updateBrandData} 
                />
              )}
              {currentStep.id === 'brand-style' && (
                <BrandStyleStep 
                  data={brandData} 
                  onChange={updateBrandData} 
                />
              )}
              {currentStep.id === 'brand-memory' && (
                <BrandMemoryStep 
                  memory={brandMemory}
                  onChange={setBrandMemory}
                />
              )}
              {currentStep.id === 'shopify-connect' && (
                <ShopifyConnectStep 
                  data={brandData} 
                  onChange={updateBrandData} 
                />
              )}
              {currentStep.id === 'complete' && (
                <CompleteStep data={brandData} />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Navigation */}
      <div className="p-8">
        <div className="max-w-xl mx-auto flex justify-between">
          <Button
            variant="ghost"
            onClick={goBack}
            disabled={isFirstStep || (currentStepIndex === 0 && setupMode === 'choose')}
            className="gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
          <Button 
            onClick={goNext} 
            className="gap-2"
            disabled={currentStepIndex === 0 && setupMode === 'choose'}
          >
            {isLastStep ? 'Get Started' : 'Continue'}
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// Step Components

interface WelcomeStepProps {
  setupMode: 'choose' | 'manual' | 'import';
  onSetupModeChange: (mode: 'choose' | 'manual' | 'import') => void;
  brandMemory: BrandMemory | null;
  onBrandMemoryChange: (memory: BrandMemory | null) => void;
}

function WelcomeStep({ setupMode, onSetupModeChange, brandMemory, onBrandMemoryChange }: WelcomeStepProps) {
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
      
      // Validate required fields
      if (!memoryData.name) {
        throw new Error('Brand memory must have a name');
      }

      onBrandMemoryChange(memoryData);
      onSetupModeChange('import');
    } catch (err) {
      console.error('Failed to import brand memory:', err);
      setError(err instanceof Error ? err.message : 'Failed to parse JSON file');
    } finally {
      setIsLoading(false);
    }
  };

  const handleManualSetup = () => {
    onSetupModeChange('manual');
  };

  const handleRemoveImport = () => {
    onBrandMemoryChange(null);
    onSetupModeChange('choose');
  };

  // Show imported summary if we have brand memory
  if (setupMode === 'import' && brandMemory) {
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
      <div className="w-20 h-20 mx-auto rounded-2xl bg-primary/10 flex items-center justify-center">
        <Sparkles className="w-10 h-10 text-primary" />
      </div>
      <div>
        <h1 className="text-3xl font-bold mb-3">Welcome to Shop OS</h1>
        <p className="text-lg text-muted-foreground">
          Your AI work companion that learns your brand and does real commerce work.
        </p>
      </div>

      <div className="space-y-3 pt-4">
        <p className="text-sm text-muted-foreground mb-4">How would you like to set up your brand?</p>
        
        {/* Import JSON Option */}
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
            <p className="text-sm text-muted-foreground">Upload your brand's visual DNA file</p>
          </div>
        </button>

        {/* Manual Setup Option */}
        <button
          onClick={handleManualSetup}
          disabled={isLoading}
          className="w-full p-4 rounded-lg border-2 border-border hover:border-primary/50 hover:bg-muted/30 transition-all text-left flex items-center gap-4"
        >
          <Building2 className="w-8 h-8 text-primary" />
          <div>
            <h3 className="font-medium">Enter Details Manually</h3>
            <p className="text-sm text-muted-foreground">Set up your brand step by step</p>
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

interface StepProps {
  data: Partial<BrandProfile>;
  onChange: (updates: Partial<BrandProfile>) => void;
}

function BrandBasicsStep({ data, onChange }: StepProps) {
  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold mb-2">Tell us about your brand</h2>
        <p className="text-muted-foreground">We'll use this to personalize your experience</p>
      </div>
      
      <div className="space-y-4">
        <div>
          <Label htmlFor="brandName">Brand Name</Label>
          <Input
            id="brandName"
            value={data.name || ''}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="e.g., Acme Fashion Co."
            className="mt-1.5"
          />
        </div>
        
        <div>
          <Label htmlFor="industry">Industry</Label>
          <Input
            id="industry"
            value={data.industry || ''}
            onChange={(e) => onChange({ industry: e.target.value })}
            placeholder="e.g., Fashion, Electronics, Home Goods"
            className="mt-1.5"
          />
        </div>
        
        <div>
          <Label htmlFor="targetAudience">Target Audience</Label>
          <Input
            id="targetAudience"
            value={data.targetAudience || ''}
            onChange={(e) => onChange({ targetAudience: e.target.value })}
            placeholder="e.g., Young professionals aged 25-35"
            className="mt-1.5"
          />
        </div>
        
        <div>
          <Label htmlFor="description">Brief Description</Label>
          <textarea
            id="description"
            value={data.description || ''}
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

function BrandVoiceStep({ data, onChange }: StepProps) {
  const selectedTemplate = data.voice?.template || 'friendly';

  const handleTemplateSelect = (template: BrandVoiceTemplate) => {
    onChange({
      voice: {
        ...data.voice!,
        template,
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold mb-2">Choose your brand voice</h2>
        <p className="text-muted-foreground">This helps us write content that sounds like you</p>
      </div>
      
      <div className="space-y-3">
        {VOICE_TEMPLATES.map((template) => (
          <button
            key={template.id}
            onClick={() => handleTemplateSelect(template.id)}
            className={`
              w-full p-4 rounded-lg border-2 text-left transition-all
              ${selectedTemplate === template.id 
                ? 'border-primary bg-primary/5' 
                : 'border-border hover:border-primary/50'}
            `}
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-medium">{template.name}</h3>
                <p className="text-sm text-muted-foreground">{template.description}</p>
                <p className="text-sm text-muted-foreground/70 mt-2 italic">
                  "{template.example}"
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
  );
}

function BrandStyleStep({ data, onChange }: StepProps) {
  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold mb-2">Visual preferences</h2>
        <p className="text-muted-foreground">Help us match your brand's aesthetic</p>
      </div>
      
      <div className="space-y-6">
        <div>
          <Label>Primary Color</Label>
          <div className="flex items-center gap-3 mt-2">
            <input
              type="color"
              value={data.style?.primaryColor || '#6366F1'}
              onChange={(e) => onChange({
                style: { ...data.style!, primaryColor: e.target.value }
              })}
              className="w-12 h-12 rounded-lg cursor-pointer border-2 border-border"
            />
            <Input
              value={data.style?.primaryColor || '#6366F1'}
              onChange={(e) => onChange({
                style: { ...data.style!, primaryColor: e.target.value }
              })}
              placeholder="#6366F1"
              className="flex-1"
            />
          </div>
        </div>

        <div>
          <Label>Image Style Preference</Label>
          <div className="grid grid-cols-2 gap-3 mt-2">
            {(['lifestyle', 'studio', 'minimal', 'vibrant'] as const).map((style) => (
              <button
                key={style}
                onClick={() => onChange({
                  style: { ...data.style!, imageStyle: style }
                })}
                className={`
                  p-4 rounded-lg border-2 text-left capitalize transition-all
                  ${data.style?.imageStyle === style 
                    ? 'border-primary bg-primary/5' 
                    : 'border-border hover:border-primary/50'}
                `}
              >
                {style}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

interface BrandMemoryStepProps {
  memory: BrandMemory | null;
  onChange: (memory: BrandMemory | null) => void;
}

function BrandMemoryStep({ memory, onChange }: BrandMemoryStepProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const accomplish = getAccomplish();

  const handleFileUpload = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await accomplish.openFilePicker();
      if (result.canceled || result.filePaths.length === 0) {
        setIsLoading(false);
        return;
      }

      const filePath = result.filePaths[0];
      
      // Read the file via loadLocalFile
      const fileData = await accomplish.loadLocalFile(filePath);
      
      // Parse JSON from dataUrl
      // dataUrl format: data:application/json;base64,<base64data>
      const base64Data = fileData.dataUrl.split(',')[1];
      const jsonString = atob(base64Data);
      const memoryData = JSON.parse(jsonString) as BrandMemory;
      
      // Validate required fields
      if (!memoryData.name) {
        throw new Error('Brand memory must have a name');
      }

      onChange(memoryData);
    } catch (err) {
      console.error('Failed to import brand memory:', err);
      setError(err instanceof Error ? err.message : 'Failed to parse JSON file');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemove = () => {
    onChange(null);
    setError(null);
  };

  // Count what's included in the memory
  const memorySummary = memory ? {
    hasLogo: !!memory.logo?.urls?.length,
    hasTagline: !!memory.tagline?.text,
    hasColors: !!memory.palette?.primary?.length,
    hasFonts: !!memory.fonts?.length,
    hasCharacters: !!memory.characters?.length,
    hasScenes: !!memory.scenes?.length,
    hasSiteImages: !!memory.site_images?.length,
  } : null;

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold mb-2">Brand Memory (Optional)</h2>
        <p className="text-muted-foreground">
          Import your brand's visual DNA for AI-powered image generation
        </p>
      </div>

      {!memory ? (
        <div className="space-y-4">
          <div 
            onClick={handleFileUpload}
            className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-all"
          >
            {isLoading ? (
              <Loader2 className="w-10 h-10 mx-auto text-muted-foreground animate-spin mb-3" />
            ) : (
              <Upload className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
            )}
            <h3 className="font-medium mb-1">Upload Brand Memory JSON</h3>
            <p className="text-sm text-muted-foreground">
              Click to select a brand memory file
            </p>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <XCircle className="w-4 h-4" />
              {error}
            </div>
          )}

          <div className="p-4 rounded-lg bg-muted/50">
            <h4 className="font-medium mb-2 text-sm">What's included in Brand Memory?</h4>
            <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Image className="w-4 h-4" />
                <span>Logo & site images</span>
              </div>
              <div className="flex items-center gap-2">
                <Palette className="w-4 h-4" />
                <span>Color palette</span>
              </div>
              <div className="flex items-center gap-2">
                <Type className="w-4 h-4" />
                <span>Fonts & typography</span>
              </div>
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4" />
                <span>Characters & scenes</span>
              </div>
            </div>
          </div>

          <p className="text-xs text-muted-foreground text-center">
            You can skip this step and import later in Settings
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="p-6 rounded-lg border-2 border-foreground/20 bg-foreground/5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-foreground/10 flex items-center justify-center">
                  <FileJson className="w-5 h-5 text-foreground" />
                </div>
                <div>
                  <h3 className="font-medium">{memory.name}</h3>
                  <p className="text-sm text-muted-foreground">Brand memory imported</p>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={handleRemove}>
                Remove
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {memorySummary?.hasLogo && (
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="w-4 h-4 text-foreground" />
                  <span>Logo</span>
                </div>
              )}
              {memorySummary?.hasTagline && (
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="w-4 h-4 text-foreground" />
                  <span>Tagline</span>
                </div>
              )}
              {memorySummary?.hasColors && (
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="w-4 h-4 text-foreground" />
                  <span>{memory.palette?.primary?.length || 0} colors</span>
                </div>
              )}
              {memorySummary?.hasFonts && (
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="w-4 h-4 text-foreground" />
                  <span>{memory.fonts?.length || 0} fonts</span>
                </div>
              )}
              {memorySummary?.hasCharacters && (
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="w-4 h-4 text-foreground" />
                  <span>{memory.characters?.length || 0} characters</span>
                </div>
              )}
              {memorySummary?.hasScenes && (
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="w-4 h-4 text-foreground" />
                  <span>{memory.scenes?.length || 0} scenes</span>
                </div>
              )}
              {memorySummary?.hasSiteImages && (
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="w-4 h-4 text-foreground" />
                  <span>{memory.site_images?.length || 0} site images</span>
                </div>
              )}
            </div>
          </div>

          {memory.overview && (
            <div className="p-4 rounded-lg bg-muted/50">
              <h4 className="font-medium mb-1 text-sm">Overview</h4>
              <p className="text-sm text-muted-foreground line-clamp-3">{memory.overview}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ShopifyConnectStep({ data, onChange }: StepProps) {
  const [shopDomain, setShopDomain] = useState('');
  const [accessToken, setAccessToken] = useState('');
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
        setError(result.error || 'Connection failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed');
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
      
      // Test first
      const testResult = await accomplish.testShopifyConnection({
        shopDomain: shopDomain.trim(),
        accessToken: accessToken.trim(),
      });

      if (!testResult.success) {
        setError(testResult.error || 'Invalid credentials');
        setIsConnecting(false);
        return;
      }

      // Connect
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
      setError(err instanceof Error ? err.message : 'Failed to connect');
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
            Your store is ready to be managed by BrandWork
          </p>
        </div>
        
        <div className="p-6 rounded-lg border-2 border-foreground/20 bg-foreground/5">
          <div className="text-center space-y-4">
            <div className="w-12 h-12 mx-auto rounded-full bg-foreground/10 flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6 text-foreground" />
            </div>
            <div>
              <h3 className="font-medium">{shopName || data.shopifyStoreUrl}</h3>
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
        <h2 className="text-2xl font-bold mb-2">Connect your Shopify store</h2>
        <p className="text-muted-foreground">
          This allows BrandWork to read and update your products
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
            Create a custom app in your Shopify admin to get an access token.{' '}
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
              'Test Connection'
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

        <p className="text-xs text-muted-foreground text-center pt-2">
          You can skip this step and connect later in Settings
        </p>
      </div>
    </div>
  );
}

function CompleteStep({ data }: { data: Partial<BrandProfile> }) {
  return (
    <div className="text-center space-y-6">
      <div className="w-20 h-20 mx-auto rounded-full bg-foreground/10 flex items-center justify-center">
        <CheckCircle2 className="w-10 h-10 text-foreground" />
      </div>
      <div>
        <h2 className="text-2xl font-bold mb-2">You're all set!</h2>
        <p className="text-muted-foreground">
          Shop OS is ready to help <strong>{data.name || 'your brand'}</strong> with:
        </p>
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
