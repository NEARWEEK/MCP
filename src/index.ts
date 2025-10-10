#!/usr/bin/env node
/**
 * NEARWEEK MCP Server
 * Provides tools and resources for accessing NEAR blockchain data
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import 'dotenv/config';
import express from 'express';
import morgan from 'morgan';
import { randomUUID } from 'node:crypto';
import { NearClient, type NearClientConfig } from './near-client.js';
import type { NearNetwork } from './types.js';
import { initLogger, getLogger, logError, logFatal, type LogLevel } from './logger.js';

// Tool handlers
import { handleBlockTools, getBlockToolDefinitions } from './tools/block-tools.js';
import { handleAccountTools, getAccountToolDefinitions } from './tools/account-tools.js';
import { handleContractTools, getContractToolDefinitions } from './tools/contract-tools.js';

// Resource handlers
import { generateAccountCard, formatAccountCard } from './resources/account-resource.js';
import { generateBlocksFeed, formatBlocksFeed } from './resources/blocks-resource.js';
import { generateContractReadme, formatContractReadme } from './resources/contract-resource.js';
import { generateNetworkStatus, formatNetworkStatus } from './resources/network-resource.js';

/**
 * Parse command line arguments and environment variables
 */
function parseArgs(): {
  clientConfig: NearClientConfig;
  useHttp: boolean;
  port: number;
  logLevel: LogLevel;
  isDevelopment: boolean;
  accessLogFormat: string;
} {
  const args = process.argv.slice(2);

  // Read configuration from environment variables
  let network: NearNetwork = (process.env.NEAR_NETWORK as NearNetwork) ?? 'mainnet';
  const rpcUrl = process.env.NEAR_RPC_URL ?? process.env.RPC_URL;
  const apiKey = process.env.NEAR_API_KEY ?? process.env.API_KEY;
  const logLevel = (process.env.LOG_LEVEL ?? 'info') as LogLevel;
  const isDevelopment = process.env.NODE_ENV !== 'production';
  const accessLogFormat = process.env.ACCESS_LOG_FORMAT ?? '[:date[iso]] :method :url :status :response-time ms - :res[content-length]';

  let useHttp = false;
  let port = parseInt(process.env.PORT ?? '3000', 10);

  // Parse command line arguments
  for (const arg of args) {
    if (arg === '--http' || arg === '-h') {
      useHttp = true;
    } else if (arg === 'mainnet' || arg === 'testnet') {
      network = arg;
    } else if (arg.startsWith('--port=')) {
      port = parseInt(arg.split('=')[1], 10);
    }
  }

  if (network !== 'mainnet' && network !== 'testnet') {
    const message = `Invalid network: ${String(network)}. Must be 'mainnet' or 'testnet'`;
    console.error(message);
    throw new Error(message);
  }

  const clientConfig: NearClientConfig = {
    network,
    rpcUrl,
    apiKey,
  };

  return { clientConfig, useHttp, port, logLevel, isDevelopment, accessLogFormat };
}

/**
 * Create and configure MCP server
 */
