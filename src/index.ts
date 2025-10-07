#!/usr/bin/env node
/**
 * NEARWEEK MCP Server
 * Provides tools and resources for accessing NEAR blockchain data
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import 'dotenv/config'
import express from 'express';
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
  let network: NearNetwork = (process.env.NEAR_NETWORK as NearNetwork) || 'mainnet';
  const rpcUrl = process.env.NEAR_RPC_URL || process.env.RPC_URL;
  const apiKey = process.env.NEAR_API_KEY || process.env.API_KEY;

  let useHttp = false;
  let port = parseInt(process.env.PORT || '3000', 10);

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
    console.error(`Invalid network: ${network}. Must be 'mainnet' or 'testnet'`);
    process.exit(1);
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
    }
  );

  // Register tool call handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    // Try each tool handler
    const result = await handleBlockTools(request, nearClient)
      ?? await handleAccountTools(request, nearClient)
      ?? await handleContractTools(request, nearClient);

    if (result) {
      return result;
    }

    throw new Error(`Unknown tool: ${request.params.name}`);
  });

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        ...getBlockToolDefinitions(),
        ...getAccountToolDefinitions(),
        ...getContractToolDefinitions(),
      ],
    };
  });

  // List available resources
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return {
      resources: [
        {
          uri: 'near://account/{account_id}',
          name: 'Account Card',
          description: 'Summarized account information including balance, storage, and keys',
          mimeType: 'text/markdown',
        },
        {
          uri: 'near://blocks/latest',
          name: 'Latest Blocks',
          description: 'Feed of recent blocks (use ?count=N to specify number, default 10)',
          mimeType: 'text/markdown',
        },
        {
          uri: 'near://contract/{account_id}/readme',
          name: 'Contract README',
          description: 'Contract metadata and suggested view methods',
          mimeType: 'text/markdown',
        },
        {
          uri: 'near://network/status',
          name: 'Network Status',
          description: 'Current network status and protocol information',
          mimeType: 'text/markdown',
        },
      ],
    };
  });

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
      const count = parseInt(url.searchParams.get('count') || '10', 10);
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
    console.error(`Using API Key authentication`);
  }
}

/**
 * Start server with HTTP transport
 */
async function startHttpServer(clientConfig: NearClientConfig, port: number) {
  const nearClient = new NearClient(clientConfig);
  const app = express();

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

  // JSON-RPC endpoint for direct HTTP requests
  app.post('/rpc', async (req, res) => {
    try {
      const { method, params, id } = req.body;

      // Handle tools/list
      if (method === 'tools/list') {
        return res.json({
          jsonrpc: '2.0',
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
        const request = { params: { name: params.name, arguments: params.arguments } };
        const result = await handleBlockTools(request, nearClient)
          ?? await handleAccountTools(request, nearClient)
          ?? await handleContractTools(request, nearClient);

        if (result) {
          return res.json({
            jsonrpc: '2.0',
            id,
            result,
          });
        }

        return res.status(404).json({
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: `Unknown tool: ${params.name}` },
        });
      }

      // Handle resources/list
      if (method === 'resources/list') {
        return res.json({
          jsonrpc: '2.0',
          id,
          result: {
            resources: [
              {
                uri: 'near://account/{account_id}',
                name: 'Account Card',
                description: 'Summarized account information including balance, storage, and keys',
                mimeType: 'text/markdown',
              },
              {
                uri: 'near://blocks/latest',
                name: 'Latest Blocks',
                description: 'Feed of recent blocks (use ?count=N to specify number, default 10)',
                mimeType: 'text/markdown',
              },
              {
                uri: 'near://contract/{account_id}/readme',
                name: 'Contract README',
                description: 'Contract metadata and suggested view methods',
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

      // Handle resources/read
      if (method === 'resources/read') {
        const uri = params.uri;
        let content;

        if (uri.startsWith('near://account/')) {
          const accountId = uri.replace('near://account/', '');
          const card = await generateAccountCard(nearClient, accountId);
          content = formatAccountCard(card);
        } else if (uri.startsWith('near://blocks/latest')) {
          const url = new URL(uri);
          const count = parseInt(url.searchParams.get('count') || '10', 10);
          const blocks = await generateBlocksFeed(nearClient, count);
          content = formatBlocksFeed(blocks);
        } else if (uri.startsWith('near://contract/') && uri.endsWith('/readme')) {
          const accountId = uri.replace('near://contract/', '').replace('/readme', '');
          const readme = await generateContractReadme(nearClient, accountId);
          content = formatContractReadme(readme);
        } else if (uri === 'near://network/status') {
          const status = await generateNetworkStatus(nearClient);
          content = formatNetworkStatus(status);
        } else {
          return res.status(404).json({
            jsonrpc: '2.0',
            id,
            error: { code: -32602, message: `Unknown resource URI: ${uri}` },
          });
        }

        return res.json({
          jsonrpc: '2.0',
          id,
          result: {
            contents: [{
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
        id,
        error: { code: -32601, message: `Method not found: ${method}` },
      });
    } catch (error: any) {
      console.error('RPC error:', error);
      return res.status(500).json({
        jsonrpc: '2.0',
        id: req.body.id,
        error: { code: -32603, message: error.message || 'Internal error' },
      });
    }
  });

  // SSE/MCP endpoint for MCP clients (Claude Desktop, etc.)
  app.post('/mcp', async (_req, res) => {
    // Create a new server instance for each request to avoid state conflicts
    const server = createServer(nearClient);
    const transport = new SSEServerTransport('/mcp/message', res);

    res.on('close', () => {
      transport.close();
    });

    await server.connect(transport);
  });

  // SSE message endpoint
  app.post('/mcp/message', async (_req, res) => {
    // This endpoint is used by SSEServerTransport for bidirectional communication
    res.status(200).end();
  });

  app.listen(port, () => {
    console.log(`NEARWEEK MCP Server running on ${nearClient.getNetwork()} (HTTP mode)`);
    console.log(`RPC URL: ${nearClient.getRpcUrl()}`);
    if (clientConfig.apiKey) {
      console.log(`Using API Key authentication`);
    }
    console.log(`Listening on http://localhost:${port}`);
    console.log(`MCP endpoint: http://localhost:${port}/mcp`);
    console.log(`RPC endpoint: http://localhost:${port}/rpc`);
    console.log(`Health check: http://localhost:${port}/health`);
  });
}

/**
 * Main entry point
 */
async function main() {
  const { clientConfig, useHttp, port } = parseArgs();

  if (useHttp) {
    await startHttpServer(clientConfig, port);
  } else {
    await startStdioServer(clientConfig);
  }
}

// Run the server
main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});
