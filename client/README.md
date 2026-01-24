# CONU Client

Single-window Electron app with transparent overlay containing integrated UI.

## Structure

```
client/
├── main.js                 # Main process - creates overlay window
├── overlay.html            # Combined overlay + UI in one window
└── mouse_events/           # Mouse event tracking module
    ├── preload.js          # IPC bridge for overlay with mouse events
    └── ...                 # Event handlers and utilities
```

## Running

```bash
# Install dependencies
npm install

# Start the app
npm start

# Start with dev tools
npm run dev

# Kill all running instances
npm run kill
# OR
./kill.sh
```

## Quitting the App

**Three ways to quit:**

1. **Press Cmd+Q** (macOS) or **Ctrl+Q** (Windows/Linux) - **WORKS SYSTEM-WIDE**
2. **Press ESC key** - Quick exit shortcut
3. **Click the red "Quit" button** in the top-right corner
4. **Run the kill script**: `npm run kill` or `./kill.sh`

The keyboard shortcuts use Electron's `globalShortcut` API so they work **anywhere on your system** while the app is running - you don't need to focus the window!

## Features

### Single Overlay Window
- Transparent fullscreen window (not macOS fullscreen mode)
- Visible dashed green border around screen edges
- Click-through enabled for most of screen
- Integrated control panel (top-left)
- Live mouse event log (bottom-right)
- **Red "Quit" button** (top-right) for easy app exit

### Control Panel (Top-Left)
- Floating semi-transparent UI
- Text input for prompts
- "Start Tutorial" button
- Automatically disables click-through when hovering over panel
- Can interact with text box while keeping other apps in focus

### Mouse Event Logger (Bottom-Right)
- **Real-time logging** of all mouse events directly from DOM
- Shows **event type**, **coordinates**, **button**, and **scroll deltas**
- Throttled mouse-move logging (100ms) to avoid spam
- **Color-coded output**:
  - Gray: Timestamp (HH:MM:SS.mmm)
  - Cyan: Event type
  - Yellow: Coordinates
- Auto-scrolling with 50 entry limit
- Fixed and working! Events log as you move/click/scroll

### Canvas Overlay
- Pulsing green highlight effect for elements
- Instruction tooltips with arrows
- Border showing overlay bounds
- Test highlight appears after 2 seconds

### Smart Click-Through
- Most of screen passes clicks to apps below
- Control panel area captures clicks when hovered
- Maintains Electron app focus while clicking through
- Mouse events tracked globally even when click-through is enabled

## Mouse Events Tracked

The live logger shows:
- `mouse-move` - Mouse position updates (throttled to 100ms)
- `mouse-down` - Button press with button name
- `mouse-up` - Button release
- `click` - Full click (down + up)
- `double-click` - Double click detection
- `right-click` - Right mouse button
- `scroll` - Scroll wheel with delta values
- `drag-start`, `drag`, `drag-end` - Drag operations
- `hover` - Mouse stationary for 500ms

## Test

After starting, you'll see:
1. Green dashed border around screen edges
2. Control panel in top-left corner
3. Mouse event log in bottom-right corner
4. Test highlight at [100, 100, 300, 150] after 2 seconds
5. All mouse movements and clicks logged in real-time

You can click through the overlay to interact with apps below while the event log tracks everything!

## Next Steps

- Hook up "Start Tutorial" button to state machine
- Connect to Python locator service
- Implement full tutorial flow from MASTER_PLAN.md
- Add keyboard shortcuts for showing/hiding UI
