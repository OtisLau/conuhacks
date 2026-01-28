/**
 * Mouse Event Helpers
 * Utility functions for common mouse event operations
 */

import { screen, Display } from 'electron';
import type { MouseEventType } from './eventTypes';

export interface Point {
  x: number;
  y: number;
}

export type BBox = [number, number, number, number]; // [x1, y1, x2, y2]

export interface MouseEvent {
  type: MouseEventType;
  timestamp: number;
  position: Point;
  button?: number | null;
  buttonName?: string | null;
  modifiers?: {
    ctrl: boolean;
    alt: boolean;
    shift: boolean;
    meta: boolean;
  };
  scrollDelta?: {
    x: number;
    y: number;
  };
  [key: string]: any;
}

/**
 * Calculate distance between two points
 */
export function distance(p1: Point, p2: Point): number {
  return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
}

/**
 * Check if a point is inside a bounding box
 */
export function isPointInBbox(point: Point, bbox: BBox): boolean {
  const [x1, y1, x2, y2] = bbox;
  return point.x >= x1 && point.x <= x2 && point.y >= y1 && point.y <= y2;
}

/**
 * Get the center point of a bounding box
 */
export function getBboxCenter(bbox: BBox): Point {
  const [x1, y1, x2, y2] = bbox;
  return {
    x: x1 + (x2 - x1) / 2,
    y: y1 + (y2 - y1) / 2,
  };
}

/**
 * Expand a bounding box by a given amount
 */
export function expandBbox(bbox: BBox, amount: number): BBox {
  const [x1, y1, x2, y2] = bbox;
  return [x1 - amount, y1 - amount, x2 + amount, y2 + amount];
}

/**
 * Get the display containing a point
 */
export function getDisplayAtPoint(point: Point): Display {
  return screen.getDisplayNearestPoint(point);
}

/**
 * Convert screen coordinates to display-relative coordinates
 */
export function screenToDisplayCoords(point: Point): { x: number; y: number; display: Display } {
  const display = screen.getDisplayNearestPoint(point);
  return {
    x: point.x - display.bounds.x,
    y: point.y - display.bounds.y,
    display,
  };
}

/**
 * Convert display-relative coordinates to screen coordinates
 */
export function displayToScreenCoords(point: Point, displayId: number): Point {
  const displays = screen.getAllDisplays();
  const display = displays.find(d => d.id === displayId) || screen.getPrimaryDisplay();
  return {
    x: point.x + display.bounds.x,
    y: point.y + display.bounds.y,
  };
}

/**
 * Get normalized position (0-1) relative to a bounding box
 */
export function getNormalizedPosition(point: Point, bbox: BBox): Point {
  const [x1, y1, x2, y2] = bbox;
  const width = x2 - x1;
  const height = y2 - y1;

  return {
    x: width > 0 ? (point.x - x1) / width : 0,
    y: height > 0 ? (point.y - y1) / height : 0,
  };
}

export interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Determine which region of the screen a point is in
 */
export function getScreenRegion(point: Point, screenBounds: Rectangle | null = null): string {
  const bounds = screenBounds || screen.getPrimaryDisplay().bounds;
  const { width, height } = bounds;

  // Normalize point to 0-1 range
  const nx = (point.x - bounds.x) / width;
  const ny = (point.y - bounds.y) / height;

  // Simplified region definitions
  const regions: Record<string, { bounds: [number, number, number, number] }> = {
    menu_bar: { bounds: [0, 0, 1, 0.04] },
    dock: { bounds: [0, 0.95, 1, 1] },
  };

  for (const [name, region] of Object.entries(regions)) {
    const [x1, y1, x2, y2] = region.bounds;
    if (nx >= x1 && nx <= x2 && ny >= y1 && ny <= y2) {
      return name;
    }
  }

  return 'unknown';
}

/**
 * Create a click event filter that only triggers for clicks in a specific region
 */
export function createRegionFilter(
  region: string,
  screenBounds: Rectangle | null = null
): (event: MouseEvent) => boolean {
  return (event: MouseEvent) => {
    return getScreenRegion(event.position, screenBounds) === region;
  };
}

