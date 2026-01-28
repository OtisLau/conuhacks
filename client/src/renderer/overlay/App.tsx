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
    console.log('Overlay App mounted');

    // Initialize IPC listeners for stores
    initializeTutorialIPC();
    initializeMouseIPC();

    console.log('IPC listeners initialized');
  }, []);

  return (
    <>
      <OverlayCanvas />
      <ControlPanel />
    </>
  );
};

export default App;
