/**
 * Preload script for spotlight window
 * Handles mouse events and spotlight position updates
 */

import { contextBridge, ipcRenderer } from 'electron';

// Inline IPC_CHANNELS to avoid code splitting in preload
const IPC_CHANNELS = {
  GLOBAL_MOUSE_MOVE: 'global-mouse-move',
  SET_SPOTLIGHT_POSITION: 'set-spotlight-position',
  TARGET_CLICKED: 'target-clicked',
} as const;

const electronAPI = {
  // Mouse event listeners
  onGlobalMouseMove: (callback: (event: any) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, event: any) => callback(event);
    ipcRenderer.on(IPC_CHANNELS.GLOBAL_MOUSE_MOVE, listener);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.GLOBAL_MOUSE_MOVE, listener);
    };
  },

  // Spotlight position updates from main process
  onSetSpotlightPosition: (callback: (coords: any) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, coords: any) => callback(coords);
    ipcRenderer.on(IPC_CHANNELS.SET_SPOTLIGHT_POSITION, listener);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.SET_SPOTLIGHT_POSITION, listener);
    };
  },

  // Notify main process when target is clicked
  notifyTargetClicked: () => {
    ipcRenderer.send(IPC_CHANNELS.TARGET_CLICKED);
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

console.log('Spotlight preload script loaded');
