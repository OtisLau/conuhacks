/**
 * Coordinate calculation utilities
 * Handles DPR (Device Pixel Ratio) and menu bar offset calculations
 */

import type { MenuBarOffset, MousePosition } from '../types/mouse.types';

/**
 * Get the device pixel ratio
 * Note: This function is meant for renderer process use only
 */
export function getDevicePixelRatio(): number {
  // Check if we're in a browser environment
  if (typeof globalThis !== 'undefined' && 'devicePixelRatio' in globalThis) {
    return (globalThis as any).devicePixelRatio || 1;
  }
  return 1; // Fallback for main process
}

/**
 * Convert logical coordinates to physical pixels
 */
export function toPhysicalPixels(logical: number, dpr: number = getDevicePixelRatio()): number {
  return logical * dpr;
}

/**
 * Convert physical pixels to logical coordinates
 */
export function toLogicalPixels(physical: number, dpr: number = getDevicePixelRatio()): number {
  return physical / dpr;
}

/**
 * Adjust coordinates for menu bar offset
 */
export function adjustForMenuBarOffset(
  coords: MousePosition,
  offset: MenuBarOffset,
  dpr: number = getDevicePixelRatio()
): MousePosition {
  return {
    x: coords.x,
    y: coords.y - offset.y * dpr,
  };
}

/**
 * Adjust bbox for menu bar offset
 */
export function adjustBboxForMenuBarOffset(
  bbox: [number, number, number, number],
  offset: MenuBarOffset,
  dpr: number = getDevicePixelRatio()
): [number, number, number, number] {
  const offsetY = offset.y * dpr;
  return [bbox[0], bbox[1] - offsetY, bbox[2], bbox[3] - offsetY];
}
