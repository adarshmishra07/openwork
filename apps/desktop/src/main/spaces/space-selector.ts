/**
 * Space Selector - Intelligent intent-based space matching
 * 
 * Uses a two-phase approach:
 * 1. Fast rule-based matching for obvious cases (keywords + patterns)
 * 2. LLM-based semantic intent matching via Lambda service for complex/ambiguous requests
 * 
 * The Lambda service uses Gemini to understand user intent and match to spaces
 * semantically, not just by keywords.
 */

import { SPACE_REGISTRY, SpaceDefinition } from './space-registry';
import { matchPromptRemote } from './space-runtime-client';

export interface SpaceMatch {
  matched: boolean;
  space: SpaceDefinition | null;
  confidence: number;
  matchedKeywords: string[];
  matchedPatterns: string[];
  intentBased?: boolean; // True if matched via LLM intent detection
}

// Minimum confidence threshold to consider a match
const MIN_CONFIDENCE_THRESHOLD = 0.3;

// High confidence threshold for direct execution (skip orchestration)
const HIGH_CONFIDENCE_THRESHOLD = 0.7;

/**
 * Match a user prompt to the best fitting space using intelligent intent detection.
 * 
 * This is the primary entry point for space matching. It:
 * 1. First tries fast rule-based matching for obvious cases
 * 2. If uncertain, calls the Lambda service for LLM-based intent matching
 * 
 * @param prompt - User's natural language request
 * @param useLLM - Whether to use LLM for intent detection (default: true)
 */
export async function matchPromptToSpaceAsync(prompt: string, useLLM = true): Promise<SpaceMatch> {
  // Phase 1: Fast rule-based matching
  const ruleMatch = matchPromptToSpaceSync(prompt);
  
  // If high confidence rule match, return immediately
  if (ruleMatch.confidence >= HIGH_CONFIDENCE_THRESHOLD) {
    return ruleMatch;
  }
  
  // Phase 2: LLM-based intent matching (via Lambda service)
  if (useLLM) {
    try {
      const remoteMatch = await matchPromptRemote(prompt);
      
      if (remoteMatch.matched && remoteMatch.space) {
        // Find the full space definition from local registry
        const fullSpace = SPACE_REGISTRY.spaces.find(s => s.id === remoteMatch.space?.id);
        
        return {
          matched: true,
          space: fullSpace || null,
          confidence: remoteMatch.confidence,
          matchedKeywords: remoteMatch.matchedKeywords,
          matchedPatterns: [],
          intentBased: remoteMatch.matchedKeywords.some(k => k.startsWith('intent:')),
        };
      }
    } catch (error) {
      console.warn('[SpaceSelector] LLM matching failed, falling back to rules:', error);
    }
  }
  
  // Fall back to rule-based match if LLM fails or is disabled
  return ruleMatch;
}

/**
 * Synchronous rule-based matching (fast, no network calls)
 * Used as fallback and for quick pre-checks
 */
export function matchPromptToSpaceSync(prompt: string): SpaceMatch {
  const promptLower = prompt.toLowerCase();
  
  let bestMatch: SpaceDefinition | null = null;
  let bestScore = 0;
  let bestKeywords: string[] = [];
  let bestPatterns: string[] = [];
  
  for (const space of SPACE_REGISTRY.spaces) {
    const { score, matchedKeywords, matchedPatterns } = calculateMatchScore(promptLower, space);
    
    if (score > bestScore) {
      bestScore = score;
      bestMatch = space;
      bestKeywords = matchedKeywords;
      bestPatterns = matchedPatterns;
    }
  }
  
  // Normalize score to 0-1 range
  const confidence = Math.min(bestScore, 1.0);
  
  if (bestMatch && confidence >= MIN_CONFIDENCE_THRESHOLD) {
    return {
      matched: true,
      space: bestMatch,
      confidence,
      matchedKeywords: bestKeywords,
      matchedPatterns: bestPatterns,
      intentBased: false,
    };
  }
  
  return {
    matched: false,
    space: null,
    confidence: 0,
    matchedKeywords: [],
    matchedPatterns: [],
    intentBased: false,
  };
}

/**
 * Legacy synchronous function for backwards compatibility
 * @deprecated Use matchPromptToSpaceAsync for intelligent matching
 */
