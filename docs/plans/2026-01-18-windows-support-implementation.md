# Windows Support Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add production-ready Windows support with full feature parity, NSIS installer, and CI/CD.

**Architecture:** Add Windows x64 build target to electron-builder, rewrite bash scripts as Node.js for cross-platform compatibility, extend CI/CD with Windows matrix.

**Tech Stack:** Electron, electron-builder, Node.js, GitHub Actions, PowerShell

---

## Task 1: Add Windows Node.js Binary Download

**Files:**
- Modify: `apps/desktop/scripts/download-nodejs.cjs:20-33`

**Step 1: Get Windows Node.js SHA256**

Run:
```bash
curl -s https://nodejs.org/dist/v20.18.1/SHASUMS256.txt | grep win-x64.zip
```

Expected: SHA256 hash for `node-v20.18.1-win-x64.zip`

**Step 2: Add win32-x64 to PLATFORMS array**

In `apps/desktop/scripts/download-nodejs.cjs`, add to PLATFORMS array after line 32:

```javascript
  {
    name: 'win32-x64',
    file: `node-v${NODE_VERSION}-win-x64.zip`,
    extract: 'zip',
    sha256: '<sha256-from-step-1>',
  },
```

**Step 3: Test download script**

Run:
```bash
cd apps/desktop && node scripts/download-nodejs.cjs
```

Expected: Downloads and extracts `win32-x64` alongside darwin binaries.

**Step 4: Commit**

```bash
git add apps/desktop/scripts/download-nodejs.cjs
git commit -m "feat(windows): add win32-x64 Node.js binary download"
```

---

## Task 2: Create Windows Icon

**Files:**
- Create: `apps/desktop/resources/icon.ico`

**Step 1: Install ImageMagick (if needed)**

Run:
```bash
which convert || brew install imagemagick
```

**Step 2: Convert PNG to ICO**

Run:
```bash
cd apps/desktop/resources
convert icon.png -define icon:auto-resize=256,128,64,48,32,16 icon.ico
```

**Step 3: Verify icon**

Run:
```bash
file apps/desktop/resources/icon.ico
```

Expected: `MS Windows icon resource`

**Step 4: Commit**

```bash
git add apps/desktop/resources/icon.ico
git commit -m "feat(windows): add Windows icon file"
```

---

## Task 3: Add Windows Build Configuration

**Files:**
- Modify: `apps/desktop/package.json`

**Step 1: Add win and nsis config to build section**

After the `dmg` section (around line 173), add:

```json
    "win": {
      "target": ["nsis"],
      "icon": "resources/icon.ico"
    },
    "nsis": {
      "oneClick": false,
      "allowToChangeInstallationDirectory": true,
      "createDesktopShortcut": true,
      "createStartMenuShortcut": true,
      "shortcutName": "Openwork"
    }
```

**Step 2: Update asarUnpack to include Windows binary**

In the `asarUnpack` array (line 116), add:

```json
      "node_modules/opencode-ai/bin/opencode.exe",
```

**Step 3: Remove Windows exclusion from files**

Remove line 112:
```json
      "!node_modules/opencode-win32-*/**"
```

**Step 4: Add package:win and release:win scripts**

After line 17 (`release:mac`), add:

```json
    "package:win": "pnpm build && node scripts/package.cjs --win --x64 --publish never",
    "release:win": "pnpm build && node scripts/package.cjs --win --x64 --publish always",
```

**Step 5: Commit**

```bash
git add apps/desktop/package.json
git commit -m "feat(windows): add electron-builder Windows/NSIS configuration"
```

---

## Task 4: Fix start-server.ts Windows Compatibility

**Files:**
- Modify: `apps/desktop/skills/dev-browser/scripts/start-server.ts`

**Step 1: Replace lsof with cross-platform port check**

Replace lines 53-61:

