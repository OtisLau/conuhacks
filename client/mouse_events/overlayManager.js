/**
 * Overlay Manager
 * Manages the transparent click-through overlay window and mouse event forwarding
 */

const { BrowserWindow, screen, ipcMain } = require('electron');
const MouseTracker = require('./mouseTracker');
const { MouseEventTypes } = require('./eventTypes');

class OverlayManager {
  constructor(options = {}) {
    this.overlayWindow = null;
    this.mouseTracker = new MouseTracker(options.trackerOptions);
    this.isClickThrough = true;
    this.interactiveRegions = []; // Regions where clicks should NOT pass through

    this.config = {
      alwaysOnTop: true,
      ...options,
    };

    // Bind methods
    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.handleMouseDown = this.handleMouseDown.bind(this);
    this.handleMouseUp = this.handleMouseUp.bind(this);
  }

  /**
   * Create the transparent overlay window
   */
  createOverlay(preloadPath) {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.bounds;

    this.overlayWindow = new BrowserWindow({
      x: 0,
      y: 0,
      width,
      height,
      transparent: true,
      frame: false,
      fullscreen: true,
      alwaysOnTop: this.config.alwaysOnTop,
      skipTaskbar: true,
      focusable: false,
      hasShadow: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      closable: false,
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    // Make clicks pass through by default
    this.setClickThrough(true);

    // Set up window events
    this.setupWindowEvents();

    return this.overlayWindow;
  }

  /**
   * Set up event listeners on the overlay window
   */
  setupWindowEvents() {
    if (!this.overlayWindow) return;

    // Forward mouse events from renderer to tracker
    ipcMain.on('overlay-mouse-move', (event, data) => {
      this.handleMouseMove(data);
    });

    ipcMain.on('overlay-mouse-down', (event, data) => {
      this.handleMouseDown(data);
    });

    ipcMain.on('overlay-mouse-up', (event, data) => {
      this.handleMouseUp(data);
    });

    ipcMain.on('overlay-mouse-scroll', (event, data) => {
      this.mouseTracker.handleScroll(data.deltaX, data.deltaY, data);
    });
  }

  /**
   * Handle mouse move events
   */
  handleMouseMove(data) {
    this.mouseTracker.updatePosition(data.x, data.y, data);
    this.mouseTracker.checkDragStart(data);

    // Check if mouse is in an interactive region
    this.updateClickThroughState();
  }

  /**
   * Handle mouse down events
   */
  handleMouseDown(data) {
    this.mouseTracker.handleMouseDown(data.button, data);
  }

  /**
   * Handle mouse up events
   */
  handleMouseUp(data) {
    this.mouseTracker.handleMouseUp(data.button, data);
  }

  /**
   * Enable/disable click-through mode
   */
  setClickThrough(enabled) {
    if (!this.overlayWindow) return;

    this.isClickThrough = enabled;

    if (enabled) {
      // Clicks pass through to apps below
      // { forward: true } still forwards mouse move events to the window
      this.overlayWindow.setIgnoreMouseEvents(true, { forward: true });
    } else {
      // Overlay captures clicks
      this.overlayWindow.setIgnoreMouseEvents(false);
    }
  }

  /**
   * Add an interactive region where clicks should be captured
   * (not passed through to apps below)
   */
  addInteractiveRegion(id, bbox) {
    this.interactiveRegions.push({ id, bbox });
  }

  /**
   * Remove an interactive region
   */
  removeInteractiveRegion(id) {
    this.interactiveRegions = this.interactiveRegions.filter(r => r.id !== id);
  }

  /**
   * Clear all interactive regions
   */
  clearInteractiveRegions() {
    this.interactiveRegions = [];
  }

  /**
   * Update click-through state based on mouse position
   */
  updateClickThroughState() {
    const position = this.mouseTracker.getPosition();
    const isInInteractiveRegion = this.interactiveRegions.some(region => {
      const [x1, y1, x2, y2] = region.bbox;
      return (
        position.x >= x1 &&
        position.x <= x2 &&
        position.y >= y1 &&
        position.y <= y2
      );
    });

    // Only toggle if state needs to change
    if (isInInteractiveRegion && this.isClickThrough) {
      this.setClickThrough(false);
    } else if (!isInInteractiveRegion && !this.isClickThrough) {
      this.setClickThrough(true);
    }
  }

  /**
   * Subscribe to mouse events
   */
  on(eventType, callback) {
    return this.mouseTracker.on(eventType, callback);
  }

  /**
   * Subscribe to click events with position info
   */
  onClickAt(bbox, callback) {
    return this.mouseTracker.on(MouseEventTypes.CLICK, (event) => {
      if (this.mouseTracker.isInsideBbox(bbox)) {
        callback(event);
      }
    });
  }

  /**
   * Wait for a click inside a bounding box (Promise-based)
   */
  waitForClickInBbox(bbox, timeout = 30000) {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        unsubscribe();
        reject(new Error('Click timeout'));
      }, timeout);

      const unsubscribe = this.mouseTracker.on(MouseEventTypes.CLICK, (event) => {
        if (this.mouseTracker.isInsideBbox(bbox)) {
          clearTimeout(timeoutId);
          unsubscribe();
          resolve(event);
        }
      });
    });
  }

  /**
   * Wait for any click (Promise-based)
   */
  waitForClick(timeout = 30000) {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        unsubscribe();
        reject(new Error('Click timeout'));
      }, timeout);

      const unsubscribe = this.mouseTracker.on(MouseEventTypes.CLICK, (event) => {
        clearTimeout(timeoutId);
        unsubscribe();
        resolve(event);
      });
    });
  }

  /**
   * Send highlight data to the overlay renderer
   */
  highlight(bbox, instruction) {
    if (this.overlayWindow) {
      this.overlayWindow.webContents.send('highlight', { bbox, instruction });
    }
  }

  /**
   * Clear highlight from overlay
   */
  clearHighlight() {
    if (this.overlayWindow) {
      this.overlayWindow.webContents.send('clear-highlight');
    }
  }

  /**
   * Show the overlay
   */
  show() {
    if (this.overlayWindow) {
      this.overlayWindow.show();
    }
  }

  /**
   * Hide the overlay
   */
  hide() {
    if (this.overlayWindow) {
      this.overlayWindow.hide();
    }
  }

  /**
   * Get the overlay window instance
   */
  getWindow() {
    return this.overlayWindow;
  }

  /**
   * Get the mouse tracker instance
   */
  getTracker() {
    return this.mouseTracker;
  }

  /**
   * Clean up resources
   */
  destroy() {
    this.mouseTracker.destroy();

    ipcMain.removeAllListeners('overlay-mouse-move');
    ipcMain.removeAllListeners('overlay-mouse-down');
    ipcMain.removeAllListeners('overlay-mouse-up');
    ipcMain.removeAllListeners('overlay-mouse-scroll');

    if (this.overlayWindow) {
      this.overlayWindow.destroy();
      this.overlayWindow = null;
    }
  }
}

module.exports = OverlayManager;
