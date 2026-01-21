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
import type { BrandProfile, BrandVoice, BrandStyle, BrandRules, BrandMemory } from '@brandwork/shared';

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
 * This is injected into every agent request to maintain brand consistency
 */
export function generateBrandContext(brandId?: string): string {
  const profile = brandId ? getBrandProfile(brandId) : getActiveBrandProfile();
  
  if (!profile) {
    return '';
  }

  const examples = getBrandExamples(profile.id, undefined, 5);
  
  const context = `
## Brand Context: ${profile.name}

### Brand Overview
- **Industry**: ${profile.industry || 'Not specified'}
- **Target Audience**: ${profile.targetAudience || 'Not specified'}
- **Description**: ${profile.description || 'Not specified'}

### Brand Voice
- **Template**: ${profile.voice.template}
- **Tone**: ${profile.voice.tone || 'Match the template style'}
- **Personality**: ${profile.voice.personality?.join(', ') || 'Authentic, helpful'}

### Writing Guidelines
${profile.voice.vocabulary?.preferred?.length ? `- **Preferred Words**: ${profile.voice.vocabulary.preferred.join(', ')}` : ''}
${profile.voice.vocabulary?.avoided?.length ? `- **Avoid Using**: ${profile.voice.vocabulary.avoided.join(', ')}` : ''}

### Brand Rules
${profile.rules.doStatements?.length ? profile.rules.doStatements.map(s => `- DO: ${s}`).join('\n') : ''}
${profile.rules.dontStatements?.length ? profile.rules.dontStatements.map(s => `- DON'T: ${s}`).join('\n') : ''}
${profile.rules.legalDisclaimer ? `- **Legal Note**: ${profile.rules.legalDisclaimer}` : ''}

### Visual Style Preferences
- **Primary Color**: ${profile.style.primaryColor}
- **Image Style**: ${profile.style.imageStyle}
- **Font Style**: ${profile.style.fontStyle}

${examples.length > 0 ? `
### Example Outputs (Learn from these)
${examples.map(ex => `
**${ex.example_type}**:
${ex.input_text ? `Input: ${ex.input_text}` : ''}
Output: ${ex.output_text}
`).join('\n')}
` : ''}

**IMPORTANT**: All content you generate must align with this brand voice and style. When writing product descriptions, marketing copy, or any customer-facing content, embody the ${profile.voice.template} voice template.
`.trim();

  return context;
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
