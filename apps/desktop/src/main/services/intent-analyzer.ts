/**
 * Intent Analysis Service
 *
 * Lightweight pre-processing layer that uses Gemini Flash to analyze user prompts
 * before sending to the main AI. Classifies intents and adds minimal structural guidance.
 */

import { getApiKey } from '../store/secureStorage';

export type IntentCategory =
  | 'research'
  | 'code_generation'
  | 'image_manipulation'
  | 'shopify_operation'
  | 'content_creation'
  | 'general_query';

export interface IntentAnalysisResult {
  intent: IntentCategory;
  confidence: number;
  refinedPrompt: string;
  originalPrompt: string;
  analysisTimeMs: number;
}

export interface AnalyzeIntentOptions {
  prompt: string;
  hasAttachments?: boolean;
  attachmentTypes?: string[]; // e.g., ['image', 'document']
}

const INTENT_PROMPT = `Classify intent and clarify WHAT the user wants. Do NOT suggest HOW to do it or which tools to use.

Return JSON only:
{"intent":"category","confidence":0.0-1.0,"refined_prompt":"clarified goal - plan steps and narrate progress"}

Categories: research, code_generation, image_manipulation, shopify_operation, content_creation, general_query

Rules:
- Clarify the GOAL, not the METHOD
- NEVER suggest specific tools, APIs, or techniques
- NEVER remove URLs from the prompt - preserve them exactly
- NEVER remove file paths or references
- Preserve ALL specific data (URLs, numbers, names, product IDs, etc.)
- Add "Plan the steps and narrate your progress" for complex tasks
- If attachments: mention them as reference material
- Keep it concise - just clarify what they want done

Examples:
Input: "make the dress photos look better" [has attached image]
Output: {"intent":"image_manipulation","confidence":0.92,"refined_prompt":"Enhance the attached dress product photos with better lighting and clean backgrounds. Plan the steps and narrate your progress."}

Input: "put this shoe on a model"
Output: {"intent":"image_manipulation","confidence":0.95,"refined_prompt":"Place this shoe product on a model/person. Plan the steps and narrate your progress."}

Input: "download https://example.com/image.jpg and remove the background"
Output: {"intent":"image_manipulation","confidence":0.95,"refined_prompt":"Download https://example.com/image.jpg and remove its background. Plan the steps and narrate your progress."}

Input: "check what zara charges and update my prices"
Output: {"intent":"research","confidence":0.95,"refined_prompt":"Research Zara's pricing for similar products, then update our store pricing accordingly. Plan the steps and narrate your progress."}

Input: "launch my new summer collection on shopify"
Output: {"intent":"shopify_operation","confidence":0.88,"refined_prompt":"Create and publish the summer collection on Shopify with products, images, and pricing. Plan the steps and narrate your progress."}

User request: `;

const CONFIDENCE_THRESHOLD = 0.8;
const TIMEOUT_MS = 5000; // 5 seconds - user sees "Understanding Intent" indicator

/**
 * Get Gemini API key with fallback strategy:
 * 1. User's configured Google API key
 * 2. GOOGLE_GENERATIVE_AI_API_KEY environment variable fallback
 * 3. null (skip analysis)
 */
async function getGeminiApiKey(): Promise<string | null> {
  // 1. User's Google key
  try {
    const userKey = await getApiKey('google');
    if (userKey) {
      console.log('[Intent] Using user Google API key');
      return userKey;
    }
  } catch {
    // Key retrieval failed, try fallback
  }

  // 2. GOOGLE_GENERATIVE_AI_API_KEY env fallback (same as used elsewhere in the app)
  const envKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (envKey) {
    console.log('[Intent] Using GOOGLE_GENERATIVE_AI_API_KEY environment variable');
    return envKey;
  }

  return null;
}

/**
 * Analyze user intent using Gemini Flash
 *
 * @param options - The prompt and attachment context
 * @returns Intent analysis result or null if skipped/failed
 */
export async function analyzeIntent(
  options: AnalyzeIntentOptions
): Promise<IntentAnalysisResult | null> {
  const { prompt, hasAttachments, attachmentTypes } = options;

  const apiKey = await getGeminiApiKey();
  if (!apiKey) {
    console.log('[Intent] No API key available, skipping analysis');
    return null;
  }

  // Build context about attachments
  let attachmentContext = '';
  if (hasAttachments && attachmentTypes?.length) {
    attachmentContext = ` [has attached ${attachmentTypes.join(', ')}]`;
  }

  const startTime = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: INTENT_PROMPT + prompt + attachmentContext }] }],
          generationConfig: {
            maxOutputTokens: 150,
            temperature: 0.1, // Low temperature for consistent classification
          },
        }),
        signal: controller.signal,
      }
    );
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      throw new Error('Empty response from Gemini');
    }

    // Parse JSON response (may be wrapped in markdown code block)
    let jsonText = text.trim();
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    }

    const parsed = JSON.parse(jsonText);
    const analysisTimeMs = Date.now() - startTime;

    const result: IntentAnalysisResult = {
      intent: parsed.intent || 'general_query',
      confidence: parsed.confidence || 0,
      // Only use refined prompt if confidence >= threshold
      refinedPrompt:
        parsed.confidence >= CONFIDENCE_THRESHOLD
          ? parsed.refined_prompt || prompt
          : prompt,
      originalPrompt: prompt,
      analysisTimeMs,
    };

    console.log(
      `[Intent] Classified as "${result.intent}" (confidence: ${result.confidence}) in ${analysisTimeMs}ms`
    );

    return result;
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error && error.name === 'AbortError') {
      console.warn(`[Intent] Timed out after ${TIMEOUT_MS}ms, using original prompt`);
    } else {
      console.warn('[Intent] Analysis failed:', error);
    }

    return null;
  }
}
