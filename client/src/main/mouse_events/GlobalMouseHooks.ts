/**
 * Global Mouse Hooks
 * Captures system-wide mouse events even when overlay is click-through
 *
 * This module uses polling + screen.getCursorScreenPoint() as a reliable
 * cross-platform approach.
 */

import { screen, Display } from 'electron';
import { EventEmitter } from 'events';
import { MouseEventTypes, MouseButtons, ButtonNames, type MouseEventType } from './eventTypes';
import type { Point, BBox } from './helpers';

export interface GlobalMouseHooksOptions {
  pollRate?: number;
  enableNativeHooks?: boolean;
}

export interface GlobalMouseEvent {
  type: MouseEventType;
  timestamp: number;
  position: Point;
  screenPosition: Point;
  previousPosition: Point;
  delta: Point;
  display?: {
    id: number;
    bounds: Electron.Rectangle;
    scaleFactor: number;
  };
  button?: number;
  buttonName?: string;
  scrollDelta?: {
    x: number;
    y: number;
  };
}

export class GlobalMouseHooks extends EventEmitter {
  private isRunning: boolean;
  private pollInterval: NodeJS.Timeout | null;
  private lastPosition: Point;
  private lastButtons: Set<number>;
  private config: Required<GlobalMouseHooksOptions>;
  private nativeHooks: any; // Type depends on native module used

  constructor(options: GlobalMouseHooksOptions = {}) {
    super();

    this.isRunning = false;
    this.pollInterval = null;
    this.lastPosition = { x: 0, y: 0 };
    this.lastButtons = new Set();

    this.config = {
      pollRate: options.pollRate || 16, // ~60fps
      enableNativeHooks: options.enableNativeHooks || false,
    };

    this.nativeHooks = null;
  }

  /**
   * Start tracking global mouse events
   */
  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    // Try to use native hooks if available and enabled
    if (this.config.enableNativeHooks) {
      this.tryInitNativeHooks();
    }

    // Fall back to polling if native hooks not available
    if (!this.nativeHooks) {
      this.startPolling();
    }