```typescript
// Clean up stale CDP port if HTTP server isn't running (crash recovery)
// This handles the case where Node crashed but Chrome is still running
try {
  const pid = execSync(`lsof -ti:${ACCOMPLISH_CDP_PORT}`, { encoding: "utf-8" }).trim();
  if (pid) {
    console.log(`Cleaning up stale Chrome process on CDP port ${ACCOMPLISH_CDP_PORT} (PID: ${pid})`);
    execSync(`kill -9 ${pid}`);
  }
} catch {
  // No process on CDP port, which is expected
}
```

With:

```typescript
// Clean up stale CDP port if HTTP server isn't running (crash recovery)
// This handles the case where Node crashed but Chrome is still running
try {
  if (process.platform === 'win32') {
    // Windows: use netstat to find PID, then taskkill
    const output = execSync(`netstat -ano | findstr :${ACCOMPLISH_CDP_PORT}`, { encoding: "utf-8" });
    const match = output.match(/LISTENING\s+(\d+)/);
    if (match) {
      const pid = match[1];
      console.log(`Cleaning up stale Chrome process on CDP port ${ACCOMPLISH_CDP_PORT} (PID: ${pid})`);
      execSync(`taskkill /F /PID ${pid}`, { stdio: "ignore" });
    }
  } else {
    // Unix: use lsof
    const pid = execSync(`lsof -ti:${ACCOMPLISH_CDP_PORT}`, { encoding: "utf-8" }).trim();
    if (pid) {
      console.log(`Cleaning up stale Chrome process on CDP port ${ACCOMPLISH_CDP_PORT} (PID: ${pid})`);
      execSync(`kill -9 ${pid}`);
    }
  }
} catch {
  // No process on CDP port, which is expected
}
```

**Step 2: Replace `which` with cross-platform command check**

Replace lines 101-107:

```typescript
  for (const manager of managers) {
    try {
      execSync(`which ${manager.name}`, { stdio: "ignore" });
      pm = manager;
      break;
    } catch {
      // Package manager not found, try next
    }
  }
```

With:

```typescript
  for (const manager of managers) {
    try {
      const cmd = process.platform === 'win32' ? `where ${manager.name}` : `which ${manager.name}`;
      execSync(cmd, { stdio: "ignore" });
      pm = manager;
      break;
    } catch {
      // Package manager not found, try next
    }
  }
```

**Step 3: Commit**

```bash
git add apps/desktop/skills/dev-browser/scripts/start-server.ts
git commit -m "fix(windows): cross-platform port cleanup and command detection"
```

---

## Task 5: Create Cross-Platform server.js

**Files:**
- Create: `apps/desktop/skills/dev-browser/server.js`
- Delete: `apps/desktop/skills/dev-browser/server.sh`

**Step 1: Create server.js**

Create `apps/desktop/skills/dev-browser/server.js`:

```javascript
#!/usr/bin/env node
/**
 * Cross-platform dev-browser server launcher.
 * Replaces server.sh for Windows compatibility.
 */
const { spawn } = require('child_process');
const path = require('path');

const skillDir = __dirname;
const isWindows = process.platform === 'win32';

// Parse command line arguments
const headless = process.argv.includes('--headless');

// Determine npx path - prefer bundled Node.js if available
let npxCommand = 'npx';
if (process.env.NODE_BIN_PATH) {
  npxCommand = path.join(process.env.NODE_BIN_PATH, isWindows ? 'npx.cmd' : 'npx');
}

// Build environment
const env = { ...process.env };
if (headless) {
  env.HEADLESS = 'true';
}

console.log('Starting dev-browser server...');

const child = spawn(npxCommand, ['tsx', 'scripts/start-server.ts'], {
  cwd: skillDir,
  stdio: 'inherit',
  env,
  shell: isWindows,
});

child.on('error', (err) => {
  console.error('Failed to start server:', err.message);
  process.exit(1);
});

child.on('close', (code) => {
  process.exit(code || 0);
});
```

**Step 2: Delete server.sh**

Run:
```bash
rm apps/desktop/skills/dev-browser/server.sh
```

