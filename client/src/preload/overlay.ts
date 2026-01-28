/**
 * Preload script for overlay window
 * Exposes type-safe IPC APIs to renderer process
 */

import { contextBridge, ipcRenderer } from 'electron';
import type { ElectronAPI } from '../shared/types/ipc.types';

// Inline IPC_CHANNELS to avoid code splitting in preload
const IPC_CHANNELS = {
  START_TUTORIAL: 'start-tutorial',
  CANCEL_TUTORIAL: 'cancel-tutorial',
  TARGET_CLICKED: 'target-clicked',
  TUTORIAL_STATE_CHANGE: 'tutorial-state-change',
  SET_SPOTLIGHT_POSITION: 'set-spotlight-position',
  GLOBAL_MOUSE_MOVE: 'global-mouse-move',
  GLOBAL_MOUSE_DOWN: 'global-mouse-down',
  GLOBAL_MOUSE_UP: 'global-mouse-up',
  GLOBAL_CLICK: 'global-click',
  GLOBAL_SCROLL: 'global-scroll',
  SET_CLICK_THROUGH: 'set-click-through',
  // Backend status channels
  BACKEND_STATUS: 'backend:status',
  BACKEND_READINESS: 'backend:readiness',
  CHECK_BACKEND_HEALTH: 'backend:check-health',
  // Step control channels
  STEP_RETRY: 'tutorial:step-retry',
  STEP_SKIP: 'tutorial:step-skip',
} as const;

const electronAPI: ElectronAPI = {
  // Tutorial commands
  startTutorial: (task: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.START_TUTORIAL, task),

  cancelTutorial: () => {
    ipcRenderer.send(IPC_CHANNELS.CANCEL_TUTORIAL);
  },

  notifyTargetClicked: () => {
    ipcRenderer.send(IPC_CHANNELS.TARGET_CLICKED);
  },

  // Tutorial state listeners
  onTutorialStateChange: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, state: any) => callback(state);
    ipcRenderer.on(IPC_CHANNELS.TUTORIAL_STATE_CHANGE, listener);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.TUTORIAL_STATE_CHANGE, listener);
    };
  },

  onSetSpotlightPosition: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, coords: any) => callback(coords);
    ipcRenderer.on(IPC_CHANNELS.SET_SPOTLIGHT_POSITION, listener);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.SET_SPOTLIGHT_POSITION, listener);
    };
  },

  // Mouse event listeners
  onGlobalMouseMove: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, event: any) => callback(event);
    ipcRenderer.on(IPC_CHANNELS.GLOBAL_MOUSE_MOVE, listener);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.GLOBAL_MOUSE_MOVE, listener);
    };
  },

  onGlobalMouseDown: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, event: any) => callback(event);
    ipcRenderer.on(IPC_CHANNELS.GLOBAL_MOUSE_DOWN, listener);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.GLOBAL_MOUSE_DOWN, listener);
    };
  },

  onGlobalMouseUp: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, event: any) => callback(event);
    ipcRenderer.on(IPC_CHANNELS.GLOBAL_MOUSE_UP, listener);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.GLOBAL_MOUSE_UP, listener);
    };
  },

  onGlobalClick: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, event: any) => callback(event);
    ipcRenderer.on(IPC_CHANNELS.GLOBAL_CLICK, listener);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.GLOBAL_CLICK, listener);
    };
  },

  onGlobalScroll: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, event: any) => callback(event);
    ipcRenderer.on(IPC_CHANNELS.GLOBAL_SCROLL, listener);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.GLOBAL_SCROLL, listener);
    };
  },

  // Backend status
  checkBackendHealth: () =>
    ipcRenderer.invoke(IPC_CHANNELS.CHECK_BACKEND_HEALTH),

  // Step controls
  retryStep: () => {
    ipcRenderer.send(IPC_CHANNELS.STEP_RETRY);
  },

  skipStep: () => {
    ipcRenderer.send(IPC_CHANNELS.STEP_SKIP);
  },

  onBackendStatus: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, status: any) => callback(status);
    ipcRenderer.on(IPC_CHANNELS.BACKEND_STATUS, listener);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.BACKEND_STATUS, listener);
    };
  },

  onBackendReadiness: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, readiness: any) => callback(readiness);
    ipcRenderer.on(IPC_CHANNELS.BACKEND_READINESS, listener);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.BACKEND_READINESS, listener);
    };
  },

  // Window control
  send: (channel: string, data: unknown) => {
    ipcRenderer.send(channel, data);
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

console.log('Overlay preload script loaded');
