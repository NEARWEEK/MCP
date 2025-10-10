/**
 * HTTP endpoint handlers for Express routes
 */
import type express from 'express';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { NearClient, NearClientConfig } from '../near-client.js';
import { logError } from '../logger.js';
import { logMcpRequest, wrapResponseForMcpLogging } from './mcp-logging.js';
import type { SessionManager, ServerSession } from './session.js';

// Tool handlers
import { handleBlockTools, getBlockToolDefinitions } from '../tools/block-tools.js';
import { handleAccountTools, getAccountToolDefinitions } from '../tools/account-tools.js';
import { handleContractTools, getContractToolDefinitions } from '../tools/contract-tools.js';

// Resource handlers
import { generateAccountCard, formatAccountCard } from '../resources/account-resource.js';
import { generateBlocksFeed, formatBlocksFeed } from '../resources/blocks-resource.js';
import { generateContractReadme, formatContractReadme } from '../resources/contract-resource.js';
import { generateNetworkStatus, formatNetworkStatus } from '../resources/network-resource.js';

/**
 * Health check endpoint handler
 */
export function createHealthCheckHandler(nearClient: NearClient, clientConfig: NearClientConfig): express.RequestHandler {
  return (_req, res) => {
    res.json({
      status: 'ok',
      network: nearClient.getNetwork(),
      rpcUrl: nearClient.getRpcUrl(),
      hasApiKey: !!clientConfig.apiKey,
    });
  };
}

/**
 * Handle tools/list JSON-RPC method
 */
function handleToolsList(id: unknown): object {
  return {
    jsonrpc: '2.0',
    id,
    result: {
      tools: [
        ...getBlockToolDefinitions(),
        ...getAccountToolDefinitions(),
        ...getContractToolDefinitions(),
      ],
    },
  };
}

/**
 * Handle tools/call JSON-RPC method
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleToolsCall(params: any, id: unknown, nearClient: NearClient): Promise<object> {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
  const request = { params: { name: params.name, arguments: params.arguments } };
  const result = (await handleBlockTools(request, nearClient))
    ?? (await handleAccountTools(request, nearClient))
    ?? (await handleContractTools(request, nearClient));

  if (result) {
    return {
      jsonrpc: '2.0',
      id,
      result,
    };
  }

  return {
    jsonrpc: '2.0',
    id,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    error: { code: -32601, message: `Unknown tool: ${String(params.name)}` },
  };
}

/**
 * Handle resources/list JSON-RPC method
 */
function handleResourcesList(id: unknown): object {
  return {
    jsonrpc: '2.0',
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
  };
}

/**
 * Handle resources/templates/list JSON-RPC method
 */
function handleResourceTemplatesList(id: unknown): object {
  return {
    jsonrpc: '2.0',
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
  };
}

/**
 * Handle resources/read JSON-RPC method
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleResourcesRead(params: any, id: unknown, nearClient: NearClient): Promise<object> {
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
    return {
      jsonrpc: '2.0',
      id,
      error: { code: -32602, message: `Unknown resource URI: ${String(uri)}` },
    };
  }

  return {
    jsonrpc: '2.0',
    id,
    result: {
      contents: [{
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        uri,
        mimeType: 'text/markdown',
        text: content,
      }],
    },
  };
}

/**
 * JSON-RPC endpoint handler for direct HTTP requests
 */
export function createRpcHandler(nearClient: NearClient): express.RequestHandler {
  return async (req, res) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const { method, params, id } = req.body;

      // Route to appropriate handler based on method
      let response: object;

      if (method === 'tools/list') {
        response = handleToolsList(id);
      } else if (method === 'tools/call') {
        response = await handleToolsCall(params, id, nearClient);
      } else if (method === 'resources/list') {
        response = handleResourcesList(id);
      } else if (method === 'resources/templates/list') {
        response = handleResourceTemplatesList(id);
      } else if (method === 'resources/read') {
        response = await handleResourcesRead(params, id, nearClient);
      } else {
        // Unknown method
        return res.status(404).json({
          jsonrpc: '2.0',
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          id,
          error: { code: -32601, message: `Method not found: ${String(method)}` },
        });
      }

      return res.json(response);
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
  };
}

/**
 * MCP Streamable HTTP Transport endpoint handler
 * Handles GET (SSE streams), POST (JSON-RPC messages), and DELETE (session termination)
 */
export function createMcpHandler(
  sessionManager: SessionManager,
  createServer: (nearClient: NearClient) => Server,
  nearClient: NearClient,
): express.RequestHandler {
  return async (req, res) => {
    try {
      // Extract session ID from request header (if present)
      const sessionId = req.headers['mcp-session-id'] as string | undefined;

      // Try to get existing session
      let session: ServerSession | undefined = sessionManager.getSession(sessionId);

      if (!session) {
        // Create new session with transport and server
        const transport = sessionManager.createTransport();

        // Create new server instance for this session
        const server = createServer(nearClient);
        await server.connect(transport);

        session = { server, transport, nearClient };
      }

      // Log incoming MCP request at trace level
      logMcpRequest(req, sessionId);

      // Capture outgoing SSE messages for trace logging
      wrapResponseForMcpLogging(res);

      // Handle the request with the session's transport
      await session.transport.handleRequest(req, res, req.body);

      // Store session after first request (when sessionId is assigned)
      sessionManager.storeSession(session);
    } catch (error) {
      logError('MCP transport error', error);
      if (!res.headersSent) {
        res.status(500).json({
          error: 'Internal server error',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  };
}
