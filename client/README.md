# CONU Client

This is the client for CONU, a single-window Electron application with a transparent overlay and integrated UI.

## Getting Started

### Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/your-username/conu.git
    cd conu/client
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

### Running the App

*   **Start the app:**
    ```bash
    npm start
    ```

*   **Start with developer tools:**
    ```bash
    npm run dev
    ```

*   **Kill all running instances:**
    ```bash
    npm run kill
    # OR
    ./kill.sh
    ```

## How to Quit

You can quit the application in any of the following ways:

1.  **Keyboard Shortcut:** Press `Cmd+Q` (macOS) or `Ctrl+Q` (Windows/Linux). This works system-wide.
2.  **ESC Key:** Press the `ESC` key for a quick exit.
3.  **Quit Button:** Click the red "Quit" button in the top-right corner of the overlay.
4.  **Kill Script:** Run `npm run kill` or `./kill.sh` in your terminal.

## Project Structure

The client is organized as follows:

```
client/
├── main.js                 # Main Electron process - creates the overlay window
├── main-window.html        # HTML for the main window
├── overlay.html            # HTML for the transparent overlay and UI
├── preload-main.js         # Preload script for the main window
├── package.json            # Project metadata and dependencies
├── mouse_events/           # Module for tracking mouse events
│   ├── index.js            # Main logic for mouse event tracking
│   ├── preload.js          # IPC bridge for sharing mouse events with the overlay
│   └── ...                 # Other event handlers and utility functions
└── node_modules/           # Installed npm packages
```

## Features

### Single Overlay Window
- Transparent, fullscreen window that stays on top of other applications.
- A visible dashed green border shows the edges of the screen.
- Most of the screen is "click-through," so you can interact with applications underneath.
- An integrated control panel is located in the top-left.
- A live mouse event log is displayed in the bottom-right.
- A red "Quit" button in the top-right provides an easy way to exit the app.

### Control Panel (Top-Left)
- A floating, semi-transparent UI.
- Contains a text input for prompts and a "Start Tutorial" button.
- Automatically captures mouse clicks when you hover over it, so you can interact with the UI.

### Mouse Event Logger (Bottom-Right)
- Logs all mouse events in real-time.
- Displays the event type, coordinates, button, and scroll deltas.
- Mouse movement logging is throttled to prevent spam.
- Output is color-coded for readability.
- Automatically scrolls and has a 50-entry limit.

### Canvas Overlay
- A pulsing green highlight effect can be used to draw attention to elements.
- Instruction tooltips with arrows can guide the user.
- A border shows the bounds of the overlay.

### Smart Click-Through
- The overlay passes clicks through to the applications below it.
- The control panel captures clicks when hovered over.
- The Electron app remains in focus even when clicking through to other applications.

## Tracked Mouse Events

The live logger shows the following events:
- `mouse-move`
- `mouse-down`
- `mouse-up`
- `click`
- `double-click`
- `right-click`
- `scroll`
- `drag-start`, `drag`, `drag-end`
- `hover`

## Contributing

Contributions are welcome! Please feel free to submit a pull request or open an issue.

## Next Steps

- Hook up the "Start Tutorial" button to the state machine.
- Connect to the Python locator service.
- Implement the full tutorial flow from `MASTER_PLAN.md`.
- Add keyboard shortcuts for showing and hiding the UI.