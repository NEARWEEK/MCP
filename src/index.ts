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
import { randomUUID } from 'node:crypto';
import { NearClient, type NearClientConfig } from './near-client.js';
import type { NearNetwork } from './types.js';

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
} {
  const args = process.argv.slice(2);

  // Read configuration from environment variables
  let network: NearNetwork = (process.env.NEAR_NETWORK as NearNetwork) ?? 'mainnet';
  const rpcUrl = process.env.NEAR_RPC_URL ?? process.env.RPC_URL;
  const apiKey = process.env.NEAR_API_KEY ?? process.env.API_KEY;

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

  return { clientConfig, useHttp, port };
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

  console.error(`NEARWEEK MCP Server running on ${nearClient.getNetwork()} (stdio mode)`);
  console.error(`RPC URL: ${nearClient.getRpcUrl()}`);
  if (clientConfig.apiKey) {
    console.error('Using API Key authentication');
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
    console.error('MCP Backend API error:', error);
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
function startHttpServer(clientConfig: NearClientConfig, port: number) {
  const nearClient = new NearClient(clientConfig);
  const app = express();

  // Store server instances per session ID
  const serverSessions = new Map<string, ServerSession>();

  app.use(express.json());

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
      console.error('RPC error:', error);
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
            console.info(`MCP session initialized: ${newSessionId}`);
            // Session will be stored after handleRequest completes
          },

          // Called when session is closed (DELETE request)
          onsessionclosed: async (closedSessionId: string) => {
            console.info(`MCP session closed: ${closedSessionId}`);
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

      // Handle the request with the session's transport
      await session.transport.handleRequest(req, res, req.body);

      // Store session after first request (when sessionId is assigned)
      if (session.transport.sessionId && !serverSessions.has(session.transport.sessionId)) {
        serverSessions.set(session.transport.sessionId, session);
        console.info(`MCP session stored: ${session.transport.sessionId}`);
      }
    } catch (error) {
      console.error('MCP transport error:', error);
      if (!res.headersSent) {
        res.status(500).json({
          error: 'Internal server error',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  });

  app.listen(port, () => {
    console.info(`NEARWEEK MCP Server running on ${nearClient.getNetwork()} (HTTP mode)`);
    console.info(`RPC URL: ${nearClient.getRpcUrl()}`);
    if (clientConfig.apiKey) {
      console.info('Using API Key authentication');
    }
    console.info(`Listening on http://localhost:${port}`);
    console.info(`MCP endpoint: http://localhost:${port}/mcp`);
    console.info(`RPC endpoint: http://localhost:${port}/rpc`);
    console.info(`Health check: http://localhost:${port}/health`);
  });
}

/**
 * Main entry point
 */
async function main() {
  const { clientConfig, useHttp, port } = parseArgs();

  if (useHttp) {
    startHttpServer(clientConfig, port);
  } else {
    // Stdio mode: validate API key from environment variable
    const apiKey = process.env.MCP_API_KEY ?? process.env.API_KEY;

    if (!apiKey) {
      console.error('Error: API_KEY or MCP_API_KEY environment variable required for stdio mode');
      console.error('Set it with: export MCP_API_KEY=your-api-key-here');
      // eslint-disable-next-line n/no-process-exit
      process.exit(1);
    }

    // Validate with MCP Backend API
    console.info('Validating API key with MCP Backend API...');
    const isValid = await validateApiKey(apiKey);

    if (!isValid) {
      console.error('Error: Invalid or inactive API key');
      console.error('Please check your API key or contact the administrator');
      // eslint-disable-next-line n/no-process-exit
      process.exit(1);
    }

    console.info('✓ API key validated successfully');
    await startStdioServer(clientConfig);
  }
}

// Run the server
main().catch((error) => {
  console.error('Server error:', error);
  throw error;
});
