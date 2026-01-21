/**
 * Skill Loader MCP Server
 *
 * Provides tools to list and load marketing skills on-demand.
 * Skills are loaded only when needed to save context window space.
 *
 * Tools:
 * - list_skills: Returns all available skills with names and descriptions
 * - load_skill: Loads the full content of a specific skill
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import fs from 'fs';
import path from 'path';

// Get skills path from environment or use default
const SKILLS_PATH = process.env.MARKETING_SKILLS_PATH || path.join(process.cwd(), 'skills', 'marketing-skills');

interface SkillMetadata {
  name: string;
  description: string;
  path: string;
}

// Cache for skill metadata
let skillsCache: SkillMetadata[] | null = null;

/**
 * Parse YAML frontmatter from a SKILL.md file
 */
function parseFrontmatter(content: string): { name: string; description: string } | null {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) return null;

  const frontmatter = frontmatterMatch[1];
  const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
  const descMatch = frontmatter.match(/^description:\s*["']?(.+?)["']?$/m);

  if (!nameMatch || !descMatch) return null;

  return {
    name: nameMatch[1].trim(),
    description: descMatch[1].trim(),
  };
}

/**
 * Scan the marketing-skills directory and build skill index
 */
function loadSkillsIndex(): SkillMetadata[] {
  if (skillsCache) return skillsCache;

  const skills: SkillMetadata[] = [];

  if (!fs.existsSync(SKILLS_PATH)) {
    console.error(`[skill-loader] Skills path not found: ${SKILLS_PATH}`);
    return skills;
  }

  const entries = fs.readdirSync(SKILLS_PATH, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const skillPath = path.join(SKILLS_PATH, entry.name, 'SKILL.md');
    if (!fs.existsSync(skillPath)) continue;

    try {
      const content = fs.readFileSync(skillPath, 'utf-8');
      const metadata = parseFrontmatter(content);

      if (metadata) {
        skills.push({
          name: metadata.name,
          description: metadata.description,
          path: skillPath,
        });
      } else {
        // Fallback: use directory name as skill name
        skills.push({
          name: entry.name,
          description: `Marketing skill: ${entry.name}`,
          path: skillPath,
        });
      }
    } catch (error) {
      console.error(`[skill-loader] Failed to read skill: ${entry.name}`, error);
    }
  }

  // Sort by name for consistent ordering
  skills.sort((a, b) => a.name.localeCompare(b.name));
  skillsCache = skills;

  console.error(`[skill-loader] Loaded ${skills.length} skills from ${SKILLS_PATH}`);
  return skills;
}

/**
 * Load the full content of a specific skill
 */
function loadSkillContent(skillName: string): string | null {
  const skills = loadSkillsIndex();
  const skill = skills.find(
    (s) => s.name.toLowerCase() === skillName.toLowerCase() ||
           s.name.toLowerCase().replace(/[^a-z0-9]/g, '-') === skillName.toLowerCase()
  );

  if (!skill) {
    // Try matching by directory name
    const dirPath = path.join(SKILLS_PATH, skillName, 'SKILL.md');
    if (fs.existsSync(dirPath)) {
      return fs.readFileSync(dirPath, 'utf-8');
    }
    return null;
  }

  return fs.readFileSync(skill.path, 'utf-8');
}

// Create MCP server
const server = new Server(
  {
    name: 'skill-loader',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'list_skills',
        description:
          'List all available marketing skills with their names and descriptions. Use this to see what skills are available before loading one.',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
      {
        name: 'load_skill',
        description:
          'Load the full content of a specific marketing skill. Use this when you need detailed instructions for a marketing task like copywriting, SEO audit, pricing strategy, etc.',
        inputSchema: {
          type: 'object',
          properties: {
            skill_name: {
              type: 'string',
              description:
                'The name of the skill to load (e.g., "copywriting", "seo-audit", "pricing-strategy")',
            },
          },
          required: ['skill_name'],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === 'list_skills') {
    const skills = loadSkillsIndex();

    if (skills.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: 'No marketing skills found. Please ensure the marketing-skills folder is properly set up.',
          },
        ],
      };
    }

    // Format as a readable list
    const skillList = skills
      .map((s) => `- **${s.name}**: ${s.description}`)
      .join('\n');

    return {
      content: [
        {
          type: 'text',
          text: `# Available Marketing Skills (${skills.length})\n\n${skillList}\n\nUse \`load_skill\` with the skill name to get detailed instructions.`,
        },
      ],
    };
  }

  if (name === 'load_skill') {
    const skillName = (args as { skill_name: string }).skill_name;

    if (!skillName) {
      return {
        content: [
          {
            type: 'text',
            text: 'Error: skill_name is required. Use list_skills to see available skills.',
          },
        ],
        isError: true,
      };
    }

    const content = loadSkillContent(skillName);

    if (!content) {
      const skills = loadSkillsIndex();
      const suggestions = skills
        .filter((s) => s.name.toLowerCase().includes(skillName.toLowerCase()))
        .map((s) => s.name)
        .slice(0, 5);

      let errorMsg = `Skill "${skillName}" not found.`;
      if (suggestions.length > 0) {
        errorMsg += ` Did you mean: ${suggestions.join(', ')}?`;
      }
      errorMsg += ' Use list_skills to see all available skills.';

      return {
        content: [
          {
            type: 'text',
            text: errorMsg,
          },
        ],
        isError: true,
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: content,
        },
      ],
    };
  }

  return {
    content: [
      {
        type: 'text',
        text: `Unknown tool: ${name}`,
      },
    ],
    isError: true,
  };
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[skill-loader] MCP server started');
}

main().catch((error) => {
  console.error('[skill-loader] Fatal error:', error);
  process.exit(1);
});