**Step 3: Test server.js locally**

Run:
```bash
cd apps/desktop/skills/dev-browser && node server.js
```

Expected: Server starts, shows "Ready" message. Press Ctrl+C to stop.

**Step 4: Commit**

```bash
git add apps/desktop/skills/dev-browser/server.js
git rm apps/desktop/skills/dev-browser/server.sh
git commit -m "feat(windows): replace server.sh with cross-platform server.js"
```

---

## Task 6: Update task-manager.ts to Use server.js

**Files:**
- Modify: `apps/desktop/src/main/opencode/task-manager.ts:177-197`

**Step 1: Update server spawning logic**

Replace lines 177-197:

```typescript
  // Now start the server
  try {
    const skillsPath = getSkillsPath();
    const serverScript = path.join(skillsPath, 'dev-browser', 'server.sh');

    // Build environment with bundled Node.js in PATH
    const bundledPaths = getBundledNodePaths();
    let spawnEnv: NodeJS.ProcessEnv = { ...process.env };
    if (bundledPaths) {
      const delimiter = process.platform === 'win32' ? ';' : ':';
      spawnEnv.PATH = `${bundledPaths.binDir}${delimiter}${process.env.PATH || ''}`;
      spawnEnv.NODE_BIN_PATH = bundledPaths.binDir;
    }

    // Spawn server in background (detached, unref to not block)
    const child = spawn('bash', [serverScript], {
      detached: true,
      stdio: 'ignore',
      cwd: path.join(skillsPath, 'dev-browser'),
      env: spawnEnv,
    });
    child.unref();

    console.log('[TaskManager] Dev-browser server spawn initiated');
  } catch (error) {
    console.error('[TaskManager] Failed to start dev-browser server:', error);
  }
```

With:

```typescript
  // Now start the server
  try {
    const skillsPath = getSkillsPath();
    const serverScript = path.join(skillsPath, 'dev-browser', 'server.js');

    // Build environment with bundled Node.js in PATH
    const bundledPaths = getBundledNodePaths();
    let spawnEnv: NodeJS.ProcessEnv = { ...process.env };
    if (bundledPaths) {
      const delimiter = process.platform === 'win32' ? ';' : ':';
      spawnEnv.PATH = `${bundledPaths.binDir}${delimiter}${process.env.PATH || ''}`;
      spawnEnv.NODE_BIN_PATH = bundledPaths.binDir;
    }

    // Get node executable path
    const nodeExe = bundledPaths?.nodePath || 'node';

    // Spawn server in background (detached, unref to not block)
    const child = spawn(nodeExe, [serverScript], {
      detached: true,
      stdio: 'ignore',
      cwd: path.join(skillsPath, 'dev-browser'),
      env: spawnEnv,
    });
    child.unref();

    console.log('[TaskManager] Dev-browser server spawn initiated');
  } catch (error) {
    console.error('[TaskManager] Failed to start dev-browser server:', error);
  }
```

**Step 2: Commit**

```bash
git add apps/desktop/src/main/opencode/task-manager.ts
git commit -m "feat(windows): use node to spawn server.js instead of bash"
```

---

## Task 7: Update config-generator.ts System Prompt

**Files:**
- Modify: `apps/desktop/src/main/opencode/config-generator.ts:166`

**Step 1: Update fallback command in system prompt**

Replace line 166:

```typescript
cd {{SKILLS_PATH}}/dev-browser && PATH="\${NODE_BIN_PATH}:\$PATH" ./server.sh &
```

With:

```typescript
cd {{SKILLS_PATH}}/dev-browser && node server.js &
```

**Step 2: Commit**

```bash
git add apps/desktop/src/main/opencode/config-generator.ts
git commit -m "feat(windows): update system prompt to use server.js"
```

---

## Task 8: Update SKILL.md Documentation

**Files:**
- Modify: `apps/desktop/skills/dev-browser/SKILL.md:25`

**Step 1: Update server start command**

Replace line 25:

