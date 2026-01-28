/**
 * Root component for overlay window
 */

import React, { useEffect } from 'react';
import OverlayCanvas from './components/Canvas/OverlayCanvas';
import ControlPanel from './components/ControlPanel/ControlPanel';
import ConnectionStatus from './components/ConnectionStatus/ConnectionStatus';
import { initializeTutorialIPC } from './store/tutorialStore';
import { initializeMouseIPC } from './store/mouseStore';
import { initializeBackendIPC } from './store/backendStore';

const App: React.FC = () => {
  useEffect(() => {
    // Initialize IPC listeners for stores
    initializeTutorialIPC();
    initializeMouseIPC();
    initializeBackendIPC();
  }, []);

  return (
    <>
      <OverlayCanvas />
      <ControlPanel />
      <ConnectionStatus />
    </>
  );
};

export default App;
