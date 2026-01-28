/**
 * Mouse event type definitions
 */

export interface MousePosition {
  x: number;
  y: number;
}

export interface MouseEvent {
  position: MousePosition;
  button?: number;
  timestamp: number;
  clicks?: number;
}

export interface MouseDownEvent extends MouseEvent {
  button: number;
}

export interface MouseUpEvent extends MouseEvent {
  button: number;
}

export interface MouseClickEvent extends MouseEvent {
  button: number;
  clicks: number;
}

export interface MouseScrollEvent extends MouseEvent {
  rotation?: number;
  direction?: number;
}

export interface MenuBarOffset {
  x: number;
  y: number;
}
