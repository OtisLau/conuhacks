const { app, BrowserWindow, screen, ipcMain, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const { uIOhook, UiohookKey } = require('uiohook-napi');
const engineBridge = require('./engine-bridge');

// Wait for screen to stop changing (page loaded)
async function waitForStableScreen(maxWaitMs = 3000, checkIntervalMs = 150) {
  let lastSize = 0;
  let stableCount = 0;
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    const screenshotPath = await engineBridge.takeScreenshot();
    const stats = fs.statSync(screenshotPath);
    const currentSize = stats.size;

    // If file size is similar (within 1%), screen is stable
    if (lastSize > 0 && Math.abs(currentSize - lastSize) / lastSize < 0.01) {
      stableCount++;
      if (stableCount >= 2) {
        console.log('Screen stable after', Date.now() - startTime, 'ms');
        fs.unlinkSync(screenshotPath); // Clean up
        return;
      }
    } else {
      stableCount = 0;
    }

    lastSize = currentSize;
    fs.unlinkSync(screenshotPath); // Clean up
    await new Promise(resolve => setTimeout(resolve, checkIntervalMs));
  }
  console.log('Screen stability timeout, proceeding anyway');
}

let overlayWindow;
let spotlightWindow;
let mouseTrackingInterval;
let lastMousePos = { x: 0, y: 0 };

// Tutorial state machine
let tutorialState = {
  mode: 'idle',  // idle | planning | locating | highlighting | complete | error
  plan: null,
  currentStepIndex: 0,
  targetCoords: null,
  error: null
};