function createServer(nearClient: NearClient): Server {
  const server = new Server(
    {
      name: '@nearweek/mcp-server',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    },
  );

  // Register tool call handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    // Try each tool handler
    const result = (await handleBlockTools(request, nearClient))
      ?? (await handleAccountTools(request, nearClient))
      ?? (await handleContractTools(request, nearClient));

    if (result) {
      return result;
    }

    throw new Error(`Unknown tool: ${request.params.name}`);
  });

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, () => ({
      tools: [
        ...getBlockToolDefinitions(),
        ...getAccountToolDefinitions(),
        ...getContractToolDefinitions(),
      ],
    }));

  // List available resources
  server.setRequestHandler(ListResourcesRequestSchema, () => ({
      resources: [
        {
          uri: 'near://blocks/latest',
          name: 'Latest Blocks',
          description: 'Feed of recent blocks (use ?count=N to specify number, default 10)',
          mimeType: 'text/markdown',
        },
        {
          uri: 'near://network/status',
          name: 'Network Status',
          description: 'Current network status and protocol information',
          mimeType: 'text/markdown',
        },
      ],
    }));

  // List available resource templates
  server.setRequestHandler(ListResourceTemplatesRequestSchema, () => ({
      resourceTemplates: [
        {
          uriTemplate: 'near://account/{account_id}',
          name: 'Account Card',
          description: 'Summarized account information including balance, storage, and keys',
          mimeType: 'text/markdown',
        },
        {
          uriTemplate: 'near://contract/{account_id}/readme',
          name: 'Contract README',
          description: 'Contract metadata and suggested view methods',
          mimeType: 'text/markdown',
        },
      ],
    }));

  // Handle resource reads
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const uri = request.params.uri;

    // Account card: near://account/{account_id}
    if (uri.startsWith('near://account/')) {
      const accountId = uri.replace('near://account/', '');
      const card = await generateAccountCard(nearClient, accountId);
      return {
        contents: [
          {
            uri,
            mimeType: 'text/markdown',
            text: formatAccountCard(card),
          },
        ],
      };
    }

    // Latest blocks: near://blocks/latest?count=10
    if (uri.startsWith('near://blocks/latest')) {
      const url = new URL(uri);
      const count = parseInt(url.searchParams.get('count') ?? '10', 10);
      const blocks = await generateBlocksFeed(nearClient, count);
      return {
        contents: [
          {
            uri,
            mimeType: 'text/markdown',
            text: formatBlocksFeed(blocks),
          },
        ],
      };
    }

    // Contract README: near://contract/{account_id}/readme
    if (uri.startsWith('near://contract/') && uri.endsWith('/readme')) {
      const accountId = uri.replace('near://contract/', '').replace('/readme', '');
      const readme = await generateContractReadme(nearClient, accountId);
      return {
        contents: [
          {
            uri,
            mimeType: 'text/markdown',
            text: formatContractReadme(readme),
          },
        ],
      };
    }

    // Network status: near://network/status
    if (uri === 'near://network/status') {
      const status = await generateNetworkStatus(nearClient);
      return {
        contents: [
          {
            uri,
            mimeType: 'text/markdown',
            text: formatNetworkStatus(status),
          },
        ],
      };
    }

    throw new Error(`Unknown resource URI: ${uri}`);
  });

  return server;
}

/**
 * Start server with stdio transport
 */
async function startStdioServer(clientConfig: NearClientConfig) {
  const nearClient = new NearClient(clientConfig);
  const server = createServer(nearClient);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  const logger = getLogger();
  logger.info(`NEARWEEK MCP Server running on ${nearClient.getNetwork()} (stdio mode)`);
  logger.info(`RPC URL: ${nearClient.getRpcUrl()}`);
  if (clientConfig.apiKey) {
    logger.info('Using API Key authentication');
  }
}

/**
 * Session storage for maintaining server instances across requests
 */
interface ServerSession {
  server: Server;
  transport: StreamableHTTPServerTransport;
  nearClient: NearClient;
}

/**
 * Validate API key with MCP Backend API
 * @param key The API key to validate
 * @returns true if key is valid, false otherwise
 */
