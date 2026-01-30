/**
 * Window type augmentation for renderer process
 * Provides TypeScript types for window.electronAPI
 *
 * This file ensures that TypeScript knows about the electronAPI
 * exposed via contextBridge in the preload script.
 */

import type { ElectronAPI } from '../shared/types/ipc.types';

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
