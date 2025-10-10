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
- **MCP endpoint**: `http://localhost:3000/mcp` (GET/POST/DELETE) - Streamable HTTP transport with session management (requires authentication)
- **RPC endpoint**: `http://localhost:3000/rpc` (POST) - Simple JSON-RPC for direct requests (requires authentication)
- **Health check**: `http://localhost:3000/health` (GET) - No authentication required

## Authentication

The MCP server requires API key authentication for all operations (both stdio and HTTP modes). Authentication is managed by the MCP Backend API service.

### Prerequisites

1. **Start the MCP Backend API**:
```bash
cd ../mcp-backend-api
npm install
npm run build
npm start
```

The MCP Backend API runs on port 3001 by default. See `../mcp-backend-api/README.md` for details.

2. **Generate an API Key**:
```bash
cd ../mcp-backend-api
npm run generate:key -- --name="My MCP Client"
```

Save the generated API key securely - it will be needed for both stdio and HTTP modes.

### Stdio Mode Authentication

API key must be provided via the `MCP_API_KEY` or `API_KEY` environment variable:

```bash
# Set the API key
export MCP_API_KEY=your-generated-api-key-here

# Optional: Set MCP Backend API URL (default: http://localhost:3001)
export AUTH_BACKEND_URL=http://localhost:3001

# Start the server
npm start
```

The server will validate the API key on startup and exit if invalid.

### HTTP Mode Authentication

API key must be provided as a Bearer token in the `Authorization` header:

```bash
# Start the server
npm start -- --http

# Make authenticated requests
curl -X POST http://localhost:3000/mcp \
  -H "Authorization: Bearer your-generated-api-key-here" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
```

All requests to `/mcp` and `/rpc` endpoints require the `Authorization: Bearer <api-key>` header.

### Configuration

Configure the server via environment variables or CLI arguments:

#### MCP Server Configuration

- **Network**: `NEAR_NETWORK=mainnet|testnet` or CLI arg `testnet`
- **Transport**: CLI flag `--http` or `-h` for HTTP mode (default: stdio)
- **Port**: `PORT=3000` or CLI arg `--port=8080` (HTTP mode only)
- **RPC URL**: `NEAR_RPC_URL` or `RPC_URL` (overrides default network endpoint)
- **NEAR API Key**: `NEAR_API_KEY` or `API_KEY` (for authenticated NEAR RPC providers like FastNEAR)

#### Authentication Configuration

- **MCP API Key**: `MCP_API_KEY` or `API_KEY` (required for stdio mode authentication)
- **MCP Backend API URL**: `AUTH_BACKEND_URL` (default: `http://localhost:3001`)

#### Logging Configuration

The MCP server uses a **two-tier logging approach** (HTTP mode only):

