import { config } from 'dotenv';
import { app, BrowserWindow, shell, ipcMain, nativeImage, protocol, net } from 'electron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { registerIPCHandlers } from './ipc/handlers';
import { flushPendingTasks } from './store/taskHistory';
import { disposeTaskManager } from './opencode/task-manager';
import { checkAndCleanupFreshInstall } from './store/freshInstallCleanup';

// Handle EPIPE errors globally - these happen when stdout/stderr pipe is broken
// This is common in Electron dev mode and shouldn't crash the app
process.on('uncaughtException', (error: Error & { code?: string }) => {
  if (error.message?.includes('EPIPE') || error.code === 'EPIPE') {
    // Silently ignore EPIPE errors
    return;
  }
  // Re-throw other errors
  console.error('Uncaught exception:', error);
});

process.stdout?.on?.('error', (err) => {
  if (err.code === 'EPIPE') return;
});

process.stderr?.on?.('error', (err) => {
  if (err.code === 'EPIPE') return;
});

// Local UI - no longer uses remote URL

// Early E2E flag detection - check command-line args before anything else
// This must run synchronously at module load time
if (process.argv.includes('--e2e-skip-auth')) {
  (global as Record<string, unknown>).E2E_SKIP_AUTH = true;
}
if (process.argv.includes('--e2e-mock-tasks') || process.env.E2E_MOCK_TASK_EVENTS === '1') {
  (global as Record<string, unknown>).E2E_MOCK_TASK_EVENTS = true;
}

// Clean mode - wipe all stored data for a fresh start
// Use CLEAN_START env var since CLI args don't pass through vite to Electron
if (process.env.CLEAN_START === '1') {
  const userDataPath = app.getPath('userData');
  console.log('[Clean Mode] Clearing userData directory:', userDataPath);
  try {
    if (fs.existsSync(userDataPath)) {
      fs.rmSync(userDataPath, { recursive: true, force: true });
      console.log('[Clean Mode] Successfully cleared userData');
    }
  } catch (err) {
    console.error('[Clean Mode] Failed to clear userData:', err);
  }
  // Note: Secure storage (API keys, auth tokens) is stored in electron-store
  // which lives in userData, so it gets cleared with the directory above
}

// Set app name before anything else (affects deep link dialogs)
app.name = 'Shop OS';

// Register custom protocol scheme as privileged BEFORE app is ready
// This must be called before app.whenReady()
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'local-media',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      bypassCSP: true,
    },
  },
]);

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env file from app root
const envPath = app.isPackaged
  ? path.join(process.resourcesPath, '.env')
  : path.join(__dirname, '../../.env');
config({ path: envPath });

// The built directory structure
//
// ├─┬ dist-electron
// │ ├─┬ main
// │ │ └── index.js    > Electron-Main
// │ └─┬ preload
// │   └── index.js    > Preload-Scripts
// ├─┬ dist
// │ └── index.html    > Electron-Renderer

process.env.APP_ROOT = path.join(__dirname, '../..');

export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron');
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist');
export const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

let mainWindow: BrowserWindow | null = null;

// Get the preload script path
function getPreloadPath(): string {
  return path.join(__dirname, '../preload/index.cjs');
}

