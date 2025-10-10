/**
 * Pino logger configuration for MCP server
 * Provides structured logging with configurable log levels
 */

import pino, { type Logger } from 'pino';

// Valid log levels
export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';

/**
 * Create a logger instance with configuration
 */
export function createLogger(level: LogLevel = 'info', isDevelopment = false): Logger {
  return pino({
    level,
    transport: isDevelopment ? {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    } : undefined,
  });
}

/**
 * Global logger instance (initialized in index.ts)
 */
let globalLogger: Logger;

/**
 * Initialize the global logger
 */
export function initLogger(level: LogLevel, isDevelopment: boolean): void {
  globalLogger = createLogger(level, isDevelopment);
}

/**
 * Get the global logger instance
 */
export function getLogger(): Logger {
  if (!globalLogger) {
    // Fallback to default logger if not initialized
    globalLogger = createLogger();
  }
  return globalLogger;
}

/**
 * Log an error with stack trace
 */
export function logError(message: string, error: unknown, context?: Record<string, unknown>): void {
  const logger = getLogger();
  const errorContext = {
    ...context,
    ...(error instanceof Error && {
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
    }),
  };
  logger.error(errorContext, message);
}

/**
 * Log a fatal error with stack trace
 */
export function logFatal(message: string, error: unknown, context?: Record<string, unknown>): void {
  const logger = getLogger();
  const errorContext = {
    ...context,
    ...(error instanceof Error && {
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
    }),
  };
  logger.fatal(errorContext, message);
}
