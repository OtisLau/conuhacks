/**
 * IPC communication type definitions
 */

import type { TutorialState, TutorialPlan, SpotlightCoords } from './tutorial.types';
import type { MouseEvent, MouseDownEvent, MouseUpEvent, MouseClickEvent, MouseScrollEvent } from './mouse.types';

export interface StartTutorialResponse {
  success: boolean;
  plan?: TutorialPlan;
  error?: string;
}

export interface BackendStatus {
  connected: boolean;
  error?: string;
}

export interface BackendReadiness {
  ready: boolean;
  tesseract: boolean;
  gemini: { available: boolean; error?: string };
}

/**
 * ElectronAPI exposed to renderer process via contextBridge
 */
export interface ElectronAPI {
  // Tutorial commands
  startTutorial: (task: string) => Promise<StartTutorialResponse>;
  cancelTutorial: () => void;
  notifyTargetClicked: () => void;

  // Tutorial state listeners
  onTutorialStateChange: (callback: (state: TutorialState) => void) => () => void;
  onSetSpotlightPosition: (callback: (coords: SpotlightCoords | null) => void) => () => void;

  // Mouse event listeners
  onGlobalMouseMove: (callback: (event: MouseEvent) => void) => () => void;
  onGlobalMouseDown: (callback: (event: MouseDownEvent) => void) => () => void;
  onGlobalMouseUp: (callback: (event: MouseUpEvent) => void) => () => void;
  onGlobalClick: (callback: (event: MouseClickEvent) => void) => () => void;
  onGlobalScroll: (callback: (event: MouseScrollEvent) => void) => () => void;

  // Backend status
  checkBackendHealth: () => Promise<BackendStatus>;
  onBackendStatus: (callback: (status: BackendStatus) => void) => () => void;
  onBackendReadiness: (callback: (readiness: BackendReadiness) => void) => () => void;

  // Window control
  send: (channel: string, data: unknown) => void;
}

/**
 * Window type augmentation for TypeScript
 */
declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
