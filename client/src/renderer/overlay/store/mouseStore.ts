/**
 * Zustand store for mouse event tracking
 * Stores recent mouse events from global tracking
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { MouseEvent, MouseClickEvent } from '../../../shared/types/mouse.types';

interface MouseEventLog {
  type: string;
  event: MouseEvent | MouseClickEvent;
  timestamp: number;
}

interface MouseStore {
  // Current mouse position
  position: { x: number; y: number };

  // Event log (last N events)
  eventLog: MouseEventLog[];
  maxLogEntries: number;

  // Tutorial mode tracking
  inTutorialMode: boolean;
  lastTargetClickTime: number;

  // Actions
  setPosition: (x: number, y: number) => void;
  logEvent: (type: string, event: MouseEvent | MouseClickEvent) => void;
  setTutorialMode: (enabled: boolean) => void;
  setLastTargetClickTime: (time: number) => void;
  clearLog: () => void;
}

export const useMouseStore = create<MouseStore>()(
  devtools(
    (set, get) => ({
      position: { x: 0, y: 0 },
      eventLog: [],
      maxLogEntries: 50,
      inTutorialMode: false,
      lastTargetClickTime: 0,

      setPosition: (x, y) => set({ position: { x, y } }, false, 'setPosition'),

      logEvent: (type, event) => {
        const { eventLog, maxLogEntries } = get();
        const newEntry: MouseEventLog = {
          type,
          event,
          timestamp: Date.now(),
        };

        const updatedLog = [newEntry, ...eventLog].slice(0, maxLogEntries);
        set({ eventLog: updatedLog }, false, 'logEvent');
      },

      setTutorialMode: (inTutorialMode) => set({ inTutorialMode }, false, 'setTutorialMode'),

      setLastTargetClickTime: (lastTargetClickTime) =>
        set({ lastTargetClickTime }, false, 'setLastTargetClickTime'),

      clearLog: () => set({ eventLog: [] }, false, 'clearLog'),
    }),
    { name: 'MouseStore' }
  )
);

/**
 * Initialize IPC listeners for mouse events
 */
export function initializeMouseIPC() {
  const store = useMouseStore.getState();

  // Global mouse move
  window.electronAPI.onGlobalMouseMove((event) => {
    store.setPosition(event.position.x, event.position.y);

    // Log only occasionally to avoid spam
    const now = Date.now();
    const lastLog = store.eventLog[0];
    if (!lastLog || lastLog.type !== 'mousemove' || now - lastLog.timestamp > 100) {
      store.logEvent('mousemove', event);
    }
  });

  // Global mouse down
  window.electronAPI.onGlobalMouseDown((event) => {
    store.logEvent('mousedown', event);
  });

  // Global mouse up
  window.electronAPI.onGlobalMouseUp((event) => {
    store.logEvent('mouseup', event);
  });

  // Global click
  window.electronAPI.onGlobalClick((event) => {
    store.logEvent('click', event);

    // Check if in tutorial mode and handle target click
    if (store.inTutorialMode) {
      const now = Date.now();
      const timeSinceLastClick = now - store.lastTargetClickTime;

      // Debounce: ignore clicks within 200ms of last target click
      if (timeSinceLastClick > 200) {
        store.setLastTargetClickTime(now);
        console.log('Click detected in tutorial mode, notifying main process');
        window.electronAPI.notifyTargetClicked();
      }
    }
  });

  // Global scroll
  window.electronAPI.onGlobalScroll((event) => {
    store.logEvent('scroll', event);
  });
}
