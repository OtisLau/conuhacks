/**
 * Hook for cycling loading messages
 * Provides fun, random loading text when in planning mode
 */

import { useEffect } from 'react';
import { useUIStore } from '../store/uiStore';

const LOADING_MESSAGES = [
  'Planning',      // Always starts here
  'Thinking',
  'Hmm',
  'Pondering',
  'Mapping',
  'Pfft',
  'Computing',
  'Vibing',
  'Processing',
  'Brewing',
  'Scheming',
  'Crunching',
  'Noodling',
  'Conjuring',
  'Mulling',
  'Calibrating',
  'Imagining',
  'Simmering',
];

export function useLoadingMessages(isActive: boolean) {
  const setLoading = useUIStore((state) => state.setLoading);

  useEffect(() => {
    if (!isActive) return;

    let messageIndex = 0;
    let cycleCount = 0;

    const cycleMessage = () => {
      const message = LOADING_MESSAGES[messageIndex];
      setLoading(true, message);

      // After first message, randomly pick from the rest
      if (cycleCount > 0) {
        messageIndex = 1 + Math.floor(Math.random() * (LOADING_MESSAGES.length - 1));
      } else {
        messageIndex = 0;
      }

      cycleCount++;
    };

    // Start immediately
    cycleMessage();

    // Cycle every 2.5 seconds
    const interval = setInterval(cycleMessage, 2500);

    return () => {
      clearInterval(interval);
    };
  }, [isActive, setLoading]);
}
