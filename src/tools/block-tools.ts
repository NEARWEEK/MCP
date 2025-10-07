/**
 * MCP tools for NEAR block and chunk operations
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
 * Handle block-related tool calls
 */
export async function handleBlockTools(request: ToolRequest, nearClient: NearClient): Promise<ToolResult | null> {
  // near.getBlock - Get block details
  if (request.params.name === 'near.getBlock') {
      const schema = z.object({
        block_id: z.string().optional().describe('Block hash'),
        height: z.number().optional().describe('Block height'),
        finality: FinalitySchema.describe('Block finality: optimistic (~1s), near-final (~2s), final (~3s)'),
      });

      const args = schema.parse(request.params.arguments);

      const result = await nearClient.getBlock({
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

  // near.getBlockChanges - Get changes in block
  if (request.params.name === 'near.getBlockChanges') {
      const schema = z.object({
        block_id: z.string().optional().describe('Block hash'),
        height: z.number().optional().describe('Block height'),
        finality: FinalitySchema.describe('Block finality level'),
      });

      const args = schema.parse(request.params.arguments);

      const result = await nearClient.getBlockChanges({
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

  // near.getChunk - Get chunk details
  if (request.params.name === 'near.getChunk') {
      const schema = z.object({
        chunk_id: z.string().optional().describe('Chunk hash'),
        block_id: z.string().optional().describe('Block hash'),
        height: z.number().optional().describe('Block height'),
        shard_id: z.number().optional().describe('Shard ID (required with block_id or height)'),
      });

      const args = schema.parse(request.params.arguments);

      const result = await nearClient.getChunk({
        chunk_id: args.chunk_id,
        block_id: args.block_id,
        height: args.height,
        shard_id: args.shard_id,
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

  return null;
}

/**
 * Get block tool definitions for listing
 */
export function getBlockToolDefinitions() {
  return [
    {
      name: 'near.getBlock',
      description: 'Get NEAR blockchain block details by hash, height, or finality level',
      inputSchema: {
        type: 'object',
        properties: {
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
            description: 'Block finality: optimistic (~1s), near-final (~2s), final (~3s)',
          },
        },
      },
    },
    {
      name: 'near.getBlockChanges',
      description: 'Get all state changes in a NEAR block',
      inputSchema: {
        type: 'object',
        properties: {
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
      },
    },
    {
      name: 'near.getChunk',
      description: 'Get NEAR blockchain chunk details by chunk ID or block location',
      inputSchema: {
        type: 'object',
        properties: {
          chunk_id: {
            type: 'string',
            description: 'Chunk hash',
          },
          block_id: {
            type: 'string',
            description: 'Block hash',
          },
          height: {
            type: 'number',
            description: 'Block height',
          },
          shard_id: {
            type: 'number',
            description: 'Shard ID (required when using block_id or height)',
          },
        },
      },
    },
  ];
}
