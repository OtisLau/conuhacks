/**
 * IPC channel constants for type-safe communication
 */

export const IPC_CHANNELS = {
  // Tutorial channels
  START_TUTORIAL: 'start-tutorial',
  CANCEL_TUTORIAL: 'cancel-tutorial',
  TARGET_CLICKED: 'target-clicked',
  TUTORIAL_STATE_CHANGE: 'tutorial-state-change',
  SET_SPOTLIGHT_POSITION: 'set-spotlight-position',

  // Mouse event channels
  GLOBAL_MOUSE_MOVE: 'global-mouse-move',
  GLOBAL_MOUSE_DOWN: 'global-mouse-down',
  GLOBAL_MOUSE_UP: 'global-mouse-up',
  GLOBAL_CLICK: 'global-click',
  GLOBAL_SCROLL: 'global-scroll',

  // Window control channels
  SET_CLICK_THROUGH: 'set-click-through',
  SET_GLOBAL_CLICK_THROUGH: 'set-global-click-through',
  FORWARD_CLICK: 'forward-click',
  QUIT_APP: 'quit-app',

  // Highlight channels (legacy, may not be needed)
  HIGHLIGHT: 'highlight',
  CLEAR_HIGHLIGHT: 'clear-highlight',

  // Backend connection channels
  BACKEND_STATUS: 'backend:status',
  BACKEND_READINESS: 'backend:readiness',
  CHECK_BACKEND_HEALTH: 'backend:check-health',

  // Step control channels
  STEP_RETRY: 'tutorial:step-retry',
  STEP_SKIP: 'tutorial:step-skip',
} as const;

export type IpcChannel = typeof IPC_CHANNELS[keyof typeof IPC_CHANNELS];
