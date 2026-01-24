/**
 * Mouse Tracker
 * Core class for tracking mouse events and position through a transparent overlay
 */

const { screen } = require('electron');
const { MouseEventTypes, MouseButtons, ButtonNames } = require('./eventTypes');

class MouseTracker {
  constructor(options = {}) {
    this.listeners = new Map();
    this.position = { x: 0, y: 0 };
    this.previousPosition = { x: 0, y: 0 };
    this.isTracking = false;
    this.isDragging = false;
    this.dragStartPosition = null;
    this.pressedButtons = new Set();

    // Configuration
    this.config = {
      hoverDelay: options.hoverDelay || 500,        // ms before hover event fires
      longPressDelay: options.longPressDelay || 800, // ms for long press
      doubleClickThreshold: options.doubleClickThreshold || 300, // ms between clicks
      moveThreshold: options.moveThreshold || 2,    // pixels to register as movement
      ...options,
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
  createEvent(type, rawEvent = {}) {
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
  on(eventType, callback) {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType).add(callback);
    return () => this.off(eventType, callback);
  }

  /**
   * Subscribe to multiple event types at once
   */
  onMany(eventTypes, callback) {
    const unsubscribes = eventTypes.map(type => this.on(type, callback));
    return () => unsubscribes.forEach(unsub => unsub());
  }

  /**
   * Subscribe to all events
   */
  onAny(callback) {
    return this.onMany(Object.values(MouseEventTypes), callback);
  }

  /**
   * Unsubscribe from a mouse event type
   */
  off(eventType, callback) {
    if (this.listeners.has(eventType)) {
      this.listeners.get(eventType).delete(callback);
    }
  }

  /**
   * Emit an event to all listeners
   */
  emit(eventType, event) {
    if (this.listeners.has(eventType)) {
      this.listeners.get(eventType).forEach(callback => {
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
  updatePosition(x, y, rawEvent = {}) {
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
  handleMouseDown(button, rawEvent = {}) {
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
  handleMouseUp(button, rawEvent = {}) {
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
  detectClick(button, rawEvent) {
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
    let eventType;
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
  handleScroll(deltaX, deltaY, rawEvent = {}) {
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
  startHoverTimer(rawEvent) {
    this.clearHoverTimer();
    this.hoverTimer = setTimeout(() => {
      const event = this.createEvent(MouseEventTypes.HOVER, rawEvent);
      this.emit(MouseEventTypes.HOVER, event);
    }, this.config.hoverDelay);
  }

  /**
   * Clear hover timer
   */
  clearHoverTimer() {
    if (this.hoverTimer) {
      clearTimeout(this.hoverTimer);
      this.hoverTimer = null;
    }
  }

  /**
   * Start long press detection timer
   */
  startLongPressTimer(button, rawEvent) {
    this.clearLongPressTimer();
    this.longPressTimer = setTimeout(() => {
      const event = this.createEvent(MouseEventTypes.LONG_PRESS, { ...rawEvent, button });
      this.emit(MouseEventTypes.LONG_PRESS, event);
    }, this.config.longPressDelay);
  }

  /**
   * Clear long press timer
   */
  clearLongPressTimer() {
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
  }

  /**
   * Check if mouse moved enough to start drag
   */
  checkDragStart(rawEvent) {
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
  getPosition() {
    return { ...this.position };
  }

  /**
   * Get position relative to a bounding box
   */
  getPositionRelativeTo(bbox) {
    const [x1, y1, x2, y2] = bbox;
    return {
      x: this.position.x - x1,
      y: this.position.y - y1,
      isInside: this.isInsideBbox(bbox),
    };
  }

  /**
   * Check if current position is inside a bounding box
   */
  isInsideBbox(bbox) {
    const [x1, y1, x2, y2] = bbox;
    return (
      this.position.x >= x1 &&
      this.position.x <= x2 &&
      this.position.y >= y1 &&
      this.position.y <= y2
    );
  }

  /**
   * Clean up timers
   */
  destroy() {
    this.clearHoverTimer();
    this.clearLongPressTimer();
    this.listeners.clear();
  }
}

module.exports = MouseTracker;
