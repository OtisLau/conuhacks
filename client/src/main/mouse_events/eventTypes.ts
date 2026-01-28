/**
 * Mouse Event Types
 * Constants for all mouse events the system can track
 */

export const MouseEventTypes = {
  // Click events
  CLICK: 'click',
  DOUBLE_CLICK: 'double-click',
  RIGHT_CLICK: 'right-click',
  MIDDLE_CLICK: 'middle-click',

  // Press/Release events
  MOUSE_DOWN: 'mouse-down',
  MOUSE_UP: 'mouse-up',

  // Movement events
  MOUSE_MOVE: 'mouse-move',
  MOUSE_ENTER: 'mouse-enter',
  MOUSE_LEAVE: 'mouse-leave',

  // Drag events
  DRAG_START: 'drag-start',
  DRAG: 'drag',
  DRAG_END: 'drag-end',

  // Scroll events
  SCROLL: 'scroll',
  SCROLL_UP: 'scroll-up',
  SCROLL_DOWN: 'scroll-down',

  // Special events
  HOVER: 'hover',
  LONG_PRESS: 'long-press',
} as const;

export const MouseButtons = {
  LEFT: 0,
  MIDDLE: 1,
  RIGHT: 2,
  BACK: 3,
  FORWARD: 4,
} as const;

export const ButtonNames: Record<number, string> = {
  0: 'left',
  1: 'middle',
  2: 'right',
  3: 'back',
  4: 'forward',
};

export type MouseEventType = (typeof MouseEventTypes)[keyof typeof MouseEventTypes];
export type MouseButton = (typeof MouseButtons)[keyof typeof MouseButtons];
