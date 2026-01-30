/**
 * Mouse Tracker
 * Core class for tracking mouse events and position through a transparent overlay
 */

import { screen, Display } from 'electron';
import { MouseEventTypes, MouseButtons, ButtonNames, type MouseEventType, type MouseButton } from './eventTypes';
import type { Point, BBox, MouseEvent } from './helpers';

export interface MouseTrackerOptions {
  hoverDelay?: number;
  longPressDelay?: number;
  doubleClickThreshold?: number;
  moveThreshold?: number;
}

export interface RawMouseEvent {
  button?: number;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  metaKey?: boolean;
  [key: string]: any;
}

export interface TrackedMouseEvent extends MouseEvent {
  screenPosition: Point;
  previousPosition: Point;
  delta: Point;
  button: number | null;
  buttonName: string | null;
  buttons: number[];
  modifiers: {
    ctrl: boolean;
    alt: boolean;
    shift: boolean;
    meta: boolean;
  };
  display: {
    id: number;
    bounds: Electron.Rectangle;
    scaleFactor: number;
  };
  isDragging: boolean;
  dragStartPosition: Point | null;
  raw: RawMouseEvent;
}

type EventCallback = (event: TrackedMouseEvent) => void;

export class MouseTracker {
  private listeners: Map<string, Set<EventCallback>>;
  private position: Point;
  private previousPosition: Point;
  public isTracking: boolean;
  private isDragging: boolean;
  private dragStartPosition: Point | null;
  private pressedButtons: Set<number>;
  private config: Required<MouseTrackerOptions>;
  private hoverTimer: NodeJS.Timeout | null;
  private longPressTimer: NodeJS.Timeout | null;
  private lastClickTime: number;
  private lastClickPosition: Point;
  private clickCount: number;

  constructor(options: MouseTrackerOptions = {}) {
    this.listeners = new Map();
    this.position = { x: 0, y: 0 };
    this.previousPosition = { x: 0, y: 0 };
    this.isTracking = false;
    this.isDragging = false;
    this.dragStartPosition = null;
    this.pressedButtons = new Set();

    // Configuration
    this.config = {
      hoverDelay: options.hoverDelay || 500,
      longPressDelay: options.longPressDelay || 800,
      doubleClickThreshold: options.doubleClickThreshold || 300,
      moveThreshold: options.moveThreshold || 2,
    };

    // Timers
    this.hoverTimer = null;
    this.longPressTimer = null;
    this.lastClickTime = 0;
    this.lastClickPosition = { x: 0, y: 0 };
    this.clickCount = 0;
  }

  /**
   * Create a mouse event object with all relevant data
   */
  createEvent(type: MouseEventType, rawEvent: RawMouseEvent = {}): TrackedMouseEvent {
    const display = screen.getDisplayNearestPoint(this.position);

    return {
      type,
      timestamp: Date.now(),
      position: { ...this.position },
      screenPosition: {
        x: this.position.x,
        y: this.position.y,
      },
      previousPosition: { ...this.previousPosition },
      delta: {
        x: this.position.x - this.previousPosition.x,
        y: this.position.y - this.previousPosition.y,
      },
      button: rawEvent.button !== undefined ? rawEvent.button : null,
      buttonName: rawEvent.button !== undefined ? ButtonNames[rawEvent.button] : null,
      buttons: Array.from(this.pressedButtons),
      modifiers: {
        ctrl: rawEvent.ctrlKey || false,
        alt: rawEvent.altKey || false,
        shift: rawEvent.shiftKey || false,
        meta: rawEvent.metaKey || false,
      },
      display: {
        id: display.id,
        bounds: display.bounds,
        scaleFactor: display.scaleFactor,
      },
      isDragging: this.isDragging,
      dragStartPosition: this.dragStartPosition ? { ...this.dragStartPosition } : null,
      raw: rawEvent,
    };
  }

