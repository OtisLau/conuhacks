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

// Default request timeout (30 seconds)
const REQUEST_TIMEOUT = 30000;

/**
 * Custom error class for API errors
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public endpoint?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Make an API request to the FastAPI server with timeout support
 */
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {},
  timeout: number = REQUEST_TIMEOUT
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;

  // Create abort controller for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const message = typeof errorData.detail === 'string'
        ? errorData.detail
        : Array.isArray(errorData.detail)
          ? errorData.detail.map((e: { msg: string }) => e.msg).join(', ')
          : `API error: ${response.status} ${response.statusText}`;
      throw new ApiError(message, response.status, endpoint);
    }

    return response.json();
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof ApiError) {
      throw error;
    }

    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        throw new ApiError(`Request timeout after ${timeout}ms`, undefined, endpoint);
      }
      if (error.message.includes('fetch')) {
        throw new ApiError('Cannot connect to backend server', undefined, endpoint);
      }
    }

    throw new ApiError(
      error instanceof Error ? error.message : 'Unknown error',
      undefined,
      endpoint
    );
  }
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
    image?: string;
    path?: string;
  }

  try {
    const result = await apiRequest<ScreenshotResponse>('/screenshot', {
      method: 'POST',
      body: JSON.stringify({ return_base64: true }),
    });

    if (!result.success) {
      throw new ApiError('Screenshot capture failed: backend returned unsuccessful', undefined, '/screenshot');
    }

    if (!result.image) {
      throw new ApiError('Screenshot capture failed: no image data returned', undefined, '/screenshot');
    }

    // Validate base64 data
    if (result.image.length === 0) {
      throw new ApiError('Screenshot capture failed: empty image data', undefined, '/screenshot');
    }

    // Save base64 image to temp file
    base64ToFile(result.image, tmpPath);

    console.log(`Screenshot saved: ${tmpPath} (${result.width}x${result.height})`);
    return tmpPath;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(
      `Screenshot failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      undefined,
      '/screenshot'
    );
  }
}

/**
 * Generate a tutorial plan from screenshot and task description
 */
async function generatePlan(
  screenshotPath: string,
  task: string
): Promise<TutorialPlan> {
  if (!task || task.trim().length === 0) {
    throw new ApiError('Task description is required', undefined, '/plan');
  }

  // Read screenshot and encode as base64
  let imageBase64: string;
  try {
    imageBase64 = fileToBase64(screenshotPath);
  } catch (error) {
    throw new ApiError(
      `Failed to read screenshot: ${error instanceof Error ? error.message : 'Unknown error'}`,
      undefined,
      '/plan'
    );
  }

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

  try {
    const result = await apiRequest<PlanResponse>('/plan', {
      method: 'POST',
      body: JSON.stringify({
        task: task.trim(),
        image: imageBase64,
        max_steps: 8,
      }),
    }, 60000); // 60 second timeout for plan generation (AI can be slow)

    // Validate response
    if (!result.steps || !Array.isArray(result.steps)) {
      throw new ApiError('Invalid plan response: missing steps array', undefined, '/plan');
    }

    if (result.steps.length === 0) {
      throw new ApiError('Plan generation returned no steps. Try rephrasing your task.', undefined, '/plan');
    }

    console.log(`Plan generated: ${result.steps.length} steps for task "${task}"`);

    // Convert to TutorialPlan format with validation
    return {
      steps: result.steps.map((step, index) => {
        if (!step.instruction || !step.target_text) {
          console.warn(`Step ${index} missing required fields:`, step);
        }
        return {
          instruction: step.instruction || `Step ${index + 1}`,
          target_text: step.target_text || '',
          region: (step.region as 'full' | 'top' | 'bottom' | 'left' | 'right') || 'full',
          is_icon: step.is_icon || false,
          quad: typeof step.quad === 'number' ? step.quad : null,
        };
      }),
    };
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(
      `Plan generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      undefined,
      '/plan'
    );
  }
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
  if (!target || target.trim().length === 0) {
    throw new ApiError('Target text is required for element location', undefined, '/locate');
  }

  // Read screenshot and encode as base64
  let imageBase64: string;
  try {
    imageBase64 = fileToBase64(screenshotPath);
  } catch (error) {
    throw new ApiError(
      `Failed to read screenshot: ${error instanceof Error ? error.message : 'Unknown error'}`,
      undefined,
      '/locate'
    );
  }

  interface LocateResponse {
    found: boolean;
    bbox: [number, number, number, number] | null;
    center: [number, number] | null;
    confidence: number;
    method: string | null;
    suggestions: string[];
  }

  try {
    const result = await apiRequest<LocateResponse>('/locate', {
      method: 'POST',
      body: JSON.stringify({
        target: target.trim(),
        image: imageBase64,
        region,
        is_icon: isIcon,
        instruction: instruction || undefined,
        quad: quad || undefined,
      }),
    });

    console.log(`Locate "${target}": found=${result.found}, confidence=${result.confidence}%`);

    if (result.found && result.center) {
      console.log(`  Center: (${result.center[0]}, ${result.center[1]}), Method: ${result.method}`);
    } else if (result.suggestions && result.suggestions.length > 0) {
      console.log(`  Suggestions: ${result.suggestions.slice(0, 3).join(', ')}`);
    }

    return {
      found: result.found,
      bbox: result.bbox || undefined,
      center: result.center || undefined,
      suggestions: result.suggestions || [],
    };
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(
      `Element location failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      undefined,
      '/locate'
    );
  }
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
