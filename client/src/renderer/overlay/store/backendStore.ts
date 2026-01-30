/**
 * Zustand store for backend connection state management
 * Syncs with main process via IPC
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { BackendStatus, BackendReadiness } from '../../../shared/types/ipc.types';

interface BackendStore {
  // State
  status: BackendStatus;
  readiness: BackendReadiness | null;
  isChecking: boolean;

  // Actions
  setStatus: (status: BackendStatus) => void;
  setReadiness: (readiness: BackendReadiness) => void;
  setChecking: (isChecking: boolean) => void;
  checkHealth: () => Promise<void>;
}

const initialState = {
  status: { connected: false } as BackendStatus,
  readiness: null as BackendReadiness | null,
  isChecking: false,
};

export const useBackendStore = create<BackendStore>()(
  devtools(
    (set) => ({
      ...initialState,

      setStatus: (status) => set({ status }, false, 'setStatus'),

      setReadiness: (readiness) => set({ readiness }, false, 'setReadiness'),

      setChecking: (isChecking) => set({ isChecking }, false, 'setChecking'),

      checkHealth: async () => {
        set({ isChecking: true }, false, 'checkHealth/start');
        try {
          const status = await window.electronAPI.checkBackendHealth();
          set({ status, isChecking: false }, false, 'checkHealth/success');
        } catch (error) {
          set({
            status: { connected: false, error: 'Failed to check backend health' },
            isChecking: false
          }, false, 'checkHealth/error');
        }
      },
    }),
    { name: 'BackendStore' }
  )
);

/**
 * Initialize IPC listeners to sync backend status from main process
 */
export function initializeBackendIPC(): void {
  // Listen for backend status changes
  window.electronAPI.onBackendStatus((status) => {
    console.log('Backend status changed:', status);
    useBackendStore.getState().setStatus(status);
  });

  // Listen for backend readiness changes
  window.electronAPI.onBackendReadiness((readiness) => {
    console.log('Backend readiness changed:', readiness);
    useBackendStore.getState().setReadiness(readiness);
  });

  // Trigger initial health check
  useBackendStore.getState().checkHealth();
}
