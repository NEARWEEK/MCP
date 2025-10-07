/**
 * MCP resource: Network status
 * Provides current network information
 */

import type { NearClient } from '../near-client.js';

interface NetworkStatus {
  network: string;
  chain_id: string;
  protocol_version: number;
  latest_block_height: number;
  latest_block_hash: string;
  latest_block_time: string;
  syncing: boolean;
  epoch_id: string;
  epoch_start_height: number;
  validators_count: number;
  rpc_url: string;
}

/**
 * Generate network status summary
 */
export async function generateNetworkStatus(
  nearClient: NearClient
): Promise<NetworkStatus> {
  const status = await nearClient.getNetworkStatus();

  return {
    network: nearClient.getNetwork(),
    chain_id: status.chain_id,
    protocol_version: status.protocol_version,
    latest_block_height: status.sync_info.latest_block_height,
    latest_block_hash: status.sync_info.latest_block_hash,
    latest_block_time: status.sync_info.latest_block_time,
    syncing: status.sync_info.syncing,
    epoch_id: status.sync_info.epoch_id,
    epoch_start_height: status.sync_info.epoch_start_height,
    validators_count: status.validators.length,
    rpc_url: nearClient.getRpcUrl(),
  };
}

/**
 * Format network status as readable text
 */
export function formatNetworkStatus(status: NetworkStatus): string {
  return `# NEAR Network Status

## Network
- Name: ${status.network}
- Chain ID: ${status.chain_id}
- RPC URL: ${status.rpc_url}

## Protocol
- Version: ${status.protocol_version}

## Latest Block
- Height: ${status.latest_block_height}
- Hash: ${status.latest_block_hash}
- Time: ${status.latest_block_time}

## Sync Status
- Syncing: ${status.syncing ? 'Yes' : 'No'}

## Current Epoch
- Epoch ID: ${status.epoch_id}
- Epoch Start Height: ${status.epoch_start_height}

## Validators
- Active Validators: ${status.validators_count}
`;
}
