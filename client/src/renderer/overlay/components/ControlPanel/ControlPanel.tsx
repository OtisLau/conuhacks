/**
 * Control Panel component - main input interface
 * Uses Zustand stores for state management
 */

import React, { useState, useRef, useEffect } from 'react';
import { useTutorialStore } from '../../store/tutorialStore';
import { useUIStore } from '../../store/uiStore';
import { useMouseStore } from '../../store/mouseStore';
import { useBackendStore } from '../../store/backendStore';
import { useLoadingMessages } from '../../hooks/useLoadingMessages';
import './ControlPanel.css';

interface ControlPanelProps {}

const ControlPanel: React.FC<ControlPanelProps> = () => {
  // Local state
  const [inputValue, setInputValue] = useState('');

  // Store state
  const tutorialMode = useTutorialStore((state) => state.mode);
  const currentStep = useTutorialStore((state) => state.currentStepIndex);
  const plan = useTutorialStore((state) => state.plan);
  const tutorialError = useTutorialStore((state) => state.error);

  const isLoading = useUIStore((state) => state.isLoading);
  const loadingMessage = useUIStore((state) => state.loadingMessage);
  const placeholderText = useUIStore((state) => state.placeholderText);
  const height = useUIStore((state) => state.controlPanelHeight);
  const setHeight = useUIStore((state) => state.setControlPanelHeight);
  const setLoading = useUIStore((state) => state.setLoading);
  const setPlaceholderText = useUIStore((state) => state.setPlaceholderText);

  const setTutorialMode = useMouseStore((state) => state.setTutorialMode);

  const backendConnected = useBackendStore((state) => state.status.connected);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const DEFAULT_HEIGHT = 60;
  const MAX_HEIGHT = 300;
  const PILL_TO_RECT_THRESHOLD = 100;
  const RECT_BORDER_RADIUS = 25;

  // Cycle loading messages when in planning mode
  useLoadingMessages(tutorialMode === 'planning');

  // Update placeholder based on tutorial state and backend connection
  useEffect(() => {
    let newPlaceholder = '';
    let disabled = false;

    // Check backend connection first
    if (!backendConnected) {
      setPlaceholderText('Waiting for backend connection...');
      setLoading(false);
      return;
    }

    switch (tutorialMode) {
      case 'idle':
        newPlaceholder = 'Type your command...';
        disabled = false;
        setLoading(false);
        break;
      case 'planning':
        newPlaceholder = 'Planning...';
        disabled = true;
        setLoading(true, 'Planning');
        break;
      case 'locating':
        newPlaceholder = 'Finding element...';
        disabled = true;
        break;
      case 'highlighting':
        disabled = true;
        setTutorialMode(true);
        if (plan && plan.steps && plan.steps[currentStep]) {
          const step = plan.steps[currentStep];
          newPlaceholder = `Step ${currentStep + 1}: ${step.instruction}`;
        } else {
          newPlaceholder = `Step ${currentStep + 1}: Click the target`;
        }
        break;
      case 'complete':
        newPlaceholder = 'Done! Type next command...';
        disabled = false;
        setLoading(false);
        setTutorialMode(false);
        break;
      case 'error':
        newPlaceholder = 'Type your command...';
        disabled = false;
        setLoading(false);
        setTutorialMode(false);
        break;
    }

    setPlaceholderText(newPlaceholder);
  }, [tutorialMode, currentStep, plan, setLoading, setPlaceholderText, setTutorialMode, backendConnected]);

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
      setLoading(true, 'Planning');
      setInputValue('');

      try {
        const result = await window.electronAPI.startTutorial(task);
        if (!result.success) {
          console.error('Tutorial failed:', result.error);
        }
      } catch (error) {
        console.error('Tutorial error:', error);
      }
      // Loading state will be cleared by store updates from main process
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

  const isDisabled = !backendConnected || (tutorialMode !== 'idle' && tutorialMode !== 'complete' && tutorialMode !== 'error');

  // Show error state
  const showError = tutorialMode === 'error' && tutorialError;

  return (
    <>
      {showError && (
        <div
          className="error-banner"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <span className="error-icon">!</span>
          <span className="error-message">{tutorialError}</span>
        </div>
      )}
      <div
        ref={panelRef}
        className={`control-panel ${isLoading ? 'loading-text' : ''} ${showError ? 'has-error' : ''}`}
        style={{ height: `${height}px`, borderRadius }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {isLoading && (
          <div className="loading-text-display">{loadingMessage}...</div>
        )}
        <textarea
          ref={textareaRef}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholderText}
          disabled={isDisabled}
          style={{ height: `${height}px` }}
          autoFocus
        />
      </div>
    </>
  );
};

export default ControlPanel;
