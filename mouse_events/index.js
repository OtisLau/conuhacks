/**
 * CONU Mouse Events Module
 *
 * Provides comprehensive mouse event tracking for transparent overlay windows
 * in Electron applications. Designed to track mouse events while allowing
 * clicks to pass through to underlying applications.
 *
 * Usage:
 *
 * ```javascript
 * const {
 *   OverlayManager,
 *   GlobalMouseHooks,
 *   MouseTracker,
 *   MouseEventTypes,
 *   helpers
 * } = require('./mouse_events');
 *
 * // Create overlay with click-through support
 * const overlay = new OverlayManager();
 * overlay.createOverlay(path.join(__dirname, 'mouse_events/preload.js'));
 *
 * // Listen for clicks
 * overlay.on(MouseEventTypes.CLICK, (event) => {
 *   console.log(`Click at (${event.position.x}, ${event.position.y})`);
 * });
 *
 * // Wait for click in highlighted region
 * const highlightBbox = [100, 200, 300, 250];
 * overlay.highlight(highlightBbox, 'Click here!');
 *
 * try {
 *   const clickEvent = await overlay.waitForClickInBbox(highlightBbox);
 *   console.log('User clicked the highlighted element!');
 * } catch (e) {
 *   console.log('Click timeout');
 * }
 * ```
 */

const MouseTracker = require('./mouseTracker');
const OverlayManager = require('./overlayManager');
const GlobalMouseHooks = require('./globalMouseHooks');
const { MouseEventTypes, MouseButtons, ButtonNames } = require('./eventTypes');
const helpers = require('./helpers');
const rendererUtils = require('./rendererUtils');

module.exports = {
  // Core classes
  MouseTracker,
  OverlayManager,
  GlobalMouseHooks,

  // Event type constants
  MouseEventTypes,
  MouseButtons,
  ButtonNames,

  // Helper functions
  helpers,

  // Renderer-side utilities (for overlay window)
  rendererUtils,

  // Re-export individual helpers for convenience
  ...helpers,
};
