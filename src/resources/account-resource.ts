/**
 * MCP resource: Account card
 * Provides summarized account information
 */

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */

import type { NearClient } from '../near-client.js';

interface AccountCard {
  account_id: string;
  balance: string;
  balance_near: string;
  locked: string;
  locked_near: string;
  storage_usage: number;
  storage_usage_kb: number;
  has_contract: boolean;
  code_hash: string;
  access_keys_count: number;
  block_height: number;
  block_hash: string;
  network: string;
}

/**
 * Generate an account card with summarized information
 */
export async function generateAccountCard(
  nearClient: NearClient,
  accountId: string,
): Promise<AccountCard> {
  // Fetch account details and access keys in parallel
  const [account, accessKeys] = await Promise.all([
    nearClient.getAccount(accountId),
    nearClient.getAccessKeys(accountId),
  ]);

  // Convert yoctoNEAR to NEAR (1 NEAR = 10^24 yoctoNEAR)
  const toNear = (yocto: string): string => {
    const value = BigInt(yocto);
    const divisor = BigInt('1000000000000000000000000');
    const nearValue = Number(value) / Number(divisor);
    return nearValue.toFixed(4);
  };

  const hasContract = account.code_hash !== '11111111111111111111111111111111';

  return {
    account_id: accountId,
    balance: account.amount,
    balance_near: toNear(account.amount),
    locked: account.locked,
    locked_near: toNear(account.locked),
    storage_usage: account.storage_usage,
    storage_usage_kb: Math.round(account.storage_usage / 1024 * 100) / 100,
    has_contract: hasContract,
    code_hash: account.code_hash,
    access_keys_count: accessKeys.keys.length,
    block_height: account.block_height,
    block_hash: account.block_hash,
    network: nearClient.getNetwork(),
  };
}

/**
 * Format account card as readable text
 */
export function formatAccountCard(card: AccountCard): string {
  return `# NEAR Account: ${card.account_id}

## Balance
- Available: ${card.balance_near} NEAR (${card.balance} yoctoNEAR)
- Locked: ${card.locked_near} NEAR (${card.locked} yoctoNEAR)

## Storage
- Usage: ${card.storage_usage_kb} KB (${card.storage_usage} bytes)

## Contract
- Has Contract: ${card.has_contract ? 'Yes' : 'No'}
- Code Hash: ${card.code_hash}

## Access Keys
- Count: ${card.access_keys_count}

## Reference Block
- Height: ${card.block_height}
- Hash: ${card.block_hash}

## Network
- ${card.network}
`;
}