    this.emit('started');
  }

  /**
   * Stop tracking global mouse events
   */
  stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;

    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }

    if (this.nativeHooks) {
      this.stopNativeHooks();
    }

    this.emit('stopped');
  }

  /**
   * Start polling for mouse position
   */
  private startPolling(): void {
    // Get initial position
    const initial = screen.getCursorScreenPoint();
    this.lastPosition = { x: initial.x, y: initial.y };

    this.pollInterval = setInterval(() => {
      this.pollMouseState();
    }, this.config.pollRate);
  }

  /**
   * Poll current mouse state
   */
  private pollMouseState(): void {
    const point = screen.getCursorScreenPoint();

    // Check for movement
    if (point.x !== this.lastPosition.x || point.y !== this.lastPosition.y) {
      const event = this.createPositionEvent(point);
      this.emit(MouseEventTypes.MOUSE_MOVE, event);
      this.lastPosition = { x: point.x, y: point.y };
    }
  }

  /**
   * Create a position event object
   */
  private createPositionEvent(point: Point): GlobalMouseEvent {
    const display = screen.getDisplayNearestPoint(point);

    return {
      type: MouseEventTypes.MOUSE_MOVE,
      timestamp: Date.now(),
      position: { x: point.x, y: point.y },
      screenPosition: { x: point.x, y: point.y },
      previousPosition: { ...this.lastPosition },
      delta: {
        x: point.x - this.lastPosition.x,
        y: point.y - this.lastPosition.y,
      },
      display: {
        id: display.id,
        bounds: display.bounds,
        scaleFactor: display.scaleFactor,
      },
    };
  }

  /**
   * Try to initialize native hooks (iohook, robotjs, etc.)
   */
  private tryInitNativeHooks(): boolean {
    try {
      // Try iohook first (best for global hooks)
      const ioHook = require('iohook');
      this.initIoHook(ioHook);
      return true;
    } catch (e) {
      // iohook not available
    }

    try {
      // Try robotjs as fallback
      const robot = require('robotjs');
      this.initRobotJs(robot);
      return true;
    } catch (e) {
      // robotjs not available
    }

    console.log('Native mouse hooks not available, using polling');
    return false;
  }

  /**
   * Initialize iohook for native global hooks
   */
  private initIoHook(ioHook: any): void {
    this.nativeHooks = ioHook;

    ioHook.on('mousemove', (event: any) => {
      const mouseEvent: GlobalMouseEvent = {
        type: MouseEventTypes.MOUSE_MOVE,
        timestamp: Date.now(),
        position: { x: event.x, y: event.y },
        screenPosition: { x: event.x, y: event.y },
        previousPosition: { ...this.lastPosition },
        delta: {
          x: event.x - this.lastPosition.x,
          y: event.y - this.lastPosition.y,
        },
      };
      this.lastPosition = { x: event.x, y: event.y };
      this.emit(MouseEventTypes.MOUSE_MOVE, mouseEvent);
    });

    ioHook.on('mousedown', (event: any) => {
      const button = this.ioHookButtonToStandard(event.button);
      this.lastButtons.add(button);
      this.emit(MouseEventTypes.MOUSE_DOWN, {
        type: MouseEventTypes.MOUSE_DOWN,
        timestamp: Date.now(),
        position: { x: event.x, y: event.y },
        screenPosition: { x: event.x, y: event.y },
        previousPosition: { ...this.lastPosition },
        delta: { x: 0, y: 0 },
        button,
        buttonName: ButtonNames[button],
      });
    });

    ioHook.on('mouseup', (event: any) => {
      const button = this.ioHookButtonToStandard(event.button);
      this.lastButtons.delete(button);
      this.emit(MouseEventTypes.MOUSE_UP, {
        type: MouseEventTypes.MOUSE_UP,
        timestamp: Date.now(),
        position: { x: event.x, y: event.y },
        screenPosition: { x: event.x, y: event.y },
        previousPosition: { ...this.lastPosition },
        delta: { x: 0, y: 0 },
        button,
        buttonName: ButtonNames[button],
      });

      // Also emit click
      this.emit(MouseEventTypes.CLICK, {
        type: MouseEventTypes.CLICK,
        timestamp: Date.now(),
        position: { x: event.x, y: event.y },
        screenPosition: { x: event.x, y: event.y },
        previousPosition: { ...this.lastPosition },
        delta: { x: 0, y: 0 },
        button,
        buttonName: ButtonNames[button],
      });
    });

    ioHook.on('mousewheel', (event: any) => {
      this.emit(MouseEventTypes.SCROLL, {
        type: MouseEventTypes.SCROLL,
        timestamp: Date.now(),
        position: { x: event.x, y: event.y },
        screenPosition: { x: event.x, y: event.y },
        previousPosition: { ...this.lastPosition },
        delta: { x: 0, y: 0 },
        scrollDelta: { x: 0, y: event.rotation > 0 ? -1 : 1 },
      });
    });

    ioHook.start();
  }

  /**
   * Convert iohook button codes to standard
   */
  private ioHookButtonToStandard(button: number): number {
    // iohook: 1=left, 2=right, 3=middle
    const mapping: Record<number, number> = { 1: 0, 2: 2, 3: 1 };
    return mapping[button] !== undefined ? mapping[button] : button;
  }

  /**
   * Initialize robotjs for polling-based tracking
   */
  private initRobotJs(robot: any): void {
    this.nativeHooks = robot;
    // robotjs doesn't have event hooks, so we still use polling
    this.startPolling();
  }

  /**
   * Stop native hooks
   */
  private stopNativeHooks(): void {
    if (this.nativeHooks && this.nativeHooks.stop) {
      this.nativeHooks.stop();
    }
    this.nativeHooks = null;
  }

  /**
   * Get current cursor position
   */
  getPosition(): Point {
    const point = screen.getCursorScreenPoint();
    return { x: point.x, y: point.y };
  }

  /**
   * Check if cursor is inside a bounding box
   */
  isInsideBbox(bbox: BBox): boolean {
    const pos = this.getPosition();
    const [x1, y1, x2, y2] = bbox;
    return pos.x >= x1 && pos.x <= x2 && pos.y >= y1 && pos.y <= y2;
  }

  /**
   * Wait for cursor to enter a bounding box
   */
  waitForEnterBbox(bbox: BBox, timeout = 30000): Promise<Point> {
    return new Promise((resolve, reject) => {
      if (this.isInsideBbox(bbox)) {
        resolve(this.getPosition());
        return;
      }

      const timeoutId = setTimeout(() => {
        this.off(MouseEventTypes.MOUSE_MOVE, checkPosition);
        reject(new Error('Timeout waiting for cursor to enter region'));
      }, timeout);

      const checkPosition = (event: GlobalMouseEvent) => {
        if (this.isInsideBbox(bbox)) {
          clearTimeout(timeoutId);
          this.off(MouseEventTypes.MOUSE_MOVE, checkPosition);
          resolve(event.position);
        }
      };

      this.on(MouseEventTypes.MOUSE_MOVE, checkPosition);
    });
  }
}
