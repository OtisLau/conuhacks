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
const CONNECTION_TIMEOUT_MS = 10000;
const HEARTBEAT_INTERVAL_MS = 30000;

export class TaskWebSocket {
  private ws: WebSocket | null = null;
  private state: WebSocketState = 'disconnected';
  private handlers: WebSocketEventHandlers = {};
  private reconnectAttempts = 0;
  private currentTask: string | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private connectionTimeout: NodeJS.Timeout | null = null;

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

    // Clear any existing connection timeout
    this.clearConnectionTimeout();

    return new Promise((resolve, reject) => {
      this.setState('connecting');

      try {
        const wsUrl = `${WS_BASE_URL}/ws/run`;
        console.log('Connecting to WebSocket:', wsUrl);
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
          console.log('WebSocket connection opened');
          this.reconnectAttempts = 0;
          this.clearConnectionTimeout();
          // Don't set state to connected yet - wait for 'connected' event from server
        };

        this.ws.onmessage = (event) => {
          try {
            const message: WebSocketEvent = JSON.parse(event.data);
            this.handleMessage(message);

            // Resolve on first 'connected' message
            if (message.type === 'connected') {
              this.clearConnectionTimeout();
              this.startHeartbeat();
              resolve();
            }
          } catch (error) {
            console.error('Failed to parse WebSocket message:', error);
          }
        };

        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          this.clearConnectionTimeout();
          this.stopHeartbeat();
          this.setState('error');
          reject(new Error('WebSocket connection failed. Is the backend server running?'));
        };

        this.ws.onclose = (event) => {
          console.log('WebSocket closed:', event.code, event.reason);
          this.clearConnectionTimeout();
          this.stopHeartbeat();
          this.ws = null;

          // Handle different close codes
          const wasRunning = this.state === 'running';
          const closeReason = this.getCloseReason(event.code);

          if (wasRunning && this.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            // Attempt reconnect if we were in the middle of a task
            console.log(`Connection lost during task. ${closeReason}`);
            this.attemptReconnect();
          } else {
            this.setState('disconnected');
            if (wasRunning) {
              this.handlers.onError?.({
                error: `Connection lost: ${closeReason}`,
              });
            }
          }
        };

        // Set connection timeout
        this.connectionTimeout = setTimeout(() => {
          if (this.state === 'connecting') {
            console.error('WebSocket connection timeout');
            this.ws?.close();
            this.setState('error');
            reject(new Error('Connection timeout. Backend may be unavailable.'));
          }
        }, CONNECTION_TIMEOUT_MS);
      } catch (error) {
        this.clearConnectionTimeout();
        this.setState('error');
        const message = error instanceof Error ? error.message : 'Unknown error';
        reject(new Error(`Failed to connect: ${message}`));
      }
    });
  }

  /**
   * Get human-readable close reason from WebSocket close code
   */
  private getCloseReason(code: number): string {
    switch (code) {
      case 1000: return 'Normal closure';
      case 1001: return 'Server going away';
      case 1002: return 'Protocol error';
      case 1003: return 'Unsupported data';
      case 1006: return 'Connection lost unexpectedly';
      case 1007: return 'Invalid data received';
      case 1008: return 'Policy violation';
      case 1009: return 'Message too large';
      case 1011: return 'Server error';
      case 1015: return 'TLS handshake failed';
      default: return `Error code ${code}`;
    }
  }

  /**
   * Clear connection timeout timer
   */
  private clearConnectionTimeout(): void {
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }
  }

  /**
   * Start heartbeat to keep connection alive
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    // WebSocket ping/pong is handled at protocol level
    // This is just for monitoring connection health
    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        // Connection is still open
      } else if (this.state === 'connected' || this.state === 'running') {
        console.warn('Heartbeat detected closed connection');
        this.setState('error');
        this.handlers.onError?.({
          error: 'Connection lost. Please try again.',
        });
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  /**
   * Stop heartbeat timer
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect(): void {
    this.clearConnectionTimeout();
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
    this.setState('disconnected');
    this.currentTask = null;
    this.reconnectAttempts = 0;
  }

  /**
   * Start a new task
   */
  async startTask(task: string): Promise<void> {
    try {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        await this.connect();
      }

      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        throw new Error('Failed to establish connection');
      }

      this.currentTask = task;
      this.setState('running');
      this.send({ type: 'start_task', data: { task } });
    } catch (error) {
      this.setState('error');
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.handlers.onError?.({
        error: `Failed to start task: ${message}`,
      });
      throw error;
    }
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
