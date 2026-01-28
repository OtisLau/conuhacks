/**
 * Python engine bridge type definitions
 */

import type { TutorialPlan, LocateResult } from './tutorial.types';

export interface EngineBridge {
  takeScreenshot: () => Promise<string>;
  generatePlan: (screenshotPath: string, task: string) => Promise<TutorialPlan>;
  locateElement: (
    screenshotPath: string,
    target: string,
    region?: 'full' | 'top' | 'bottom' | 'left' | 'right',
    isIcon?: boolean,
    instruction?: string,
    quad?: number | null
  ) => Promise<LocateResult>;
  runEngineCommand: (command: string, args: string[]) => Promise<string>;
}

export interface EngineCommandResult {
  stdout: string;
  stderr: string;
  code: number;
}
