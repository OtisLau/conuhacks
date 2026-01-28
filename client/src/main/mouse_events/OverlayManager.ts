/**
 * Overlay Manager
 * Manages the transparent click-through overlay window and mouse event forwarding
 */

import { BrowserWindow, screen, ipcMain } from 'electron';
import { MouseTracker, type MouseTrackerOptions } from './MouseTracker';
import { MouseEventTypes, type MouseEventType } from './eventTypes';
import type { BBox } from './helpers';

export interface OverlayManagerOptions {
  alwaysOnTop?: boolean;
  trackerOptions?: MouseTrackerOptions;
}

interface InteractiveRegion {
  id: string;
  bbox: BBox;
}

export class OverlayManager {
  private overlayWindow: BrowserWindow | null;
  private mouseTracker: MouseTracker;
  private isClickThrough: boolean;
  private interactiveRegions: InteractiveRegion[];
  private config: { alwaysOnTop: boolean };

  constructor(options: OverlayManagerOptions = {}) {
    this.overlayWindow = null;
    this.mouseTracker = new MouseTracker(options.trackerOptions);
    this.isClickThrough = true;
    this.interactiveRegions = [];

    this.config = {
      alwaysOnTop: options.alwaysOnTop !== undefined ? options.alwaysOnTop : true,
    };

    // Bind methods
    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.handleMouseDown = this.handleMouseDown.bind(this);
    this.handleMouseUp = this.handleMouseUp.bind(this);
    this.handleMouseScroll = this.handleMouseScroll.bind(this);
  }

  /**
   * Create the transparent overlay window
   */
  createOverlay(preloadPath: string): BrowserWindow {
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
  private setupWindowEvents(): void {
    if (!this.overlayWindow) return;

    // Forward mouse events from renderer to tracker
    ipcMain.on('overlay-mouse-move', this.handleMouseMove);
    ipcMain.on('overlay-mouse-down', this.handleMouseDown);
    ipcMain.on('overlay-mouse-up', this.handleMouseUp);
    ipcMain.on('overlay-mouse-scroll', this.handleMouseScroll);
  }

  /**
   * Handle mouse move events
   */
  private handleMouseMove(_event: Electron.IpcMainEvent, data: any): void {
    this.mouseTracker.updatePosition(data.x, data.y, data);
    this.mouseTracker.checkDragStart(data);

    // Check if mouse is in an interactive region
    this.updateClickThroughState();
  }

  /**
   * Handle mouse down events
   */
  private handleMouseDown(_event: Electron.IpcMainEvent, data: any): void {
    this.mouseTracker.handleMouseDown(data.button, data);
  }

  /**
   * Handle mouse up events
   */
  private handleMouseUp(_event: Electron.IpcMainEvent, data: any): void {
    this.mouseTracker.handleMouseUp(data.button, data);
  }

  /**
   * Handle mouse scroll events
   */
  private handleMouseScroll(_event: Electron.IpcMainEvent, data: any): void {
    this.mouseTracker.handleScroll(data.deltaX, data.deltaY, data);
  }

  /**
   * Enable/disable click-through mode
   */
  setClickThrough(enabled: boolean): void {
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
   */
  addInteractiveRegion(id: string, bbox: BBox): void {
    this.interactiveRegions.push({ id, bbox });
  }

  /**
   * Remove an interactive region
   */
  removeInteractiveRegion(id: string): void {
    this.interactiveRegions = this.interactiveRegions.filter(r => r.id !== id);
  }

  /**
   * Clear all interactive regions
   */
  clearInteractiveRegions(): void {
    this.interactiveRegions = [];
  }

  /**
   * Update click-through state based on mouse position
   */
  private updateClickThroughState(): void {
    const position = this.mouseTracker.getPosition();
    const isInInteractiveRegion = this.interactiveRegions.some(region => {
      const [x1, y1, x2, y2] = region.bbox;
      return position.x >= x1 && position.x <= x2 && position.y >= y1 && position.y <= y2;
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
  on(eventType: MouseEventType, callback: (event: any) => void): () => void {
    return this.mouseTracker.on(eventType, callback);
  }

  /**
   * Subscribe to click events with position info
   */
  onClickAt(bbox: BBox, callback: (event: any) => void): () => void {
    return this.mouseTracker.on(MouseEventTypes.CLICK, event => {
      if (this.mouseTracker.isInsideBbox(bbox)) {
        callback(event);
      }
    });
  }

  /**
   * Wait for a click inside a bounding box (Promise-based)
   */
  waitForClickInBbox(bbox: BBox, timeout = 30000): Promise<any> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        unsubscribe();
        reject(new Error('Click timeout'));
      }, timeout);

      const unsubscribe = this.mouseTracker.on(MouseEventTypes.CLICK, event => {
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
  waitForClick(timeout = 30000): Promise<any> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        unsubscribe();
        reject(new Error('Click timeout'));
      }, timeout);

      const unsubscribe = this.mouseTracker.on(MouseEventTypes.CLICK, event => {
        clearTimeout(timeoutId);
        unsubscribe();
        resolve(event);
      });
    });
  }

  /**
   * Send highlight data to the overlay renderer
   */
  highlight(bbox: BBox, instruction: string): void {
    if (this.overlayWindow) {
      this.overlayWindow.webContents.send('highlight', { bbox, instruction });
    }
  }

  /**
   * Clear highlight from overlay
   */
  clearHighlight(): void {
    if (this.overlayWindow) {
      this.overlayWindow.webContents.send('clear-highlight');
    }
  }

  /**
   * Show the overlay
   */
  show(): void {
    if (this.overlayWindow) {
      this.overlayWindow.show();
    }
  }

  /**
   * Hide the overlay
   */
  hide(): void {
    if (this.overlayWindow) {
      this.overlayWindow.hide();
    }
  }

  /**
   * Get the overlay window instance
   */
  getWindow(): BrowserWindow | null {
    return this.overlayWindow;
  }

  /**
   * Get the mouse tracker instance
   */
  getTracker(): MouseTracker {
    return this.mouseTracker;
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.mouseTracker.destroy();

    ipcMain.removeListener('overlay-mouse-move', this.handleMouseMove);
    ipcMain.removeListener('overlay-mouse-down', this.handleMouseDown);
    ipcMain.removeListener('overlay-mouse-up', this.handleMouseUp);
    ipcMain.removeListener('overlay-mouse-scroll', this.handleMouseScroll);

    if (this.overlayWindow) {
      this.overlayWindow.destroy();
      this.overlayWindow = null;
    }
  }
}
