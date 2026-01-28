/**
 * Control Panel component - main input interface
 * Ported from overlay.html control panel
 */

import React, { useState, useRef, useEffect } from 'react';
import './ControlPanel.css';

interface ControlPanelProps {}

const ControlPanel: React.FC<ControlPanelProps> = () => {
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('');
  const [placeholder, setPlaceholder] = useState('Type your command...');
  const [isDisabled, setIsDisabled] = useState(false);
  const [height, setHeight] = useState(60); // Default height
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const DEFAULT_HEIGHT = 60;
  const MAX_HEIGHT = 300;
  const PILL_TO_RECT_THRESHOLD = 100;
  const RECT_BORDER_RADIUS = 25;

  // Auto-resize control panel based on textarea content
  const adjustHeight = () => {
    if (isLoading) return;

    const textarea = textareaRef.current;
    if (!textarea) return;

    let finalHeight = DEFAULT_HEIGHT;

    if (!inputValue || inputValue.trim() === '') {
      finalHeight = DEFAULT_HEIGHT;
    } else {
      const currentHeight = height;
      const isOverflowing = textarea.scrollHeight > currentHeight;

      if (isOverflowing) {
        finalHeight = Math.min(textarea.scrollHeight, MAX_HEIGHT);
      } else {
        textarea.style.height = DEFAULT_HEIGHT + 'px';
        if (textarea.scrollHeight <= DEFAULT_HEIGHT) {
          finalHeight = DEFAULT_HEIGHT;
        } else {
          finalHeight = Math.min(textarea.scrollHeight, MAX_HEIGHT);
        }
      }
    }

    setHeight(finalHeight);
  };

  useEffect(() => {
    adjustHeight();
  }, [inputValue]);

  // Handle keyboard input
  const handleKeyDown = async (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const task = inputValue.trim();
      if (!task) return;

      console.log('Starting tutorial:', task);
      setIsLoading(true);
      setIsDisabled(true);
      setInputValue('');

      try {
        const result = await window.electronAPI.startTutorial(task);
        if (!result.success) {
          console.error('Tutorial failed:', result.error);
          setIsDisabled(false);
        }
      } catch (error) {
        console.error('Tutorial error:', error);
        setIsDisabled(false);
      } finally {
        setIsLoading(false);
      }
    }
  };

  // Mouse enter/leave for click-through control
  const handleMouseEnter = () => {
    window.electronAPI.send('set-click-through', false);
  };

  const handleMouseLeave = () => {
    window.electronAPI.send('set-click-through', true);
  };

  const borderRadius = height <= PILL_TO_RECT_THRESHOLD
    ? `${height / 2}px`
    : `${RECT_BORDER_RADIUS}px`;

  return (
    <div
      ref={panelRef}
      className={`control-panel ${isLoading ? 'loading-text' : ''}`}
      style={{ height: `${height}px`, borderRadius }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {isLoading && (
        <div className="loading-text-display">{loadingText}</div>
      )}
      <textarea
        ref={textareaRef}
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={isDisabled}
        style={{ height: `${height}px` }}
        autoFocus
      />
    </div>
  );
};

export default ControlPanel;
