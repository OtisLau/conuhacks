# AI-Powered Screen Tutorial Guide

## Project Overview

Build a desktop app that guides users through any task on their computer by highlighting what to click next — like having someone looking over your shoulder saying "click there, now click that."

**Example Use Case:**
- User: "Help me change my keyboard layout to Chinese"
- App: Takes screenshot → generates step-by-step plan → highlights "Keyboard" in Settings → user clicks → highlights next element → repeat until done

---

## Core Architecture

```
USER INPUT: "Help me do X"
           ↓
    ┌──────────────────────────────────────┐
    │ PHASE 1: PLANNING (once, ~4 sec)     │
    │                                      │
    │ Screenshot + Task → Gemini 2.0 Pro   │
    │ Output: Step-by-step plan            │
    └──────────────────┬───────────────────┘
                       ↓
    ┌──────────────────────────────────────┐
    │ PHASE 2: LOCATE (per step, ~1.5 sec) │
    │                                      │
    │ Screenshot + Instruction →           │
    │ Gemini 2.0 Flash                     │
    │ Output: Bounding box coordinates     │
    └──────────────────┬───────────────────┘
                       ↓
    ┌──────────────────────────────────────┐
    │ PHASE 3: HIGHLIGHT                   │
    │                                      │
    │ Draw box at coordinates              │
    │ Show instruction tooltip             │
    │ Wait for user click                  │
    └──────────────────┬───────────────────┘
                       ↓
              [User clicks]
                       ↓
              Wait 500ms
                       ↓
         Back to PHASE 2 for next step
```

---

## Tech Stack

| Component | Technology | Why |
|-----------|------------|-----|
| Desktop App | **Electron** | Cross-platform, transparent overlay support |
| Screenshot | Electron `desktopCapturer` | Built-in, fast |
| Planning | **Gemini 2.0 Flash** | Fast step generation with region hints |
| Text Location | **Tesseract OCR** | Fast (~0.2s), exact coordinates for text |
| Icon Location | **OmniParser + Gemini** | Fallback for non-text elements (~1s) |
| Overlay | Transparent BrowserWindow + Canvas | Draw highlights on top of everything |

---

## Element Location Strategy (Tested & Validated)

We tested multiple approaches. Here's what works:

### Primary: Tesseract OCR (for text elements)

- **Speed:** ~0.2s per element (when cropped to region)
- **Accuracy:** 100% for visible text
- **Best for:** Menu items, labels, filenames, buttons with text

### Fallback: OmniParser + Gemini (for icons)

- **Speed:** ~1s per element
- **Accuracy:** ~70% for icons
- **Best for:** Icons, buttons without text labels

### What Doesn't Work

- **Gemini bbox prediction alone:** Inaccurate coordinates (~50% miss rate)
- **OmniParser + batch Gemini labeling:** Inconsistent labels

### Region-Based Cropping (Key Optimization)

Cropping to the relevant region before OCR makes it 10x faster:

```python
REGIONS = {
    "menu_bar": (0, 0, 1, 0.04),      # Top 4% - menus
    "toolbar": (0, 0.04, 1, 0.12),     # Below menu - toolbars
    "sidebar": (0, 0.04, 0.25, 0.95),  # Left 25% - file trees
    "main": (0.25, 0.04, 1, 0.95),     # Main content area
    "bottom": (0, 0.90, 1, 1),         # Bottom 10% - status bar
}
```

---

## Detailed Flow

### Phase 1: Planning

**Input:**
- Screenshot (current screen state)
- User's task description

**API Call:** Gemini 2.0 Pro

**Prompt:**
```
You are a helpful assistant guiding a user through a task on their computer.

Task: {user_task}

Look at the current screenshot and generate step-by-step instructions.

Return ONLY a JSON object:
{
  "steps": [
    {
      "step": 1,
      "instruction": "Click on X",
      "element_description": "description of UI element to find"
    },
    ...
  ]
}

Be specific about what to click. Include scroll steps if needed.
Return ONLY the JSON.
```

