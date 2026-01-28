/**
 * CONU Mouse Events Module
 *
 * Provides comprehensive mouse event tracking for transparent overlay windows
 * in Electron applications. Designed to track mouse events while allowing
 * clicks to pass through to underlying applications.
 */

export { MouseTracker, type MouseTrackerOptions, type TrackedMouseEvent } from './MouseTracker';
export { OverlayManager, type OverlayManagerOptions } from './OverlayManager';
export { GlobalMouseHooks, type GlobalMouseHooksOptions, type GlobalMouseEvent } from './GlobalMouseHooks';
export { MouseEventTypes, MouseButtons, ButtonNames, type MouseEventType, type MouseButton } from './eventTypes';
export * as helpers from './helpers';
export type { Point, BBox, MouseEvent } from './helpers';
