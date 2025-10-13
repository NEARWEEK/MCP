/**
 * Express middleware functions for HTTP server
 */
import type express from 'express';
import { getLogger } from '../logger.js';

/**
 * Mask API key in URL query parameters for logging
 */
export function maskApiKeyInUrl(url: string): string {
  if (!url.includes('apiKey=')) {
    return url;
  }

  // Replace apiKey parameter value with asterisks
  return url.replace(/apiKey=([^&]+)/g, 'apiKey=***');
}

/**
 * Middleware to capture response bodies for trace logging
 * Wraps res.json() and res.send() to store the response body
 */
export function createResponseCaptureMiddleware(): express.RequestHandler {
  return (_req, res, next) => {
    const originalJson = res.json.bind(res);
    const originalSend = res.send.bind(res);

    res.json = function(body: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
      (res as any).capturedBody = body;
      return originalJson(body);
    };

    res.send = function(body: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
      (res as any).capturedBody = body;
      return originalSend(body);
    };

    next();
  };
}

/**
 * Middleware for structured HTTP logging
 * Logs all requests at trace level, and errors at error level
 * Excludes /mcp endpoint (which has its own MCP protocol logging)
 */
export function createStructuredLoggingMiddleware(): express.RequestHandler {
  return (req, res, next) => {
    const logger = getLogger();
    const start = Date.now();

    res.on('finish', () => {
      const duration = Date.now() - start;

      // Mask API key in URL for logging
      const maskedUrl = maskApiKeyInUrl(req.url);

      // Check if this is /mcp endpoint (regardless of query params)
      const path = req.url.split('?')[0];
      const isMcpEndpoint = path === '/mcp';

      const logData = {
        method: req.method,
        url: maskedUrl,
        // Don't log request/response body for /mcp (has its own logging)
        ...(!isMcpEndpoint && {
          requestBody: req.body as unknown,
        }),
        statusCode: res.statusCode,
        responseTime: duration,
        ...(logger.level === 'trace' && !isMcpEndpoint && {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
          responseBody: (res as any).capturedBody,
          responseHeaders: {
            'content-type': res.get('content-type'),
            'content-length': res.get('content-length'),
          },
        }),
      };

      // Only log errors to structured logs, or everything at trace level
      if (res.statusCode >= 500) {
        // 5xx errors: log at error level (without req/res details unless trace)
        logger.error(`${req.method} ${maskedUrl} ${res.statusCode}`);
      } else if (logger.level === 'trace' && !isMcpEndpoint) {
        // Trace level: log all requests with details (except /mcp which has its own logging)
        logger.trace(logData, `${req.method} ${maskedUrl} ${res.statusCode}`);
      }
      // /mcp endpoint: only MCP protocol messages logged (not HTTP details)
      // 4xx errors: only in access log, not structured log (unless trace)
      // 2xx/3xx: only in access log, not structured log (unless trace)
    });

    next();
  };
}