function forceQuit() {

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
  // Use workArea (excludes menu bar) for window position
  // We'll adjust coordinates to account for the offset
  const workArea = primaryDisplay.workArea;
  const bounds = primaryDisplay.bounds;

  // Store the offset for coordinate adjustment
  global.menuBarOffset = {
    x: workArea.x - bounds.x,
    y: workArea.y - bounds.y
  };
  console.log('Menu bar offset:', global.menuBarOffset);

  overlayWindow = new BrowserWindow({
    x: workArea.x,
    y: workArea.y,
    width: workArea.width,
    height: workArea.height,
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
  const { x, y, width, height } = primaryDisplay.bounds;

  spotlightWindow = new BrowserWindow({
    x,
    y,
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

function setupIpcHandlers() {
  ipcMain.on('set-click-through', (event, enabled) => {
    if (overlayWindow) {
      overlayWindow.setIgnoreMouseEvents(enabled, { forward: true });
    }
  });

  ipcMain.on('set-global-click-through', (event, enabled) => {
    if (overlayWindow) {
      overlayWindow.setIgnoreMouseEvents(enabled, { forward: true });
    }
  });

  ipcMain.on('forward-click', (event, data) => {
    // Clicks automatically pass through when click-through is enabled
  });

  ipcMain.on('quit-app', (event) => {
    forceQuit();
  });

  // Tutorial: Start tutorial with a task
  ipcMain.handle('start-tutorial', async (event, task) => {
    try {
      console.log('Starting tutorial for task:', task);
      tutorialState.mode = 'planning';
      tutorialState.error = null;
      overlayWindow.webContents.send('tutorial-state-change', tutorialState);

      // Clear any existing spotlight before taking screenshot
      overlayWindow.webContents.send('set-spotlight-position', null);
      await new Promise(resolve => setTimeout(resolve, 50));

      // Take screenshot
      console.log('Taking screenshot...');
      const screenshotPath = await engineBridge.takeScreenshot();

      // Generate plan
      console.log('Generating plan...');
      const plan = await engineBridge.generatePlan(screenshotPath, task);
      console.log('Plan generated:', JSON.stringify(plan, null, 2));
      tutorialState.plan = plan;
      tutorialState.currentStepIndex = 0;

      // Execute first step
      await executeCurrentStep();

      return { success: true, plan };
    } catch (error) {
      console.error('Tutorial error:', error);
      tutorialState.mode = 'error';
      tutorialState.error = error.message;
      overlayWindow.webContents.send('tutorial-state-change', tutorialState);
      return { success: false, error: error.message };
    }
  });

  // Tutorial: User clicked the target
  ipcMain.on('target-clicked', async () => {
    if (tutorialState.mode === 'highlighting') {
      tutorialState.currentStepIndex++;

      // Clear the spotlight while waiting for next step
      tutorialState.targetCoords = null;
      overlayWindow.webContents.send('set-spotlight-position', null);

      // Wait for page to load (screen to stabilize)
      (async () => {
        try {
          await new Promise(resolve => setTimeout(resolve, 200)); // Brief initial wait
          await waitForStableScreen(3000, 150); // Wait up to 3s for screen to stabilize
          await executeCurrentStep();
        } catch (error) {
          console.error('Error executing step:', error);
          tutorialState.mode = 'error';
          tutorialState.error = error.message;
          overlayWindow.webContents.send('tutorial-state-change', tutorialState);
        }
      })();
    }
  });

  // Tutorial: Cancel/reset tutorial
  ipcMain.on('cancel-tutorial', () => {
    tutorialState = {
      mode: 'idle',
      plan: null,
      currentStepIndex: 0,
      targetCoords: null,
      error: null
    };
    overlayWindow.webContents.send('tutorial-state-change', tutorialState);
    overlayWindow.webContents.send('set-spotlight-position', null);
  });
}

// Check if a target is a placeholder (contains [brackets])
function isPlaceholder(target) {
  return target && target.includes('[') && target.includes(']');
}

// Extract hint words from instruction for matching suggestions
function getHintWords(instruction) {
  // Common words to ignore
  const stopWords = ['click', 'the', 'on', 'a', 'an', 'your', 'to', 'from', 'in', 'will', 'appear'];
  const words = instruction.toLowerCase().split(/\s+/);
  return words.filter(w => w.length > 2 && !stopWords.includes(w));
}

// Find best matching suggestion based on instruction context
function findBestSuggestion(suggestions, instruction) {
  if (!suggestions || suggestions.length === 0) return null;

  const hints = getHintWords(instruction);
  let bestMatch = null;
  let bestScore = 0;

  for (const suggestion of suggestions) {
    const suggestionLower = suggestion.toLowerCase();
    let score = 0;

    // Score based on how many hint words match
    for (const hint of hints) {
      if (suggestionLower.includes(hint) || hint.includes(suggestionLower)) {
        score += 10;
      }
    }

    // Prefer shorter, cleaner suggestions (likely menu items)
    if (suggestion.length < 20) score += 2;

    if (score > bestScore) {
      bestScore = score;
      bestMatch = suggestion;
    }
  }

  // If no good match found, return first suggestion as fallback
  return bestMatch || suggestions[0];
}

// Execute the current step in the tutorial (with retry logic)
async function executeCurrentStep(retryCount = 0) {
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 400; // 0.4 seconds between retries

  if (!tutorialState.plan || !tutorialState.plan.steps) {
    tutorialState.mode = 'error';
    tutorialState.error = 'No plan available';
    overlayWindow.webContents.send('tutorial-state-change', tutorialState);
    return;
  }

  const step = tutorialState.plan.steps[tutorialState.currentStepIndex];
  if (!step) {
    // All steps complete
    console.log('Tutorial complete!');
    tutorialState.mode = 'complete';
    tutorialState.targetCoords = null;
    overlayWindow.webContents.send('tutorial-state-change', tutorialState);
    overlayWindow.webContents.send('set-spotlight-position', null);
    return;
  }

  console.log(`Executing step ${tutorialState.currentStepIndex + 1}:`, step);
  tutorialState.mode = 'locating';
  overlayWindow.webContents.send('tutorial-state-change', tutorialState);

  // Hide overlay before taking screenshot so it doesn't appear in the capture
  overlayWindow.webContents.send('set-spotlight-position', null);
  await new Promise(resolve => setTimeout(resolve, 50)); // Wait for overlay to clear

  // Take fresh screenshot
  const screenshotPath = await engineBridge.takeScreenshot();

  // Locate target element (pass instruction and quad for icon detection)
  let result = await engineBridge.locateElement(
    screenshotPath,
    step.target_text,
    step.region || 'full',
    step.is_icon || false,
    step.instruction || '',
    step.quad || null
  );

  console.log('Locate result:', JSON.stringify(result));

  // If not found and target is a placeholder, try using suggestions
  if (!result.found && isPlaceholder(step.target_text) && result.suggestions && result.suggestions.length > 0) {
    console.log('Target is placeholder, trying suggestions:', result.suggestions);

    // Find best matching suggestion based on instruction
    const bestSuggestion = findBestSuggestion(result.suggestions, step.instruction || '');

    if (bestSuggestion) {
      console.log('Trying best suggestion:', bestSuggestion);
      result = await engineBridge.locateElement(
        screenshotPath,
        bestSuggestion,
        step.region || 'full',
        false, // suggestions are text, not icons
        step.instruction || '',
        step.quad || null
      );
      console.log('Suggestion locate result:', JSON.stringify(result));
    }
  }

  // Clean up screenshot file
  try {
    fs.unlinkSync(screenshotPath);
  } catch (e) {
    // Ignore cleanup errors
  }

  if (result.found && result.center) {
    tutorialState.mode = 'highlighting';
    // Adjust coordinates for menu bar offset (workArea vs full screen)
    const offset = global.menuBarOffset || { x: 0, y: 0 };
    const dpr = screen.getPrimaryDisplay().scaleFactor || 2;
    // Screenshot coords are in physical pixels, adjust for menu bar (also in physical pixels)
    const offsetY = offset.y * dpr;

    const spotlightData = {
      x: result.center[0],
      y: result.center[1] - offsetY,  // Adjust for menu bar
      bbox: result.bbox ? [
        result.bbox[0],
        result.bbox[1] - offsetY,
        result.bbox[2],
        result.bbox[3] - offsetY
      ] : null
    };
    tutorialState.targetCoords = spotlightData;
    console.log('Spotlight target (adjusted):', spotlightData, 'offset:', offsetY);
    overlayWindow.webContents.send('tutorial-state-change', tutorialState);
    overlayWindow.webContents.send('set-spotlight-position', spotlightData);
  } else {
    console.log('Element not found, suggestions:', result.suggestions);
    // Retry if we haven't exceeded max retries
    if (retryCount < MAX_RETRIES - 1) {
      setTimeout(async () => {
        try {
          await executeCurrentStep(retryCount + 1);
        } catch (error) {
          console.error('Retry error:', error);
          tutorialState.mode = 'error';
          tutorialState.error = error.message;
          overlayWindow.webContents.send('tutorial-state-change', tutorialState);
        }
      }, RETRY_DELAY);
    } else {
      // All retries exhausted - skip to next step instead of stopping
      tutorialState.currentStepIndex++;

      // Check if there are more steps
      if (tutorialState.currentStepIndex < tutorialState.plan.steps.length) {
        // Try the next step
        await executeCurrentStep(0);
      } else {
        // No more steps
        tutorialState.mode = 'complete';
        tutorialState.error = null;
        overlayWindow.webContents.send('tutorial-state-change', tutorialState);
      }
    }
  }
}

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
  } catch (err) {
    console.error('Failed to start mouse hooks - check Accessibility permissions');

    // Fall back to position-only tracking
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
  } catch (err) {
    // Ignore stop errors
  }
}

app.whenReady().then(() => {
  setupIpcHandlers();
  createOverlayWindow();

  // Start global mouse tracking
  startGlobalMouseTracking();

  // Register global keyboard shortcut for quitting
  globalShortcut.register('CommandOrControl+Q', () => {
    forceQuit();
  });

  // Escape key - just log it, don't quit (too easy to hit accidentally)
  // globalShortcut.register('Escape', () => {
  //   console.log('Escape pressed - quitting app');
  //   forceQuit();
  // });

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
