/**
 * Mouse Event Helpers
 * Utility functions for common mouse event operations
 */

const { screen } = require('electron');
const { MouseEventTypes } = require('./eventTypes');

/**
 * Calculate distance between two points
 */
function distance(p1, p2) {
  return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
}

/**
 * Check if a point is inside a bounding box
 * @param {Object} point - { x, y }
 * @param {Array} bbox - [x1, y1, x2, y2]
 */
function isPointInBbox(point, bbox) {
  const [x1, y1, x2, y2] = bbox;
  return point.x >= x1 && point.x <= x2 && point.y >= y1 && point.y <= y2;
}

/**
 * Get the center point of a bounding box
 * @param {Array} bbox - [x1, y1, x2, y2]
 */
function getBboxCenter(bbox) {
  const [x1, y1, x2, y2] = bbox;
  return {
    x: x1 + (x2 - x1) / 2,
    y: y1 + (y2 - y1) / 2,
  };
}

/**
 * Expand a bounding box by a given amount
 * @param {Array} bbox - [x1, y1, x2, y2]
 * @param {number} amount - Pixels to expand
 */
function expandBbox(bbox, amount) {
  const [x1, y1, x2, y2] = bbox;
  return [x1 - amount, y1 - amount, x2 + amount, y2 + amount];
}

/**
 * Get the display containing a point
 */
function getDisplayAtPoint(point) {
  return screen.getDisplayNearestPoint(point);
}

/**
 * Convert screen coordinates to display-relative coordinates
 */
function screenToDisplayCoords(point) {
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
function displayToScreenCoords(point, displayId) {
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
function getNormalizedPosition(point, bbox) {
  const [x1, y1, x2, y2] = bbox;
  const width = x2 - x1;
  const height = y2 - y1;

  return {
    x: width > 0 ? (point.x - x1) / width : 0,
    y: height > 0 ? (point.y - y1) / height : 0,
  };
}

/**
 * Determine which region of the screen a point is in
 * Based on the region definitions from MASTER_PLAN.md
 */
function getScreenRegion(point, screenBounds = null) {
  const bounds = screenBounds || screen.getPrimaryDisplay().bounds;
  const { width, height } = bounds;

  // Normalize point to 0-1 range
  const nx = (point.x - bounds.x) / width;
  const ny = (point.y - bounds.y) / height;

  // Simplified region definitions - no hardcoded sub-window regions
  const regions = {
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
function createRegionFilter(region, screenBounds = null) {
  return (event) => {
    return getScreenRegion(event.position, screenBounds) === region;
  };
}

/**
 * Create a click event filter that only triggers for clicks in a bounding box
 */
function createBboxFilter(bbox) {
  return (event) => {
    return isPointInBbox(event.position, bbox);
  };
}

/**
 * Debounce a mouse event handler
 */
function debounceMouseHandler(handler, delay = 100) {
  let timeoutId = null;
  let lastEvent = null;

  return (event) => {
    lastEvent = event;

    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      handler(lastEvent);
      timeoutId = null;
    }, delay);
  };
}

/**
 * Throttle a mouse event handler
 */
function throttleMouseHandler(handler, limit = 16) {
  let lastCall = 0;

  return (event) => {
    const now = Date.now();
    if (now - lastCall >= limit) {
      lastCall = now;
      handler(event);
    }
  };
}

/**
 * Create a gesture detector for common patterns
 */
function createGestureDetector(options = {}) {
  const {
    swipeThreshold = 100,
    swipeTimeout = 300,
  } = options;

  let startPosition = null;
  let startTime = null;

  return {
    onDragStart(event) {
      startPosition = { ...event.position };
      startTime = Date.now();
    },

    onDragEnd(event) {
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

        let direction;
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
function formatMouseEvent(event) {
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
function createEventLogger(prefix = 'MOUSE') {
  return (event) => {
    console.log(`${prefix}: ${formatMouseEvent(event)}`);
  };
}

module.exports = {
  distance,
  isPointInBbox,
  getBboxCenter,
  expandBbox,
  getDisplayAtPoint,
  screenToDisplayCoords,
  displayToScreenCoords,
  getNormalizedPosition,
  getScreenRegion,
  createRegionFilter,
  createBboxFilter,
  debounceMouseHandler,
  throttleMouseHandler,
  createGestureDetector,
  formatMouseEvent,
  createEventLogger,
};
