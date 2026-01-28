/**
 * Preload script for spotlight window
 * Simpler than overlay - only needs mouse events
 */

import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../shared/constants/channels';

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