**Output Example:**
```json
{
  "steps": [
    {
      "step": 1,
      "instruction": "Click Keyboard in the left sidebar",
      "element_description": "keyboard icon in sidebar"
    },
    {
      "step": 2,
      "instruction": "Click Input Sources",
      "element_description": "Input Sources text or tab"
    },
    {
      "step": 3,
      "instruction": "Click the + button to add a new input source",
      "element_description": "plus button at bottom of list"
    },
    {
      "step": 4,
      "instruction": "Search for Chinese",
      "element_description": "search field"
    },
    {
      "step": 5,
      "instruction": "Select Chinese - Simplified",
      "element_description": "Chinese Simplified option in list"
    },
    {
      "step": 6,
      "instruction": "Click Add",
      "element_description": "Add button"
    }
  ]
}
```

**Time:** ~3-4 seconds

---

### Phase 2: Element Location (Hybrid Approach)

**Input:**

- Fresh screenshot (current screen state)
- Current step's target_text and region hint

**Strategy:**

1. **Try OCR first** (fast, accurate for text)
   - Crop to the hinted region (menu_bar, sidebar, main, etc.)
   - Run Tesseract OCR on the crop
   - Find exact text match → return bbox

2. **Fall back to icon detection** (if OCR fails)
   - Load OmniParser boxes for the region
   - Crop each box and ask Gemini to identify it
   - Match to target description → return bbox

**Planning Prompt (generates region hints):**

```text
Task: {user_task}

Generate 3-5 steps. For each step, specify the text to find and where to look.

Return JSON only:
{"steps": [
  {"instruction": "Click Terminal", "target_text": "Terminal", "region": "menu_bar"},
  {"instruction": "Click New Terminal", "target_text": "New Terminal", "region": "main"}
]}

region must be: menu_bar, toolbar, sidebar, main, bottom
```

**Output Example:**

```json
{
  "found": true,
  "element": "Terminal",
  "bbox": [807, 28, 907, 48],
  "confidence": 91,
  "method": "ocr"
}
```

**Time:** ~0.2s for text (OCR), ~1s for icons (Gemini)

---

### Phase 3: Highlight & Wait

**If element found:**
1. Draw pulsing highlight box at bbox coordinates
2. Show tooltip with instruction text
3. Listen for user click
4. Wait 500ms after click (let UI settle)
5. Advance to next step

**If scroll needed:**
1. Show indicator at bottom/top of screen: "↓ Scroll down to continue"
2. Wait for scroll (detect via screenshot change)
3. Re-run Phase 2 to find element

---

## Fallback Logic

| Scenario | Trigger | Action |
|----------|---------|--------|
| Element not found | `found: false` + `action: scroll_*` | Show scroll indicator |
| Low confidence | `confidence: "low"` | Call Gemini Pro to verify/replan |
| 2 failures in a row | Match fails twice | Call Gemini Pro to replan from current screen |
| User clicks "I'm stuck" | Manual trigger | Call Gemini Pro to replan |

**Replan Prompt:**
```
Original goal: {original_task}
Steps completed so far: {completed_steps}
Current screen: [screenshot]

The user seems stuck. Generate new steps to complete the goal from the current state.
Return JSON in same format as before.
```

---

## API Configuration

### Gemini API

**Model Names:**
- Planning: `gemini-2.0-pro-exp` (or `gemini-1.5-pro` as fallback)
- Location: `gemini-2.0-flash` (NOT `gemini-2.0-flash-exp` — lower rate limits)

**Rate Limits (gemini-2.0-flash):**
- 2,000 requests per minute
- Unlimited requests per day
- More than enough for hackathon

**Setup:**
1. Go to https://aistudio.google.com/apikey
2. Create API key
3. Set `GOOGLE_API_KEY` environment variable

**Cost:** Essentially free for hackathon volume

### Replicate API (Backup - OmniParser)

Only use if Gemini Flash bbox accuracy is bad.

**Setup:**
1. Go to https://replicate.com
2. Sign in with GitHub
3. Get API token from https://replicate.com/account/api-tokens
4. Add $10 at https://replicate.com/account/billing
5. Set `REPLICATE_API_TOKEN` environment variable

**Cost:** ~$0.0004 per run

---

## Electron App Structure

```
/tutorial-guide-app
├── package.json
├── main.js                 # Electron main process
├── preload.js              # Bridge between main and renderer
├── /renderer
│   ├── index.html          # Main UI (input box, status)
│   ├── overlay.html        # Transparent overlay window
│   ├── renderer.js         # Main window logic
│   └── overlay.js          # Highlight drawing logic
├── /services
│   ├── screenshot.js       # Screen capture
│   ├── gemini.js           # Gemini API calls
│   ├── planner.js          # Step planning logic
│   └── locator.js          # Element location logic
└── /utils
    └── geometry.js         # Bbox calculations
```

