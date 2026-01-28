/**
 * Preload script for spotlight window
 * Minimal - only needs mouse move events
 */

import { contextBridge, ipcRenderer } from 'electron';

// Inline IPC_CHANNELS to avoid code splitting in preload
const IPC_CHANNELS = {
  GLOBAL_MOUSE_MOVE: 'global-mouse-move',
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
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

console.log('Spotlight preload script loaded');
