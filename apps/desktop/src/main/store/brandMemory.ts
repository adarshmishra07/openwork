/**
 * Brand Memory Store
 * 
 * SQLite-based persistent storage for brand profiles and learned patterns.
 * Stores brand voice, style, rules, and context that gets injected into agent prompts.
 */

import Database from 'better-sqlite3';
import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import type { BrandProfile, BrandVoice, BrandStyle, BrandRules, BrandMemory } from '@shopos/shared';

// Safe console.log that doesn't crash on EPIPE errors
function safeLog(...args: unknown[]): void {
  try {
    console.log(...args);
  } catch {
    // Ignore EPIPE errors
  }
}

// Database instance (lazy initialization)
let db: Database.Database | null = null;

/**
 * Get the database file path
 */
function getDbPath(): string {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'brand-memory.db');
}

/**
 * Initialize the database and create tables if needed
 */
function initDatabase(): Database.Database {
  if (db) return db;

  const dbPath = getDbPath();
  safeLog('[BrandMemory] Initializing database at:', dbPath);

  // Ensure directory exists
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  db = new Database(dbPath);

  // Enable WAL mode for better performance
  db.pragma('journal_mode = WAL');

  // Create tables
  db.exec(`
    -- Brand profiles table
    CREATE TABLE IF NOT EXISTS brand_profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      industry TEXT,
      target_audience TEXT,
      voice_json TEXT NOT NULL,
      style_json TEXT NOT NULL,
      rules_json TEXT NOT NULL,
      memory_json TEXT,
      shopify_connected INTEGER DEFAULT 0,
      shopify_store_url TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      is_active INTEGER DEFAULT 1
    );
    
    -- Migration: Add memory_json column if it doesn't exist
    -- SQLite doesn't have ALTER TABLE IF NOT EXISTS, so we use a safe approach
  `);
  
  // Check if memory_json column exists, if not add it
  const columns = db.prepare(`PRAGMA table_info(brand_profiles)`).all() as Array<{ name: string }>;
  const hasMemoryColumn = columns.some(col => col.name === 'memory_json');
  if (!hasMemoryColumn) {
    safeLog('[BrandMemory] Adding memory_json column...');
    db.exec(`ALTER TABLE brand_profiles ADD COLUMN memory_json TEXT`);
  }

  db.exec(`

    -- Brand learned patterns (for future ML/learning features)
    CREATE TABLE IF NOT EXISTS brand_patterns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      brand_id TEXT NOT NULL,
      pattern_type TEXT NOT NULL,
      pattern_data TEXT NOT NULL,
      confidence REAL DEFAULT 0.0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (brand_id) REFERENCES brand_profiles(id) ON DELETE CASCADE
    );

    -- Brand examples (successful outputs to learn from)
    CREATE TABLE IF NOT EXISTS brand_examples (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      brand_id TEXT NOT NULL,
      example_type TEXT NOT NULL,
      input_text TEXT,
      output_text TEXT NOT NULL,
      rating INTEGER,
      created_at TEXT NOT NULL,
      FOREIGN KEY (brand_id) REFERENCES brand_profiles(id) ON DELETE CASCADE
    );

    -- Indexes for performance
    CREATE INDEX IF NOT EXISTS idx_brand_patterns_brand_id ON brand_patterns(brand_id);
    CREATE INDEX IF NOT EXISTS idx_brand_examples_brand_id ON brand_examples(brand_id);
    CREATE INDEX IF NOT EXISTS idx_brand_profiles_active ON brand_profiles(is_active);
  `);

  safeLog('[BrandMemory] Database initialized successfully');
  return db;
}

/**
 * Get the database instance
 */
function getDb(): Database.Database {
  return initDatabase();
}

/**
 * Save a brand profile to the database
 */