export function matchPromptToSpace(prompt: string): SpaceMatch {
  return matchPromptToSpaceSync(prompt);
}

/**
 * Calculate match score for a space against a prompt (rule-based)
 */
function calculateMatchScore(prompt: string, space: SpaceDefinition): {
  score: number;
  matchedKeywords: string[];
  matchedPatterns: string[];
} {
  let score = 0;
  const matchedKeywords: string[] = [];
  const matchedPatterns: string[] = [];
  
  // Keyword matching (0.15 points per keyword, max 0.6)
  let keywordScore = 0;
  for (const keyword of space.keywords) {
    if (prompt.includes(keyword.toLowerCase())) {
      keywordScore += 0.15;
      matchedKeywords.push(keyword);
    }
  }
  score += Math.min(keywordScore, 0.6);
  
  // Pattern matching (0.4 points per pattern match, max 0.4)
  for (const pattern of space.patterns) {
    try {
      const regex = new RegExp(pattern, 'i');
      if (regex.test(prompt)) {
        score += 0.4;
        matchedPatterns.push(pattern);
        break; // Only count one pattern match
      }
    } catch {
      // Invalid regex, skip
      continue;
    }
  }
  
  // Boost score if multiple keywords match (indicates stronger intent)
  if (matchedKeywords.length >= 3) {
    score += 0.1;
  }
  
  return { score, matchedKeywords, matchedPatterns };
}

/**
 * Check if a match is high confidence (suitable for direct execution)
 */
export function isHighConfidenceMatch(match: SpaceMatch): boolean {
  return match.matched && match.confidence >= HIGH_CONFIDENCE_THRESHOLD;
}

/**
 * Check if a task is simple (can be handled by a single space)
 * vs complex (needs orchestration with multiple steps)
 */
export function isSimpleTask(match: SpaceMatch): boolean {
  // High confidence match = simple task
  return isHighConfidenceMatch(match);
}

/**
 * Determine the execution strategy for a prompt
 */
export type ExecutionStrategy = 
  | { type: 'direct-space'; space: SpaceDefinition; confidence: number }
  | { type: 'orchestration'; reason: string };

export async function determineExecutionStrategy(prompt: string): Promise<ExecutionStrategy> {
  const match = await matchPromptToSpaceAsync(prompt);
  
  if (isHighConfidenceMatch(match) && match.space) {
    return {
      type: 'direct-space',
      space: match.space,
      confidence: match.confidence,
    };
  }
  
  // Complex task or low confidence - use orchestration
  return {
    type: 'orchestration',
    reason: match.matched 
      ? `Low confidence match (${Math.round(match.confidence * 100)}%). Using orchestration for better results.`
      : 'No matching space found. Task requires planning and may need multiple steps.',
  };
}

/**
 * Get all spaces that partially match a prompt (for suggestions)
 */
export function getSuggestedSpaces(prompt: string, limit = 3): Array<{
  space: SpaceDefinition;
  confidence: number;
  matchedKeywords: string[];
}> {
  const promptLower = prompt.toLowerCase();
  const matches: Array<{
    space: SpaceDefinition;
    score: number;
    matchedKeywords: string[];
  }> = [];
  
  for (const space of SPACE_REGISTRY.spaces) {
    const { score, matchedKeywords } = calculateMatchScore(promptLower, space);
    if (score > 0.1) { // Lower threshold for suggestions
      matches.push({ space, score, matchedKeywords });
    }
  }
  
  // Sort by score descending and limit
  return matches
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(m => ({
      space: m.space,
      confidence: Math.min(m.score, 1.0),
      matchedKeywords: m.matchedKeywords,
    }));
}

/**
 * Extract potential image URLs or references from a prompt
 */
export function extractImageReferences(prompt: string): string[] {
  const urlPattern = /https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp)/gi;
  const matches = prompt.match(urlPattern) || [];
  return matches;
}

/**
 * Format a match result for display
 */
export function formatMatchResult(match: SpaceMatch): string {
  if (!match.matched || !match.space) {
    return 'No matching space found';
  }
  
  const confidencePercent = Math.round(match.confidence * 100);
  return `Matched: ${match.space.name} (${confidencePercent}% confidence)`;
}