---

## Key Electron Concepts

### Transparent Overlay Window
```javascript
const overlayWindow = new BrowserWindow({
  transparent: true,
  frame: false,
  alwaysOnTop: true,
  fullscreen: true,
  focusable: false,           // Don't steal focus
  skipTaskbar: true,
  webPreferences: {
    nodeIntegration: false,
    contextIsolation: true,
    preload: path.join(__dirname, 'preload.js')
  }
});

// Make clicks pass through to apps below
overlayWindow.setIgnoreMouseEvents(true, { forward: true });
```

### Screenshot Capture
```javascript
const { desktopCapturer } = require('electron');

async function captureScreen() {
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: 1920, height: 1080 }
  });
  
  // sources[0].thumbnail is a NativeImage
  return sources[0].thumbnail.toPNG(); // Returns Buffer
}
```

### Drawing Highlight (in overlay.js)
```javascript
function drawHighlight(bbox, instruction) {
  const canvas = document.getElementById('overlay-canvas');
  const ctx = canvas.getContext('2d');
  
  const [x1, y1, x2, y2] = bbox;
  
  // Clear previous
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // Draw pulsing rectangle
  ctx.strokeStyle = '#00ff00';
  ctx.lineWidth = 3;
  ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
  
  // Draw tooltip
  ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
  ctx.fillRect(x1, y2 + 5, 300, 30);
  ctx.fillStyle = '#ffffff';
  ctx.font = '14px sans-serif';
  ctx.fillText(instruction, x1 + 10, y2 + 25);
}
```

---

## macOS Permissions (Important!)

The app needs these permissions:
1. **Screen Recording** — required for screenshots
2. **Accessibility** — required for global click detection (optional)

User will need to manually enable in System Preferences → Privacy & Security.

**For hackathon demo:** Pre-grant these permissions before presenting.

---

## Simplified Flow for Hackathon

Since this is a hackathon demo:
- Only test on 2-3 specific apps (e.g., macOS Settings, VS Code)
- Pre-test the exact flows you'll demo
- No misclick handling — assume user clicks correctly
- Call Gemini on every click, no smart change detection
- Have a backup demo video ready

---

## State Machine

```
States:
  IDLE          → User hasn't started
  PLANNING      → Generating steps
  SHOWING_STEP  → Highlighting current element
  WAITING_CLICK → User needs to click
  PROCESSING    → Getting next element location
  COMPLETE      → All steps done
  ERROR         → Something went wrong

Transitions:
  IDLE → PLANNING           (user submits task)
  PLANNING → SHOWING_STEP   (plan generated)
  SHOWING_STEP → WAITING_CLICK (highlight drawn)
  WAITING_CLICK → PROCESSING (user clicked)
  PROCESSING → SHOWING_STEP (next element found)
  PROCESSING → COMPLETE     (no more steps)
  ANY → ERROR               (API failure, etc.)
```

---

## Testing Before Hackathon

Use the included `test_models.py` to verify:
1. Gemini Flash returns usable bounding boxes
2. Gemini Pro generates sensible steps
3. Latency is acceptable

```bash
pip install google-generativeai pillow
export GOOGLE_API_KEY="your_key"
python test_models.py screenshot.png "Settings" "change keyboard to Chinese"
```

---

## Summary

| Phase | Model | Time | Purpose |
|-------|-------|------|---------|
| Plan | Gemini 2.0 Pro | ~4 sec (once) | Generate steps |
| Locate | Gemini 2.0 Flash | ~1.5 sec (per step) | Find element bbox |
| Fallback | Gemini Pro | ~4 sec (rare) | Replan if stuck |

**Total per step: ~1.5-2 sec** — fast enough for good UX.

---

## What to Build (Priority Order)

1. **Electron app with overlay** — transparent window that draws highlights
2. **Screenshot service** — capture screen as base64/PNG
3. **Gemini integration** — planning + location calls
4. **Main loop** — plan → locate → highlight → wait → repeat
5. **Basic UI** — input box for task, status display
6. **Polish** — animations, error handling, "I'm stuck" button

Start with #1-4, that's your MVP. The rest is nice-to-have.
