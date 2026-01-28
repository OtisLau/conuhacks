/**
 * Tutorial type definitions
 */

export enum TutorialMode {
  Idle = 'idle',
  Planning = 'planning',
  Locating = 'locating',
  Highlighting = 'highlighting',
  Complete = 'complete',
  Error = 'error',
}

export interface TutorialStep {
  instruction: string;
  target_text: string;
  region: 'full' | 'top' | 'bottom' | 'left' | 'right';
  is_icon: boolean;
  quad?: number | null;
}

export interface TutorialPlan {
  steps: TutorialStep[];
}

export interface SpotlightCoords {
  x: number;
  y: number;
  bbox?: [number, number, number, number] | null;
}

export interface TutorialState {
  mode: TutorialMode;
  plan: TutorialPlan | null;
  currentStepIndex: number;
  targetCoords: SpotlightCoords | null;
  error: string | null;
}

export interface LocateResult {
  found: boolean;
  center?: [number, number];
  bbox?: [number, number, number, number];
  suggestions?: string[];
  label?: string;
}
