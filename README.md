# NEARWEEK MCP Server

Model Context Protocol (MCP) server for accessing NEAR blockchain data. Provides tools and resources for querying accounts, blocks, contracts, and transactions on NEAR Protocol.

## Features

### Tools

- **Block Operations**
  - `near.getBlock` - Get block details by hash, height, or finality
  - `near.getBlockChanges` - Get all state changes in a block
  - `near.getChunk` - Get chunk details

- **Account Operations**
  - `near.getAccount` - View account details (balance, storage, etc.)
  - `near.getAccountChanges` - View account state changes
  - `near.getAccessKeys` - List all access keys for an account
  - `near.getAccessKey` - View specific access key details

- **Contract & Transaction Operations**
  - `near.viewFunction` - Call read-only contract view methods
  - `near.getTransaction` - Get transaction status with receipts
  - `near.rpc` - Make generic NEAR RPC calls

### Resources

**Static Resources:**
- `near://blocks/latest?count=N` - Recent blocks feed
- `near://network/status` - Network status and protocol info

**Resource Templates (parameterized):**
- `near://account/{account_id}` - Account summary card
- `near://contract/{account_id}/readme` - Contract info and suggested methods

## Installation

```bash
npm install
npm run build
```

## Usage

### Running the Server

The server supports two transport modes: **stdio** (default) and **HTTP**.

#### Stdio Mode (for MCP clients like Claude Desktop)

```bash
# Mainnet (default)
npm start

# Testnet
NEAR_NETWORK=testnet npm start
# or
npm start testnet
```

#### HTTP Mode (for web-based clients)

```bash
# Mainnet on port 3000 (default)
npm start -- --http

# Testnet on custom port
npm start testnet --http --port=8080

# Using npm scripts
npm run start:http
npm run start:streamableHttp  # Explicit alias for Streamable HTTP transport

# With environment variables
PORT=8080 NEAR_NETWORK=testnet npm start -- --http
```

The HTTP server provides:
- **MCP endpoint**: `http://localhost:3000/mcp` (GET/POST/DELETE) - Streamable HTTP transport with session management
- **RPC endpoint**: `http://localhost:3000/rpc` (POST) - Simple JSON-RPC for direct requests (non-MCP clients)
- **Health check**: `http://localhost:3000/health` (GET)

### Configuration

Configure the server via environment variables or CLI arguments:

- **Network**: `NEAR_NETWORK=mainnet|testnet` or CLI arg `testnet`
- **Transport**: CLI flag `--http` or `-h` for HTTP mode (default: stdio)
- **Port**: `PORT=3000` or CLI arg `--port=8080` (HTTP mode only)
- **RPC URL**: `NEAR_RPC_URL` or `RPC_URL` (overrides default network endpoint)
- **API Key**: `NEAR_API_KEY` or `API_KEY` (for authenticated RPC providers)

#### Using Custom RPC Providers

To use alternative RPC providers like FastNEAR with API key authentication:

```bash
# With API key
NEAR_RPC_URL="https://rpc.mainnet.fastnear.com" \
NEAR_API_KEY="your-api-key-here" \
npm start

# Custom RPC without API key
NEAR_RPC_URL="https://your-custom-rpc.com" npm start
```

## Development

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Watch mode
npm run dev

# Type checking
npm run typecheck
```

## MCP Client Configuration

### Stdio Transport (Claude Desktop, VS Code, etc.)

Add to your MCP client configuration:

```json
{
  "mcpServers": {
    "near": {
      "command": "node",
      "args": ["/path/to/nearweek/src/MCP/dist/index.js", "mainnet"],
      "env": {
        "NEAR_NETWORK": "mainnet"
      }
    }
  }
}
```

### HTTP Transport (Web-based clients)

Start the server in HTTP mode and connect to:
- Base URL: `http://localhost:3000`
- **MCP Endpoint**: `http://localhost:3000/mcp` - Full MCP protocol with Streamable HTTP transport
  - Supports GET (SSE streams), POST (JSON-RPC messages), DELETE (session termination)
  - Includes session management with `Mcp-Session-Id` headers
  - Complies with MCP specification 2025-03-26
- **RPC Endpoint**: `http://localhost:3000/rpc` - Simple JSON-RPC endpoint for non-MCP clients

#### Using the MCP endpoint (for MCP clients)

MCP clients should use the `/mcp` endpoint with proper protocol headers. The server manages sessions automatically.

#### Using the RPC endpoint (for simple HTTP clients)

For direct JSON-RPC requests without MCP protocol overhead:

```bash
# List available tools
curl -X POST http://localhost:3000/rpc \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "method": "tools/list", "id": 1}'

# Call a tool
curl -X POST http://localhost:3000/rpc \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "near.getBlock",
      "arguments": {"finality": "final"}
    },
    "id": 2
  }'
```

## Requirements

- Node.js 22 or higher
- TypeScript 5.7+

## Architecture

- **Runtime**: Node.js 22+ with ES2022 modules
- **Transport**:
  - MCP stdio transport for desktop clients
  - Streamable HTTP transport (MCP 2025-03-26 spec) for web clients
  - Session management with cryptographically secure UUIDs
- **NEAR SDK**: near-api-js v5+ official JavaScript SDK
- **RPC**: NEAR JSON RPC via JsonRpcProvider with optional API key authentication
- **Validation**: Zod schemas for all inputs
- **HTTP Server**: Express.js with dual endpoints:
  - `/mcp` - Full MCP protocol with Streamable HTTP transport
  - `/rpc` - Simple JSON-RPC for non-MCP clients
