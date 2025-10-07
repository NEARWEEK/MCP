/**
 * NEAR blockchain types and interfaces
 */

export type NearNetwork = 'mainnet' | 'testnet';

export type Finality = 'optimistic' | 'near-final' | 'final';

export interface BlockReference {
  block_id?: string;
  height?: number;
  finality?: Finality;
}

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string;
  method: string;
  params: unknown;
}

export interface JsonRpcResponse<T = unknown> {
  jsonrpc: '2.0';
  id: string;
  result?: T;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export interface BlockResult {
  author: string;
  header: {
    height: number;
    epoch_id: string;
    next_epoch_id: string;
    hash: string;
    prev_hash: string;
    prev_state_root: string;
    chunk_receipts_root: string;
    chunk_headers_root: string;
    chunk_tx_root: string;
    outcome_root: string;
    chunks_included: number;
    challenges_root: string;
    timestamp: number;
    timestamp_nanosec: string;
    random_value: string;
    validator_proposals: unknown[];
    chunk_mask: boolean[];
    gas_price: string;
    block_ordinal: number;
    total_supply: string;
    challenges_result: unknown[];
    last_final_block: string;
    last_ds_final_block: string;
    next_bp_hash: string;
    block_merkle_root: string;
    approvals: (string | null)[];
    signature: string;
    latest_protocol_version: number;
  };
  chunks: ChunkHeader[];
}

export interface ChunkHeader {
  chunk_hash: string;
  prev_block_hash: string;
  outcome_root: string;
  prev_state_root: string;
  encoded_merkle_root: string;
  encoded_length: number;
  height_created: number;
  height_included: number;
  shard_id: number;
  gas_used: number;
  gas_limit: number;
  rent_paid: string;
  validator_reward: string;
  balance_burnt: string;
  outgoing_receipts_root: string;
  tx_root: string;
  validator_proposals: unknown[];
  signature: string;
}

export interface ChunkResult {
  author: string;
  header: ChunkHeader;
  transactions: Transaction[];
  receipts: Receipt[];
}

export interface Transaction {
  signer_id: string;
  public_key: string;
  nonce: number;
  receiver_id: string;
  actions: Action[];
  signature: string;
  hash: string;
}

export interface Action {
  [key: string]: unknown;
}

export interface Receipt {
  predecessor_id: string;
  receiver_id: string;
  receipt_id: string;
  receipt: {
    Action?: {
      actions: Action[];
      gas_price: string;
      input_data_ids: string[];
      output_data_receivers: unknown[];
      signer_id: string;
      signer_public_key: string;
    };
    Data?: {
      data_id: string;
      data: string | null;
    };
  };
}

export interface AccountView {
  amount: string;
  locked: string;
  code_hash: string;
  storage_usage: number;
  storage_paid_at: number;
  block_height: number;
  block_hash: string;
}

export interface AccessKeyView {
  nonce: number;
  permission: 'FullAccess' | {
    FunctionCall: {
      allowance: string | null;
      receiver_id: string;
      method_names: string[];
    };
  };
  block_height: number;
  block_hash: string;
}

export interface AccessKeyList {
  keys: Array<{
    public_key: string;
    access_key: AccessKeyView;
  }>;
  block_height: number;
  block_hash: string;
}

export interface TransactionStatus {
  status: {
    SuccessValue?: string;
    SuccessReceiptId?: string;
    Failure?: {
      error_message: string;
      error_type: string;
    };
  };
  transaction: Transaction;
  transaction_outcome: ExecutionOutcome;
  receipts_outcome: ExecutionOutcome[];
}

export interface ExecutionOutcome {
  proof: unknown[];
  block_hash: string;
  id: string;
  outcome: {
    logs: string[];
    receipt_ids: string[];
    gas_burnt: number;
    tokens_burnt: string;
    executor_id: string;
    status: {
      SuccessValue?: string;
      SuccessReceiptId?: string;
      Failure?: unknown;
    };
    metadata: {
      version: number;
      gas_profile: unknown;
    };
  };
}

export interface StateChange {
  type: string;
  change: {
    account_id: string;
    [key: string]: unknown;
  };
}

export interface BlockChangesResult {
  block_hash: string;
  changes: StateChange[];
}

export interface NetworkStatusResult {
  chain_id: string;
  rpc_addr: string;
  sync_info: {
    latest_block_hash: string;
    latest_block_height: number;
    latest_state_root: string;
    latest_block_time: string;
    syncing: boolean;
    earliest_block_hash: string;
    earliest_block_height: number;
    earliest_block_time: string;
    epoch_id: string;
    epoch_start_height: number;
  };
  validators: Array<{
    account_id: string;
    is_slashed: boolean;
  }>;
  version: {
    version: string;
    build: string;
    rustc_version: string;
  };
  protocol_version: number;
  protocol_config: unknown;
}