1. **Access Logs** - HTTP request/response logging via [morgan](https://github.com/expressjs/morgan)
2. **Structured Logs** - Application logging via [Pino](https://getpino.io/)

**Configuration:**
- **Log Level**: `LOG_LEVEL` - Set minimum log level for structured logs (default: `info`)
- **Access Log Format**: `ACCESS_LOG_FORMAT` - Set format for HTTP access logs
- **Node Environment**: `NODE_ENV` - Set to `production` for JSON logs, otherwise pretty-printed

##### Access Logs (morgan)

HTTP access logs are **always enabled** in HTTP mode and written to stdout, independent of the `LOG_LEVEL` setting. These provide one-line summaries of each HTTP request.

**Configuration:**
- Set format via `ACCESS_LOG_FORMAT` environment variable
- Default: `[:date[iso]] :method :url :status :response-time ms - :res[content-length]`

**Common format tokens:**
- `:date[iso]` - ISO 8601 timestamp
- `:method` - HTTP method (GET, POST, etc.)
- `:url` - Request URL
- `:status` - HTTP status code
- `:response-time` - Response time in milliseconds
- `:res[content-length]` - Response size in bytes
- `:remote-addr` - Client IP address

**Example access log output:**
```
[2025-01-09T14:30:15.123Z] POST /rpc 200 12.456 ms - 345
[2025-01-09T14:30:20.789Z] GET /health 200 1.234 ms - 78
[2025-01-09T14:30:25.456Z] POST /mcp 403 5.678 ms - 62
```

For more format tokens, see [morgan documentation](https://github.com/expressjs/morgan#tokens).

##### Structured Logs (Pino)

Application logs for startup messages, errors, and debug information. Controlled by `LOG_LEVEL` environment variable.

**Log Levels:**
- `fatal` (60) - Fatal errors that cause application termination (includes stack traces)
- `error` (50) - Error conditions (includes stack traces for 5xx errors)
- `warn` (40) - Warning conditions
- `info` (30) - Informational messages (default)
- `debug` (20) - Debug messages
- `trace` (10) - Trace messages (very verbose, includes HTTP req/res details)

**Example:**
```bash
# Show only warnings and errors
LOG_LEVEL=warn npm start

# Debug mode for development
LOG_LEVEL=debug npm start

# Trace level (includes detailed HTTP request logging)
LOG_LEVEL=trace npm start

# Production mode with JSON logs
NODE_ENV=production npm start
```

**HTTP Request Logging Behavior:**
- **Normal requests (2xx, 3xx)**: Only logged to access log
- **Client errors (4xx)**: Only logged to access log
- **Server errors (5xx)**: Logged to access log + error level in structured log
- **Trace level**: All requests logged to structured log with req/res details

**Development mode** (NODE_ENV != production):
```
[14:30:15.123] INFO: NEARWEEK MCP Server running on mainnet (HTTP mode)
[14:30:30.123] ERROR: POST /rpc 500
[14:30:35.456] TRACE: POST /health 200
    method: "POST"
    url: "/health"
    statusCode: 200
    responseTime: 12
```

**Production mode** (NODE_ENV=production):
```json
{"level":30,"time":1673270415123,"msg":"NEARWEEK MCP Server running on mainnet (HTTP mode)"}
{"level":50,"time":1673270430123,"msg":"POST /rpc 500"}
{"level":10,"time":1673270435456,"method":"POST","url":"/health","statusCode":200,"responseTime":12,"msg":"POST /health 200"}
```

**Log Separation:**
- **Access logs**: All HTTP requests (always on in HTTP mode)
- **Structured logs**: Application messages, errors, and (at trace level) HTTP details
- At `trace` level: Both access logs and structured logs include HTTP request details

**Note**: Stdio mode only has structured logs (no HTTP access logs), and they're written to stderr to avoid interfering with the MCP protocol on stdout.

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

Add to your MCP client configuration with your API key:

```json
{
  "mcpServers": {
    "near": {
      "command": "node",
      "args": ["/path/to/nearweek/src/MCP/dist/index.js", "mainnet"],
      "env": {
        "NEAR_NETWORK": "mainnet",
        "MCP_API_KEY": "your-generated-api-key-here",
        "AUTH_BACKEND_URL": "http://localhost:3001"
      }
    }
  }
}
```

**Important**: Replace `your-generated-api-key-here` with an actual API key generated using the MCP Backend API's CLI tool.

### HTTP Transport (Web-based clients)

Start the server in HTTP mode and connect to:
- Base URL: `http://localhost:3000`
- **MCP Endpoint**: `http://localhost:3000/mcp` - Full MCP protocol with Streamable HTTP transport
  - Supports GET (SSE streams), POST (JSON-RPC messages), DELETE (session termination)
  - Includes session management with `Mcp-Session-Id` headers
  - Complies with MCP specification 2025-03-26
- **RPC Endpoint**: `http://localhost:3000/rpc` - Simple JSON-RPC endpoint for non-MCP clients

#### Using the MCP endpoint (for MCP clients)

MCP clients should use the `/mcp` endpoint with proper protocol headers and Bearer token authentication. The server manages sessions automatically.

```bash
# Example authenticated MCP request
curl -X POST http://localhost:3000/mcp \
  -H "Authorization: Bearer your-generated-api-key-here" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{},"id":1}'
```

#### Using the RPC endpoint (for simple HTTP clients)

For direct JSON-RPC requests without MCP protocol overhead (still requires authentication):

```bash
# List available tools (with authentication)
curl -X POST http://localhost:3000/rpc \
  -H "Authorization: Bearer your-generated-api-key-here" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "method": "tools/list", "id": 1}'

# Call a tool (with authentication)
curl -X POST http://localhost:3000/rpc \
  -H "Authorization: Bearer your-generated-api-key-here" \
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
