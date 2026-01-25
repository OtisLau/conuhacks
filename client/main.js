const { app, BrowserWindow, screen, ipcMain, globalShortcut } = require('electron');
const path = require('path');
const { uIOhook, UiohookKey } = require('uiohook-napi');

let overlayWindow;
let spotlightWindow;
let mouseTrackingInterval;
let lastMousePos = { x: 0, y: 0 };

function forceQuit() {
  console.log('FORCE QUIT CALLED');

  // Stop mouse tracking
  stopGlobalMouseTracking();

  // Close all windows
  BrowserWindow.getAllWindows().forEach(win => {
    win.destroy();
  });

  // Unregister shortcuts
  globalShortcut.unregisterAll();

  // Force exit immediately
  process.exit(0);
}

function createOverlayWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.bounds;

  overlayWindow = new BrowserWindow({
    x: 0,
    y: 0,
    width,
    height,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    closable: false,
    visibleOnAllWorkspaces: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'mouse_events', 'preload.js')
    },
  });

  // Start with click-through enabled
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });

  overlayWindow.loadFile('overlay.html');

  if (process.argv.includes('--dev')) {
    overlayWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

function createSpotlightWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.bounds;

  spotlightWindow = new BrowserWindow({
    x: 0,
    y: 0,
    width,
    height,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    closable: false,
    visibleOnAllWorkspaces: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'mouse_events', 'preload.js')
    },
  });

  // Start with click-through enabled
  spotlightWindow.setIgnoreMouseEvents(true, { forward: true });

  spotlightWindow.loadFile('spotlight/index.html');

  if (process.argv.includes('--dev')) {
    spotlightWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

// Set up IPC handlers ONCE
ipcMain.on('set-click-through', (event, enabled) => {
  console.log('Click-through mode:', enabled);
  if (overlayWindow) {
    overlayWindow.setIgnoreMouseEvents(enabled, { forward: true });
  }
});

ipcMain.on('set-global-click-through', (event, enabled) => {
  console.log('Global click-through mode:', enabled);
  if (overlayWindow) {
    overlayWindow.setIgnoreMouseEvents(enabled, { forward: true });
  }
});

ipcMain.on('forward-click', (event, data) => {
  // Clicks automatically pass through when click-through is enabled
  // This just logs the click event
  console.log(`Click at (${data.x}, ${data.y}) - button: ${data.button}`);
});

ipcMain.on('quit-app', (event) => {
  console.log('Quit app IPC received from a window!');
  if (event && event.sender) {
    const senderWindow = BrowserWindow.fromWebContents(event.sender);
    if (senderWindow) {
        console.log(`Quit signal from window with ID: ${senderWindow.id}`);
        // To get more info, we can check the window's title or URL
        console.log(`Window Title: ${senderWindow.getTitle()}`);
        console.log(`Window URL: ${senderWindow.webContents.getURL()}`);
    }
  }
  forceQuit();
});

function startGlobalMouseTracking() {
  try {
    // Set up global mouse event listeners using uiohook-napi
    uIOhook.on('mousemove', (e) => {
      if (overlayWindow && overlayWindow.webContents) {
        overlayWindow.webContents.send('global-mouse-move', {
          position: { x: e.x, y: e.y },
          timestamp: Date.now()
        });
      }
    });

    uIOhook.on('mousedown', (e) => {
      if (overlayWindow && overlayWindow.webContents) {
        overlayWindow.webContents.send('global-mouse-down', {
          position: { x: e.x, y: e.y },
          button: e.button,
          timestamp: Date.now()
        });
      }
    });

    uIOhook.on('mouseup', (e) => {
      if (overlayWindow && overlayWindow.webContents) {
        overlayWindow.webContents.send('global-mouse-up', {
          position: { x: e.x, y: e.y },
          button: e.button,
          timestamp: Date.now()
        });
      }
    });

    uIOhook.on('click', (e) => {
      if (overlayWindow && overlayWindow.webContents) {
        overlayWindow.webContents.send('global-click', {
          position: { x: e.x, y: e.y },
          button: e.button,
          clicks: e.clicks,
          timestamp: Date.now()
        });
      }
    });

    uIOhook.on('wheel', (e) => {
      if (overlayWindow && overlayWindow.webContents) {
        overlayWindow.webContents.send('global-scroll', {
          position: { x: e.x, y: e.y },
          rotation: e.rotation,
          direction: e.direction,
          timestamp: Date.now()
        });
      }
    });

    // Start the hook
    uIOhook.start();
    console.log('✅ Global mouse hooks started with uiohook-napi');
    console.log('⚠️  If clicks are not being detected, enable Accessibility permissions for Electron in System Settings');
  } catch (err) {
    console.error('❌ Failed to start global mouse hooks:', err.message);
    console.log('⚠️  Accessibility permissions may be required');
    console.log('⚠️  Go to: System Settings > Privacy & Security > Accessibility');
    console.log('⚠️  Add Electron to the list of allowed apps');

    // Fall back to position-only tracking
    console.log('📍 Falling back to position-only tracking (no click detection)');
    mouseTrackingInterval = setInterval(() => {
      const pos = screen.getCursorScreenPoint();
      if (pos.x !== lastMousePos.x || pos.y !== lastMousePos.y) {
        if (overlayWindow && overlayWindow.webContents) {
          overlayWindow.webContents.send('global-mouse-move', {
            position: { x: pos.x, y: pos.y },
            timestamp: Date.now()
          });
        }
        lastMousePos = { x: pos.x, y: pos.y };
      }
    }, 16);
  }
}

function stopGlobalMouseTracking() {
  try {
    uIOhook.stop();
    console.log('Global mouse hooks stopped');
  } catch (err) {
    console.error('Error stopping hooks:', err);
  }
}

app.whenReady().then(() => {
  createOverlayWindow();

  // Start global mouse tracking
  startGlobalMouseTracking();
  console.log('Global mouse position tracking started');

  // Register global keyboard shortcut for quitting
  globalShortcut.register('CommandOrControl+Q', () => {
    console.log('Cmd+Q pressed - quitting app');
    forceQuit();
  });

  // Also register Escape key as backup
  globalShortcut.register('Escape', () => {
    console.log('Escape pressed - quitting app');
    forceQuit();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createOverlayWindow();
    }
  });
});

app.on('window-all-closed', () => {
  forceQuit();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
