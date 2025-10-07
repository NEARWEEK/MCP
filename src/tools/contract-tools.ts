/**
 * MCP tools for NEAR contract and transaction operations
 */

/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import { z } from 'zod';
import type { NearClient } from '../near-client.js';

const FinalitySchema = z.enum(['optimistic', 'near-final', 'final']).optional();

interface ToolRequest {
  params: {
    name: string;
    arguments?: unknown;
  };
}

interface ToolResult {
  content: { type: string; text: string }[];
  [key: string]: unknown;
}

/**
 * Handle contract and transaction tool calls
 */
export async function handleContractTools(request: ToolRequest, nearClient: NearClient): Promise<ToolResult | null> {
  // near.viewFunction - Call a contract view function
  if (request.params.name === 'near.viewFunction') {
    const schema = z.object({
      account_id: z.string().describe('Contract account ID'),
      method_name: z.string().describe('View method name to call'),
      args_base64: z.string().optional().describe('Base64-encoded method arguments (default: empty)'),
      block_id: z.string().optional().describe('Block hash'),
      height: z.number().optional().describe('Block height'),
      finality: FinalitySchema.describe('Block finality level'),
    });

    const args = schema.parse(request.params.arguments);

    const result = await nearClient.viewFunction(
      args.account_id,
      args.method_name,
      args.args_base64,
      {
        block_id: args.block_id,
        height: args.height,
        finality: args.finality,
      },
    );

    // Try to decode result if it looks like JSON
     
    let decodedResult = result;
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (result.result && Array.isArray(result.result)) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const bytes = new Uint8Array(result.result);
        const text = new TextDecoder().decode(bytes);
        try {
           
          const json = JSON.parse(text);
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          decodedResult = { ...result, decoded: json, raw_result: result.result };
        } catch {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          decodedResult = { ...result, decoded: text, raw_result: result.result };
        }
      }
    } catch {
      // Keep original result if decoding fails
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(decodedResult, null, 2),
        },
      ],
    };
  }

  // near.getTransaction - Get transaction status with receipts
  if (request.params.name === 'near.getTransaction') {
    const schema = z.object({
      hash: z.string().describe('Transaction hash'),
      signer_id: z.string().optional().describe('Transaction signer account ID'),
    });

    const args = schema.parse(request.params.arguments);

    // NEAR SDK requires accountId for getTransaction
    if (!args.signer_id) {
      throw new Error('signer_id is required for transaction lookup');
    }

    const result = await nearClient.getTransaction(args.hash, args.signer_id);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }

  // near.rpc - Generic RPC call
  if (request.params.name === 'near.rpc') {
    const schema = z.object({
      method: z.string().describe('RPC method name'),
      params: z.any().describe('Method parameters (object or array)'),
    });

    const args = schema.parse(request.params.arguments);

    const result = await nearClient.genericRpc(args.method, args.params);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }

  return null;
}

/**
 * Get contract tool definitions for listing
 */
export function getContractToolDefinitions() {
  return [
    {
      name: 'near.viewFunction',
      description: 'Call a read-only view method on a NEAR smart contract',
      inputSchema: {
        type: 'object',
        properties: {
          account_id: {
            type: 'string',
            description: 'Contract account ID (e.g., contract.near)',
          },
          method_name: {
            type: 'string',
            description: 'View method name to call',
          },
          args_base64: {
            type: 'string',
            description: 'Base64-encoded method arguments JSON (default: empty string)',
          },
          block_id: {
            type: 'string',
            description: 'Block hash',
          },
          height: {
            type: 'number',
            description: 'Block height',
          },
          finality: {
            type: 'string',
            enum: ['optimistic', 'near-final', 'final'],
            description: 'Block finality level',
          },
        },
        required: ['account_id', 'method_name'],
      },
    },
    {
      name: 'near.getTransaction',
      description: 'Get NEAR transaction status with execution receipts',
      inputSchema: {
        type: 'object',
        properties: {
          hash: {
            type: 'string',
            description: 'Transaction hash',
          },
          signer_id: {
            type: 'string',
            description: 'Transaction signer account ID (optional, for faster lookup)',
          },
        },
        required: ['hash'],
      },
    },
    {
      name: 'near.rpc',
      description: 'Make a generic NEAR RPC call with custom method and parameters',
      inputSchema: {
        type: 'object',
        properties: {
          method: {
            type: 'string',
            description: 'NEAR RPC method name',
          },
          params: {
            description: 'Method parameters (object or array, depending on the method)',
          },
        },
        required: ['method', 'params'],
      },
    },
  ];
}
