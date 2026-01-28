/**
 * Connection Status component
 * Displays backend connection status with visual indicator
 */

import React from 'react';
import { useBackendStore } from '../../store/backendStore';
import './ConnectionStatus.css';

const ConnectionStatus: React.FC = () => {
  const status = useBackendStore((state) => state.status);
  const readiness = useBackendStore((state) => state.readiness);
  const isChecking = useBackendStore((state) => state.isChecking);
  const checkHealth = useBackendStore((state) => state.checkHealth);

  const getStatusText = (): string => {
    if (isChecking) return 'Checking...';
    if (!status.connected) return status.error || 'Disconnected';
    if (readiness && !readiness.ready) {
      const missing: string[] = [];
      if (!readiness.tesseract) missing.push('OCR');
      if (!readiness.gemini.available) missing.push('AI');
      return `Connected (${missing.join(', ')} unavailable)`;
    }
    return 'Connected';
  };

  const getStatusClass = (): string => {
    if (isChecking) return 'checking';
    if (!status.connected) return 'disconnected';
    if (readiness && !readiness.ready) return 'partial';
    return 'connected';
  };

  const handleClick = () => {
    if (!isChecking) {
      checkHealth();
    }
  };

  // Handle mouse enter/leave for click-through control
  const handleMouseEnter = () => {
    window.electronAPI.send('set-click-through', false);
  };

  const handleMouseLeave = () => {
    window.electronAPI.send('set-click-through', true);
  };

  return (
    <div
      className={`connection-status ${getStatusClass()}`}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      title={status.error || (status.connected ? 'Backend connected' : 'Backend disconnected')}
    >
      <span className="status-dot" />
      <span className="status-text">{getStatusText()}</span>
    </div>
  );
};

export default ConnectionStatus;