export function saveBrandProfile(profile: BrandProfile): void {
  const db = getDb();
  
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO brand_profiles (
      id, name, description, industry, target_audience,
      voice_json, style_json, rules_json, memory_json,
      shopify_connected, shopify_store_url,
      created_at, updated_at, is_active
    ) VALUES (
      @id, @name, @description, @industry, @targetAudience,
      @voiceJson, @styleJson, @rulesJson, @memoryJson,
      @shopifyConnected, @shopifyStoreUrl,
      @createdAt, @updatedAt, @isActive
    )
  `);

  stmt.run({
    id: profile.id,
    name: profile.name,
    description: profile.description || '',
    industry: profile.industry || '',
    targetAudience: profile.targetAudience || '',
    voiceJson: JSON.stringify(profile.voice),
    styleJson: JSON.stringify(profile.style),
    rulesJson: JSON.stringify(profile.rules),
    memoryJson: profile.memory ? JSON.stringify(profile.memory) : null,
    shopifyConnected: profile.shopifyConnected ? 1 : 0,
    shopifyStoreUrl: profile.shopifyStoreUrl || null,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
    isActive: 1,
  });

  safeLog('[BrandMemory] Saved brand profile:', profile.id);
}

/**
 * Get the active brand profile
 */
export function getActiveBrandProfile(): BrandProfile | null {
  const db = getDb();
  
  const stmt = db.prepare(`
    SELECT * FROM brand_profiles WHERE is_active = 1 ORDER BY updated_at DESC LIMIT 1
  `);

  const row = stmt.get() as BrandProfileRow | undefined;
  
  if (!row) return null;

  return rowToBrandProfile(row);
}

/**
 * Get a brand profile by ID
 */
export function getBrandProfile(id: string): BrandProfile | null {
  const db = getDb();
  
  const stmt = db.prepare(`SELECT * FROM brand_profiles WHERE id = ?`);
  const row = stmt.get(id) as BrandProfileRow | undefined;
  
  if (!row) return null;

  return rowToBrandProfile(row);
}

/**
 * Get all brand profiles
 */
export function getAllBrandProfiles(): BrandProfile[] {
  const db = getDb();
  
  const stmt = db.prepare(`SELECT * FROM brand_profiles ORDER BY updated_at DESC`);
  const rows = stmt.all() as BrandProfileRow[];
  
  return rows.map(rowToBrandProfile);
}

/**
 * Update a brand profile
 */
export function updateBrandProfile(id: string, updates: Partial<BrandProfile>): void {
  const db = getDb();
  const existing = getBrandProfile(id);
  
  if (!existing) {
    throw new Error(`Brand profile not found: ${id}`);
  }

  const updated: BrandProfile = {
    ...existing,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  saveBrandProfile(updated);
}

/**
 * Delete a brand profile
 */
export function deleteBrandProfile(id: string): void {
  const db = getDb();
  
  const stmt = db.prepare(`DELETE FROM brand_profiles WHERE id = ?`);
  stmt.run(id);
  
  safeLog('[BrandMemory] Deleted brand profile:', id);
}

/**
 * Set a brand profile as active (deactivates others)
 */
export function setActiveBrandProfile(id: string): void {
  const db = getDb();
  
  db.transaction(() => {
    // Deactivate all
    db.prepare(`UPDATE brand_profiles SET is_active = 0`).run();
    // Activate the selected one
    db.prepare(`UPDATE brand_profiles SET is_active = 1 WHERE id = ?`).run(id);
  })();
  
  safeLog('[BrandMemory] Set active brand profile:', id);
}

/**
 * Add a learned pattern
 */
export function addBrandPattern(
  brandId: string,
  patternType: string,
  patternData: Record<string, unknown>,
  confidence: number = 0.5
): void {
  const db = getDb();
  
  const stmt = db.prepare(`
    INSERT INTO brand_patterns (brand_id, pattern_type, pattern_data, confidence, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  stmt.run(
    brandId,
    patternType,
    JSON.stringify(patternData),
    confidence,
    new Date().toISOString()
  );
}

/**
 * Add a brand example (for learning)
 */
export function addBrandExample(
  brandId: string,
  exampleType: string,
  inputText: string | null,
  outputText: string,
  rating?: number
): void {
  const db = getDb();
  
  const stmt = db.prepare(`
    INSERT INTO brand_examples (brand_id, example_type, input_text, output_text, rating, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    brandId,
    exampleType,
    inputText,
    outputText,
    rating ?? null,
    new Date().toISOString()
  );
}

/**
 * Get brand examples for context injection
 */
export function getBrandExamples(brandId: string, exampleType?: string, limit: number = 10): BrandExample[] {
  const db = getDb();
  
  let sql = `SELECT * FROM brand_examples WHERE brand_id = ?`;
  const params: (string | number)[] = [brandId];
  
  if (exampleType) {
    sql += ` AND example_type = ?`;
    params.push(exampleType);
  }
  
  sql += ` ORDER BY rating DESC NULLS LAST, created_at DESC LIMIT ?`;
  params.push(limit);
  
  const stmt = db.prepare(sql);
  return stmt.all(...params) as BrandExample[];
}

/**
 * Generate brand context for agent prompts
 * This is injected into every agent request to maintain brand consistency.
 * 
 * The function merges data from BrandProfile and BrandMemory, with BrandProfile
 * taking precedence. This allows standalone BrandMemory JSON files to provide
 * voice/rules/context that will be used if the BrandProfile fields are empty.
 */
export function generateBrandContext(brandId?: string): string {
  const profile = brandId ? getBrandProfile(brandId) : getActiveBrandProfile();
  
  if (!profile) {
    return '';
  }

  const examples = getBrandExamples(profile.id, undefined, 5);
  const memory = profile.memory;
  
  // Build the context string with all available brand information
  let context = `## Brand Context: ${profile.name}\n\n`;

  // Brand Overview - use profile fields with memory as fallback
  context += `### Brand Overview\n`;
  context += `- **Industry**: ${profile.industry || memory?.industry || 'Not specified'}\n`;
  context += `- **Target Audience**: ${profile.targetAudience || memory?.targetAudience || 'Not specified'}\n`;
  context += `- **Description**: ${profile.description || memory?.overview || 'Not specified'}\n`;
  
  // Tagline (from memory)
  if (memory?.tagline?.text) {
    context += `- **Tagline**: "${memory.tagline.text}"`;
    if (memory.tagline.tones?.length) {
      context += ` (${memory.tagline.tones.join(', ')})`;
    }
    context += '\n';
  }
  context += '\n';

  // Brand Voice - merge profile.voice with memory.voice as fallback
  const voiceTemplate = profile.voice?.template || memory?.voice?.template || 'friendly';
  const voiceTone = profile.voice?.tone || memory?.voice?.tone || 'Match the template style';
  const voicePersonality = (profile.voice?.personality?.length ? profile.voice.personality : memory?.voice?.personality) || ['Authentic', 'helpful'];
  
  context += `### Brand Voice\n`;
  context += `- **Template**: ${voiceTemplate}\n`;
  context += `- **Tone**: ${voiceTone}\n`;
  context += `- **Personality**: ${voicePersonality.join(', ')}\n\n`;

  // Writing Guidelines - merge vocabulary from both sources
  const preferredWords = [
    ...(profile.voice?.vocabulary?.preferred || []),
    ...(memory?.voice?.vocabulary?.preferred || [])
  ].filter((v, i, a) => a.indexOf(v) === i); // dedupe
  
  const avoidedWords = [
    ...(profile.voice?.vocabulary?.avoided || []),
    ...(memory?.voice?.vocabulary?.avoided || [])
  ].filter((v, i, a) => a.indexOf(v) === i); // dedupe
  
  context += `### Writing Guidelines\n`;
  if (preferredWords.length > 0) {
    context += `- **Preferred Words**: ${preferredWords.join(', ')}\n`;
  }
  if (avoidedWords.length > 0) {
    context += `- **Avoid Using**: ${avoidedWords.join(', ')}\n`;
  }
  
  // Voice examples from both sources
  const voiceExamples = [
    ...(profile.voice?.examples || []),
    ...(memory?.voice?.examples || [])
  ];
  if (voiceExamples.length > 0) {
    context += `- **Example Phrases**:\n`;
    voiceExamples.slice(0, 5).forEach(ex => {
      context += `  - "${ex}"\n`;
    });
  }
  context += '\n';

  // Brand Rules - merge from both sources
  const doStatements = [
    ...(profile.rules?.doStatements || []),
    ...(memory?.rules?.doStatements || [])
  ].filter((v, i, a) => a.indexOf(v) === i); // dedupe
  
  const dontStatements = [
    ...(profile.rules?.dontStatements || []),
    ...(memory?.rules?.dontStatements || [])
  ].filter((v, i, a) => a.indexOf(v) === i); // dedupe
  
  const legalDisclaimer = profile.rules?.legalDisclaimer || memory?.rules?.legalDisclaimer;
  
  if (doStatements.length > 0 || dontStatements.length > 0 || legalDisclaimer) {
    context += `### Brand Rules\n`;
    if (doStatements.length > 0) {
      context += doStatements.map(s => `- DO: ${s}`).join('\n') + '\n';
    }
    if (dontStatements.length > 0) {
      context += dontStatements.map(s => `- DON'T: ${s}`).join('\n') + '\n';
    }
    if (legalDisclaimer) {
      context += `- **Legal Note**: ${legalDisclaimer}\n`;
    }
    context += '\n';
  }

  // Visual Style Section
  context += `### Visual Style\n`;
  context += `- **Primary Color**: ${profile.style.primaryColor}\n`;
  context += `- **Image Style**: ${profile.style.imageStyle}\n`;
  context += `- **Font Style**: ${profile.style.fontStyle}\n`;

  // Extended visual assets from memory
  if (memory) {
    // Logos
    if (memory.logo?.urls?.length) {
      context += `\n#### Brand Logos\n`;
      memory.logo.urls.forEach((url, i) => {
        context += `- Logo ${i + 1}: ${url}\n`;
      });
      if (memory.logo.colors?.length) {
        context += `- **Logo Colors**: ${memory.logo.colors.join(', ')}\n`;
      }
    }

    // Color Palette
    if (memory.palette) {
      context += `\n#### Color Palette\n`;
      if (memory.palette.primary?.length) {
        context += `**Primary Colors:**\n`;
        memory.palette.primary.forEach(c => {
          context += `- ${c.hex}${c.label ? ` (${c.label})` : ''}\n`;
        });
      }
      if (memory.palette.secondary?.length) {
        context += `**Secondary Colors:**\n`;
        memory.palette.secondary.forEach(c => {
          context += `- ${c.hex}${c.label ? ` (${c.label})` : ''}\n`;
        });
      }
      if (memory.palette.other?.length) {
        context += `**Accent Colors:**\n`;
        memory.palette.other.forEach(c => {
          context += `- ${c.hex}${c.label ? ` (${c.label})` : ''}\n`;
        });
      }
    }

    // Typography
    if (memory.fonts?.length) {
      context += `\n#### Typography\n`;
      memory.fonts.forEach(font => {
        context += `- **Font**: ${font.family}, Weight: ${font.weight}, Color: ${font.color}\n`;
        if (font.fileUrl) {
          context += `  Font file: ${font.fileUrl}\n`;
        }
      });
    }

    // Characters/Models
    if (memory.characters?.length) {
      context += `\n#### Brand Characters/Models\n`;
      context += `Use these characters when creating visual content:\n`;
      memory.characters.forEach(char => {
        context += `- **${char.metadata.name}**: ${char.metadata.description}\n`;
        context += `  Image: ${char.url}\n`;
        if (char.metadata.appearance) {
          context += `  Appearance: ${char.metadata.appearance}\n`;
        }
        if (char.metadata.outfit) {
          context += `  Outfit: ${char.metadata.outfit}\n`;
        }
      });
    }

    // Scenes/Backgrounds
    if (memory.scenes?.length) {
      context += `\n#### Brand Scenes/Backgrounds\n`;
      context += `Use these scenes for product photography:\n`;
      memory.scenes.forEach(scene => {
        context += `- **${scene.metadata.name}** (${scene.metadata.type}): ${scene.metadata.description}\n`;
        context += `  Image: ${scene.url}\n`;
      });
    }

    // Site Reference Images
    if (memory.site_images?.length) {
      context += `\n#### Site Reference Images\n`;
      context += `These images represent the brand's visual aesthetic:\n`;
      memory.site_images.forEach((url, i) => {
        context += `- Reference ${i + 1}: ${url}\n`;
      });
    }
  }

  // Examples
  if (examples.length > 0) {
    context += `\n### Example Outputs (Learn from these)\n`;
    examples.forEach(ex => {
      context += `\n**${ex.example_type}**:\n`;
      if (ex.input_text) {
        context += `Input: ${ex.input_text}\n`;
      }
      context += `Output: ${ex.output_text}\n`;
    });
  }

  // Visual instruction
  if (memory?.logo?.urls?.length || memory?.characters?.length || memory?.scenes?.length || memory?.site_images?.length) {
    context += `\n### Visual Content Instructions\n`;
    context += `When creating visual content, analyze the images and visual assets above alongside the text descriptions to ensure consistency with the brand's established aesthetic. Pay attention to:\n`;
    context += `- Color palette and how colors are used\n`;
    context += `- Overall style and mood of imagery\n`;
    context += `- Typography and text treatments\n`;
    context += `- Character/model styling if applicable\n`;
    context += `- Background and scene compositions\n`;
  }

  context += `\n**IMPORTANT**: All content you generate must align with this brand voice and style. When writing product descriptions, marketing copy, or any customer-facing content, embody the ${voiceTemplate} voice template.`;

  return context.trim();
}

/**
 * Check if brand memory has any profiles
 */
export function hasBrandProfile(): boolean {
  const db = getDb();
  const stmt = db.prepare(`SELECT COUNT(*) as count FROM brand_profiles`);
  const result = stmt.get() as { count: number };
  return result.count > 0;
}

/**
 * Close the database connection
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
    safeLog('[BrandMemory] Database closed');
  }
}

// Type definitions for database rows
interface BrandProfileRow {
  id: string;
  name: string;
  description: string;
  industry: string;
  target_audience: string;
  voice_json: string;
  style_json: string;
  rules_json: string;
  memory_json: string | null;
  shopify_connected: number;
  shopify_store_url: string | null;
  created_at: string;
  updated_at: string;
  is_active: number;
}

interface BrandExample {
  id: number;
  brand_id: string;
  example_type: string;
  input_text: string | null;
  output_text: string;
  rating: number | null;
  created_at: string;
}

/**
 * Convert database row to BrandProfile
 */
function rowToBrandProfile(row: BrandProfileRow): BrandProfile {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    industry: row.industry,
    targetAudience: row.target_audience,
    voice: JSON.parse(row.voice_json) as BrandVoice,
    style: JSON.parse(row.style_json) as BrandStyle,
    rules: JSON.parse(row.rules_json) as BrandRules,
    memory: row.memory_json ? JSON.parse(row.memory_json) as BrandMemory : undefined,
    shopifyConnected: row.shopify_connected === 1,
    shopifyStoreUrl: row.shopify_store_url || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Import brand memory from JSON data
 * Validates the structure and merges with existing profile
 */
export function importBrandMemory(brandId: string, memoryData: BrandMemory): void {
  const db = getDb();
  const existing = getBrandProfile(brandId);
  
  if (!existing) {
    throw new Error(`Brand profile not found: ${brandId}`);
  }

  // Validate required fields
  if (!memoryData.name) {
    throw new Error('Brand memory must have a name');
  }

  const updated: BrandProfile = {
    ...existing,
    memory: memoryData,
    updatedAt: new Date().toISOString(),
  };

  saveBrandProfile(updated);
  safeLog('[BrandMemory] Imported brand memory for:', brandId);
}

/**
 * Get brand memory for a profile
 */
export function getBrandMemory(brandId: string): BrandMemory | null {
  const profile = getBrandProfile(brandId);
  return profile?.memory || null;
}

/**
 * Get active brand memory (from active profile)
 */
export function getActiveBrandMemory(): BrandMemory | null {
  const profile = getActiveBrandProfile();
  return profile?.memory || null;
}
