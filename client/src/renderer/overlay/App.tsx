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
    console.log('Window dimensions:', window.innerWidth, 'x', window.innerHeight);
    console.log('Screen dimensions:', window.screen.width, 'x', window.screen.height);

    // Initialize IPC listeners for stores
    initializeTutorialIPC();
    initializeMouseIPC();

    console.log('IPC listeners initialized');

    // Check if control panel is in DOM
    setTimeout(() => {
      const controlPanel = document.querySelector('.control-panel');
      console.log('Control panel element:', controlPanel);
      if (controlPanel) {
        const rect = controlPanel.getBoundingClientRect();
        console.log('Control panel position:', rect);
        console.log('Control panel styles:', window.getComputedStyle(controlPanel));
      }
    }, 1000);
  }, []);

  return (
    <>
      <OverlayCanvas />
      <ControlPanel />
    </>
  );
};

export default App;
