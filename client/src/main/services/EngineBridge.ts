/**
 * Python engine bridge for AI-powered tutorial generation
 * TypeScript version of engine-bridge.js
 */

import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import os from 'os';
import type { TutorialPlan, LocateResult } from '../../shared/types/tutorial.types';
import type { EngineBridge as IEngineBridge } from '../../shared/types/engine.types';

// When built, __dirname is dist/main/services/, so go up to dist/, then client/, then conuhacks/
const PROJECT_ROOT = path.join(__dirname, '..', '..', '..');
const VENV_PYTHON = path.join(PROJECT_ROOT, 'engine', '.venv', 'bin', 'python3');

/**
 * Run a Python engine command via subprocess
 */
function runEngineCommand(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc: ChildProcess = spawn(VENV_PYTHON, ['-m', 'engine.cli', command, ...args], {
      cwd: PROJECT_ROOT,
      env: { ...process.env, PYTHONPATH: PROJECT_ROOT },
    });

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on('close', (code: number | null) => {
      // Allow non-zero exit codes if we got valid JSON output
      if (code !== 0 && !stdout.includes('"found"') && !stdout.includes('"steps"')) {
        reject(new Error(`Engine error (code ${code}): ${stderr || stdout}`));
      } else {
        resolve(stdout);
      }
    });

    proc.on('error', (err: Error) => {
      reject(new Error(`Failed to spawn engine process: ${err.message}`));
    });
  });
}

/**
 * Take a screenshot and save to temporary location
 */
async function takeScreenshot(): Promise<string> {
  const tmpPath = path.join(os.tmpdir(), `conu_screenshot_${Date.now()}.png`);
  await runEngineCommand('screenshot', ['--output', tmpPath]);
  return tmpPath;
}

/**
 * Generate a tutorial plan from screenshot and task description
 */
async function generatePlan(screenshotPath: string, task: string): Promise<TutorialPlan> {
  const output = await runEngineCommand('plan', [screenshotPath, task, '--json']);

  // Look for JSON block in output (after "JSON:" marker)
  const jsonMatch = output.match(/JSON:\s*(\{[\s\S]*\})/);
  if (jsonMatch) {
    return JSON.parse(jsonMatch[1]) as TutorialPlan;
  }

  throw new Error('Could not parse plan JSON from output');
}

/**
 * Locate an element on the screen
 */
async function locateElement(
  screenshotPath: string,
  target: string,
  region: 'full' | 'top' | 'bottom' | 'left' | 'right' = 'full',
  isIcon: boolean = false,
  instruction: string = '',
  quad: number | null = null
): Promise<LocateResult> {
  const args = [screenshotPath, target, '-r', region, '--json'];

  if (isIcon) args.push('-i');
  if (instruction) args.push('--instruction', instruction);
  if (quad !== null) args.push('-q', String(quad));

  const output = await runEngineCommand('locate', args);

  // Find JSON in output (may have other text before it)
  const lines = output.trim().split('\n');
  for (const line of lines) {
    if (line.startsWith('{')) {
      return JSON.parse(line) as LocateResult;
    }
  }

  throw new Error('Could not parse locate JSON from output');
}

/**
 * Engine bridge singleton export
 */
const engineBridge: IEngineBridge = {
  takeScreenshot,
  generatePlan,
  locateElement,
  runEngineCommand,
};

export default engineBridge;
