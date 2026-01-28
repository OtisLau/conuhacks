/**
 * Root component for overlay window
 */

import React, { useEffect } from 'react';
import OverlayCanvas from './components/Canvas/OverlayCanvas';
import ControlPanel from './components/ControlPanel/ControlPanel';
import { initializeTutorialIPC } from './store/tutorialStore';
import { initializeMouseIPC } from './store/mouseStore';

const App: React.FC = () => {
  useEffect(() => {
    // Initialize IPC listeners for stores
    initializeTutorialIPC();
    initializeMouseIPC();
  }, []);

  return (
    <>
      <OverlayCanvas />
      <ControlPanel />
    </>
  );
};

export default App;
