#!/usr/bin/env node
/**
 * NEARWEEK MCP Server
 * Provides tools and resources for accessing NEAR blockchain data
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
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
import { NearClient, type NearClientConfig } from './near-client.js';
import type { NearNetwork } from './types.js';
import { initLogger, getLogger, logError, logFatal, type LogLevel } from './logger.js';

// HTTP module imports
import { createResponseCaptureMiddleware, createStructuredLoggingMiddleware, maskApiKeyInUrl } from './http/middleware.js';
import { createHealthCheckHandler, createRpcHandler, createMcpHandler } from './http/handlers.js';
import { SessionManager } from './http/session.js';

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
  const apiKey = process.env.NEAR_API_KEY;
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
 * Express middleware to validate API key from Authorization header or query parameter
 */
async function authMiddleware(req: express.Request, res: express.Response, next: express.NextFunction): Promise<void> {
  const logger = getLogger();

  // Try to get API key from Authorization header first
  let apiKey: string | undefined;

  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    apiKey = authHeader.substring(7); // Remove "Bearer "
  }

  // Fallback to query parameter if header not present
  if (!apiKey && req.query.apiKey) {
    apiKey = req.query.apiKey as string;
    logger.debug('API key provided via query parameter (consider using Authorization header for production)');
  }

  // No API key found in either location
  if (!apiKey) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Missing API key. Provide either Authorization: Bearer <api-key> header or apiKey query parameter',
    });
    return;
  }

  // Validate the API key
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

  // Create session manager for MCP sessions
  const sessionManager = new SessionManager();

  // Configure middleware
  app.set('trust proxy', true);

  // Configure morgan to mask API keys in access logs
  morgan.token('masked-url', (req) => maskApiKeyInUrl(req.url ?? ''));
  const maskedAccessLogFormat = accessLogFormat.replace(/:url/g, ':masked-url');

  app.use(morgan(maskedAccessLogFormat)); // Access logging with masked URLs
  app.use(createResponseCaptureMiddleware()); // Response body capture for trace logging
  app.use(express.json()); // Parse JSON bodies
  app.use(createStructuredLoggingMiddleware()); // Structured HTTP logging

  // Register endpoints
  app.get('/health', createHealthCheckHandler(nearClient, clientConfig));
  app.post('/rpc', authMiddleware, createRpcHandler(nearClient));
  app.all('/mcp', authMiddleware, createMcpHandler(sessionManager, createServer, nearClient));

  // Start listening
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
