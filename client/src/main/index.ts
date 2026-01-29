/**
 * Main process entry point
 * TypeScript version of main.js
 */

import { app, BrowserWindow, screen, ipcMain, globalShortcut } from 'electron';
import path from 'path';
import { uIOhook } from 'uiohook-napi';
import engineBridge, { checkApiHealth, checkApiReadiness } from './services/EngineBridge';
import { taskWebSocket } from './services/TaskWebSocket';
import type {
  TutorialState,
  TutorialMode,
  SpotlightCoords,
  TutorialStep,
} from '../shared/types/tutorial.types';
import type { MousePosition } from '../shared/types/mouse.types';
import type { BackendStatus, BackendReadiness } from '../shared/types/ipc.types';
import type {
  PlanReadyData,
  StepStartedData,
  StepResultData,
  StepErrorData,
  TaskCompleteData,
  ErrorData,
} from '../shared/types/websocket.types';
import { IPC_CHANNELS } from '../shared/constants/channels';

let overlayWindow: BrowserWindow | null = null;
let spotlightWindow: BrowserWindow | null = null;
let mouseTrackingInterval: NodeJS.Timeout | null = null;
let healthCheckInterval: NodeJS.Timeout | null = null;
let lastMousePos: MousePosition = { x: 0, y: 0 };

// Backend connection state
let backendStatus: BackendStatus = { connected: false };
let backendReadiness: BackendReadiness = { ready: false, tesseract: false, gemini: { available: false } };
const HEALTH_CHECK_INTERVAL = 30000; // 30 seconds

// Execution mode: 'rest' for REST API calls, 'websocket' for streaming WebSocket
const EXECUTION_MODE: 'rest' | 'websocket' = 'websocket';

// Tutorial state machine
let tutorialState: TutorialState = {
  mode: 'idle' as TutorialMode,
  plan: null,
  currentStepIndex: 0,
  targetCoords: null,
  error: null,
};

// Global menu bar offset
declare global {
  var menuBarOffset: { x: number; y: number };
}

function forceQuit(): void {
  // Stop mouse tracking
  stopGlobalMouseTracking();

  // Stop health check interval
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = null;
  }

  // Close all windows
  BrowserWindow.getAllWindows().forEach((win) => {
    win.destroy();
  });

  // Unregister shortcuts
  globalShortcut.unregisterAll();

  // Force exit immediately
  process.exit(0);
}

/**
 * Broadcast backend status to all renderer windows
 */
function broadcastBackendStatus(status: BackendStatus): void {
  backendStatus = status;
  overlayWindow?.webContents.send(IPC_CHANNELS.BACKEND_STATUS, status);
  spotlightWindow?.webContents.send(IPC_CHANNELS.BACKEND_STATUS, status);
}

/**
 * Broadcast backend readiness to all renderer windows
 */
function broadcastBackendReadiness(readiness: BackendReadiness): void {
  backendReadiness = readiness;
  overlayWindow?.webContents.send(IPC_CHANNELS.BACKEND_READINESS, readiness);
  spotlightWindow?.webContents.send(IPC_CHANNELS.BACKEND_READINESS, readiness);
}

/**
 * Check backend health and update status
 */
async function checkBackendConnection(): Promise<BackendStatus> {
  try {
    const healthy = await checkApiHealth();
    if (!healthy) {
      return { connected: false, error: 'Backend health check failed' };
    }

    // Also check readiness
    try {
      const readiness = await checkApiReadiness();
      broadcastBackendReadiness(readiness);

      if (!readiness.ready) {
        const missing: string[] = [];
        if (!readiness.tesseract) missing.push('Tesseract OCR');
        if (!readiness.gemini.available) missing.push('Gemini API');
        return {
          connected: true,
          error: missing.length > 0 ? `Services unavailable: ${missing.join(', ')}` : undefined
        };
      }
    } catch {
      // Readiness check failed but health is ok
    }

    return { connected: true };
  } catch (err) {
    return { connected: false, error: 'Cannot reach backend at localhost:8000' };
  }
}

