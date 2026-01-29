/**
 * Utility functions for user-friendly error messages
 */

/**
 * Convert technical error messages to user-friendly ones
 */
export function getUserFriendlyError(error: string | Error): string {
  const message = error instanceof Error ? error.message : error;
  const lowerMessage = message.toLowerCase();

  // Connection errors
  if (lowerMessage.includes('econnrefused') || lowerMessage.includes('cannot connect')) {
    return 'Cannot connect to backend server. Please make sure it is running.';
  }

  if (lowerMessage.includes('connection lost') || lowerMessage.includes('websocket')) {
    return 'Connection to server was lost. Please try again.';
  }

  if (lowerMessage.includes('timeout')) {
    return 'Request timed out. The server may be busy or unavailable.';
  }

  // API errors
  if (lowerMessage.includes('api error: 500') || lowerMessage.includes('server error')) {
    return 'Server encountered an error. Please try again.';
  }

  if (lowerMessage.includes('api error: 404')) {
    return 'The requested resource was not found.';
  }

  if (lowerMessage.includes('api error: 400') || lowerMessage.includes('validation')) {
    return 'Invalid request. Please check your input.';
  }

  if (lowerMessage.includes('api error: 429') || lowerMessage.includes('rate limit')) {
    return 'Too many requests. Please wait a moment and try again.';
  }

  // Screenshot errors
  if (lowerMessage.includes('screenshot')) {
    return 'Failed to capture screenshot. Please check screen capture permissions.';
  }

  // Plan generation errors
  if (lowerMessage.includes('plan') && lowerMessage.includes('fail')) {
    return 'Failed to generate a plan. Try rephrasing your task.';
  }

  if (lowerMessage.includes('no steps') || lowerMessage.includes('empty plan')) {
    return 'Could not determine steps for this task. Try being more specific.';
  }

  // Element location errors
  if (lowerMessage.includes('could not find') || lowerMessage.includes('element not found')) {
    return message; // Keep these as-is since they're already user-friendly
  }

  // AI service errors
  if (lowerMessage.includes('gemini') || lowerMessage.includes('ai service')) {
    return 'AI service is unavailable. Please check your API configuration.';
  }

  if (lowerMessage.includes('tesseract') || lowerMessage.includes('ocr')) {
    return 'OCR service is unavailable. Please check Tesseract installation.';
  }

  // Generic fallback
  if (message.length > 100) {
    return 'An error occurred. Please try again.';
  }

  return message;
}

/**
 * Categorize error for logging/analytics
 */
export type ErrorCategory =
  | 'connection'
  | 'timeout'
  | 'server'
  | 'validation'
  | 'screenshot'
  | 'plan'
  | 'locate'
  | 'service'
  | 'unknown';

export function categorizeError(error: string | Error): ErrorCategory {
  const message = (error instanceof Error ? error.message : error).toLowerCase();

  if (message.includes('connect') || message.includes('websocket')) return 'connection';
  if (message.includes('timeout')) return 'timeout';
  if (message.includes('500') || message.includes('server error')) return 'server';
  if (message.includes('400') || message.includes('validation')) return 'validation';
  if (message.includes('screenshot')) return 'screenshot';
  if (message.includes('plan')) return 'plan';
  if (message.includes('find') || message.includes('locate')) return 'locate';
  if (message.includes('gemini') || message.includes('tesseract')) return 'service';

  return 'unknown';
}
