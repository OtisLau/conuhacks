/**
 * WebSocket client for real-time task execution
 *
 * Connects to the backend WebSocket endpoint for streaming
 * task planning and execution updates.
 */

import type {
  WebSocketState,
  WebSocketEventHandlers,
  ConnectedData,
  PlanStartedData,
  PlanReadyData,
  PlanErrorData,
  StepStartedData,
  StepResultData,
  StepErrorData,
  TaskCompleteData,
  ErrorData,
  WebSocketEvent,
} from '../../shared/types/websocket.types';

// WebSocket server URL
const WS_BASE_URL = process.env.ENGINE_WS_URL || 'ws://127.0.0.1:8000';

// Reconnection settings
const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAY_MS = 1000;

export class TaskWebSocket {
  private ws: WebSocket | null = null;
  private state: WebSocketState = 'disconnected';
  private handlers: WebSocketEventHandlers = {};
  private reconnectAttempts = 0;
  private currentTask: string | null = null;

  /**
   * Set event handlers
   */
  setHandlers(handlers: WebSocketEventHandlers): void {
    this.handlers = handlers;
  }

  /**
   * Get current connection state
   */
  getState(): WebSocketState {
    return this.state;
  }

  /**
   * Connect to WebSocket server
   */
  async connect(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log('WebSocket already connected');
      return;
    }

    return new Promise((resolve, reject) => {
      this.setState('connecting');

      try {
        this.ws = new WebSocket(`${WS_BASE_URL}/ws/run`);

        this.ws.onopen = () => {
          console.log('WebSocket connected');
          this.reconnectAttempts = 0;
          // Don't set state to connected yet - wait for 'connected' event
        };

        this.ws.onmessage = (event) => {
          try {
            const message: WebSocketEvent = JSON.parse(event.data);
            this.handleMessage(message);

            // Resolve on first 'connected' message
            if (message.type === 'connected') {
              resolve();
            }
          } catch (error) {
            console.error('Failed to parse WebSocket message:', error);
          }
        };

        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          this.setState('error');
          reject(new Error('WebSocket connection failed'));
        };

        this.ws.onclose = (event) => {
          console.log('WebSocket closed:', event.code, event.reason);
          this.ws = null;

          if (this.state === 'running' && this.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            // Attempt reconnect if we were in the middle of a task
            this.attemptReconnect();
          } else {
            this.setState('disconnected');
          }
        };

        // Timeout for connection
        setTimeout(() => {
          if (this.state === 'connecting') {
            this.ws?.close();
            reject(new Error('WebSocket connection timeout'));
          }
        }, 10000);
      } catch (error) {
        this.setState('error');
        reject(error);
      }
    });
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.setState('disconnected');
    this.currentTask = null;
  }

  /**
   * Start a new task
   */
  async startTask(task: string): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      await this.connect();
    }

    this.currentTask = task;
    this.setState('running');
    this.send({ type: 'start_task', data: { task } });
  }

  /**
   * Signal step completion
   */
  stepDone(): void {
    this.send({ type: 'step_done' });
  }

  /**
   * Request step retry
   */
  stepRetry(): void {
    this.send({ type: 'step_retry' });
  }

  /**
   * Skip current step
   */
  stepSkip(): void {
    this.send({ type: 'step_skip' });
  }

  /**
   * Cancel task execution
   */
  cancel(): void {
    this.send({ type: 'cancel' });
    this.currentTask = null;
    this.setState('connected');
  }

  /**
   * Send a message to the server
   */
  private send(message: object): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.error('Cannot send message: WebSocket not connected');
    }
  }

  /**
   * Update connection state and notify handlers
   */
  private setState(state: WebSocketState): void {
    this.state = state;
    this.handlers.onStateChange?.(state);
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(message: WebSocketEvent): void {
    console.log('WebSocket message:', message.type, message.data);

    switch (message.type) {
      case 'connected':
        this.setState('connected');
        this.handlers.onConnected?.(message.data as ConnectedData);
        break;

      case 'plan_started':
        this.handlers.onPlanStarted?.(message.data as PlanStartedData);
        break;

      case 'plan_ready':
        this.handlers.onPlanReady?.(message.data as PlanReadyData);
        break;

      case 'plan_error':
        this.handlers.onPlanError?.(message.data as PlanErrorData);
        this.setState('error');
        break;

      case 'step_started':
        this.handlers.onStepStarted?.(message.data as StepStartedData);
        break;

      case 'step_result':
        this.handlers.onStepResult?.(message.data as StepResultData);
        break;

      case 'step_error':
        this.handlers.onStepError?.(message.data as StepErrorData);
        break;

      case 'task_complete':
        this.handlers.onTaskComplete?.(message.data as TaskCompleteData);
        this.currentTask = null;
        this.setState('connected');
        break;

      case 'error':
        this.handlers.onError?.(message.data as ErrorData);
        this.setState('error');
        break;

      default:
        console.warn('Unknown WebSocket message type:', message.type);
    }
  }

  /**
   * Attempt to reconnect after disconnection
   */
  private async attemptReconnect(): Promise<void> {
    this.reconnectAttempts++;
    console.log(`Attempting reconnect (${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);

    await new Promise((resolve) => setTimeout(resolve, RECONNECT_DELAY_MS));

    try {
      await this.connect();

      // If we had an active task, we can't resume it (state was lost)
      // Notify via error handler
      if (this.currentTask) {
        this.handlers.onError?.({
          error: 'Connection lost during task execution. Please try again.',
        });
        this.currentTask = null;
      }
    } catch (error) {
      console.error('Reconnect failed:', error);
      if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        this.setState('error');
        this.handlers.onError?.({
          error: 'Failed to reconnect to server after multiple attempts.',
        });
      }
    }
  }
}

// Export singleton instance
export const taskWebSocket = new TaskWebSocket();
