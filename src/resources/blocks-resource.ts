/**
 * MCP resource: Latest blocks feed
 * Provides compact information about recent blocks
 */

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return */

import type { NearClient } from '../near-client.js';

interface CompactBlockInfo {
  height: number;
  hash: string;
  timestamp: number;
  timestamp_iso: string;
  author: string;
  transactions_count: number;
  gas_price: string;
  chunks_count: number;
}

/**
 * Generate a feed of latest blocks
 */
export async function generateBlocksFeed(
  nearClient: NearClient,
  count = 10,
): Promise<CompactBlockInfo[]> {
  // Get the latest block first
  const latestBlock = await nearClient.getBlock({ finality: 'final' });
  const startHeight = latestBlock.header.height;

  // Fetch multiple blocks in parallel
  const blockPromises: Promise<any>[] = [];
  for (let i = 0; i < count; i++) {
    const height = startHeight - i;
    if (height > 0) {
      blockPromises.push(nearClient.getBlock({ height }));
    }
  }

  const blocks = await Promise.all(blockPromises);

  // Transform to compact format
  return blocks.map((block: any) => {
    const txCount = block.chunks.reduce((sum: number, chunk: any) => sum + chunk.tx_root.length, 0);

    return {
      height: block.header.height,
      hash: block.header.hash,
      timestamp: Math.floor(block.header.timestamp / 1_000_000),
      timestamp_iso: new Date(Math.floor(block.header.timestamp / 1_000_000)).toISOString(),
      author: block.author,
      transactions_count: txCount,
      gas_price: block.header.gas_price,
      chunks_count: block.chunks.length,
    };
  });
}

/**
 * Format blocks feed as readable text
 */
export function formatBlocksFeed(blocks: CompactBlockInfo[]): string {
  let output = `# Latest ${blocks.length} NEAR Blocks\n\n`;

  for (const block of blocks) {
    output += `## Block #${block.height}\n`;
    output += `- Hash: ${block.hash}\n`;
    output += `- Time: ${block.timestamp_iso}\n`;
    output += `- Author: ${block.author}\n`;
    output += `- Chunks: ${block.chunks_count}\n`;
    output += `- Gas Price: ${block.gas_price}\n`;
    output += '\n';
  }

  return output;
}
