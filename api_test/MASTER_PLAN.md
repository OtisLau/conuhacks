# CONU - AI Screen Tutorial Guide
## Master Plan & Implementation Guide

---

## 1. Project Vision

**What:** A desktop app that watches your screen and guides you through any task by highlighting exactly what to click next.

**Example:**
```
User: "Help me change my keyboard to Chinese"
App:  [Takes screenshot]
      [AI plans: 1. Click Settings, 2. Click Keyboard, 3. Click Input Sources...]
      [Highlights "Settings" with green glow]
      [User clicks]
      [Highlights next element...]
      [Repeat until done]
```

**Why it's cool:** Like having an expert looking over your shoulder saying "click there, now click that" - but it's AI.

---

## 2. What We've Validated (Dev-Side Testing)

### Element Location Strategy ✅

| Approach | Speed | Accuracy | Use Case |
|----------|-------|----------|----------|
| **Tesseract OCR** | ~0.2-0.5s | 95%+ | Text elements (menus, labels, buttons) |
| **OmniParser + Gemini** | ~1s | ~70% | Icons without text |
| **Gemini bbox alone** | ~1.5s | ~50% | ❌ Not reliable |

### Tested Flows ✅

1. **Dark Mode toggle** - Found "Appearance" → "Dark"
2. **Battery Health** - Found "Battery" → "Health" → info popup
3. **VS Code menus** - Found "Terminal" in menu bar

### Key Optimizations ✅

- **Region cropping**: 10x faster OCR by cropping to sidebar/main/menu_bar
- **Gemini validation**: Only when multiple text matches found
- **Confidence scoring**: Pick highest confidence OCR match

---

## 3. Full Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        ELECTRON APP                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐     │
│  │  MAIN WINDOW │     │   OVERLAY    │     │   TRAY ICON  │     │
│  │              │     │   WINDOW     │     │              │     │
│  │ - Task input │     │ - Transparent│     │ - Quick      │     │
│  │ - Status     │     │ - Full screen│     │   access     │     │
│  │ - Step list  │     │ - Highlights │     │ - Status     │     │
│  │ - Controls   │     │ - Tooltips   │     │              │     │
│  └──────┬───────┘     └──────┬───────┘     └──────────────┘     │
│         │                    │                                   │
│         └────────┬───────────┘                                   │
│                  │                                               │
│         ┌────────▼────────┐                                      │
│         │   MAIN PROCESS  │                                      │
│         │                 │                                      │
│         │ - State machine │                                      │
│         │ - IPC handling  │                                      │
│         │ - Screenshot    │                                      │
│         │ - Locator calls │                                      │
│         └────────┬────────┘                                      │
│                  │                                               │
└──────────────────┼───────────────────────────────────────────────┘
                   │
         ┌─────────▼─────────┐
         │   LOCATOR ENGINE  │
         │                   │
         │ ┌───────────────┐ │
         │ │ Gemini Planner│ │  ← "Turn on Dark Mode"
         │ │ (~2-3s once)  │ │  → [{step: 1, target: "Appearance", region: "sidebar"}, ...]
         │ └───────┬───────┘ │
         │         │         │
         │ ┌───────▼───────┐ │
         │ │ Tesseract OCR │ │  ← Screenshot + "Appearance"
         │ │ (~0.2-0.5s)   │ │  → {bbox: [100, 200, 180, 230], conf: 95}
         │ └───────┬───────┘ │
         │         │         │
         │ ┌───────▼───────┐ │
         │ │ Gemini Valid. │ │  ← Only if multiple matches
         │ │ (~1s)         │ │  → Picks correct match
         │ └───────────────┘ │
         └───────────────────┘
