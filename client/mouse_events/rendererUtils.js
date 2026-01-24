/**
 * Renderer-Side Mouse Utilities
 *
 * Helper functions for use in the overlay renderer process.
 * These work with the preload script to provide easy mouse tracking.
 *
 * Usage in overlay.js:
 * ```javascript
 * import { createMouseVisualizer, trackMouseInCanvas } from './mouse_events/rendererUtils.js';
 *
 * const canvas = document.getElementById('overlay-canvas');
 * const visualizer = createMouseVisualizer(canvas);
 * visualizer.start();
 * ```
 */

/**
 * Create a mouse position tracker for canvas
 */
function createCanvasTracker(canvas) {
  let position = { x: 0, y: 0 };
  let isTracking = false;

  const tracker = {
    get position() {
      return { ...position };
    },

    get isTracking() {
      return isTracking;
    },

    start() {
      if (isTracking) return;
      isTracking = true;

      // Use the exposed mouseEvents API from preload
      if (window.mouseEvents) {
        window.mouseEvents.onMouseMove((data) => {
          position = { x: data.x, y: data.y };
        });
      } else {
        // Fallback to direct DOM events
        canvas.addEventListener('mousemove', (e) => {
          position = { x: e.clientX, y: e.clientY };
        });
      }
    },

    stop() {
      isTracking = false;
      if (window.mouseEvents) {
        window.mouseEvents.removeAllListeners();
      }
    },

    getCanvasPosition() {
      const rect = canvas.getBoundingClientRect();
      return {
        x: position.x - rect.left,
        y: position.y - rect.top,
      };
    },
  };

  return tracker;
}

/**
 * Create a mouse cursor visualizer (for debugging)
 */
function createMouseVisualizer(canvas, options = {}) {
  const ctx = canvas.getContext('2d');
  const tracker = createCanvasTracker(canvas);

  const config = {
    color: options.color || 'rgba(0, 255, 0, 0.5)',
    size: options.size || 20,
    showCoords: options.showCoords !== false,
    ...options,
  };

  let animationId = null;

  function draw() {
    if (!tracker.isTracking) return;

    const pos = tracker.getCanvasPosition();

    // Clear previous frame (if not persistent)
    if (!config.persistent) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    // Draw cursor indicator
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, config.size / 2, 0, Math.PI * 2);
    ctx.fillStyle = config.color;
    ctx.fill();

    // Draw crosshair
    ctx.strokeStyle = config.color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pos.x - config.size, pos.y);
    ctx.lineTo(pos.x + config.size, pos.y);
    ctx.moveTo(pos.x, pos.y - config.size);
    ctx.lineTo(pos.x, pos.y + config.size);
    ctx.stroke();

    // Draw coordinates
    if (config.showCoords) {
      ctx.fillStyle = '#fff';
      ctx.font = '12px monospace';
      ctx.fillText(`(${Math.round(pos.x)}, ${Math.round(pos.y)})`, pos.x + 15, pos.y - 15);
    }

    animationId = requestAnimationFrame(draw);
  }

  return {
    start() {
      tracker.start();
      draw();
    },

    stop() {
      tracker.stop();
      if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
      }
    },

    getTracker() {
      return tracker;
    },
  };
}

/**
 * Check if mouse is inside a bounding box (renderer side)
 */
function isInsideBbox(position, bbox) {
  const [x1, y1, x2, y2] = bbox;
  return position.x >= x1 && position.x <= x2 && position.y >= y1 && position.y <= y2;
}

/**
 * Create a click detector for a specific region
 */
function createClickDetector(bbox, callback) {
  if (!window.mouseEvents) {
    console.warn('mouseEvents API not available. Make sure preload.js is loaded.');
    return { destroy: () => {} };
  }

  const handler = (event) => {
    if (isInsideBbox({ x: event.x, y: event.y }, bbox)) {
      callback(event);
    }
  };

  window.mouseEvents.onClick(handler);

  return {
    destroy() {
      // Note: Would need a more sophisticated listener management for proper cleanup
    },
  };
}

/**
 * Draw a highlight box with pulsing animation
 */
function drawHighlightBox(ctx, bbox, options = {}) {
  const [x1, y1, x2, y2] = bbox;
  const width = x2 - x1;
  const height = y2 - y1;

  const {
    color = '#00ff00',
    pulsePhase = 0,
    lineWidth = 3,
    padding = 5,
    glowSize = 10,
  } = options;

  const pulse = Math.sin(pulsePhase) * 0.3 + 0.7;
  const glow = glowSize + Math.sin(pulsePhase) * 5;

  // Draw glow
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = glow;
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.globalAlpha = pulse;
  ctx.strokeRect(x1 - padding, y1 - padding, width + padding * 2, height + padding * 2);
  ctx.restore();

  // Draw inner fill
  ctx.fillStyle = `${color}1a`; // 10% opacity
  ctx.fillRect(x1, y1, width, height);
}

/**
 * Draw instruction tooltip
 */
function drawTooltip(ctx, text, position, options = {}) {
  const {
    backgroundColor = 'rgba(0, 0, 0, 0.85)',
    textColor = '#ffffff',
    font = '14px -apple-system, BlinkMacSystemFont, sans-serif',
    padding = 10,
    arrowSize = 10,
    maxWidth = 300,
  } = options;

  ctx.font = font;

  // Measure text
  const metrics = ctx.measureText(text);
  const textWidth = Math.min(metrics.width, maxWidth);
  const textHeight = 20;

  const boxWidth = textWidth + padding * 2;
  const boxHeight = textHeight + padding * 2;
  const boxX = position.x - boxWidth / 2;
  const boxY = position.y + arrowSize;

  // Draw arrow
  ctx.fillStyle = backgroundColor;
  ctx.beginPath();
  ctx.moveTo(position.x, position.y);
  ctx.lineTo(position.x - arrowSize, position.y + arrowSize);
  ctx.lineTo(position.x + arrowSize, position.y + arrowSize);
  ctx.closePath();
  ctx.fill();

  // Draw box
  ctx.fillStyle = backgroundColor;
  ctx.beginPath();
  ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 6);
  ctx.fill();

  // Draw text
  ctx.fillStyle = textColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, position.x, boxY + boxHeight / 2, maxWidth);
}

// Export for ES modules (renderer)
if (typeof window !== 'undefined') {
  window.mouseRendererUtils = {
    createCanvasTracker,
    createMouseVisualizer,
    isInsideBbox,
    createClickDetector,
    drawHighlightBox,
    drawTooltip,
  };
}

// Export for CommonJS (if used in Node context)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    createCanvasTracker,
    createMouseVisualizer,
    isInsideBbox,
    createClickDetector,
    drawHighlightBox,
    drawTooltip,
  };
}
