/**
 * Canvas rendering type definitions
 */

export interface BoundingBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface SpotlightCircle {
  x: number;
  y: number;
  radius: number;
  opacity?: number;
}

export interface AnimationState {
  animating: boolean;
  startTime: number;
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  startRadius: number;
  targetRadius: number;
}

export interface CanvasConfig {
  width: number;
  height: number;
  devicePixelRatio: number;
}
