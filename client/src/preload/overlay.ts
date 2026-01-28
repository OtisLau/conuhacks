/**
 * Preload script for overlay window
 * Exposes type-safe IPC APIs to renderer process
 */

import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../shared/constants/channels';
import type { ElectronAPI } from '../shared/types/ipc.types';

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

  // Window control
  send: (channel: string, data: unknown) => {
    ipcRenderer.send(channel, data);
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

console.log('Overlay preload script loaded');