  /**
   * Subscribe to a mouse event type
   */
  on(eventType: MouseEventType, callback: EventCallback): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(callback);
    return () => this.off(eventType, callback);
  }

  /**
   * Subscribe to multiple event types at once
   */
  onMany(eventTypes: MouseEventType[], callback: EventCallback): () => void {
    const unsubscribes = eventTypes.map(type => this.on(type, callback));
    return () => unsubscribes.forEach(unsub => unsub());
  }

  /**
   * Subscribe to all events
   */
  onAny(callback: EventCallback): () => void {
    return this.onMany(Object.values(MouseEventTypes) as MouseEventType[], callback);
  }

  /**
   * Unsubscribe from a mouse event type
   */
  off(eventType: MouseEventType, callback: EventCallback): void {
    if (this.listeners.has(eventType)) {
      this.listeners.get(eventType)!.delete(callback);
    }
  }

  /**
   * Emit an event to all listeners
   */
  emit(eventType: MouseEventType, event: TrackedMouseEvent): void {
    if (this.listeners.has(eventType)) {
      this.listeners.get(eventType)!.forEach(callback => {
        try {
          callback(event);
        } catch (err) {
          console.error(`Error in mouse event listener for ${eventType}:`, err);
        }
      });
    }
  }

  /**
   * Update mouse position and emit movement events
   */
  updatePosition(x: number, y: number, rawEvent: RawMouseEvent = {}): void {
    this.previousPosition = { ...this.position };
    this.position = { x, y };

    const dx = Math.abs(x - this.previousPosition.x);
    const dy = Math.abs(y - this.previousPosition.y);

    // Only emit if movement exceeds threshold
    if (dx > this.config.moveThreshold || dy > this.config.moveThreshold) {
      // Clear hover timer on movement
      this.clearHoverTimer();

      const event = this.createEvent(MouseEventTypes.MOUSE_MOVE, rawEvent);
      this.emit(MouseEventTypes.MOUSE_MOVE, event);

      // Handle drag
      if (this.isDragging) {
        this.emit(MouseEventTypes.DRAG, this.createEvent(MouseEventTypes.DRAG, rawEvent));
      }

      // Start hover timer
      this.startHoverTimer(rawEvent);
    }
  }

  /**
   * Handle mouse down event
   */
  handleMouseDown(button: number, rawEvent: RawMouseEvent = {}): void {
    this.pressedButtons.add(button);

    const event = this.createEvent(MouseEventTypes.MOUSE_DOWN, { ...rawEvent, button });
    this.emit(MouseEventTypes.MOUSE_DOWN, event);

    // Start long press timer
    this.startLongPressTimer(button, rawEvent);

    // Start drag tracking
    if (button === MouseButtons.LEFT) {
      this.dragStartPosition = { ...this.position };
    }
  }

  /**
   * Handle mouse up event
   */
  handleMouseUp(button: number, rawEvent: RawMouseEvent = {}): void {
    this.pressedButtons.delete(button);
    this.clearLongPressTimer();

    const event = this.createEvent(MouseEventTypes.MOUSE_UP, { ...rawEvent, button });
    this.emit(MouseEventTypes.MOUSE_UP, event);

    // Handle drag end
    if (this.isDragging && button === MouseButtons.LEFT) {
      this.isDragging = false;
      this.emit(MouseEventTypes.DRAG_END, this.createEvent(MouseEventTypes.DRAG_END, { ...rawEvent, button }));
      this.dragStartPosition = null;
    }

    // Detect click type
    this.detectClick(button, rawEvent);
  }

  /**
   * Detect click, double-click based on timing
   */
  private detectClick(button: number, rawEvent: RawMouseEvent): void {
    const now = Date.now();
    const timeSinceLastClick = now - this.lastClickTime;
    const distanceFromLastClick = Math.sqrt(
      Math.pow(this.position.x - this.lastClickPosition.x, 2) +
        Math.pow(this.position.y - this.lastClickPosition.y, 2)
    );

    // Check for double click (same position, within threshold)
    if (timeSinceLastClick < this.config.doubleClickThreshold && distanceFromLastClick < 10) {
      this.clickCount++;
    } else {
      this.clickCount = 1;
    }

    this.lastClickTime = now;
    this.lastClickPosition = { ...this.position };

    // Determine event type
    let eventType: MouseEventType;
    if (this.clickCount >= 2 && button === MouseButtons.LEFT) {
      eventType = MouseEventTypes.DOUBLE_CLICK;
      this.clickCount = 0; // Reset after double click
    } else if (button === MouseButtons.RIGHT) {
      eventType = MouseEventTypes.RIGHT_CLICK;
    } else if (button === MouseButtons.MIDDLE) {
      eventType = MouseEventTypes.MIDDLE_CLICK;
    } else {
      eventType = MouseEventTypes.CLICK;
    }

    const event = this.createEvent(eventType, { ...rawEvent, button });
    this.emit(eventType, event);
  }

  /**
   * Handle scroll events
   */
  handleScroll(deltaX: number, deltaY: number, rawEvent: RawMouseEvent = {}): void {
    const scrollEvent = {
      ...this.createEvent(MouseEventTypes.SCROLL, rawEvent),
      scrollDelta: { x: deltaX, y: deltaY },
    };

    this.emit(MouseEventTypes.SCROLL, scrollEvent);

    // Emit directional scroll
    if (deltaY < 0) {
      this.emit(MouseEventTypes.SCROLL_UP, scrollEvent);
    } else if (deltaY > 0) {
      this.emit(MouseEventTypes.SCROLL_DOWN, scrollEvent);
    }
  }

  /**
   * Start hover detection timer
   */
  private startHoverTimer(rawEvent: RawMouseEvent): void {
    this.clearHoverTimer();
    this.hoverTimer = setTimeout(() => {
      const event = this.createEvent(MouseEventTypes.HOVER, rawEvent);
      this.emit(MouseEventTypes.HOVER, event);
    }, this.config.hoverDelay);
  }

  /**
   * Clear hover timer
   */
  private clearHoverTimer(): void {
    if (this.hoverTimer) {
      clearTimeout(this.hoverTimer);
      this.hoverTimer = null;
    }
  }

  /**
   * Start long press detection timer
   */
  private startLongPressTimer(button: number, rawEvent: RawMouseEvent): void {
    this.clearLongPressTimer();
    this.longPressTimer = setTimeout(() => {
      const event = this.createEvent(MouseEventTypes.LONG_PRESS, { ...rawEvent, button });
      this.emit(MouseEventTypes.LONG_PRESS, event);
    }, this.config.longPressDelay);
  }

  /**
   * Clear long press timer
   */
  private clearLongPressTimer(): void {
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
  }

  /**
   * Check if mouse moved enough to start drag
   */
  checkDragStart(rawEvent: RawMouseEvent): void {
    if (this.dragStartPosition && !this.isDragging && this.pressedButtons.has(MouseButtons.LEFT)) {
      const dx = Math.abs(this.position.x - this.dragStartPosition.x);
      const dy = Math.abs(this.position.y - this.dragStartPosition.y);

      if (dx > 5 || dy > 5) {
        this.isDragging = true;
        this.clearLongPressTimer();
        this.emit(MouseEventTypes.DRAG_START, this.createEvent(MouseEventTypes.DRAG_START, rawEvent));
      }
    }
  }

  /**
   * Get current mouse position
   */
  getPosition(): Point {
    return { ...this.position };
  }

  /**
   * Get position relative to a bounding box
   */
  getPositionRelativeTo(bbox: BBox): { x: number; y: number; isInside: boolean } {
    const [x1, y1] = bbox;
    return {
      x: this.position.x - x1,
      y: this.position.y - y1,
      isInside: this.isInsideBbox(bbox),
    };
  }

  /**
   * Check if current position is inside a bounding box
   */
  isInsideBbox(bbox: BBox): boolean {
    const [x1, y1, x2, y2] = bbox;
    return (
      this.position.x >= x1 && this.position.x <= x2 && this.position.y >= y1 && this.position.y <= y2
    );
  }

  /**
   * Clean up timers
   */
  destroy(): void {
    this.clearHoverTimer();
    this.clearLongPressTimer();
    this.listeners.clear();
  }
}
