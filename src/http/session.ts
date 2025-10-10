/**
 * Session management for MCP server instances
 * Handles creation, storage, and lifecycle of MCP sessions
 */
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { randomUUID } from 'node:crypto';
import type { NearClient } from '../near-client.js';
import { getLogger } from '../logger.js';

/**
 * Session storage for maintaining server instances across requests
 */
export interface ServerSession {
  server: Server;
  transport: StreamableHTTPServerTransport;
  nearClient: NearClient;
}

/**
 * Manages MCP server sessions with lifecycle hooks
 */
export class SessionManager {
  private sessions = new Map<string, ServerSession>();

  /**
   * Get existing session by ID, or undefined if not found
   */
  getSession(sessionId: string | undefined): ServerSession | undefined {
    if (!sessionId) {
      return undefined;
    }
    return this.sessions.get(sessionId);
  }

  /**
   * Store a session by its transport's sessionId
   */
  storeSession(session: ServerSession): void {
    if (session.transport.sessionId && !this.sessions.has(session.transport.sessionId)) {
      this.sessions.set(session.transport.sessionId, session);
      const logger = getLogger();
      logger.info(`MCP session stored: ${session.transport.sessionId}`);
    }
  }

  /**
   * Create a new StreamableHTTPServerTransport with session lifecycle callbacks
   */
  createTransport(): StreamableHTTPServerTransport {
    const logger = getLogger();

    return new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      enableJsonResponse: false, // Use SSE streaming for real-time updates

      // Called when a new session is initialized
      onsessioninitialized: (newSessionId: string) => {
        logger.info(`MCP session initialized: ${newSessionId}`);
        // Session will be stored after handleRequest completes
      },

      // Called when session is closed (DELETE request)
      onsessionclosed: async (closedSessionId: string) => {
        logger.info(`MCP session closed: ${closedSessionId}`);
        const closedSession = this.sessions.get(closedSessionId);
        if (closedSession) {
          // Clean up server instance
          await closedSession.server.close();
          this.sessions.delete(closedSessionId);
        }
      },
    });
  }
}
