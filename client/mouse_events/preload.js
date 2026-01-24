/**
 * Preload Script for Overlay Window
 * Exposes mouse event APIs to the renderer process
 *
 * Include this in your overlay window's webPreferences.preload
 */

const { contextBridge, ipcRenderer } = require('electron');

// Track mouse state in renderer
let lastPosition = { x: 0, y: 0 };

/**
 * Forward native DOM mouse events to main process
 */
function setupMouseForwarding() {
  // Mouse move
  document.addEventListener('mousemove', (e) => {
    lastPosition = { x: e.screenX, y: e.screenY };
    ipcRenderer.send('overlay-mouse-move', {
      x: e.screenX,
      y: e.screenY,
      clientX: e.clientX,
      clientY: e.clientY,
      ctrlKey: e.ctrlKey,
      altKey: e.altKey,
      shiftKey: e.shiftKey,
      metaKey: e.metaKey,
    });
  });

  // Mouse down
  document.addEventListener('mousedown', (e) => {
    ipcRenderer.send('overlay-mouse-down', {
      x: e.screenX,
      y: e.screenY,
      button: e.button,
      ctrlKey: e.ctrlKey,
      altKey: e.altKey,
      shiftKey: e.shiftKey,
      metaKey: e.metaKey,
    });
  });

  // Mouse up
  document.addEventListener('mouseup', (e) => {
    ipcRenderer.send('overlay-mouse-up', {
      x: e.screenX,
      y: e.screenY,
      button: e.button,
      ctrlKey: e.ctrlKey,
      altKey: e.altKey,
      shiftKey: e.shiftKey,
      metaKey: e.metaKey,
    });
  });

  // Scroll
  document.addEventListener('wheel', (e) => {
    ipcRenderer.send('overlay-mouse-scroll', {
      x: e.screenX,
      y: e.screenY,
      deltaX: e.deltaX,
      deltaY: e.deltaY,
      deltaMode: e.deltaMode,
      ctrlKey: e.ctrlKey,
      altKey: e.altKey,
      shiftKey: e.shiftKey,
      metaKey: e.metaKey,
    });
  });

  // Context menu (right click)
  document.addEventListener('contextmenu', (e) => {
    ipcRenderer.send('overlay-context-menu', {
      x: e.screenX,
      y: e.screenY,
    });
  });
}

// Expose APIs to renderer
contextBridge.exposeInMainWorld('mouseEvents', {
  // Get last known position
  getPosition: () => ({ ...lastPosition }),

  // Subscribe to mouse events from main process
  onMouseMove: (callback) => {
    ipcRenderer.on('mouse-move', (_, data) => callback(data));
  },

  onMouseDown: (callback) => {
    ipcRenderer.on('mouse-down', (_, data) => callback(data));
  },

  onMouseUp: (callback) => {
    ipcRenderer.on('mouse-up', (_, data) => callback(data));
  },

  onClick: (callback) => {
    ipcRenderer.on('click', (_, data) => callback(data));
  },

  onDoubleClick: (callback) => {
    ipcRenderer.on('double-click', (_, data) => callback(data));
  },

  onRightClick: (callback) => {
    ipcRenderer.on('right-click', (_, data) => callback(data));
  },

  onScroll: (callback) => {
    ipcRenderer.on('scroll', (_, data) => callback(data));
  },

  onDragStart: (callback) => {
    ipcRenderer.on('drag-start', (_, data) => callback(data));
  },

  onDrag: (callback) => {
    ipcRenderer.on('drag', (_, data) => callback(data));
  },

  onDragEnd: (callback) => {
    ipcRenderer.on('drag-end', (_, data) => callback(data));
  },

  onHover: (callback) => {
    ipcRenderer.on('hover', (_, data) => callback(data));
  },

  // Subscribe to any mouse event
  onAny: (callback) => {
    const events = [
      'mouse-move', 'mouse-down', 'mouse-up',
      'click', 'double-click', 'right-click',
      'scroll', 'drag-start', 'drag', 'drag-end', 'hover'
    ];
    events.forEach(event => {
      ipcRenderer.on(event, (_, data) => callback({ ...data, type: event }));
    });
  },

  // Remove listeners
  removeAllListeners: () => {
    const events = [
      'mouse-move', 'mouse-down', 'mouse-up',
      'click', 'double-click', 'right-click',
      'scroll', 'drag-start', 'drag', 'drag-end', 'hover'
    ];
    events.forEach(event => {
      ipcRenderer.removeAllListeners(event);
    });
  },
});

// Expose highlight API for overlay drawing
contextBridge.exposeInMainWorld('overlayAPI', {
  onHighlight: (callback) => {
    ipcRenderer.on('highlight', (_, data) => callback(data.bbox, data.instruction));
  },

  onClearHighlight: (callback) => {
    ipcRenderer.on('clear-highlight', () => callback());
  },

  // Notify main process when user clicks highlighted element
  notifyClick: (data) => {
    ipcRenderer.send('highlight-clicked', data);
  },
});

// Expose general electron API for IPC
contextBridge.exposeInMainWorld('electronAPI', {
  send: (channel, data) => {
    ipcRenderer.send(channel, data);
  },

  // Listen for global mouse events from main process
  onGlobalMouseMove: (callback) => {
    ipcRenderer.on('global-mouse-move', (_, data) => callback(data));
  },

  onGlobalMouseDown: (callback) => {
    ipcRenderer.on('global-mouse-down', (_, data) => callback(data));
  },

  onGlobalMouseUp: (callback) => {
    ipcRenderer.on('global-mouse-up', (_, data) => callback(data));
  },

  onGlobalClick: (callback) => {
    ipcRenderer.on('global-click', (_, data) => callback(data));
  },

  onGlobalScroll: (callback) => {
    ipcRenderer.on('global-scroll', (_, data) => callback(data));
  },
});

// Initialize mouse forwarding when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupMouseForwarding);
} else {
  setupMouseForwarding();
}
