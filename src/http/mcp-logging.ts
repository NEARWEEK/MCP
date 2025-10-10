/**
 * MCP protocol logging utilities for capturing JSON-RPC messages over SSE
 */
import type express from 'express';
import { getLogger } from '../logger.js';

/**
 * Log incoming MCP request at trace level
 */
export function logMcpRequest(req: express.Request, sessionId?: string): void {
  const logger = getLogger();

  if (logger.level === 'trace' && req.body) {
    logger.trace(
      {
        request: req.body as unknown,
        sessionId: sessionId ?? 'new',
      },
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      `MCP → Server: ${req.body.method ?? 'unknown'}`,
    );
  }
}

/**
 * Parse and log SSE data lines containing JSON-RPC responses
 */
function parseAndLogSseData(data: string): void {
  const logger = getLogger();

  // SSE format can have multiple lines, split by newlines
  const lines = data.split('\n');
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const json = JSON.parse(line.substring(6));
        logger.trace(
          { response: json },
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          `MCP ← Server: ${json.result ? 'result' : json.error ? 'error' : 'message'}`,
        );
      } catch {
        // Ignore parse errors for non-JSON SSE data
      }
    }
  }
}

/**
 * Wrap Express response methods to capture outgoing SSE messages for trace logging
 * This intercepts res.write() and res.end() to log JSON-RPC responses
 */
export function wrapResponseForMcpLogging(res: express.Response): void {
  const logger = getLogger();

  if (logger.level !== 'trace') {
    return; // Only wrap at trace level
  }

  const originalWrite = res.write.bind(res);
  const originalEnd = res.end.bind(res);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  res.write = function(chunk: any, ...args: any[]) {
    // Parse SSE data
    if (typeof chunk === 'string' || Buffer.isBuffer(chunk)) {
      const data = chunk.toString();
      parseAndLogSseData(data);
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    return originalWrite(chunk, ...args);
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  res.end = function(chunk: any, ...args: any[]) {
    if (chunk && (typeof chunk === 'string' || Buffer.isBuffer(chunk))) {
      const data = chunk.toString();
      parseAndLogSseData(data);
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    return originalEnd(chunk, ...args);
  };
}
