/**
 * WebSocket communication type definitions
 * Matches the backend WebSocket protocol in engine/api/websocket/task_runner.py
 */

// Server -> Client event types
export type ServerEventType =
  | 'connected'
  | 'plan_started'
  | 'plan_ready'
  | 'plan_error'
  | 'step_started'
  | 'step_result'
  | 'step_error'
  | 'task_complete'
  | 'error';

// Client -> Server event types
export type ClientEventType =
  | 'start_task'
  | 'step_done'
  | 'step_retry'
  | 'step_skip'
  | 'cancel';

// Base event structure
export interface WebSocketEvent<T = unknown> {
  type: string;
  data?: T;
}

// Server event data types
export interface ConnectedData {
  message: string;
}

export interface PlanStartedData {
  task: string;
  message: string;
}

export interface PlanReadyData {
  task: string;
  steps: Array<{
    instruction: string;
    target_text: string;
    region: string;
    is_icon: boolean;
    quad?: number | string | null;
    completed: boolean;
  }>;
  total_steps: number;
}

export interface PlanErrorData {
  error: string;
}

export interface StepStartedData {
  step_number: number;
  total_steps: number;
  instruction: string;
  target: string;
  region: string;
  is_icon: boolean;
}

export interface StepResultData {
  step_number: number;
  found: boolean;
  confidence: number;
  method: string | null;
  suggestions: string[];
  bbox?: [number, number, number, number];
  center?: [number, number];
  highlight_image?: string; // base64 encoded PNG
}

export interface StepErrorData {
  step_number: number;
  error: string;
}

export interface TaskCompleteData {
  task: string;
  steps_completed: number;
  total_steps: number;
  success: boolean;
}

export interface ErrorData {
  error: string;
}

// Client event data types
export interface StartTaskData {
  task: string;
}

// Union type for all server events
export type ServerEvent =
  | WebSocketEvent<ConnectedData>
  | WebSocketEvent<PlanStartedData>
  | WebSocketEvent<PlanReadyData>
  | WebSocketEvent<PlanErrorData>
  | WebSocketEvent<StepStartedData>
  | WebSocketEvent<StepResultData>
  | WebSocketEvent<StepErrorData>
  | WebSocketEvent<TaskCompleteData>
  | WebSocketEvent<ErrorData>;

// WebSocket connection state
export type WebSocketState = 'disconnected' | 'connecting' | 'connected' | 'running' | 'error';

// Event handler types
export interface WebSocketEventHandlers {
  onConnected?: (data: ConnectedData) => void;
  onPlanStarted?: (data: PlanStartedData) => void;
  onPlanReady?: (data: PlanReadyData) => void;
  onPlanError?: (data: PlanErrorData) => void;
  onStepStarted?: (data: StepStartedData) => void;
  onStepResult?: (data: StepResultData) => void;
  onStepError?: (data: StepErrorData) => void;
  onTaskComplete?: (data: TaskCompleteData) => void;
  onError?: (data: ErrorData) => void;
  onStateChange?: (state: WebSocketState) => void;
}