```markdown
./skills/dev-browser/server.sh &
```

With:

```markdown
node skills/dev-browser/server.js &
```

**Step 2: Commit**

```bash
git add apps/desktop/skills/dev-browser/SKILL.md
git commit -m "docs: update SKILL.md to reference server.js"
```

---

## Task 9: Fix cli-path.ts Windows Dev Paths

**Files:**
- Modify: `apps/desktop/src/main/opencode/cli-path.ts:71-76`

**Step 1: Add Windows paths to globalOpenCodePaths**

Replace lines 71-76:

```typescript
    // Check other global installations
    const globalOpenCodePaths = [
      // Global npm
      '/usr/local/bin/opencode',
      // Homebrew
      '/opt/homebrew/bin/opencode',
    ];
```

With:

```typescript
    // Check other global installations (platform-specific)
    const globalOpenCodePaths = process.platform === 'win32'
      ? [
          // Windows: npm global installs
          path.join(process.env.APPDATA || '', 'npm', 'opencode.cmd'),
          path.join(process.env.LOCALAPPDATA || '', 'npm', 'opencode.cmd'),
        ]
      : [
          // macOS/Linux: Global npm
          '/usr/local/bin/opencode',
          // Homebrew
          '/opt/homebrew/bin/opencode',
        ];
```

**Step 2: Similar update for isOpenCodeBundled function**

Replace lines 140-145:

```typescript
      // Check other global installations
      const globalOpenCodePaths = [
        // Global npm
        '/usr/local/bin/opencode',
        // Homebrew
        '/opt/homebrew/bin/opencode',
      ];
```

With:

```typescript
      // Check other global installations (platform-specific)
      const globalOpenCodePaths = process.platform === 'win32'
        ? [
            path.join(process.env.APPDATA || '', 'npm', 'opencode.cmd'),
            path.join(process.env.LOCALAPPDATA || '', 'npm', 'opencode.cmd'),
          ]
        : [
            '/usr/local/bin/opencode',
            '/opt/homebrew/bin/opencode',
          ];
```

**Step 3: Commit**

```bash
git add apps/desktop/src/main/opencode/cli-path.ts
git commit -m "feat(windows): add Windows paths for dev mode CLI lookup"
```

---

## Task 10: Fix Cross-Platform Clean Script

**Files:**
- Modify: `apps/desktop/package.json:22`

**Step 1: Replace rm -rf with cross-platform clean**

Replace line 22:

```json
    "clean": "rm -rf dist dist-electron release",
```

With:

```json
    "clean": "node -e \"const fs=require('fs');['dist','dist-electron','release'].forEach(d=>fs.rmSync(d,{recursive:true,force:true}))\"",
```

**Step 2: Commit**

```bash
git add apps/desktop/package.json
git commit -m "fix(windows): cross-platform clean script"
```

---

## Task 11: Update CI Workflow for Windows E2E

**Files:**
- Modify: `.github/workflows/ci.yml`

**Step 1: Add Windows to E2E test matrix**

Replace lines 111-114:

```yaml
  e2e-tests:
    name: E2E Tests
    runs-on: macos-latest
    timeout-minutes: 20
```

With:

```yaml
  e2e-tests:
    name: E2E Tests (${{ matrix.os }})
    strategy:
      fail-fast: false
      matrix:
        os: [macos-latest, windows-latest]
    runs-on: ${{ matrix.os }}
    timeout-minutes: 30
```

**Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add Windows to E2E test matrix"
```

---

## Task 12: Update Release Workflow for Windows

**Files:**
- Modify: `.github/workflows/release.yml`

**Step 1: Add Windows build job**

After the `build-mac-arm64` job (around line 85), add new job:

```yaml
  build-windows-x64:
    name: Build Windows (x64)
    runs-on: windows-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Download Node.js binaries
        run: pnpm -F @accomplish/desktop download:nodejs

      - name: Build desktop app
        run: pnpm -F @accomplish/desktop build

      - name: Package for Windows
        run: node scripts/package.cjs --win --x64 --publish never
        working-directory: apps/desktop
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          WIN_CSC_LINK: ${{ secrets.WIN_CSC_LINK }}
          WIN_CSC_KEY_PASSWORD: ${{ secrets.WIN_CSC_KEY_PASSWORD }}

      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: Openwork-Windows-x64
          path: |
            apps/desktop/release/*.exe
          retention-days: 30
```

**Step 2: Update create-release job dependencies**

Change line 88:

```yaml
    needs: [build-mac-arm64]
```

To:

```yaml
    needs: [build-mac-arm64, build-windows-x64]
```

**Step 3: Add Windows artifact download**

After downloading macOS artifacts (around line 100), add:

```yaml
      - name: Download Windows x64 artifacts
        uses: actions/download-artifact@v4
        with:
          name: Openwork-Windows-x64
          path: ./release/win
        continue-on-error: true
```

**Step 4: Update release files and body**

Update the files section (around line 118):

```yaml
          files: |
            ./release/mac/*
            ./release/win/*
```

Update the body section to include Windows:

```yaml
          body: |
            ## Openwork v${{ steps.version.outputs.version }}

            ### Downloads
            - **macOS (Apple Silicon)**: `Openwork-*-mac-arm64.dmg`
            - **Windows (x64)**: `Openwork-*-win-x64.exe`

            ### Installation

            **macOS:**
            1. Download the DMG file
            2. Open the DMG and drag Openwork to Applications
            3. Launch Openwork

            **Windows:**
            1. Download the EXE installer
            2. Run the installer
            3. Launch Openwork from Start Menu

            ### What's Included
            - Bundled Node.js v20.18.1 runtime (no system Node.js required)
```

**Step 5: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: add Windows build to release workflow"
```

---

## Task 13: Test Windows Build Locally (Optional)

**Prerequisites:** Windows machine or VM

**Step 1: Download Node.js binaries**

```bash
pnpm -F @accomplish/desktop download:nodejs
```

**Step 2: Build the app**

```bash
pnpm -F @accomplish/desktop build
```

**Step 3: Package for Windows**

```bash
pnpm -F @accomplish/desktop package:win
```

**Step 4: Verify installer created**

Check `apps/desktop/release/` for `.exe` file.

---

## Task 14: Final Verification

**Step 1: Run typecheck**

```bash
pnpm typecheck
```

Expected: No errors

**Step 2: Run unit tests**

```bash
pnpm -F @accomplish/desktop test:unit
```

Expected: All tests pass

**Step 3: Create final commit (if any uncommitted changes)**

```bash
git status
# If clean, skip. Otherwise:
git add -A
git commit -m "chore: Windows support cleanup"
```

---

## Summary of Changes

| File | Change |
|------|--------|
| `scripts/download-nodejs.cjs` | Add win32-x64 platform |
| `resources/icon.ico` | New Windows icon |
| `package.json` | win/nsis config, scripts, clean fix |
| `skills/dev-browser/server.js` | New cross-platform launcher |
| `skills/dev-browser/server.sh` | Deleted |
| `skills/dev-browser/scripts/start-server.ts` | Windows port/process handling |
| `skills/dev-browser/SKILL.md` | Updated docs |
| `src/main/opencode/task-manager.ts` | Spawn server.js with node |
| `src/main/opencode/config-generator.ts` | Updated system prompt |
| `src/main/opencode/cli-path.ts` | Windows dev paths |
| `.github/workflows/ci.yml` | Windows E2E matrix |
| `.github/workflows/release.yml` | Windows build job |

## Code Signing (Future Task)

When you have an OV certificate:

1. Export certificate as .pfx file
2. Base64 encode: `base64 -i cert.pfx | tr -d '\n'`
3. Add GitHub secrets:
   - `WIN_CSC_LINK`: Base64-encoded .pfx
   - `WIN_CSC_KEY_PASSWORD`: Certificate password
4. Builds will automatically sign
