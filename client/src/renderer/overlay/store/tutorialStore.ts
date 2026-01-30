/**
 * Zustand store for tutorial state management
 * Syncs with main process via IPC
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { TutorialState, TutorialMode, TutorialPlan, SpotlightCoords } from '../../../shared/types/tutorial.types';

interface TutorialStore extends TutorialState {
  // Actions
  setMode: (mode: TutorialMode) => void;
  setPlan: (plan: TutorialPlan | null) => void;
  setCurrentStepIndex: (index: number) => void;
  setTargetCoords: (coords: SpotlightCoords | null) => void;
  setError: (error: string | null) => void;
  setState: (state: Partial<TutorialState>) => void;
  reset: () => void;
}

const initialState: TutorialState = {
  mode: 'idle',
  plan: null,
  currentStepIndex: 0,
  targetCoords: null,
  error: null,
  suggestions: undefined,
};

export const useTutorialStore = create<TutorialStore>()(
  devtools(
    (set) => ({
      ...initialState,

      setMode: (mode) => set({ mode }, false, 'setMode'),

      setPlan: (plan) => set({ plan }, false, 'setPlan'),

      setCurrentStepIndex: (currentStepIndex) => set({ currentStepIndex }, false, 'setCurrentStepIndex'),

      setTargetCoords: (targetCoords) => set({ targetCoords }, false, 'setTargetCoords'),

      setError: (error) => set({ error }, false, 'setError'),

      setState: (partial) => set(partial, false, 'setState'),

      reset: () => set(initialState, false, 'reset'),
    }),
    { name: 'TutorialStore' }
  )
);

/**
 * Initialize IPC listeners to sync state from main process
 */
export function initializeTutorialIPC() {
  // Listen for tutorial state changes from main process
  window.electronAPI.onTutorialStateChange((state) => {
    console.log('Tutorial state changed:', state);
    useTutorialStore.getState().setState(state);
  });

  // Listen for spotlight position updates
  window.electronAPI.onSetSpotlightPosition((coords) => {
    console.log('Spotlight position updated:', coords);
    useTutorialStore.getState().setTargetCoords(coords);
  });
}
