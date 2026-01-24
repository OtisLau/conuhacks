/**
 * Preload script for the main window
 * Exposes IPC APIs for communication with main process
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Send task to main process
  startTask: (task) => {
    ipcRenderer.send('start-task', task);
  },

  // Listen for state changes
  onStateChange: (callback) => {
    ipcRenderer.on('state-change', (_, state, data) => callback(state, data));
  },

  // Listen for plan generated
  onPlanGenerated: (callback) => {
    ipcRenderer.on('plan-generated', (_, plan) => callback(plan));
  },

  // Listen for step changes
  onStepChange: (callback) => {
    ipcRenderer.on('step-change', (_, stepIndex) => callback(stepIndex));
  },
});