function createWindow() {
  console.log('[Main] Creating main application window');

  // Get app icon
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'icon.png')
    : path.join(process.env.APP_ROOT!, 'resources', 'icon.png');
  const icon = nativeImage.createFromPath(iconPath);

  const preloadPath = getPreloadPath();
  console.log('[Main] Using preload script:', preloadPath);

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Shop OS',
    icon: icon.isEmpty() ? undefined : icon,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // Maximize window by default
  mainWindow.maximize();

  // Open DevTools in dev mode (non-packaged), but not during E2E tests
  const isE2EMode = (global as Record<string, unknown>).E2E_SKIP_AUTH === true;
  if (!app.isPackaged && !isE2EMode) {
    mainWindow.webContents.openDevTools({ mode: 'right' });
  }

  // Load the local UI
  if (VITE_DEV_SERVER_URL) {
    console.log('[Main] Loading from Vite dev server:', VITE_DEV_SERVER_URL);
    mainWindow.loadURL(VITE_DEV_SERVER_URL);
  } else {
    const indexPath = path.join(RENDERER_DIST, 'index.html');
    console.log('[Main] Loading from file:', indexPath);
    mainWindow.loadFile(indexPath);
  }
}

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  console.log('[Main] Second instance attempted; quitting');
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      console.log('[Main] Focused existing instance after second-instance event');
    }
  });

  app.whenReady().then(async () => {
    console.log('[Main] Electron app ready, version:', app.getVersion());

    // Register custom protocol for serving local media files securely
    // This allows the renderer to load local images/videos/PDFs via local-media://path
    protocol.handle('local-media', (request) => {
      // Extract the file path from the URL
      // URL format: local-media:///absolute/path/to/file.png
      const url = request.url;
      let filePath: string;
      
      try {
        // Parse as URL to properly handle the path
        // local-media:///path/to/file.png -> pathname is /path/to/file.png
        const parsedUrl = new URL(url);
        filePath = decodeURIComponent(parsedUrl.pathname);
        
        // Handle the host part of the URL for paths like local-media://private/var/...
        // In this case, parsedUrl.host = "private" and pathname = "/var/..."
        if (parsedUrl.host) {
          filePath = '/' + parsedUrl.host + filePath;
        }
        
        // On Windows, pathname might be /C:/path, remove leading slash
        if (process.platform === 'win32' && filePath.match(/^\/[A-Za-z]:/)) {
          filePath = filePath.slice(1);
        }
        
        console.log('[Protocol] Request URL:', url);
        console.log('[Protocol] Parsed - host:', parsedUrl.host, 'pathname:', parsedUrl.pathname);
        console.log('[Protocol] Resolved file path:', filePath);
        
        // Security: Ensure the path is absolute
        if (!path.isAbsolute(filePath)) {
          console.warn('[Protocol] Rejected non-absolute path:', filePath);
          return new Response('Forbidden: Path must be absolute', { status: 403 });
        }
        
        // Normalize the path to resolve any .. or . segments
        const normalizedPath = path.normalize(filePath);
        
        // Check if file exists (try both the normalized path and with /private prefix on macOS)
        let finalPath = normalizedPath;
        if (!fs.existsSync(finalPath)) {
          // On macOS, /var, /tmp, etc. are symlinks to /private/var, /private/tmp
          if (process.platform === 'darwin' && !normalizedPath.startsWith('/private')) {
            const privatePath = `/private${normalizedPath}`;
            console.log('[Protocol] Trying /private prefix:', privatePath);
            if (fs.existsSync(privatePath)) {
              finalPath = privatePath;
            }
          }
        }
        
        if (!fs.existsSync(finalPath)) {
          console.warn('[Protocol] File not found:', finalPath);
          return new Response('Not Found', { status: 404 });
        }
        
        console.log('[Protocol] Serving file from:', finalPath);
        // Use net.fetch to serve the file (handles MIME types automatically)
        return net.fetch(`file://${finalPath}`);
      } catch (err) {
        console.error('[Protocol] Error serving file:', err);
        return new Response('Internal Server Error', { status: 500 });
      }
    });
    console.log('[Main] Registered local-media:// protocol');

    // Check for fresh install and cleanup old data BEFORE initializing stores
    // This ensures users get a clean slate after reinstalling from DMG
    try {
      const didCleanup = await checkAndCleanupFreshInstall();
      if (didCleanup) {
        console.log('[Main] Cleaned up data from previous installation');
      }
    } catch (err) {
      console.error('[Main] Fresh install cleanup failed:', err);
    }

    // Set dock icon on macOS
    if (process.platform === 'darwin' && app.dock) {
      const iconPath = app.isPackaged
        ? path.join(process.resourcesPath, 'icon.png')
        : path.join(process.env.APP_ROOT!, 'resources', 'icon.png');
      const icon = nativeImage.createFromPath(iconPath);
      if (!icon.isEmpty()) {
        app.dock.setIcon(icon);
      }
    }

    // Register IPC handlers before creating window
    registerIPCHandlers();
    console.log('[Main] IPC handlers registered');

    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
        console.log('[Main] Application reactivated; recreated window');
      }
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    console.log('[Main] All windows closed; quitting app');
    app.quit();
  }
});

// Flush pending task history writes and dispose TaskManager before quitting
app.on('before-quit', () => {
  console.log('[Main] App before-quit event fired');
  flushPendingTasks();
  // Dispose all active tasks and cleanup PTY processes
  disposeTaskManager();
});

// Handle custom protocol (accomplish://)
app.setAsDefaultProtocolClient('accomplish');

app.on('open-url', (event, url) => {
  event.preventDefault();
  console.log('[Main] Received protocol URL:', url);
  // Handle protocol URL
  if (url.startsWith('accomplish://callback')) {
    mainWindow?.webContents?.send('auth:callback', url);
  }
});

// IPC Handlers
ipcMain.handle('app:version', () => {
  return app.getVersion();
});

ipcMain.handle('app:platform', () => {
  return process.platform;
});

ipcMain.handle('app:is-e2e-mode', () => {
  return (global as Record<string, unknown>).E2E_MOCK_TASK_EVENTS === true ||
    process.env.E2E_MOCK_TASK_EVENTS === '1';
});
