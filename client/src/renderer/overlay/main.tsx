/**
 * React entry point for overlay window
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/global.css';

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

console.log('Overlay React app loaded');
console.log('Canvas physical size:', window.screen.width * window.devicePixelRatio, 'x', window.screen.height * window.devicePixelRatio);
console.log('Canvas CSS size:', window.screen.width, 'x', window.screen.height);