/**
 * Create a click event filter that only triggers for clicks in a bounding box
 */
export function createBboxFilter(bbox: BBox): (event: MouseEvent) => boolean {
  return (event: MouseEvent) => {
    return isPointInBbox(event.position, bbox);
  };
}

/**
 * Debounce a mouse event handler
 */
export function debounceMouseHandler<T extends MouseEvent>(
  handler: (event: T) => void,
  delay = 100
): (event: T) => void {
  let timeoutId: NodeJS.Timeout | null = null;
  let lastEvent: T | null = null;

  return (event: T) => {
    lastEvent = event;

    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      if (lastEvent) {
        handler(lastEvent);
      }
      timeoutId = null;
    }, delay);
  };
}

/**
 * Throttle a mouse event handler
 */
export function throttleMouseHandler<T extends MouseEvent>(
  handler: (event: T) => void,
  limit = 16
): (event: T) => void {
  let lastCall = 0;

  return (event: T) => {
    const now = Date.now();
    if (now - lastCall >= limit) {
      lastCall = now;
      handler(event);
    }
  };
}

export interface GestureResult {
  type: 'swipe';
  direction: 'left' | 'right' | 'up' | 'down';
  distance: number;
  duration: number;
  velocity: number;
}

export interface GestureDetectorOptions {
  swipeThreshold?: number;
  swipeTimeout?: number;
}

export interface GestureDetector {
  onDragStart(event: MouseEvent): void;
  onDragEnd(event: MouseEvent): GestureResult | null;
}

/**
 * Create a gesture detector for common patterns
 */
export function createGestureDetector(options: GestureDetectorOptions = {}): GestureDetector {
  const { swipeThreshold = 100, swipeTimeout = 300 } = options;

  let startPosition: Point | null = null;
  let startTime: number | null = null;

  return {
    onDragStart(event: MouseEvent) {
      startPosition = { ...event.position };
      startTime = Date.now();
    },

    onDragEnd(event: MouseEvent): GestureResult | null {
      if (!startPosition || !startTime) return null;

      const elapsed = Date.now() - startTime;
      const dx = event.position.x - startPosition.x;
      const dy = event.position.y - startPosition.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      startPosition = null;
      startTime = null;

      // Check for swipe
      if (elapsed < swipeTimeout && dist > swipeThreshold) {
        const angle = Math.atan2(dy, dx) * (180 / Math.PI);

        let direction: 'left' | 'right' | 'up' | 'down';
        if (angle > -45 && angle <= 45) direction = 'right';
        else if (angle > 45 && angle <= 135) direction = 'down';
        else if (angle > -135 && angle <= -45) direction = 'up';
        else direction = 'left';

        return {
          type: 'swipe',
          direction,
          distance: dist,
          duration: elapsed,
          velocity: dist / elapsed,
        };
      }

      return null;
    },
  };
}

/**
 * Format mouse event for logging/debugging
 */
export function formatMouseEvent(event: MouseEvent): string {
  const parts = [
    `[${event.type}]`,
    `pos:(${Math.round(event.position.x)},${Math.round(event.position.y)})`,
  ];

  if (event.button !== null && event.button !== undefined) {
    parts.push(`btn:${event.buttonName || event.button}`);
  }

  if (event.modifiers) {
    const mods = [];
    if (event.modifiers.ctrl) mods.push('ctrl');
    if (event.modifiers.alt) mods.push('alt');
    if (event.modifiers.shift) mods.push('shift');
    if (event.modifiers.meta) mods.push('meta');
    if (mods.length) parts.push(`mods:[${mods.join(',')}]`);
  }

  if (event.scrollDelta) {
    parts.push(`scroll:(${event.scrollDelta.x},${event.scrollDelta.y})`);
  }

  return parts.join(' ');
}

/**
 * Create an event logger for debugging
 */
export function createEventLogger(prefix = 'MOUSE'): (event: MouseEvent) => void {
  return (event: MouseEvent) => {
    console.log(`${prefix}: ${formatMouseEvent(event)}`);
  };
}
