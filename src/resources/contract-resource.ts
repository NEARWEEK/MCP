/**
 * MCP resource: Contract README
 * Provides contract metadata and common methods
 */

import type { NearClient } from '../near-client.js';

interface ContractMetadata {
  spec?: string;
  name?: string;
  symbol?: string;
  icon?: string;
  base_uri?: string;
  reference?: string;
  reference_hash?: string;
  [key: string]: unknown;
}

interface ContractReadme {
  account_id: string;
  has_contract: boolean;
  metadata?: ContractMetadata;
  metadata_error?: string;
  suggested_methods: string[];
  code_hash: string;
  network: string;
}

/**
 * Common view methods to try
 */
const COMMON_VIEW_METHODS = [
  'get_metadata',
  'ft_metadata',
  'nft_metadata',
  'get_version',
  'get_info',
  'version',
  'name',
];

/**
 * Generate contract README
 */
export async function generateContractReadme(
  nearClient: NearClient,
  accountId: string
): Promise<ContractReadme> {
  // Get account to check if it has a contract
  const account = await nearClient.getAccount(accountId);
  const hasContract = account.code_hash !== '11111111111111111111111111111111';

  if (!hasContract) {
    return {
      account_id: accountId,
      has_contract: false,
      suggested_methods: [],
      code_hash: account.code_hash,
      network: nearClient.getNetwork(),
    };
  }

  // Try to fetch metadata
  let metadata: ContractMetadata | undefined;
  let metadataError: string | undefined;

  for (const method of COMMON_VIEW_METHODS) {
    try {
      const result = await nearClient.viewFunction(accountId, method, '');

      // Try to decode result
      if (result.result && Array.isArray(result.result)) {
        const bytes = new Uint8Array(result.result);
        const text = new TextDecoder().decode(bytes);
        try {
          metadata = JSON.parse(text);
          break;
        } catch {
          // Not JSON, continue
        }
      }
    } catch (error) {
      // Method doesn't exist or failed, try next
      metadataError = error instanceof Error ? error.message : 'Failed to fetch metadata';
    }
  }

  // Suggest common methods based on what we found
  const suggestedMethods: string[] = [];

  if (metadata?.spec?.includes('nft')) {
    suggestedMethods.push('nft_tokens', 'nft_token', 'nft_supply_for_owner', 'nft_metadata');
  } else if (metadata?.spec?.includes('ft')) {
    suggestedMethods.push('ft_balance_of', 'ft_total_supply', 'ft_metadata');
  } else {
    // Generic suggestions
    suggestedMethods.push('get_metadata', 'get_version', 'get_info');
  }

  return {
    account_id: accountId,
    has_contract: true,
    metadata,
    metadata_error: metadata ? undefined : metadataError,
    suggested_methods: suggestedMethods,
    code_hash: account.code_hash,
    network: nearClient.getNetwork(),
  };
}

/**
 * Format contract README as readable text
 */
export function formatContractReadme(readme: ContractReadme): string {
  let output = `# NEAR Contract: ${readme.account_id}\n\n`;

  if (!readme.has_contract) {
    output += '**This account does not have a deployed contract.**\n';
    return output;
  }

  output += `## Contract Info\n`;
  output += `- Code Hash: ${readme.code_hash}\n`;
  output += `- Network: ${readme.network}\n\n`;

  if (readme.metadata) {
    output += `## Metadata\n`;
    output += '```json\n';
    output += JSON.stringify(readme.metadata, null, 2);
    output += '\n```\n\n';
  } else if (readme.metadata_error) {
    output += `## Metadata\n`;
    output += `Could not fetch metadata: ${readme.metadata_error}\n\n`;
  }

  if (readme.suggested_methods.length > 0) {
    output += `## Suggested View Methods\n`;
    for (const method of readme.suggested_methods) {
      output += `- \`${method}\`\n`;
    }
    output += '\n';
    output += 'Use `near.viewFunction` tool to call these methods.\n';
  }

  return output;
}
