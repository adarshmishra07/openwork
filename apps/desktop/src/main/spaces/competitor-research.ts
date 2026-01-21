/**
 * Competitor Research Space
 * 
 * Analyzes competitor websites, pricing, and strategies
 * Uses the dev-browser skill for web browsing
 */

import { getActiveBrandProfile } from '../store/brandMemory';

export interface CompetitorInput {
  url: string;
  name?: string;
}

export interface CompetitorAnalysis {
  name: string;
  url: string;
  branding: {
    primaryColors: string[];
    voiceTone: string;
    tagline?: string;
  };
  products: {
    count?: number;
    priceRange?: { min: number; max: number };
    categories?: string[];
    featuredProducts?: Array<{
      name: string;
      price?: number;
      description?: string;
    }>;
  };
  strengths: string[];
  weaknesses: string[];
  opportunities: string[];
  summary: string;
}

export interface CompetitorResearchRequest {
  competitors: CompetitorInput[];
  analysisType: 'quick' | 'detailed' | 'pricing-focus' | 'content-focus';
  compareToUs?: boolean;
}

export interface CompetitorResearchResult {
  success: boolean;
  analyses?: CompetitorAnalysis[];
  comparison?: {
    ourStrengths: string[];
    ourWeaknesses: string[];
    recommendations: string[];
  };
  error?: string;
  researchTime?: number;
}

/**
 * Build a research prompt for the agent to execute
 * The actual browsing is done by the OpenCode agent using dev-browser
 */
export function buildResearchPrompt(request: CompetitorResearchRequest): string {
  const brandProfile = getActiveBrandProfile();
  
  const competitorList = request.competitors
    .map((c, i) => `${i + 1}. ${c.name || 'Competitor'}: ${c.url}`)
    .join('\n');

  let prompt = `# Competitor Research Task

## Competitors to Analyze
${competitorList}

## Analysis Type: ${request.analysisType}

`;

  switch (request.analysisType) {
    case 'quick':
      prompt += `### Quick Analysis Instructions
For each competitor, gather:
1. Homepage screenshot
2. Brand colors and tagline
3. Main product categories
4. Price range (if visible)
5. 2-3 sentence summary

Use the browser tool to visit each site and take screenshots.
`;
      break;

    case 'detailed':
      prompt += `### Detailed Analysis Instructions
For each competitor, thoroughly analyze:

1. **Branding**
   - Primary/secondary colors
   - Voice and tone (formal, casual, luxury, etc.)
   - Tagline and value proposition

2. **Product Catalog**
   - Number of products/categories
   - Price range (min/max)
   - Featured/bestseller products
   - Product presentation style

3. **Website UX**
   - Navigation structure
   - Mobile responsiveness
   - Checkout process visibility
   - Trust signals (reviews, badges)

4. **Content Strategy**
   - Blog/content presence
   - Social proof usage
   - Email capture methods

5. **SWOT Analysis**
   - 3 strengths
   - 3 weaknesses
   - 3 opportunities for us

Use the browser tool extensively. Take screenshots of key pages.
`;
      break;

    case 'pricing-focus':
      prompt += `### Pricing Analysis Instructions
For each competitor, focus on:

1. **Price Points**
   - Entry-level product price
   - Mid-range product price
   - Premium product price
   - Average order value estimate

2. **Pricing Strategy**
   - Discount frequency
   - Bundle offers
   - Subscription options
   - Free shipping threshold

3. **Value Perception**
   - How prices are displayed
   - Comparison to perceived quality
   - Price anchoring techniques

Create a pricing comparison table.
`;
      break;

    case 'content-focus':
      prompt += `### Content Analysis Instructions
For each competitor, analyze:

1. **Product Descriptions**
   - Length and style
   - Feature vs benefit focus
   - SEO optimization signals

2. **Brand Voice**
   - Tone (formal, casual, playful)
   - Vocabulary patterns
   - Emotional triggers used

3. **Visual Content**
   - Photo styles
   - Video usage
   - User-generated content

4. **Content Examples**
   - Copy 2-3 product descriptions verbatim
   - Note effective phrases
   - Identify patterns

Provide specific examples we can learn from.
`;
      break;
  }

  if (request.compareToUs && brandProfile) {
    prompt += `
## Compare to Our Brand: ${brandProfile.name}

Our brand voice: ${brandProfile.voice.template}
Our industry: ${brandProfile.industry}
Our target audience: ${brandProfile.targetAudience}

After analyzing competitors, provide:
1. How we compare on each dimension
2. Our unique advantages
3. Areas where we can improve
4. Specific actionable recommendations
`;
  }

  prompt += `
## Output Format
Provide a structured analysis for each competitor, then an overall summary with key insights and recommendations.
`;

  return prompt;
}

/**
 * Get research templates for common scenarios
 */
export function getResearchTemplates(): Array<{
  id: string;
  name: string;
  description: string;
  prompt: string;
}> {
  return [
    {
      id: 'quick-scan',
      name: 'Quick Competitor Scan',
      description: 'Get a fast overview of 2-3 competitors',
      prompt: 'Do a quick competitor scan of [COMPETITOR URLS]. I need brand colors, price range, and key differentiators.',
    },
    {
      id: 'pricing-intel',
      name: 'Pricing Intelligence',
      description: 'Deep dive into competitor pricing strategies',
      prompt: 'Analyze the pricing strategy of [COMPETITOR URL]. Find their price range, discounts, bundles, and how they position value.',
    },
    {
      id: 'copy-inspiration',
      name: 'Copy Inspiration',
      description: 'Gather product description examples',
      prompt: 'Browse [COMPETITOR URL] and collect 5 of their best product descriptions. Analyze what makes them effective.',
    },
    {
      id: 'full-swot',
      name: 'Full SWOT Analysis',
      description: 'Complete competitive analysis with SWOT',
      prompt: 'Do a complete SWOT analysis of [COMPETITOR URL] compared to our brand. Include screenshots and specific examples.',
    },
    {
      id: 'market-overview',
      name: 'Market Overview',
      description: 'Analyze multiple competitors to understand market',
      prompt: 'Analyze these competitors to understand the market landscape: [LIST URLS]. Identify trends, gaps, and opportunities.',
    },
  ];
}

/**
 * Validate competitor URLs
 */
export function validateCompetitorUrls(urls: string[]): { valid: string[]; invalid: string[] } {
  const valid: string[] = [];
  const invalid: string[] = [];

  for (const url of urls) {
    try {
      const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        valid.push(parsed.href);
      } else {
        invalid.push(url);
      }
    } catch {
      invalid.push(url);
    }
  }

  return { valid, invalid };
}