```

---

## 4. File Structure

```
/conu-app
├── package.json
├── electron-builder.json
│
├── /main                        # Electron main process
│   ├── main.js                  # App entry, window management
│   ├── preload.js               # IPC bridge
│   ├── state-machine.js         # App state management
│   └── ipc-handlers.js          # IPC event handlers
│
├── /renderer                    # Frontend (React or vanilla)
│   ├── /main-window
│   │   ├── index.html
│   │   ├── main.js
│   │   └── styles.css
│   │
│   └── /overlay
│       ├── overlay.html
│       ├── overlay.js           # Canvas drawing, animations
│       └── overlay.css
│
├── /services                    # Core logic
│   ├── screenshot.js            # Screen capture
│   ├── locator.js               # Main locator (OCR + Gemini)
│   ├── planner.js               # Gemini planning calls
│   ├── ocr.js                   # Tesseract wrapper
│   └── validator.js             # Gemini validation
│
├── /utils
│   ├── regions.js               # Screen region definitions
│   ├── geometry.js              # Bbox calculations
│   └── config.js                # API keys, settings
│
└── /assets
    ├── icon.png
    └── sounds/                  # Optional click sounds
```

---

## 5. Implementation Steps

### Phase 1: Skeleton (Day 1 Morning)

**Goal:** Electron app that takes screenshots and shows overlay

```javascript
// main/main.js - Basic structure
const { app, BrowserWindow, desktopCapturer, ipcMain } = require('electron');

let mainWindow, overlayWindow;

function createWindows() {
  // Main window - task input UI
  mainWindow = new BrowserWindow({
    width: 400,
    height: 500,
    webPreferences: { preload: path.join(__dirname, 'preload.js') }
  });
  mainWindow.loadFile('renderer/main-window/index.html');

  // Overlay window - transparent, fullscreen, click-through
  overlayWindow = new BrowserWindow({
    transparent: true,
    frame: false,
    fullscreen: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js') }
  });
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });
  overlayWindow.loadFile('renderer/overlay/overlay.html');
}

// Screenshot capture
ipcMain.handle('capture-screen', async () => {
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: 1920, height: 1080 }
  });
  return sources[0].thumbnail.toDataURL();
});
```

**Deliverable:** App opens, can capture screenshots, overlay shows on top of everything.

---

### Phase 2: Locator Integration (Day 1 Afternoon)

**Goal:** Port our Python locator to Node.js (or call Python as subprocess)

**Option A: Node.js native (recommended for packaging)**

```javascript
// services/ocr.js
const Tesseract = require('tesseract.js');

async function findText(imageBuffer, targetText, region) {
  // Crop to region first
  const cropped = await cropToRegion(imageBuffer, region);

  const { data } = await Tesseract.recognize(cropped, 'eng');

  const matches = data.words
    .filter(w => w.text.toLowerCase().includes(targetText.toLowerCase()))
    .map(w => ({
      text: w.text,
      bbox: [w.bbox.x0, w.bbox.y0, w.bbox.x1, w.bbox.y1],
      confidence: w.confidence
    }));

  return matches.sort((a, b) => b.confidence - a.confidence)[0];
}
```

**Option B: Python subprocess (faster to implement)**

```javascript
// services/locator.js
const { spawn } = require('child_process');

async function locate(imagePath, targetText, region) {
  return new Promise((resolve, reject) => {
    const py = spawn('python', ['locator.py', imagePath, targetText, region]);
    let result = '';
    py.stdout.on('data', (data) => result += data);
    py.on('close', () => resolve(JSON.parse(result)));
  });
}
```

**Deliverable:** Can find text elements on screen with coordinates.

---

### Phase 3: Planning Integration (Day 1 Evening)

**Goal:** Gemini generates step-by-step plans

```javascript
// services/planner.js
const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

async function generatePlan(screenshotBase64, task) {
  const prompt = `Task: ${task}

Generate steps to complete this task. Return JSON only:
{"steps": [
  {"step": 1, "instruction": "Click X", "target_text": "X", "region": "sidebar"},
  ...
]}

region must be: menu_bar, toolbar, sidebar, main, bottom
JSON only.`;

  const result = await model.generateContent([
    prompt,
    { inlineData: { mimeType: 'image/png', data: screenshotBase64 } }
  ]);

  return JSON.parse(result.response.text());
}
```

**Deliverable:** App generates plans from screenshots + user input.

---

### Phase 4: State Machine (Day 2 Morning)

**Goal:** Proper flow control between states

```javascript
// main/state-machine.js
const states = {
  IDLE: 'idle',
  PLANNING: 'planning',
  LOCATING: 'locating',
  HIGHLIGHTING: 'highlighting',
  WAITING_CLICK: 'waiting_click',
  COMPLETE: 'complete',
  ERROR: 'error'
};

