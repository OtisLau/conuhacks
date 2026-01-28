/**
 * Zustand store for UI state management
 * Controls loading states, animations, and UI preferences
 */

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

interface UIStore {
  // Loading state
  isLoading: boolean;
  loadingMessage: string;

  // Control panel state
  controlPanelPosition: 'top' | 'bottom';
  controlPanelHeight: number;

  // Placeholder text (for typewriter effect)
  placeholderText: string;

  // Actions
  setLoading: (isLoading: boolean, message?: string) => void;
  setControlPanelPosition: (position: 'top' | 'bottom') => void;
  setControlPanelHeight: (height: number) => void;
  setPlaceholderText: (text: string) => void;
}

const DEFAULT_HEIGHT = 60;

export const useUIStore = create<UIStore>()(
  devtools(
    persist(
      (set) => ({
        isLoading: false,
        loadingMessage: '',
        controlPanelPosition: 'top',
        controlPanelHeight: DEFAULT_HEIGHT,
        placeholderText: 'Type your command...',

        setLoading: (isLoading, message = '') =>
          set({ isLoading, loadingMessage: message }, false, 'setLoading'),

        setControlPanelPosition: (controlPanelPosition) =>
          set({ controlPanelPosition }, false, 'setControlPanelPosition'),

        setControlPanelHeight: (controlPanelHeight) =>
          set({ controlPanelHeight }, false, 'setControlPanelHeight'),

        setPlaceholderText: (placeholderText) =>
          set({ placeholderText }, false, 'setPlaceholderText'),
      }),
      {
        name: 'ui-storage',
        partialize: (state) => ({ controlPanelPosition: state.controlPanelPosition }),
      }
    ),
    { name: 'UIStore' }
  )
);
