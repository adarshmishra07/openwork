/**
 * Brand Settings Section
 * 
 * Allows editing brand profile, logos, colors, voice, and visual assets.
 */

import { useState, useEffect, useRef } from 'react';
import { 
  Building2, 
  Palette, 
  MessageSquare, 
  Image as ImageIcon,
  Upload,
  Trash2,
  Plus,
  X,
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  Edit2
} from 'lucide-react';
import { getAccomplish } from '@/lib/accomplish';
import type { BrandProfile, BrandVoiceTemplate, BrandColor } from '@shopos/shared';

// Max file size: 4MB (Lambda has 6MB limit, base64 adds ~33% overhead)
const MAX_FILE_SIZE_MB = 4;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

const VOICE_TEMPLATES: { id: BrandVoiceTemplate; name: string }[] = [
  { id: 'professional', name: 'Professional' },
  { id: 'friendly', name: 'Friendly' },
  { id: 'playful', name: 'Playful' },
  { id: 'luxury', name: 'Luxury' },
  { id: 'minimal', name: 'Minimal' },
];

const TAGLINE_TONES = ['minimal', 'bold', 'professional', 'playful', 'luxury', 'modern', 'elegant', 'casual'];
const PERSONALITY_TRAITS = ['innovative', 'trustworthy', 'friendly', 'bold', 'sophisticated', 'playful', 'authentic', 'expert', 'caring', 'adventurous'];

