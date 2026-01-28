/**
 * Python engine bridge for AI-powered tutorial generation
 *
 * Uses FastAPI REST API instead of subprocess calls for better performance
 * and maintainability.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import type { TutorialPlan, LocateResult } from '../../shared/types/tutorial.types';
import type { EngineBridge as IEngineBridge } from '../../shared/types/engine.types';

// API base URL (FastAPI server)
const API_BASE_URL = process.env.ENGINE_API_URL || 'http://127.0.0.1:8000';

/**
 * Make an API request to the FastAPI server
 */
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.detail || `API error: ${response.status} ${response.statusText}`
    );
  }

  return response.json();
}

/**
 * Read a file and encode as base64
 */
function fileToBase64(filePath: string): string {
  const buffer = fs.readFileSync(filePath);
  return buffer.toString('base64');
}

/**
 * Save base64 image data to a file
 */
function base64ToFile(base64Data: string, filePath: string): void {
  const buffer = Buffer.from(base64Data, 'base64');
  fs.writeFileSync(filePath, buffer);
}

/**
 * Take a screenshot and save to temporary location
 */
async function takeScreenshot(): Promise<string> {
  const tmpPath = path.join(os.tmpdir(), `conu_screenshot_${Date.now()}.png`);

  interface ScreenshotResponse {
    success: boolean;
    width: number;
    height: number;
    image: string;
  }

  const result = await apiRequest<ScreenshotResponse>('/screenshot', {
    method: 'POST',
    body: JSON.stringify({ return_base64: true }),
  });

  if (!result.success || !result.image) {
    throw new Error('Screenshot capture failed');
  }

  // Save base64 image to temp file for backwards compatibility
  base64ToFile(result.image, tmpPath);

  return tmpPath;
}

/**
 * Generate a tutorial plan from screenshot and task description
 */
async function generatePlan(
  screenshotPath: string,
  task: string
): Promise<TutorialPlan> {
  // Read screenshot and encode as base64
  const imageBase64 = fileToBase64(screenshotPath);

  interface PlanResponse {
    task: string;
    steps: Array<{
      instruction: string;
      target_text: string;
      region: string;
      is_icon: boolean;
      quad?: number | string | null;
    }>;
    current_step: number;
    analysis?: string;
  }

  const result = await apiRequest<PlanResponse>('/plan', {
    method: 'POST',
    body: JSON.stringify({
      task,
      image: imageBase64,
      max_steps: 8,
    }),
  });

  // Convert to TutorialPlan format
  return {
    steps: result.steps.map((step) => ({
      instruction: step.instruction,
      target_text: step.target_text,
      region: step.region as 'full' | 'top' | 'bottom' | 'left' | 'right',
      is_icon: step.is_icon,
      quad: typeof step.quad === 'number' ? step.quad : null,
    })),
  };
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
  // Read screenshot and encode as base64
  const imageBase64 = fileToBase64(screenshotPath);

  interface LocateResponse {
    found: boolean;
    bbox: [number, number, number, number] | null;
    center: [number, number] | null;
    confidence: number;
    method: string | null;
    suggestions: string[];
  }

  const result = await apiRequest<LocateResponse>('/locate', {
    method: 'POST',
    body: JSON.stringify({
      target,
      image: imageBase64,
      region,
      is_icon: isIcon,
      instruction: instruction || undefined,
      quad: quad || undefined,
    }),
  });

  return {
    found: result.found,
    bbox: result.bbox || undefined,
    center: result.center || undefined,
    suggestions: result.suggestions,
  };
}

/**
 * Run an engine command via API
 *
 * This is provided for backwards compatibility. New code should use
 * the specific API endpoints instead.
 */
async function runEngineCommand(command: string, args: string[]): Promise<string> {
  // Map CLI commands to API endpoints
  switch (command) {
    case 'screenshot': {
      const outputIndex = args.indexOf('--output');
      const outputPath =
        outputIndex !== -1 ? args[outputIndex + 1] : undefined;

      interface ScreenshotResponse {
        success: boolean;
        width: number;
        height: number;
        path?: string;
        image?: string;
      }

      const result = await apiRequest<ScreenshotResponse>('/screenshot', {
        method: 'POST',
        body: JSON.stringify({
          output_path: outputPath,
          return_base64: !outputPath,
        }),
      });

      if (outputPath && result.image) {
        base64ToFile(result.image, outputPath);
      }

      return `Saved: ${outputPath || 'memory'} (${result.width}x${result.height})`;
    }

    case 'regions': {
      interface RegionsResponse {
        regions: Array<{ name: string; coords: number[] }>;
      }

      const result = await apiRequest<RegionsResponse>('/regions');
      return result.regions
        .map((r) => `${r.name}: (${r.coords.join(', ')})`)
        .join('\n');
    }

    case 'health': {
      interface HealthResponse {
        status: string;
        version: string;
      }

      const result = await apiRequest<HealthResponse>('/health');
      return JSON.stringify(result);
    }

    default:
      throw new Error(
        `Command '${command}' not supported via API. Use specific methods instead.`
      );
  }
}

/**
 * Check if the API server is available
 */
export async function checkApiHealth(): Promise<boolean> {
  try {
    interface HealthResponse {
      status: string;
    }

    const result = await apiRequest<HealthResponse>('/health');
    return result.status === 'ok';
  } catch {
    return false;
  }
}

/**
 * Check API readiness (all dependencies available)
 */
export async function checkApiReadiness(): Promise<{
  ready: boolean;
  tesseract: boolean;
  gemini: { available: boolean; error?: string };
}> {
  interface ReadinessResponse {
    ready: boolean;
    tesseract: boolean;
    gemini: { available: boolean; error?: string };
  }

  return apiRequest<ReadinessResponse>('/ready');
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