/**
 * Start periodic health checks
 */
function startHealthCheckInterval(): void {
  // Initial check
  checkBackendConnection().then(broadcastBackendStatus);

  // Periodic checks
  healthCheckInterval = setInterval(async () => {
    const status = await checkBackendConnection();
    broadcastBackendStatus(status);
  }, HEALTH_CHECK_INTERVAL);
}

/**
 * Set up WebSocket event handlers for real-time task execution
 */
function setupWebSocketHandlers(): void {
  taskWebSocket.setHandlers({
    onStateChange: (state) => {
      console.log('WebSocket state changed:', state);
    },

    onPlanStarted: (data) => {
      console.log('Plan generation started:', data.task);
      tutorialState.mode = 'planning' as TutorialMode;
      tutorialState.error = null;
      overlayWindow?.webContents.send(IPC_CHANNELS.TUTORIAL_STATE_CHANGE, tutorialState);
    },

    onPlanReady: (data: PlanReadyData) => {
      console.log(`Plan ready: ${data.total_steps} steps`);
      // Convert WebSocket plan format to TutorialPlan
      tutorialState.plan = {
        steps: data.steps.map((step): TutorialStep => ({
          instruction: step.instruction,
          target_text: step.target_text,
          region: step.region as 'full' | 'top' | 'bottom' | 'left' | 'right',
          is_icon: step.is_icon,
          quad: typeof step.quad === 'number' ? step.quad : null,
        })),
      };
      tutorialState.currentStepIndex = 0;
      tutorialState.mode = 'locating' as TutorialMode;
      overlayWindow?.webContents.send(IPC_CHANNELS.TUTORIAL_STATE_CHANGE, tutorialState);
    },

    onPlanError: (data) => {
      console.error('Plan generation failed:', data.error);
      tutorialState.mode = 'error' as TutorialMode;
      tutorialState.error = data.error;
      overlayWindow?.webContents.send(IPC_CHANNELS.TUTORIAL_STATE_CHANGE, tutorialState);
    },

    onStepStarted: (data: StepStartedData) => {
      console.log(`Step ${data.step_number} started: ${data.instruction}`);
      tutorialState.currentStepIndex = data.step_number - 1;
      tutorialState.mode = 'locating' as TutorialMode;
      overlayWindow?.webContents.send(IPC_CHANNELS.TUTORIAL_STATE_CHANGE, tutorialState);
    },

    onStepResult: (data: StepResultData) => {
      console.log(`Step ${data.step_number} result: found=${data.found}`);

      if (data.found && data.center) {
        tutorialState.mode = 'highlighting' as TutorialMode;

        // Apply coordinate offset for menu bar
        const offset = global.menuBarOffset || { x: 0, y: 0 };
        const dpr = screen.getPrimaryDisplay().scaleFactor || 2;
        const offsetY = offset.y * dpr;

        const spotlightData: SpotlightCoords = {
          x: data.center[0],
          y: data.center[1] - offsetY,
          bbox: data.bbox
            ? [data.bbox[0], data.bbox[1] - offsetY, data.bbox[2], data.bbox[3] - offsetY]
            : null,
        };

        tutorialState.targetCoords = spotlightData;
        overlayWindow?.webContents.send(IPC_CHANNELS.TUTORIAL_STATE_CHANGE, tutorialState);
        overlayWindow?.webContents.send(IPC_CHANNELS.SET_SPOTLIGHT_POSITION, spotlightData);
        spotlightWindow?.webContents.send(IPC_CHANNELS.SET_SPOTLIGHT_POSITION, spotlightData);
      } else {
        // Element not found
        tutorialState.mode = 'error' as TutorialMode;
        tutorialState.error = `Could not find "${tutorialState.plan?.steps[tutorialState.currentStepIndex]?.target_text || 'target'}"`;
        if (data.suggestions && data.suggestions.length > 0) {
          tutorialState.error += `. Suggestions: ${data.suggestions.slice(0, 3).join(', ')}`;
        }
        overlayWindow?.webContents.send(IPC_CHANNELS.TUTORIAL_STATE_CHANGE, tutorialState);
      }
    },

    onStepError: (data: StepErrorData) => {
      console.error(`Step ${data.step_number} error:`, data.error);
      tutorialState.mode = 'error' as TutorialMode;
      tutorialState.error = data.error;
      overlayWindow?.webContents.send(IPC_CHANNELS.TUTORIAL_STATE_CHANGE, tutorialState);
    },

    onTaskComplete: (data: TaskCompleteData) => {
      console.log(`Task complete: ${data.steps_completed}/${data.total_steps} steps, success=${data.success}`);
      tutorialState.mode = 'complete' as TutorialMode;
      tutorialState.targetCoords = null;
      tutorialState.error = null;
      overlayWindow?.webContents.send(IPC_CHANNELS.TUTORIAL_STATE_CHANGE, tutorialState);
      overlayWindow?.webContents.send(IPC_CHANNELS.SET_SPOTLIGHT_POSITION, null);
      spotlightWindow?.webContents.send(IPC_CHANNELS.SET_SPOTLIGHT_POSITION, null);
    },

    onError: (data: ErrorData) => {
      console.error('WebSocket error:', data.error);
      tutorialState.mode = 'error' as TutorialMode;
      tutorialState.error = data.error;
      overlayWindow?.webContents.send(IPC_CHANNELS.TUTORIAL_STATE_CHANGE, tutorialState);
    },
  });
}

