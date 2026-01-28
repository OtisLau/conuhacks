/**
 * Root component for overlay window
 */

import React, { useEffect } from 'react';
import OverlayCanvas from './components/Canvas/OverlayCanvas';
import ControlPanel from './components/ControlPanel/ControlPanel';

const App: React.FC = () => {
  useEffect(() => {
    console.log('Overlay App mounted');
  }, []);

  return (
    <>
      <OverlayCanvas />
      <ControlPanel />
    </>
  );
};

export default App;
