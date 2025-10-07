/**
 * MCP tools for NEAR account and access key operations
 */

import { z } from 'zod';
import type { NearClient } from '../near-client.js';

const FinalitySchema = z.enum(['optimistic', 'near-final', 'final']).optional();

/**
 * Handle account-related tool calls
 */
export async function handleAccountTools(request: any, nearClient: NearClient): Promise<any | null> {
  // near.getAccount - View account details
  if (request.params.name === 'near.getAccount') {
    const schema = z.object({
      account_id: z.string().describe('NEAR account ID'),
      block_id: z.string().optional().describe('Block hash'),
      height: z.number().optional().describe('Block height'),
      finality: FinalitySchema.describe('Block finality level'),
    });

    const args = schema.parse(request.params.arguments);

    const result = await nearClient.getAccount(args.account_id, {
      block_id: args.block_id,
      height: args.height,
      finality: args.finality,
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }

  // near.getAccountChanges - View account changes
  if (request.params.name === 'near.getAccountChanges') {
    const schema = z.object({
      account_ids: z.array(z.string()).describe('Array of NEAR account IDs to query'),
      block_id: z.string().optional().describe('Block hash'),
      height: z.number().optional().describe('Block height'),
      finality: FinalitySchema.describe('Block finality level'),
    });

    const args = schema.parse(request.params.arguments);

    const result = await nearClient.getAccountChanges(args.account_ids, {
      block_id: args.block_id,
      height: args.height,
      finality: args.finality,
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }

  // near.getAccessKeys - View access key list
  if (request.params.name === 'near.getAccessKeys') {
    const schema = z.object({
      account_id: z.string().describe('NEAR account ID'),
      block_id: z.string().optional().describe('Block hash'),
      height: z.number().optional().describe('Block height'),
      finality: FinalitySchema.describe('Block finality level'),
    });

    const args = schema.parse(request.params.arguments);

    const result = await nearClient.getAccessKeys(args.account_id, {
      block_id: args.block_id,
      height: args.height,
      finality: args.finality,
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }

  // near.getAccessKey - View specific access key
  if (request.params.name === 'near.getAccessKey') {
    const schema = z.object({
      account_id: z.string().describe('NEAR account ID'),
      public_key: z.string().describe('Public key (e.g., ed25519:...)'),
      block_id: z.string().optional().describe('Block hash'),
      height: z.number().optional().describe('Block height'),
      finality: FinalitySchema.describe('Block finality level'),
    });

    const args = schema.parse(request.params.arguments);

    const result = await nearClient.getAccessKey(
      args.account_id,
      args.public_key,
      {
        block_id: args.block_id,
        height: args.height,
        finality: args.finality,
      }
    );

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
 * Get account tool definitions for listing
 */
export function getAccountToolDefinitions() {
  return [
    {
      name: 'near.getAccount',
      description: 'Get NEAR account details including balance, storage, and code hash',
      inputSchema: {
        type: 'object',
        properties: {
          account_id: {
            type: 'string',
            description: 'NEAR account ID (e.g., example.near)',
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
        required: ['account_id'],
      },
    },
    {
      name: 'near.getAccountChanges',
      description: 'Get state changes for NEAR accounts in a block',
      inputSchema: {
        type: 'object',
        properties: {
          account_ids: {
            type: 'array',
            items: {
              type: 'string',
            },
            description: 'Array of NEAR account IDs to query',
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
        required: ['account_ids'],
      },
    },
    {
      name: 'near.getAccessKeys',
      description: 'Get all access keys for a NEAR account',
      inputSchema: {
        type: 'object',
        properties: {
          account_id: {
            type: 'string',
            description: 'NEAR account ID',
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
        required: ['account_id'],
      },
    },
    {
      name: 'near.getAccessKey',
      description: 'Get details of a specific access key for a NEAR account',
      inputSchema: {
        type: 'object',
        properties: {
          account_id: {
            type: 'string',
            description: 'NEAR account ID',
          },
          public_key: {
            type: 'string',
            description: 'Public key in format: ed25519:...',
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
        required: ['account_id', 'public_key'],
      },
    },
  ];
}
