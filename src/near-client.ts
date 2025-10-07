/**
 * NEAR Client wrapper using near-api-js SDK
 * Handles communication with NEAR blockchain via official SDK
 */

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment */

import { providers } from 'near-api-js';
import type { NearNetwork, BlockReference } from './types.js';

const { JsonRpcProvider } = providers;

export interface NearClientConfig {
  network?: NearNetwork;
  rpcUrl?: string;
  apiKey?: string;
}

export class NearClient {
  private readonly provider: providers.JsonRpcProvider;
  private readonly network: NearNetwork;
  private readonly rpcUrl: string;

  constructor(config: NearClientConfig = {}) {
    const { network = 'mainnet', rpcUrl, apiKey } = config;

    this.network = network;

    // Determine RPC URL
    if (rpcUrl) {
      this.rpcUrl = rpcUrl;
    } else {
      this.rpcUrl = network === 'mainnet'
        ? 'https://rpc.mainnet.near.org'
        : 'https://rpc.testnet.near.org';
    }

    // Create provider with optional API key
    const providerOptions: { url: string; headers?: Record<string, string> } = {
      url: this.rpcUrl,
    };

    // Add API key header if provided
    if (apiKey) {
      providerOptions.headers = {
        'Authorization': `Bearer ${apiKey}`,
      };
    }

    this.provider = new JsonRpcProvider(providerOptions);
  }

  /**
   * Build block reference query parameter
   */
   
  private buildBlockQuery(ref?: BlockReference): any {
    if (!ref) {
      return { finality: 'near-final' };
    }

    if (ref.finality) {
      return { finality: ref.finality };
    }

    if (ref.block_id) {
      return { blockId: ref.block_id };
    }

    if (ref.height !== undefined) {
      return { blockId: ref.height };
    }

    return { finality: 'near-final' };
  }

  /**
   * Get block details
   */
   
  async getBlock(ref?: BlockReference): Promise<any> {
     
    return this.provider.block(this.buildBlockQuery(ref));
  }

  /**
   * Get block changes
   */
   
  async getBlockChanges(ref?: BlockReference): Promise<any> {
     
    return this.provider.blockChanges(this.buildBlockQuery(ref));
  }

  /**
   * Get chunk details
   */
   
  async getChunk(params: {
    chunk_id?: string;
    block_id?: string;
    height?: number;
    shard_id?: number;
  }): Promise<any> {
    if (params.chunk_id) {
      return this.provider.chunk(params.chunk_id);
    }

    if ((params.block_id ?? params.height !== undefined) && params.shard_id !== undefined) {
      const blockId = params.block_id ?? params.height;
      if (blockId === undefined) {
        throw new Error('Either chunk_id or (block_id/height + shard_id) must be provided');
      }
       
      return this.provider.chunk([blockId, params.shard_id] as any);
    }

    throw new Error('Either chunk_id or (block_id/height + shard_id) must be provided');
  }

  /**
   * View account details
   */
   
  async getAccount(accountId: string, ref?: BlockReference): Promise<any> {
    const blockRef = this.buildBlockQuery(ref);
     
    return this.provider.query({
      request_type: 'view_account',
      account_id: accountId,
      ...blockRef,
    });
  }

  /**
   * View account changes
   */
   
  async getAccountChanges(
    accountIds: string[],
    ref?: BlockReference,
  ): Promise<any> {
    const blockRef = this.buildBlockQuery(ref);
     
    return this.provider.query({
      request_type: 'view_account_changes',
      account_ids: accountIds,
      ...blockRef,
     
    });
  }

  /**
   * View access key list for an account
   */
   
  async getAccessKeys(
    accountId: string,
    ref?: BlockReference,
  ): Promise<any> {
    const blockRef = this.buildBlockQuery(ref);
     
    return this.provider.query({
      request_type: 'view_access_key_list',
      account_id: accountId,
      ...blockRef,
    });
  }

  /**
   * View a specific access key
   */
   
  async getAccessKey(
    accountId: string,
    publicKey: string,
    ref?: BlockReference,
  ): Promise<any> {
    const blockRef = this.buildBlockQuery(ref);
     
    return this.provider.query({
      request_type: 'view_access_key',
      account_id: accountId,
      public_key: publicKey,
      ...blockRef,
    });
  }

  /**
   * Call a contract view function
   */
   
  async viewFunction(
    accountId: string,
    methodName: string,
    argsBase64 = '',
    ref?: BlockReference,
  ): Promise<any> {
    const blockRef = this.buildBlockQuery(ref);
     
    return this.provider.query({
      request_type: 'call_function',
      account_id: accountId,
      method_name: methodName,
      args_base64: argsBase64,
      ...blockRef,
    });
  }

  /**
   * Get transaction status with receipts
   */
   
  async getTransaction(txHash: string, accountId: string): Promise<any> {
    return this.provider.txStatus(txHash, accountId);
  }

  /**
   * Get transaction status with receipts (alternative for backwards compatibility)
   */
   
  async getTransactionStatus(
    txHash: string,
    accountId: string,
  ): Promise<any> {
    return this.provider.txStatus(txHash, accountId);
  }

  /**
   * Get network status
   */
   
  async getNetworkStatus(): Promise<any> {
    return this.provider.status();
  }

  /**
   * Generic RPC call for custom methods
   */
   
  async genericRpc<T = any>(method: string, params: any): Promise<T> {
     
    return this.provider.sendJsonRpc<T>(method, params);
  }

  /**
   * Get the current network
   */
  getNetwork(): NearNetwork {
    return this.network;
  }

  /**
   * Get the RPC URL
   */
  getRpcUrl(): string {
    return this.rpcUrl;
  }

  /**
   * Get the underlying provider (for advanced usage)
   */
  getProvider(): providers.JsonRpcProvider {
    return this.provider;
  }
}