async function validateApiKey(key: string): Promise<boolean> {
  try {
    const authBackendUrl = process.env.AUTH_BACKEND_URL ?? 'http://localhost:3001';
    const response = await fetch(`${authBackendUrl}/api/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key }),
    });

    if (!response.ok) {
      return false;
    }

    const result = await response.json() as { valid: boolean };
    return result.valid === true;
  } catch (error) {
    logError('MCP Backend API error', error);
    return false;
  }
}

/**
 * Express middleware to validate API key from Authorization header
 */
async function authMiddleware(req: express.Request, res: express.Response, next: express.NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Missing or invalid Authorization header. Expected: Authorization: Bearer <api-key>',
    });
    return;
  }

  const apiKey = authHeader.substring(7); // Remove "Bearer "

  const isValid = await validateApiKey(apiKey);

  if (!isValid) {
    res.status(403).json({
      error: 'Forbidden',
      message: 'Invalid or inactive API key',
    });
    return;
  }

  // API key is valid, continue to next handler
  next();
}

/**
 * Start server with HTTP transport
 */
function startHttpServer(clientConfig: NearClientConfig, port: number, accessLogFormat: string, logLevel: LogLevel) {
  const nearClient = new NearClient(clientConfig);
  const app = express();
  const logger = getLogger();

  // Store server instances per session ID
  const serverSessions = new Map<string, ServerSession>();

  // Morgan access logging (always enabled)
  app.use(morgan(accessLogFormat));

  // Response body capture middleware (for trace logging)
  app.use((_req, res, next) => {
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
  });

  app.use(express.json());

  // Structured logging middleware (only at trace level for normal requests)
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      const logData = {
        method: req.method,
        url: req.url,
        // Don't log request/response body for /mcp (has its own logging)
        ...(req.url !== '/mcp' && {
          requestBody: req.body as unknown,
        }),
        statusCode: res.statusCode,
        responseTime: duration,
        ...(logger.level === 'trace' && req.url !== '/mcp' && {
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
        logger.error(`${req.method} ${req.url} ${res.statusCode}`);
      } else if (logger.level === 'trace' && req.url !== '/mcp') {
        // Trace level: log all requests with details (except /mcp which has its own logging)
        logger.trace(logData, `${req.method} ${req.url} ${res.statusCode}`);
      }
      // /mcp endpoint: only MCP protocol messages logged (not HTTP details)
      // 4xx errors: only in access log, not structured log (unless trace)
      // 2xx/3xx: only in access log, not structured log (unless trace)
    });
    next();
  });

  // Health check endpoint
  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      network: nearClient.getNetwork(),
      rpcUrl: nearClient.getRpcUrl(),
      hasApiKey: !!clientConfig.apiKey,
    });
  });

  // JSON-RPC endpoint for direct HTTP requests (with authentication)
  app.post('/rpc', authMiddleware, async (req, res) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const { method, params, id } = req.body;

      // Handle tools/list
      if (method === 'tools/list') {
        return res.json({
          jsonrpc: '2.0',
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          id,
          result: {
            tools: [
              ...getBlockToolDefinitions(),
              ...getAccountToolDefinitions(),
              ...getContractToolDefinitions(),
            ],
          },
        });
      }

      // Handle tools/call
      if (method === 'tools/call') {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        const request = { params: { name: params.name, arguments: params.arguments } };
        const result = (await handleBlockTools(request, nearClient))
          ?? (await handleAccountTools(request, nearClient))
          ?? (await handleContractTools(request, nearClient));

        if (result) {
          return res.json({
            jsonrpc: '2.0',
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            id,
            result,
          });
        }

        return res.status(404).json({
          jsonrpc: '2.0',
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          id,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          error: { code: -32601, message: `Unknown tool: ${String(params.name)}` },
        });
      }

      // Handle resources/list
      if (method === 'resources/list') {
        return res.json({
          jsonrpc: '2.0',
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          id,
          result: {
            resources: [
              {
                uri: 'near://blocks/latest',
                name: 'Latest Blocks',
                description: 'Feed of recent blocks (use ?count=N to specify number, default 10)',
                mimeType: 'text/markdown',
              },
              {
                uri: 'near://network/status',
                name: 'Network Status',
                description: 'Current network status and protocol information',
                mimeType: 'text/markdown',
              },
            ],
          },
        });
      }

      // Handle resources/templates/list
      if (method === 'resources/templates/list') {
        return res.json({
          jsonrpc: '2.0',
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          id,
          result: {
            resourceTemplates: [
              {
                uriTemplate: 'near://account/{account_id}',
                name: 'Account Card',
                description: 'Summarized account information including balance, storage, and keys',
                mimeType: 'text/markdown',
              },
              {
                uriTemplate: 'near://contract/{account_id}/readme',
                name: 'Contract README',
                description: 'Contract metadata and suggested view methods',
                mimeType: 'text/markdown',
              },
            ],
          },
        });
      }

      // Handle resources/read
      if (method === 'resources/read') {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        const uri = params.uri;
        let content: string;

        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        if (uri.startsWith('near://account/')) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
          const accountId = uri.replace('near://account/', '') as string;
          const card = await generateAccountCard(nearClient, accountId);
          content = formatAccountCard(card);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        } else if (uri.startsWith('near://blocks/latest')) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
          const url = new URL(uri);
          const count = parseInt(url.searchParams.get('count') ?? '10', 10);
          const blocks = await generateBlocksFeed(nearClient, count);
          content = formatBlocksFeed(blocks);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        } else if (uri.startsWith('near://contract/') && uri.endsWith('/readme')) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
          const accountId = uri.replace('near://contract/', '').replace('/readme', '') as string;
          const readme = await generateContractReadme(nearClient, accountId);
          content = formatContractReadme(readme);
        } else if (uri === 'near://network/status') {
          const status = await generateNetworkStatus(nearClient);
          content = formatNetworkStatus(status);
        } else {
          return res.status(404).json({
            jsonrpc: '2.0',
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            id,
             
            error: { code: -32602, message: `Unknown resource URI: ${String(uri)}` },
          });
        }

        return res.json({
          jsonrpc: '2.0',
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          id,
          result: {
            contents: [{
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
              uri,
              mimeType: 'text/markdown',
              text: content,
            }],
          },
        });
      }

      // Unknown method
      return res.status(404).json({
        jsonrpc: '2.0',
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        id,
         
        error: { code: -32601, message: `Method not found: ${String(method)}` },
      });
    } catch (error: unknown) {
      logError('RPC error', error);
      const errorMessage = error instanceof Error ? error.message : 'Internal error';
      return res.status(500).json({
        jsonrpc: '2.0',
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        id: req.body.id,
        error: { code: -32603, message: errorMessage },
      });
    }
  });

  // MCP Streamable HTTP Transport endpoint (with authentication)
  // Handles GET (SSE streams), POST (JSON-RPC messages), and DELETE (session termination)
  app.all('/mcp', authMiddleware, async (req, res) => {
    try {
      // Extract session ID from request header (if present)
      const sessionId = req.headers['mcp-session-id'] as string | undefined;

      // Try to get existing session
      let session = sessionId ? serverSessions.get(sessionId) : undefined;

      if (!session) {
        // Create new session with transport and server
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          enableJsonResponse: false, // Use SSE streaming for real-time updates

          // Called when a new session is initialized
          onsessioninitialized: (newSessionId: string) => {
            logger.info(`MCP session initialized: ${newSessionId}`);
            // Session will be stored after handleRequest completes
          },

          // Called when session is closed (DELETE request)
          onsessionclosed: async (closedSessionId: string) => {
            logger.info(`MCP session closed: ${closedSessionId}`);
            const closedSession = serverSessions.get(closedSessionId);
            if (closedSession) {
              // Clean up server instance
              await closedSession.server.close();
              serverSessions.delete(closedSessionId);
            }
          },
        });

        // Create new server instance for this session
        const server = createServer(nearClient);
        await server.connect(transport);

        session = { server, transport, nearClient };
      }

      // Log incoming MCP request at trace level
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

      // Capture outgoing SSE messages for trace logging
      if (logger.level === 'trace') {
        const originalWrite = res.write.bind(res);
        const originalEnd = res.end.bind(res);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        res.write = function(chunk: any, ...args: any[]) {
          // Parse SSE data
          if (typeof chunk === 'string' || Buffer.isBuffer(chunk)) {
            const data = chunk.toString();
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
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
          return originalWrite(chunk, ...args);
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        res.end = function(chunk: any, ...args: any[]) {
          if (chunk && (typeof chunk === 'string' || Buffer.isBuffer(chunk))) {
            const data = chunk.toString();
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
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
          return originalEnd(chunk, ...args);
        };
      }

      // Handle the request with the session's transport
      await session.transport.handleRequest(req, res, req.body);

      // Store session after first request (when sessionId is assigned)
      if (session.transport.sessionId && !serverSessions.has(session.transport.sessionId)) {
        serverSessions.set(session.transport.sessionId, session);
        logger.info(`MCP session stored: ${session.transport.sessionId}`);
      }
    } catch (error) {
      logError('MCP transport error', error);
      if (!res.headersSent) {
        res.status(500).json({
          error: 'Internal server error',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  });

  app.listen(port, () => {
    logger.info(`NEARWEEK MCP Server running on ${nearClient.getNetwork()} (HTTP mode)`);
    logger.info(`RPC URL: ${nearClient.getRpcUrl()}`);
    if (clientConfig.apiKey) {
      logger.info('Using API Key authentication');
    }
    logger.info(`Listening on http://localhost:${port}`);
    logger.info(`MCP endpoint: http://localhost:${port}/mcp`);
    logger.info(`RPC endpoint: http://localhost:${port}/rpc`);
    logger.info(`Health check: http://localhost:${port}/health`);
    logger.info(`Access log format: ${accessLogFormat}`);
    logger.info(`Log Level: ${logLevel}`);
  });
}