class TutorialStateMachine {
  constructor() {
    this.state = states.IDLE;
    this.plan = null;
    this.currentStep = 0;
    this.listeners = [];
  }

  async startTask(task) {
    this.setState(states.PLANNING);

    try {
      const screenshot = await captureScreen();
      this.plan = await generatePlan(screenshot, task);
      this.currentStep = 0;
      await this.executeStep();
    } catch (e) {
      this.setState(states.ERROR, e.message);
    }
  }

  async executeStep() {
    if (this.currentStep >= this.plan.steps.length) {
      this.setState(states.COMPLETE);
      return;
    }

    const step = this.plan.steps[this.currentStep];
    this.setState(states.LOCATING);

    const screenshot = await captureScreen();
    const result = await locate(screenshot, step.target_text, step.region);

    if (result.found) {
      this.setState(states.HIGHLIGHTING, { bbox: result.bbox, instruction: step.instruction });
      // Overlay will show highlight, wait for user click
      this.setState(states.WAITING_CLICK);
    } else {
      // Element not found - maybe need to scroll?
      this.setState(states.ERROR, `Could not find "${step.target_text}"`);
    }
  }

  userClicked() {
    if (this.state === states.WAITING_CLICK) {
      this.currentStep++;
      setTimeout(() => this.executeStep(), 500); // Wait for UI to settle
    }
  }

  setState(newState, data = null) {
    this.state = newState;
    this.listeners.forEach(fn => fn(newState, data));
  }
}
```

**Deliverable:** Complete flow from task → plan → locate → highlight → click → next step.

---

### Phase 5: Overlay UI (Day 2 Afternoon)

**Goal:** Beautiful highlight animations

```javascript
// renderer/overlay/overlay.js
const canvas = document.getElementById('overlay-canvas');
const ctx = canvas.getContext('2d');

// Resize to screen
canvas.width = window.screen.width;
canvas.height = window.screen.height;

let currentHighlight = null;
let pulsePhase = 0;

function drawHighlight(bbox, instruction) {
  currentHighlight = { bbox, instruction };
  animate();
}

function animate() {
  if (!currentHighlight) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const { bbox, instruction } = currentHighlight;
  const [x1, y1, x2, y2] = bbox;
  const w = x2 - x1;
  const h = y2 - y1;

  // Pulsing glow effect
  pulsePhase += 0.1;
  const pulse = Math.sin(pulsePhase) * 0.3 + 0.7;
  const glowSize = 10 + Math.sin(pulsePhase) * 5;

  // Outer glow
  ctx.shadowColor = `rgba(0, 255, 0, ${pulse})`;
  ctx.shadowBlur = glowSize;
  ctx.strokeStyle = '#00ff00';
  ctx.lineWidth = 3;
  ctx.strokeRect(x1 - 5, y1 - 5, w + 10, h + 10);

  // Inner highlight
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(0, 255, 0, 0.1)';
  ctx.fillRect(x1, y1, w, h);

  // Instruction tooltip
  ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
  ctx.fillRect(x1, y2 + 10, Math.max(200, instruction.length * 8), 30);
  ctx.fillStyle = '#ffffff';
  ctx.font = '14px -apple-system, sans-serif';
  ctx.fillText(instruction, x1 + 10, y2 + 30);

  // Arrow pointing to element
  ctx.beginPath();
  ctx.moveTo(x1 + w/2, y2 + 10);
  ctx.lineTo(x1 + w/2 - 10, y2 + 20);
  ctx.lineTo(x1 + w/2 + 10, y2 + 20);
  ctx.closePath();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
  ctx.fill();

  requestAnimationFrame(animate);
}