function humanizeUploadError(error: string): string {
  if (error.includes('413') || error.includes('6291456') || error.includes('Request must be smaller')) {
    return `File is too large. Please use an image smaller than ${MAX_FILE_SIZE_MB}MB.`;
  }
  if (error.includes('Failed to fetch') || error.includes('NetworkError')) {
    return 'Network error. Please check your internet connection and try again.';
  }
  if (error.includes('timeout') || error.includes('Timeout')) {
    return 'Upload timed out. Please try again with a smaller file.';
  }
  return error.replace(/\d{3}\s*-\s*/, '').replace(/[{}"]/g, '').trim() || 'Upload failed. Please try again.';
}

interface BrandSettingsSectionProps {
  onBrandUpdated?: () => void;
}

export function BrandSettingsSection({ onBrandUpdated }: BrandSettingsSectionProps) {
  const [brand, setBrand] = useState<BrandProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [expandedSection, setExpandedSection] = useState<string | null>('basics');
  const accomplish = getAccomplish();

  // Load brand profile
  useEffect(() => {
    loadBrand();
  }, []);

  const loadBrand = async () => {
    setLoading(true);
    try {
      const profile = await accomplish.getActiveBrandProfile();
      setBrand(profile);
    } catch (err) {
      console.error('Failed to load brand:', err);
      setError('Failed to load brand profile');
    } finally {
      setLoading(false);
    }
  };

  const saveBrand = async (updates: Partial<BrandProfile>) => {
    if (!brand) return;
    
    setSaving(true);
    setError(null);
    setSuccess(null);
    
    try {
      await accomplish.updateBrandProfile(brand.id, {
        ...updates,
        updatedAt: new Date().toISOString(),
      });
      
      // Reload to get fresh data
      const updated = await accomplish.getBrandProfile(brand.id);
      if (updated) {
        setBrand(updated);
      }
      
      setSuccess('Brand updated successfully');
      setTimeout(() => setSuccess(null), 3000);
      onBrandUpdated?.();
    } catch (err) {
      console.error('Failed to save brand:', err);
      setError('Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (!brand) {
    return (
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="text-center py-8">
          <Building2 className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <h3 className="font-medium mb-1">No Brand Profile</h3>
          <p className="text-sm text-muted-foreground">
            Complete the onboarding to set up your brand profile.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Status Messages */}
      {error && (
        <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-lg">
          <XCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 text-sm text-green-600 bg-green-500/10 p-3 rounded-lg">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {success}
        </div>
      )}

      {/* Brand Basics */}
      <CollapsibleSection
        title="Brand Basics"
        icon={Building2}
        expanded={expandedSection === 'basics'}
        onToggle={() => toggleSection('basics')}
      >
        <BrandBasicsEditor brand={brand} onSave={saveBrand} saving={saving} />
      </CollapsibleSection>

      {/* Brand Colors */}
      <CollapsibleSection
        title="Colors & Logo"
        icon={Palette}
        expanded={expandedSection === 'colors'}
        onToggle={() => toggleSection('colors')}
      >
        <BrandColorsEditor brand={brand} onSave={saveBrand} saving={saving} />
      </CollapsibleSection>

      {/* Brand Voice */}
      <CollapsibleSection
        title="Brand Voice"
        icon={MessageSquare}
        expanded={expandedSection === 'voice'}
        onToggle={() => toggleSection('voice')}
      >
        <BrandVoiceEditor brand={brand} onSave={saveBrand} saving={saving} />
      </CollapsibleSection>

      {/* Brand Rules */}
      <CollapsibleSection
        title="Brand Rules"
        icon={CheckCircle2}
        expanded={expandedSection === 'rules'}
        onToggle={() => toggleSection('rules')}
      >
        <BrandRulesEditor brand={brand} onSave={saveBrand} saving={saving} />
      </CollapsibleSection>

      {/* Visual Assets */}
      <CollapsibleSection
        title="Visual Assets"
        icon={ImageIcon}
        expanded={expandedSection === 'assets'}
        onToggle={() => toggleSection('assets')}
      >
        <BrandAssetsEditor brand={brand} onSave={saveBrand} saving={saving} />
      </CollapsibleSection>
    </div>
  );
}

// Collapsible Section Component
interface CollapsibleSectionProps {
  title: string;
  icon: React.ElementType;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

function CollapsibleSection({ title, icon: Icon, expanded, onToggle, children }: CollapsibleSectionProps) {
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <Icon className="h-4 w-4 text-primary" />
          </div>
          <span className="font-medium">{title}</span>
        </div>
        {expanded ? (
          <ChevronUp className="h-5 w-5 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-5 w-5 text-muted-foreground" />
        )}
      </button>
      {expanded && (
        <div className="px-4 pb-4 border-t border-border pt-4">
          {children}
        </div>
      )}
    </div>
  );
}

// Brand Basics Editor
interface EditorProps {
  brand: BrandProfile;
  onSave: (updates: Partial<BrandProfile>) => Promise<void>;
  saving: boolean;
}

function BrandBasicsEditor({ brand, onSave, saving }: EditorProps) {
  const [name, setName] = useState(brand.name);
  const [description, setDescription] = useState(brand.description);
  const [industry, setIndustry] = useState(brand.industry);
  const [targetAudience, setTargetAudience] = useState(brand.targetAudience);
  const [taglineText, setTaglineText] = useState(brand.memory?.tagline?.text || '');
  const [taglineTones, setTaglineTones] = useState<string[]>(brand.memory?.tagline?.tones || []);

  const hasChanges = 
    name !== brand.name ||
    description !== brand.description ||
    industry !== brand.industry ||
    targetAudience !== brand.targetAudience ||
    taglineText !== (brand.memory?.tagline?.text || '') ||
    JSON.stringify(taglineTones) !== JSON.stringify(brand.memory?.tagline?.tones || []);

  const handleSave = () => {
    onSave({
      name,
      description,
      industry,
      targetAudience,
      memory: {
        ...brand.memory,
        name,
        overview: description,
        tagline: { text: taglineText, tones: taglineTones },
      },
    });
  };

  const toggleTone = (tone: string) => {
    setTaglineTones(prev => 
      prev.includes(tone) ? prev.filter(t => t !== tone) : [...prev, tone]
    );
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1.5">Brand Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1.5">Tagline</label>
        <input
          type="text"
          value={taglineText}
          onChange={(e) => setTaglineText(e.target.value)}
          placeholder="e.g., Style that speaks"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1.5">Tagline Tones</label>
        <div className="flex flex-wrap gap-2">
          {TAGLINE_TONES.map((tone) => (
            <button
              key={tone}
              onClick={() => toggleTone(tone)}
              className={`px-2.5 py-1 rounded-full text-xs capitalize transition-all ${
                taglineTones.includes(tone)
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted hover:bg-muted/80'
              }`}
            >
              {tone}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1.5">Industry</label>
        <input
          type="text"
          value={industry}
          onChange={(e) => setIndustry(e.target.value)}
          placeholder="e.g., Fashion, Electronics"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1.5">Target Audience</label>
        <input
          type="text"
          value={targetAudience}
          onChange={(e) => setTargetAudience(e.target.value)}
          placeholder="e.g., Young professionals aged 25-35"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1.5">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What makes your brand unique?"
          rows={3}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>

      {hasChanges && (
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      )}
    </div>
  );
}

// Brand Colors Editor
function BrandColorsEditor({ brand, onSave, saving }: EditorProps) {
  const [primaryColors, setPrimaryColors] = useState<BrandColor[]>(
    brand.memory?.palette?.primary || [{ hex: brand.style.primaryColor, label: 'Primary' }]
  );
  const [secondaryColors, setSecondaryColors] = useState<BrandColor[]>(
    brand.memory?.palette?.secondary || []
  );
  const [logoUrls, setLogoUrls] = useState<string[]>(brand.memory?.logo?.urls || []);
  const [logoColors, setLogoColors] = useState<string[]>(brand.memory?.logo?.colors || []);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const accomplish = getAccomplish();

  const hasChanges = 
    JSON.stringify(primaryColors) !== JSON.stringify(brand.memory?.palette?.primary || [{ hex: brand.style.primaryColor, label: 'Primary' }]) ||
    JSON.stringify(secondaryColors) !== JSON.stringify(brand.memory?.palette?.secondary || []) ||
    JSON.stringify(logoUrls) !== JSON.stringify(brand.memory?.logo?.urls || []) ||
    JSON.stringify(logoColors) !== JSON.stringify(brand.memory?.logo?.colors || []);

  const handleSave = () => {
    onSave({
      style: {
        ...brand.style,
        primaryColor: primaryColors[0]?.hex || brand.style.primaryColor,
        secondaryColor: secondaryColors[0]?.hex || brand.style.secondaryColor,
      },
      memory: {
        ...brand.memory,
        name: brand.name,
        palette: {
          primary: primaryColors,
          secondary: secondaryColors,
          other: brand.memory?.palette?.other || [],
        },
        logo: {
          urls: logoUrls,
          colors: logoColors,
        },
      },
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    setUploadError(null);

    try {
      for (const file of Array.from(files)) {
        if (file.size > MAX_FILE_SIZE_BYTES) {
          setUploadError(`File too large. Max size is ${MAX_FILE_SIZE_MB}MB.`);
          continue;
        }

        const reader = new FileReader();
        const base64 = await new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve((reader.result as string).split(',')[1]);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        const result = await accomplish.uploadBrandAsset(
          brand.id,
          'logos',
          file.name,
          file.type,
          base64
        );

        if (result.success && result.url) {
          setLogoUrls(prev => [...prev, result.url!]);
        } else {
          setUploadError(humanizeUploadError(result.error || 'Upload failed'));
        }
      }
    } catch (err) {
      setUploadError(humanizeUploadError(err instanceof Error ? err.message : 'Upload failed'));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const addColor = (type: 'primary' | 'secondary') => {
    const setter = type === 'primary' ? setPrimaryColors : setSecondaryColors;
    setter(prev => [...prev, { hex: '#000000', label: '' }]);
  };

  const updateColor = (type: 'primary' | 'secondary', index: number, updates: Partial<BrandColor>) => {
    const setter = type === 'primary' ? setPrimaryColors : setSecondaryColors;
    setter(prev => prev.map((c, i) => i === index ? { ...c, ...updates } : c));
  };

  const removeColor = (type: 'primary' | 'secondary', index: number) => {
    const setter = type === 'primary' ? setPrimaryColors : setSecondaryColors;
    setter(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-6">
      {/* Logos */}
      <div>
        <label className="block text-sm font-medium mb-2">Brand Logos</label>
        <div className="flex flex-wrap gap-3">
          {logoUrls.map((url, index) => (
            <div key={index} className="relative group">
              <div className="w-16 h-16 rounded-lg bg-white border border-border overflow-hidden">
                <img src={url} alt={`Logo ${index + 1}`} className="w-full h-full object-contain" />
              </div>
              <button
                onClick={() => setLogoUrls(prev => prev.filter((_, i) => i !== index))}
                className="absolute -top-2 -right-2 w-5 h-5 bg-destructive text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="w-16 h-16 rounded-lg border-2 border-dashed border-border hover:border-primary/50 flex items-center justify-center transition-colors"
          >
            {uploading ? (
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            ) : (
              <Plus className="w-5 h-5 text-muted-foreground" />
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileUpload}
            className="hidden"
          />
        </div>
        {uploadError && (
          <p className="text-xs text-destructive mt-2">{uploadError}</p>
        )}
      </div>

      {/* Primary Colors */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium">Primary Colors</label>
          <button onClick={() => addColor('primary')} className="text-xs text-primary hover:underline">
            + Add Color
          </button>
        </div>
        <div className="space-y-2">
          {primaryColors.map((color, index) => (
            <div key={index} className="flex items-center gap-2">
              <input
                type="color"
                value={color.hex}
                onChange={(e) => updateColor('primary', index, { hex: e.target.value })}
                className="w-10 h-10 rounded cursor-pointer border border-border"
              />
              <input
                type="text"
                value={color.hex}
                onChange={(e) => updateColor('primary', index, { hex: e.target.value })}
                className="w-24 rounded-md border border-input bg-background px-2 py-1.5 text-sm"
              />
              <input
                type="text"
                value={color.label}
                onChange={(e) => updateColor('primary', index, { label: e.target.value })}
                placeholder="Label"
                className="flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-sm"
              />
              {primaryColors.length > 1 && (
                <button onClick={() => removeColor('primary', index)} className="text-destructive hover:text-destructive/80">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Secondary Colors */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium">Secondary Colors</label>
          <button onClick={() => addColor('secondary')} className="text-xs text-primary hover:underline">
            + Add Color
          </button>
        </div>
        <div className="space-y-2">
          {secondaryColors.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">No secondary colors</p>
          ) : (
            secondaryColors.map((color, index) => (
              <div key={index} className="flex items-center gap-2">
                <input
                  type="color"
                  value={color.hex}
                  onChange={(e) => updateColor('secondary', index, { hex: e.target.value })}
                  className="w-10 h-10 rounded cursor-pointer border border-border"
                />
                <input
                  type="text"
                  value={color.hex}
                  onChange={(e) => updateColor('secondary', index, { hex: e.target.value })}
                  className="w-24 rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                />
                <input
                  type="text"
                  value={color.label}
                  onChange={(e) => updateColor('secondary', index, { label: e.target.value })}
                  placeholder="Label"
                  className="flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                />
                <button onClick={() => removeColor('secondary', index)} className="text-destructive hover:text-destructive/80">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {hasChanges && (
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      )}
    </div>
  );
}

// Brand Voice Editor
function BrandVoiceEditor({ brand, onSave, saving }: EditorProps) {
  const [template, setTemplate] = useState<BrandVoiceTemplate>(brand.voice.template);
  const [tone, setTone] = useState(brand.voice.tone);
  const [personality, setPersonality] = useState<string[]>(brand.voice.personality || []);
  const [preferred, setPreferred] = useState<string[]>(brand.voice.vocabulary?.preferred || []);
  const [avoided, setAvoided] = useState<string[]>(brand.voice.vocabulary?.avoided || []);
  const [newPreferred, setNewPreferred] = useState('');
  const [newAvoided, setNewAvoided] = useState('');

  const hasChanges = 
    template !== brand.voice.template ||
    tone !== brand.voice.tone ||
    JSON.stringify(personality) !== JSON.stringify(brand.voice.personality || []) ||
    JSON.stringify(preferred) !== JSON.stringify(brand.voice.vocabulary?.preferred || []) ||
    JSON.stringify(avoided) !== JSON.stringify(brand.voice.vocabulary?.avoided || []);

  const handleSave = () => {
    onSave({
      voice: {
        ...brand.voice,
        template,
        tone,
        personality,
        vocabulary: { preferred, avoided },
      },
    });
  };

  const togglePersonality = (trait: string) => {
    setPersonality(prev => 
      prev.includes(trait) ? prev.filter(t => t !== trait) : [...prev, trait]
    );
  };

  const addPreferred = () => {
    if (newPreferred.trim() && !preferred.includes(newPreferred.trim())) {
      setPreferred(prev => [...prev, newPreferred.trim()]);
      setNewPreferred('');
    }
  };

  const addAvoided = () => {
    if (newAvoided.trim() && !avoided.includes(newAvoided.trim())) {
      setAvoided(prev => [...prev, newAvoided.trim()]);
      setNewAvoided('');
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1.5">Voice Template</label>
        <select
          value={template}
          onChange={(e) => setTemplate(e.target.value as BrandVoiceTemplate)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          {VOICE_TEMPLATES.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1.5">Tone Description</label>
        <input
          type="text"
          value={tone}
          onChange={(e) => setTone(e.target.value)}
          placeholder="e.g., Warm and approachable, yet authoritative"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1.5">Personality Traits</label>
        <div className="flex flex-wrap gap-2">
          {PERSONALITY_TRAITS.map((trait) => (
            <button
              key={trait}
              onClick={() => togglePersonality(trait)}
              className={`px-2.5 py-1 rounded-full text-xs capitalize transition-all ${
                personality.includes(trait)
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted hover:bg-muted/80'
              }`}
            >
              {trait}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1.5">Preferred Words</label>
          <div className="flex gap-1.5 mb-2">
            <input
              type="text"
              value={newPreferred}
              onChange={(e) => setNewPreferred(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addPreferred()}
              placeholder="Add word"
              className="flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            />
            <button onClick={addPreferred} className="px-2 rounded-md bg-muted hover:bg-muted/80">
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <div className="flex flex-wrap gap-1">
            {preferred.map((word) => (
              <span key={word} className="px-2 py-0.5 rounded bg-green-500/20 text-green-700 dark:text-green-300 text-xs flex items-center gap-1">
                {word}
                <button onClick={() => setPreferred(prev => prev.filter(w => w !== word))}>
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">Avoided Words</label>
          <div className="flex gap-1.5 mb-2">
            <input
              type="text"
              value={newAvoided}
              onChange={(e) => setNewAvoided(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addAvoided()}
              placeholder="Add word"
              className="flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            />
            <button onClick={addAvoided} className="px-2 rounded-md bg-muted hover:bg-muted/80">
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <div className="flex flex-wrap gap-1">
            {avoided.map((word) => (
              <span key={word} className="px-2 py-0.5 rounded bg-red-500/20 text-red-700 dark:text-red-300 text-xs flex items-center gap-1">
                {word}
                <button onClick={() => setAvoided(prev => prev.filter(w => w !== word))}>
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        </div>
      </div>

      {hasChanges && (
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      )}
    </div>
  );
}

// Brand Rules Editor
function BrandRulesEditor({ brand, onSave, saving }: EditorProps) {
  const [doStatements, setDoStatements] = useState<string[]>(brand.rules?.doStatements || []);
  const [dontStatements, setDontStatements] = useState<string[]>(brand.rules?.dontStatements || []);
  const [legalDisclaimer, setLegalDisclaimer] = useState(brand.rules?.legalDisclaimer || '');
  const [newDo, setNewDo] = useState('');
  const [newDont, setNewDont] = useState('');

  const hasChanges = 
    JSON.stringify(doStatements) !== JSON.stringify(brand.rules?.doStatements || []) ||
    JSON.stringify(dontStatements) !== JSON.stringify(brand.rules?.dontStatements || []) ||
    legalDisclaimer !== (brand.rules?.legalDisclaimer || '');

  const handleSave = () => {
    onSave({
      rules: {
        doStatements,
        dontStatements,
        legalDisclaimer: legalDisclaimer || undefined,
      },
      memory: {
        ...brand.memory,
        name: brand.name,
        rules: {
          doStatements: doStatements.length > 0 ? doStatements : undefined,
          dontStatements: dontStatements.length > 0 ? dontStatements : undefined,
          legalDisclaimer: legalDisclaimer || undefined,
        },
      },
    });
  };

  const addDo = () => {
    if (newDo.trim() && !doStatements.includes(newDo.trim())) {
      setDoStatements(prev => [...prev, newDo.trim()]);
      setNewDo('');
    }
  };

  const addDont = () => {
    if (newDont.trim() && !dontStatements.includes(newDont.trim())) {
      setDontStatements(prev => [...prev, newDont.trim()]);
      setNewDont('');
    }
  };

  return (
    <div className="space-y-4">
      {/* Do Statements */}
      <div>
        <label className="text-sm font-medium text-green-600 dark:text-green-400 flex items-center gap-2 mb-1.5">
          <CheckCircle2 className="w-4 h-4" />
          Do's - Things your brand should always do
        </label>
        <div className="flex gap-1.5 mb-2">
          <input
            type="text"
            value={newDo}
            onChange={(e) => setNewDo(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addDo()}
            placeholder="e.g., Always use inclusive language"
            className="flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          />
          <button onClick={addDo} className="px-2 rounded-md bg-muted hover:bg-muted/80">
            <Plus className="w-4 h-4" />
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {doStatements.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">No do's added yet</p>
          ) : (
            doStatements.map((statement, index) => (
              <span 
                key={index} 
                className="px-2.5 py-1 rounded-lg bg-green-500/20 text-green-700 dark:text-green-300 text-xs flex items-center gap-1.5"
              >
                {statement}
                <button 
                  onClick={() => setDoStatements(prev => prev.filter((_, i) => i !== index))}
                  className="hover:bg-green-500/30 rounded p-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))
          )}
        </div>
      </div>

      {/* Don't Statements */}
      <div>
        <label className="text-sm font-medium text-red-600 dark:text-red-400 flex items-center gap-2 mb-1.5">
          <XCircle className="w-4 h-4" />
          Don'ts - Things your brand should never do
        </label>
        <div className="flex gap-1.5 mb-2">
          <input
            type="text"
            value={newDont}
            onChange={(e) => setNewDont(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addDont()}
            placeholder="e.g., Never use slang or profanity"
            className="flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          />
          <button onClick={addDont} className="px-2 rounded-md bg-muted hover:bg-muted/80">
            <Plus className="w-4 h-4" />
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {dontStatements.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">No don'ts added yet</p>
          ) : (
            dontStatements.map((statement, index) => (
              <span 
                key={index} 
                className="px-2.5 py-1 rounded-lg bg-red-500/20 text-red-700 dark:text-red-300 text-xs flex items-center gap-1.5"
              >
                {statement}
                <button 
                  onClick={() => setDontStatements(prev => prev.filter((_, i) => i !== index))}
                  className="hover:bg-red-500/30 rounded p-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))
          )}
        </div>
      </div>

      {/* Legal Disclaimer */}
      <div>
        <label className="block text-sm font-medium mb-1.5">Legal Disclaimer (Optional)</label>
        <p className="text-xs text-muted-foreground mb-1.5">
          Text to append to product descriptions for compliance
        </p>
        <textarea
          value={legalDisclaimer}
          onChange={(e) => setLegalDisclaimer(e.target.value)}
          placeholder="e.g., Results may vary. Not intended to diagnose, treat, or cure any disease."
          rows={3}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
        />
      </div>

      {hasChanges && (
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      )}
    </div>
  );
}

// Brand Assets Editor
function BrandAssetsEditor({ brand, onSave, saving }: EditorProps) {
  const [characters, setCharacters] = useState(brand.memory?.characters || []);
  const [scenes, setScenes] = useState(brand.memory?.scenes || []);
  const [siteImages, setSiteImages] = useState(brand.memory?.site_images || []);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadType, setUploadType] = useState<'characters' | 'scenes' | 'siteImages'>('characters');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const accomplish = getAccomplish();

  const hasChanges = 
    JSON.stringify(characters) !== JSON.stringify(brand.memory?.characters || []) ||
    JSON.stringify(scenes) !== JSON.stringify(brand.memory?.scenes || []) ||
    JSON.stringify(siteImages) !== JSON.stringify(brand.memory?.site_images || []);

  const handleSave = () => {
    onSave({
      memory: {
        ...brand.memory,
        name: brand.name,
        characters,
        scenes,
        site_images: siteImages,
      },
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    setUploadError(null);

    try {
      for (const file of Array.from(files)) {
        if (file.size > MAX_FILE_SIZE_BYTES) {
          setUploadError(`File too large. Max size is ${MAX_FILE_SIZE_MB}MB.`);
          continue;
        }

        const reader = new FileReader();
        const base64 = await new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve((reader.result as string).split(',')[1]);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        const assetTypeMap = {
          characters: 'characters',
          scenes: 'scenes',
          siteImages: 'site-images',
        } as const;

        const result = await accomplish.uploadBrandAsset(
          brand.id,
          assetTypeMap[uploadType],
          file.name,
          file.type,
          base64
        );

        if (result.success && result.url) {
          if (uploadType === 'siteImages') {
            setSiteImages(prev => [...prev, result.url!]);
          } else if (uploadType === 'characters') {
            setCharacters(prev => [...prev, { url: result.url!, metadata: { name: '', description: '' } }]);
          } else {
            setScenes(prev => [...prev, { url: result.url!, metadata: { name: '', description: '', type: 'studio' as const } }]);
          }
        } else {
          setUploadError(humanizeUploadError(result.error || 'Upload failed'));
        }
      }
    } catch (err) {
      setUploadError(humanizeUploadError(err instanceof Error ? err.message : 'Upload failed'));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-4">
      {/* Tab buttons */}
      <div className="flex gap-2 border-b border-border pb-2">
        {(['characters', 'scenes', 'siteImages'] as const).map((type) => (
          <button
            key={type}
            onClick={() => setUploadType(type)}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              uploadType === type
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            {type === 'characters' && `Characters (${characters.length})`}
            {type === 'scenes' && `Scenes (${scenes.length})`}
            {type === 'siteImages' && `Site Images (${siteImages.length})`}
          </button>
        ))}
      </div>

      {/* Upload button */}
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        className="w-full p-4 rounded-lg border-2 border-dashed border-border hover:border-primary/50 flex items-center justify-center gap-2 transition-colors"
      >
        {uploading ? (
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        ) : (
          <>
            <Upload className="w-5 h-5 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Click to upload</span>
          </>
        )}
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFileUpload}
        className="hidden"
      />

      {uploadError && (
        <p className="text-xs text-destructive">{uploadError}</p>
      )}

      {/* Asset grid */}
      {uploadType === 'characters' && characters.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {characters.map((char, index) => (
            <div key={index} className="relative group">
              <img src={char.url} alt={char.metadata.name || 'Character'} className="w-full h-20 object-cover rounded-lg" />
              <button
                onClick={() => setCharacters(prev => prev.filter((_, i) => i !== index))}
                className="absolute top-1 right-1 w-5 h-5 bg-destructive text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {uploadType === 'scenes' && scenes.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {scenes.map((scene, index) => (
            <div key={index} className="relative group">
              <img src={scene.url} alt={scene.metadata.name || 'Scene'} className="w-full h-20 object-cover rounded-lg" />
              <button
                onClick={() => setScenes(prev => prev.filter((_, i) => i !== index))}
                className="absolute top-1 right-1 w-5 h-5 bg-destructive text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {uploadType === 'siteImages' && siteImages.length > 0 && (
        <div className="grid grid-cols-4 gap-2">
          {siteImages.map((url, index) => (
            <div key={index} className="relative group">
              <img src={url} alt={`Site ${index + 1}`} className="w-full h-16 object-cover rounded-lg" />
              <button
                onClick={() => setSiteImages(prev => prev.filter((_, i) => i !== index))}
                className="absolute top-1 right-1 w-4 h-4 bg-destructive text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {hasChanges && (
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      )}
    </div>
  );
}

export default BrandSettingsSection;