/**
 * Main entry point
 */
async function main() {
  const { clientConfig, useHttp, port, logLevel, isDevelopment, accessLogFormat } = parseArgs();

  // Initialize logger
  initLogger(logLevel, isDevelopment);
  const logger = getLogger();

  if (useHttp) {
    startHttpServer(clientConfig, port, accessLogFormat, logLevel);
  } else {
    // Stdio mode: validate API key from environment variable
    const apiKey = process.env.MCP_API_KEY ?? process.env.API_KEY;

    if (!apiKey) {
      logger.error('Error: API_KEY or MCP_API_KEY environment variable required for stdio mode');
      logger.error('Set it with: export MCP_API_KEY=your-api-key-here');
      // eslint-disable-next-line n/no-process-exit
      process.exit(1);
    }

    // Validate with MCP Backend API
    logger.info('Validating API key with MCP Backend API...');
    const isValid = await validateApiKey(apiKey);

    if (!isValid) {
      logger.error('Error: Invalid or inactive API key');
      logger.error('Please check your API key or contact the administrator');
      // eslint-disable-next-line n/no-process-exit
      process.exit(1);
    }

    logger.info('✓ API key validated successfully');
    await startStdioServer(clientConfig);
  }
}

// Run the server
main().catch((error) => {
  logFatal('Server error', error);
  throw error;
});
