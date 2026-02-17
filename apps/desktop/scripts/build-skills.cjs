/**
 * Build script for MCP server skills
 *
 * Compiles all skill TypeScript files to JavaScript for faster startup.
 * Instead of using `npx tsx src/index.ts` (which compiles on-the-fly),
 * we pre-compile to `dist/index.js` and use `node dist/index.js`.
 *
 * This reduces MCP server startup time from ~2s each to ~200ms each.
 */

const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const skillsDir = path.join(__dirname, '..', 'skills');

// MCP server skills that need to be compiled
const mcpSkills = [
  'file-permission',
  'ask-user-question',
  'dev-browser-mcp',
  'space-runtime',
  'skill-loader',
  'shopify',
];

console.log('[build-skills] Building MCP server skills...\n');

let hasErrors = false;

for (const skill of mcpSkills) {
  const skillPath = path.join(skillsDir, skill);
  const packageJsonPath = path.join(skillPath, 'package.json');

  // Check if skill exists
  if (!fs.existsSync(packageJsonPath)) {
    console.log(`[build-skills] Skipping ${skill} - not found`);
    continue;
  }

  // Check if skill has a build script
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
  if (!packageJson.scripts?.build) {
    console.log(`[build-skills] Skipping ${skill} - no build script`);
    continue;
  }

  console.log(`[build-skills] Building ${skill}...`);

  try {
    // Ensure dev dependencies (tsup etc.) are installed before building
    const nodeModulesPath = path.join(skillPath, 'node_modules', '.bin', 'tsup');
    if (!fs.existsSync(nodeModulesPath)) {
      console.log(`[build-skills]   Installing dependencies for ${skill}...`);
      execFileSync('npm', ['install', '--include=dev'], {
        cwd: skillPath,
        stdio: 'pipe',
      });
    }

    // Run pnpm build in the skill directory using execFileSync (safer than execSync)
    execFileSync('pnpm', ['build'], {
      cwd: skillPath,
      stdio: 'inherit',
    });
    console.log(`[build-skills] ✓ ${skill} built successfully\n`);
  } catch (error) {
    console.error(`[build-skills] ✗ ${skill} build failed\n`);
    hasErrors = true;
  }
}

if (hasErrors) {
  console.error('\n[build-skills] Some skills failed to build');
  process.exit(1);
} else {
  console.log('[build-skills] All skills built successfully!');
}