function createOverlayWindow(): void {
  const primaryDisplay = screen.getPrimaryDisplay();
  const workArea = primaryDisplay.workArea;
  const bounds = primaryDisplay.bounds;

  // Store the offset for coordinate adjustment
  global.menuBarOffset = {
    x: workArea.x - bounds.x,
    y: workArea.y - bounds.y,
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
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '..', 'preload', 'overlay.js'),
    },
  });

  // Start with click-through enabled
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });

  // Load the React renderer
  // In development with electron-vite, use the dev server
  // In production, load from built files
  if (process.env.VITE_DEV_SERVER_URL) {
    overlayWindow.loadURL(process.env.VITE_DEV_SERVER_URL + 'src/renderer/overlay/index.html');
  } else {
    overlayWindow.loadFile(path.join(__dirname, '..', 'renderer', 'src', 'renderer', 'overlay', 'index.html'));
  }

  if (process.argv.includes('--dev')) {
    overlayWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

function createSpotlightWindow(): void {
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
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '..', 'preload', 'spotlight.js'),
    },
  });

  // Start with click-through enabled
  spotlightWindow.setIgnoreMouseEvents(true, { forward: true });

  // Load the React spotlight renderer
  if (process.env.VITE_DEV_SERVER_URL) {
    spotlightWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}/src/renderer/spotlight/index.html`);
  } else {
    spotlightWindow.loadFile(path.join(__dirname, '..', 'renderer', 'src', 'renderer', 'spotlight', 'index.html'));
  }

  if (process.argv.includes('--dev')) {
    spotlightWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

function setupIpcHandlers(): void {
  // Backend health check handler
  ipcMain.handle(IPC_CHANNELS.CHECK_BACKEND_HEALTH, async () => {
    const status = await checkBackendConnection();
    broadcastBackendStatus(status);
    return status;
  });

  ipcMain.on(IPC_CHANNELS.SET_CLICK_THROUGH, (_event, enabled: boolean) => {
    if (overlayWindow) {
      overlayWindow.setIgnoreMouseEvents(enabled, { forward: true });
    }
  });

  ipcMain.on(IPC_CHANNELS.SET_GLOBAL_CLICK_THROUGH, (_event, enabled: boolean) => {
    if (overlayWindow) {
      overlayWindow.setIgnoreMouseEvents(enabled, { forward: true });
    }
  });

  ipcMain.on(IPC_CHANNELS.FORWARD_CLICK, (_event, _data: unknown) => {
    // Clicks automatically pass through when click-through is enabled
  });

  ipcMain.on(IPC_CHANNELS.QUIT_APP, (_event) => {
    forceQuit();
  });

  // Tutorial: Start tutorial with a task
  ipcMain.handle(IPC_CHANNELS.START_TUTORIAL, async (_event, task: string) => {
    try {
      // Validate task input
      if (!task || task.trim().length === 0) {
        throw new Error('Please enter a task description');
      }

      console.log('Starting tutorial for task:', task);
      console.log('Execution mode:', EXECUTION_MODE);

      // Check backend connection first
      if (!backendStatus.connected) {
        throw new Error('Backend is not connected. Please start the backend server.');
      }

      // Use WebSocket mode for real-time streaming
      if (EXECUTION_MODE === 'websocket') {
        tutorialState.mode = 'planning' as TutorialMode;
        tutorialState.error = null;
        overlayWindow?.webContents.send(IPC_CHANNELS.TUTORIAL_STATE_CHANGE, tutorialState);

        // Start task via WebSocket - handlers will manage state updates
        await taskWebSocket.startTask(task);
        return { success: true };
      }

      // REST mode (original implementation)
      tutorialState.mode = 'planning' as TutorialMode;
      tutorialState.error = null;
      overlayWindow?.webContents.send(IPC_CHANNELS.TUTORIAL_STATE_CHANGE, tutorialState);

      // Take screenshot
      console.log('Taking screenshot...');
      const screenshotPath = await engineBridge.takeScreenshot();
      console.log('Screenshot captured:', screenshotPath);

      // Generate plan
      console.log('Generating plan...');
      const plan = await engineBridge.generatePlan(screenshotPath, task);
      console.log(`Plan generated: ${plan.steps.length} steps`);

      if (plan.steps.length === 0) {
        throw new Error('Could not generate a plan for this task. Try rephrasing your request.');
      }

      tutorialState.plan = plan;
      tutorialState.currentStepIndex = 0;

      // Execute first step
      await executeCurrentStep();

      return { success: true, plan };
    } catch (error) {
      console.error('Tutorial error:', error);
      tutorialState.mode = 'error' as TutorialMode;

      // Provide user-friendly error messages
      let errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('Cannot connect to backend')) {
        errorMessage = 'Cannot connect to backend server. Is it running?';
      } else if (errorMessage.includes('timeout')) {
        errorMessage = 'Request timed out. The AI service may be slow.';
      }

      tutorialState.error = errorMessage;
      overlayWindow?.webContents.send(IPC_CHANNELS.TUTORIAL_STATE_CHANGE, tutorialState);
      return { success: false, error: errorMessage };
    }
  });

  // Tutorial: User clicked the target
  ipcMain.on(IPC_CHANNELS.TARGET_CLICKED, async () => {
    if (tutorialState.mode === 'highlighting') {
      // Clear the spotlight while waiting for next step
      tutorialState.targetCoords = null;
      overlayWindow?.webContents.send(IPC_CHANNELS.SET_SPOTLIGHT_POSITION, null);
      spotlightWindow?.webContents.send(IPC_CHANNELS.SET_SPOTLIGHT_POSITION, null);

      if (EXECUTION_MODE === 'websocket') {
        // Signal step completion to WebSocket - server handles next step
        console.log('Step done via WebSocket');
        taskWebSocket.stepDone();
        return;
      }

      // REST mode
      tutorialState.currentStepIndex++;

      // Wait for UI to settle after click (2.5s for page transitions)
      setTimeout(async () => {
        try {
          await executeCurrentStep();
        } catch (error) {
          console.error('Error executing step:', error);
          tutorialState.mode = 'error' as TutorialMode;
          tutorialState.error = error instanceof Error ? error.message : String(error);
          overlayWindow?.webContents.send(IPC_CHANNELS.TUTORIAL_STATE_CHANGE, tutorialState);
        }
      }, 2500);
    }
  });

  // Tutorial: Cancel/reset tutorial
  ipcMain.on(IPC_CHANNELS.CANCEL_TUTORIAL, () => {
    if (EXECUTION_MODE === 'websocket') {
      taskWebSocket.cancel();
    }

    tutorialState = {
      mode: 'idle' as TutorialMode,
      plan: null,
      currentStepIndex: 0,
      targetCoords: null,
      error: null,
    };
    overlayWindow?.webContents.send(IPC_CHANNELS.TUTORIAL_STATE_CHANGE, tutorialState);
    overlayWindow?.webContents.send(IPC_CHANNELS.SET_SPOTLIGHT_POSITION, null);
    spotlightWindow?.webContents.send(IPC_CHANNELS.SET_SPOTLIGHT_POSITION, null);
  });

  // Tutorial: Retry current step (re-take screenshot and locate)
  ipcMain.on(IPC_CHANNELS.STEP_RETRY, async () => {
    if (tutorialState.mode === 'error' || tutorialState.mode === 'highlighting') {
      console.log('Retrying current step...');
      tutorialState.error = null;

      if (EXECUTION_MODE === 'websocket') {
        taskWebSocket.stepRetry();
        return;
      }

      // REST mode
      try {
        await executeCurrentStep();
      } catch (error) {
        console.error('Retry error:', error);
        tutorialState.mode = 'error' as TutorialMode;
        tutorialState.error = error instanceof Error ? error.message : String(error);
        overlayWindow?.webContents.send(IPC_CHANNELS.TUTORIAL_STATE_CHANGE, tutorialState);
      }
    }
  });

  // Tutorial: Skip current step and move to next
  ipcMain.on(IPC_CHANNELS.STEP_SKIP, async () => {
    if (tutorialState.plan && tutorialState.plan.steps) {
      console.log('Skipping current step...');
      tutorialState.error = null;
      tutorialState.targetCoords = null;
      overlayWindow?.webContents.send(IPC_CHANNELS.SET_SPOTLIGHT_POSITION, null);
      spotlightWindow?.webContents.send(IPC_CHANNELS.SET_SPOTLIGHT_POSITION, null);

      if (EXECUTION_MODE === 'websocket') {
        taskWebSocket.stepSkip();
        return;
      }

      // REST mode
      tutorialState.currentStepIndex++;

      if (tutorialState.currentStepIndex >= tutorialState.plan.steps.length) {
        // All steps complete
        tutorialState.mode = 'complete' as TutorialMode;
        overlayWindow?.webContents.send(IPC_CHANNELS.TUTORIAL_STATE_CHANGE, tutorialState);
      } else {
        // Execute next step
        try {
          await executeCurrentStep();
        } catch (error) {
          console.error('Skip to next step error:', error);
          tutorialState.mode = 'error' as TutorialMode;
          tutorialState.error = error instanceof Error ? error.message : String(error);
          overlayWindow?.webContents.send(IPC_CHANNELS.TUTORIAL_STATE_CHANGE, tutorialState);
        }
      }
    }
  });
}

/**
 * Execute the current step in the tutorial (with parallel screenshot racing)
 */
async function executeCurrentStep(retryCount: number = 0): Promise<void> {
  const MAX_RETRIES = 2;
  const RETRY_DELAY = 1000;
  const STAGGER_DELAY = 1000;

  if (!tutorialState.plan || !tutorialState.plan.steps) {
    tutorialState.mode = 'error' as TutorialMode;
    tutorialState.error = 'No plan available';
    overlayWindow?.webContents.send(IPC_CHANNELS.TUTORIAL_STATE_CHANGE, tutorialState);
    return;
  }

  const step = tutorialState.plan.steps[tutorialState.currentStepIndex];
  if (!step) {
    // All steps complete
    console.log('Tutorial complete!');
    tutorialState.mode = 'complete' as TutorialMode;
    tutorialState.targetCoords = null;
    overlayWindow?.webContents.send(IPC_CHANNELS.TUTORIAL_STATE_CHANGE, tutorialState);
    overlayWindow?.webContents.send(IPC_CHANNELS.SET_SPOTLIGHT_POSITION, null);
    return;
  }

  console.log(`Executing step ${tutorialState.currentStepIndex + 1}:`, step);
  tutorialState.mode = 'locating' as TutorialMode;
  overlayWindow?.webContents.send(IPC_CHANNELS.TUTORIAL_STATE_CHANGE, tutorialState);

  // Race two screenshots with staggered timing
  const locateWithScreenshot = async (label: string) => {
    const screenshotPath = await engineBridge.takeScreenshot();
    const result = await engineBridge.locateElement(
      screenshotPath,
      step.target_text,
      step.region || 'full',
      step.is_icon || false,
      step.instruction || '',
      step.quad || null
    );
    return { ...result, label };
  };

  const promise1 = locateWithScreenshot('immediate');
  const promise2 = new Promise<typeof promise1 extends Promise<infer T> ? T : never>((resolve) => {
    setTimeout(async () => {
      const result = await locateWithScreenshot('delayed');
      resolve(result);
    }, STAGGER_DELAY);
  });

  // Race for success
  const raceForSuccess = async () => {
    return new Promise<Awaited<typeof promise1>>(async (resolve) => {
      let result1: Awaited<typeof promise1> | null = null;
      let result2: Awaited<typeof promise1> | null = null;
      let resolved = false;

      const checkAndResolve = (res: Awaited<typeof promise1>, which: number) => {
        if (resolved) return;

        if (res.found && res.center) {
          resolved = true;
          console.log(`${res.label} screenshot found element first`);
          resolve(res);
        } else {
          if (which === 1) result1 = res;
          else result2 = res;

          if (result1 && result2) {
            resolved = true;
            resolve(result1);
          }
        }
      };

      promise1.then((res) => checkAndResolve(res, 1));
      promise2.then((res) => checkAndResolve(res, 2));
    });
  };

  const result = await raceForSuccess();
  console.log('Locate result:', JSON.stringify(result));

  if (result.found && result.center) {
    tutorialState.mode = 'highlighting' as TutorialMode;
    const offset = global.menuBarOffset || { x: 0, y: 0 };
    const dpr = screen.getPrimaryDisplay().scaleFactor || 2;
    const offsetY = offset.y * dpr;

    const spotlightData: SpotlightCoords = {
      x: result.center[0],
      y: result.center[1] - offsetY,
      bbox: result.bbox
        ? [result.bbox[0], result.bbox[1] - offsetY, result.bbox[2], result.bbox[3] - offsetY]
        : null,
    };

    tutorialState.targetCoords = spotlightData;
    console.log('Spotlight target (adjusted):', spotlightData, 'offset:', offsetY);
    overlayWindow?.webContents.send(IPC_CHANNELS.TUTORIAL_STATE_CHANGE, tutorialState);
    overlayWindow?.webContents.send(IPC_CHANNELS.SET_SPOTLIGHT_POSITION, spotlightData);
  } else {
    console.log('Element not found, suggestions:', result.suggestions);
    if (retryCount < MAX_RETRIES - 1) {
      setTimeout(async () => {
        try {
          await executeCurrentStep(retryCount + 1);
        } catch (error) {
          console.error('Retry error:', error);
          tutorialState.mode = 'error' as TutorialMode;
          tutorialState.error = error instanceof Error ? error.message : String(error);
          overlayWindow?.webContents.send(IPC_CHANNELS.TUTORIAL_STATE_CHANGE, tutorialState);
        }
      }, RETRY_DELAY);
    } else {
      // Skip to next step
      tutorialState.currentStepIndex++;

      if (tutorialState.currentStepIndex < tutorialState.plan.steps.length) {
        await executeCurrentStep(0);
      } else {
        tutorialState.mode = 'complete' as TutorialMode;
        tutorialState.error = null;
        overlayWindow?.webContents.send(IPC_CHANNELS.TUTORIAL_STATE_CHANGE, tutorialState);
      }
    }
  }
}

function startGlobalMouseTracking(): void {
  try {
    uIOhook.on('mousemove', (e) => {
      // Mouse coordinates from uIOhook are in screen coordinates
      // Overlay window is positioned at workArea (excludes menu bar)
      // Need to adjust coordinates to be relative to overlay window
      const event = {
        position: {
          x: e.x - global.menuBarOffset.x,
          y: e.y - global.menuBarOffset.y
        },
        timestamp: Date.now(),
      };

      if (overlayWindow && overlayWindow.webContents) {
        overlayWindow.webContents.send(IPC_CHANNELS.GLOBAL_MOUSE_MOVE, event);
      }

      if (spotlightWindow && spotlightWindow.webContents) {
        spotlightWindow.webContents.send(IPC_CHANNELS.GLOBAL_MOUSE_MOVE, event);
      }
    });

    uIOhook.on('mousedown', (e) => {
      if (overlayWindow && overlayWindow.webContents) {
        overlayWindow.webContents.send(IPC_CHANNELS.GLOBAL_MOUSE_DOWN, {
          position: {
            x: e.x - global.menuBarOffset.x,
            y: e.y - global.menuBarOffset.y
          },
          button: e.button,
          timestamp: Date.now(),
        });
      }
    });

    uIOhook.on('mouseup', (e) => {
      if (overlayWindow && overlayWindow.webContents) {
        overlayWindow.webContents.send(IPC_CHANNELS.GLOBAL_MOUSE_UP, {
          position: {
            x: e.x - global.menuBarOffset.x,
            y: e.y - global.menuBarOffset.y
          },
          button: e.button,
          timestamp: Date.now(),
        });
      }
    });

    uIOhook.on('click', (e) => {
      if (overlayWindow && overlayWindow.webContents) {
        overlayWindow.webContents.send(IPC_CHANNELS.GLOBAL_CLICK, {
          position: {
            x: e.x - global.menuBarOffset.x,
            y: e.y - global.menuBarOffset.y
          },
          button: e.button,
          clicks: e.clicks,
          timestamp: Date.now(),
        });
      }
    });

    uIOhook.on('wheel', (e) => {
      if (overlayWindow && overlayWindow.webContents) {
        overlayWindow.webContents.send(IPC_CHANNELS.GLOBAL_SCROLL, {
          position: {
            x: e.x - global.menuBarOffset.x,
            y: e.y - global.menuBarOffset.y
          },
          rotation: e.rotation,
          direction: e.direction,
          timestamp: Date.now(),
        });
      }
    });

    uIOhook.start();
  } catch (err) {
    console.error('Failed to start mouse hooks - check Accessibility permissions');

    // Fallback to position-only tracking
    mouseTrackingInterval = setInterval(() => {
      const pos = screen.getCursorScreenPoint();
      if (pos.x !== lastMousePos.x || pos.y !== lastMousePos.y) {
        if (overlayWindow && overlayWindow.webContents) {
          overlayWindow.webContents.send(IPC_CHANNELS.GLOBAL_MOUSE_MOVE, {
            position: { x: pos.x, y: pos.y },
            timestamp: Date.now(),
          });
        }
        lastMousePos = { x: pos.x, y: pos.y };
      }
    }, 16);
  }
}

function stopGlobalMouseTracking(): void {
  try {
    uIOhook.stop();
  } catch (err) {
    // Ignore stop errors
  }

  if (mouseTrackingInterval) {
    clearInterval(mouseTrackingInterval);
    mouseTrackingInterval = null;
  }
}

app.whenReady().then(() => {
  setupIpcHandlers();
  createOverlayWindow();
  createSpotlightWindow();

  // Start global mouse tracking
  startGlobalMouseTracking();

  // Start backend health check monitoring
  startHealthCheckInterval();

  // Set up WebSocket handlers for real-time execution
  if (EXECUTION_MODE === 'websocket') {
    setupWebSocketHandlers();
    console.log('WebSocket mode enabled for task execution');
  } else {
    console.log('REST mode enabled for task execution');
  }

  // Register global keyboard shortcut for quitting
  globalShortcut.register('CommandOrControl+Q', () => {
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