function clearHighlight() {
  currentHighlight = null;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

// IPC listeners
window.electronAPI.onHighlight((bbox, instruction) => drawHighlight(bbox, instruction));
window.electronAPI.onClear(() => clearHighlight());
```

**Deliverable:** Smooth, pulsing green highlights with instruction tooltips.

---

### Phase 6: Main Window UI (Day 2 Evening)

**Goal:** Clean task input interface

```html
<!-- renderer/main-window/index.html -->
<!DOCTYPE html>
<html>
<head>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, sans-serif;
      background: #1a1a1a;
      color: white;
      padding: 20px;
      height: 100vh;
    }
    .logo { font-size: 24px; font-weight: bold; margin-bottom: 20px; }
    .logo span { color: #00ff00; }

    .input-area {
      background: #2a2a2a;
      border-radius: 12px;
      padding: 15px;
      margin-bottom: 20px;
    }
    textarea {
      width: 100%;
      background: transparent;
      border: none;
      color: white;
      font-size: 16px;
      resize: none;
      outline: none;
    }

    .start-btn {
      width: 100%;
      padding: 15px;
      background: #00ff00;
      border: none;
      border-radius: 8px;
      font-size: 16px;
      font-weight: bold;
      cursor: pointer;
    }
    .start-btn:hover { background: #00cc00; }
    .start-btn:disabled { background: #333; color: #666; }

    .status {
      margin-top: 20px;
      padding: 15px;
      background: #2a2a2a;
      border-radius: 8px;
    }
    .status-icon { display: inline-block; margin-right: 10px; }
    .status-icon.loading { animation: spin 1s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }

    .steps {
      margin-top: 20px;
      max-height: 200px;
      overflow-y: auto;
    }
    .step {
      padding: 10px;
      border-left: 3px solid #333;
      margin-bottom: 5px;
    }
    .step.current { border-color: #00ff00; background: rgba(0,255,0,0.1); }
    .step.done { border-color: #00ff00; opacity: 0.5; }
  </style>
</head>
<body>
  <div class="logo">CON<span>U</span></div>

  <div class="input-area">
    <textarea id="task" rows="3" placeholder="What do you want to do? e.g., 'Turn on Dark Mode'"></textarea>
  </div>

  <button class="start-btn" id="startBtn">Start Tutorial</button>

  <div class="status" id="status" style="display: none;">
    <span class="status-icon" id="statusIcon">⏳</span>
    <span id="statusText">Planning...</span>
  </div>

  <div class="steps" id="steps"></div>

  <script>
    const taskInput = document.getElementById('task');
    const startBtn = document.getElementById('startBtn');
    const status = document.getElementById('status');
    const statusIcon = document.getElementById('statusIcon');
    const statusText = document.getElementById('statusText');
    const stepsDiv = document.getElementById('steps');

    startBtn.addEventListener('click', async () => {
      const task = taskInput.value.trim();
      if (!task) return;

      startBtn.disabled = true;
      status.style.display = 'block';
      statusIcon.className = 'status-icon loading';
      statusText.textContent = 'Planning your tutorial...';

      await window.electronAPI.startTask(task);
    });

    window.electronAPI.onStateChange((state, data) => {
      switch (state) {
        case 'planning':
          statusIcon.textContent = '🤔';
          statusText.textContent = 'Planning steps...';
          break;
        case 'locating':
          statusIcon.textContent = '🔍';
          statusText.textContent = 'Finding element...';
          break;
        case 'highlighting':
          statusIcon.textContent = '👆';
          statusText.textContent = data.instruction;
          break;
        case 'complete':
          statusIcon.textContent = '✅';
          statusText.textContent = 'Task complete!';
          startBtn.disabled = false;
          break;
        case 'error':
          statusIcon.textContent = '❌';
          statusText.textContent = data;
          startBtn.disabled = false;
          break;
      }
    });

    window.electronAPI.onPlanGenerated((plan) => {
      stepsDiv.innerHTML = plan.steps.map((s, i) =>
        `<div class="step" id="step-${i}">${s.step}. ${s.instruction}</div>`
      ).join('');
    });

    window.electronAPI.onStepChange((stepIndex) => {
      document.querySelectorAll('.step').forEach((el, i) => {
        el.className = 'step' + (i < stepIndex ? ' done' : i === stepIndex ? ' current' : '');
      });
    });
  </script>
</body>
</html>
```

**Deliverable:** Polished UI showing task input, status, and step progress.

---

### Phase 7: Polish & Edge Cases (Day 3)

**Features to add:**

1. **"I'm Stuck" button** - Re-plans from current screen
2. **Scroll detection** - If element not found, suggest scrolling
3. **Click detection** - Know when user actually clicked the highlighted element
4. **Sound effects** - Optional audio feedback
5. **Keyboard shortcut** - Global hotkey to start/stop

**Edge case handling:**

```javascript
// Handle element not found
if (!result.found) {
  // Ask Gemini if scrolling needed
  const scrollCheck = await checkIfScrollNeeded(screenshot, step.target_text);
  if (scrollCheck.needsScroll) {
    showScrollIndicator(scrollCheck.direction);
    return;
  }

  // Try replanning
  this.plan = await generatePlan(screenshot, originalTask, `Current step failed: ${step.instruction}`);
  this.currentStep = 0;
  await this.executeStep();
}

// Handle multiple matches
if (result.matches.length > 1) {
  const validated = await validateMatches(screenshot, result.matches, step.context);
  result = validated;
}
```

---

## 6. API Configuration

### Gemini API

```javascript
// utils/config.js
module.exports = {
  GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,

  MODELS: {
    PLANNER: 'gemini-2.0-flash',      // Fast planning
    VALIDATOR: 'gemini-2.0-flash',    // Match validation
  },

  REGIONS: {
    menu_bar: [0, 0, 1, 0.04],
    toolbar: [0, 0.04, 1, 0.12],
    sidebar: [0, 0.04, 0.25, 0.95],
    main: [0.25, 0.04, 1, 0.95],
    bottom: [0, 0.90, 1, 1],
  }
};
```

### macOS Permissions

The app needs:
1. **Screen Recording** - For screenshots
2. **Accessibility** - Optional, for click detection

```javascript
// Check permissions on startup
const { systemPreferences } = require('electron');

if (process.platform === 'darwin') {
  const screenAccess = systemPreferences.getMediaAccessStatus('screen');
  if (screenAccess !== 'granted') {
    // Show dialog asking user to grant permission
    dialog.showMessageBox({
      type: 'info',
      message: 'Screen Recording Permission Required',
      detail: 'Please grant screen recording permission in System Preferences > Privacy & Security > Screen Recording'
    });
  }
}
```

---

## 7. Known Limitations

| Limitation | Impact | Workaround |
|------------|--------|------------|
| Icons without text | ~70% accuracy | Use context (nearby text) |
| Dynamic content | May miss elements that appear after delay | Add retry with delay |
| Multiple monitors | Only captures primary | Specify monitor in capture |
| Very small text | OCR may miss | Increase screenshot resolution |
| Non-English | Tesseract needs language packs | Add language support |

---

## 8. Demo Strategy

### Pre-Demo Checklist

1. ✅ Grant all permissions beforehand
2. ✅ Pre-test exact flows you'll demo
3. ✅ Have backup video recording
4. ✅ Close unnecessary apps (cleaner screenshots)
5. ✅ Use high contrast apps (Settings works well)

### Recommended Demo Flows

1. **"Turn on Dark Mode"** - 2 steps, visual feedback
2. **"Check battery health"** - 3 steps, shows info popup
3. **"Change wallpaper"** - Multiple steps, shows navigation

### Demo Script

```
1. Open app, show clean UI
2. Type "Help me turn on Dark Mode"
3. Click Start
4. [App shows planning status]
5. [Highlight appears on "Appearance"]
6. "See how it's highlighting exactly what to click?"
7. [Click, highlight moves to "Dark"]
8. [Click, task complete]
9. "That's CONU - AI-powered screen tutorials"
```

---

## 9. Timeline Summary

| Phase | Time | Deliverable |
|-------|------|-------------|
| 1. Skeleton | 2-3 hrs | Electron app with screenshot + overlay |
| 2. Locator | 2-3 hrs | OCR finding elements |
| 3. Planner | 1-2 hrs | Gemini generating steps |
| 4. State Machine | 2-3 hrs | Complete flow control |
| 5. Overlay UI | 2-3 hrs | Beautiful animations |
| 6. Main UI | 2-3 hrs | Task input interface |
| 7. Polish | 2-4 hrs | Edge cases, demo prep |

**Total: ~14-20 hours** (fits in a weekend hackathon)

---

## 10. Quick Start Commands

```bash
# Setup
mkdir conu-app && cd conu-app
npm init -y
npm install electron @google/generative-ai tesseract.js sharp

# Development
npm run dev

# Package for macOS
npm run build
```

---

## 11. Success Metrics

For hackathon judging:

1. **Works end-to-end** - User types task → sees highlights → completes task
2. **Fast enough** - <3s per step
3. **Accurate enough** - 80%+ correct highlights
4. **Looks good** - Smooth animations, clean UI
5. **Wow factor** - "I can just tell it what I want to do and it shows me how"

---

*Last updated: Based on dev-side testing validating OCR + Gemini approach*

---

## 12. Team Task Breakdown (4 People)

### **Person 1: Engine/Locator**
The core AI pipeline - the brains of the app.

| Files | Tasks |
|-------|-------|
| `services/locator.js` | Main orchestrator - coordinates OCR + Gemini |
| `services/ocr.js` | Tesseract wrapper, text finding, region cropping |
| `services/planner.js` | Gemini API calls for step generation |
| `services/validator.js` | Gemini validation for multiple matches |
| `utils/regions.js` | Screen region definitions (menu_bar, sidebar, etc.) |

---

### **Person 2: Electron Shell / Main Process**
App infrastructure and state management.

| Files | Tasks |
|-------|-------|
| `main/main.js` | Window creation, app lifecycle, permissions |
| `main/preload.js` | IPC bridge between main/renderer |
| `main/ipc-handlers.js` | Handle messages from UI |
| `main/state-machine.js` | IDLE → PLANNING → LOCATING → HIGHLIGHTING flow |
| `services/screenshot.js` | `desktopCapturer` screenshot capture |

---

### **Person 3: Overlay Window**
The transparent fullscreen highlight layer.

| Files | Tasks |
|-------|-------|
| `renderer/overlay/overlay.html` | Transparent canvas setup |
| `renderer/overlay/overlay.js` | Canvas drawing, pulsing glow animation |
| `renderer/overlay/overlay.css` | Styling |
| `utils/geometry.js` | Bbox calculations, positioning |

Key features: green pulsing highlight, instruction tooltip with arrow, smooth animations

---

### **Person 4: Main Window UI**
User-facing task input and status display.

| Files | Tasks |
|-------|-------|
| `renderer/main-window/index.html` | Layout structure |
| `renderer/main-window/main.js` | Button handlers, IPC listeners, state updates |
| `renderer/main-window/styles.css` | Dark theme styling |

Key features: task textarea, start button, status indicator, step list with current/done states

---

### Integration Points

| From | To | Data |
|------|-----|------|
| **Main UI** → State Machine | `startTask(task)` |
| **State Machine** → Engine | `generatePlan(screenshot, task)`, `locate(screenshot, text, region)` |
| **State Machine** → Overlay | `highlight(bbox, instruction)`, `clear()` |
| **State Machine** → Main UI | `onStateChange`, `onPlanGenerated`, `onStepChange` |

---

Start with parallel work, then integrate once each piece works standalone.
