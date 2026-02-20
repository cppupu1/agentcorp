import type { ServerResponse } from 'node:http';

interface SSEConnection {
  res: ServerResponse;
  seq: number;
}

/**
 * Manages SSE connections for task event streaming.
 * Supports multiple clients per task, heartbeat, and auto-cleanup.
 */
export class SSEManager {
  private connections = new Map<string, Set<SSEConnection>>();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private static readonly MAX_CONNECTIONS_PER_TASK = 10;

  start() {
    if (this.heartbeatTimer) return;
    this.heartbeatTimer = setInterval(() => {
      for (const [taskId, clients] of this.connections) {
        for (const conn of clients) {
          if (conn.res.writableEnded) {
            clients.delete(conn);
            continue;
          }
          this.emitTo(conn, 'heartbeat', {});
        }
        if (clients.size === 0) this.connections.delete(taskId);
      }
    }, 30_000);
  }

  stop() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    for (const clients of this.connections.values()) {
      for (const conn of clients) {
        if (!conn.res.writableEnded) conn.res.end();
      }
    }
    this.connections.clear();
  }

  addConnection(taskId: string, res: ServerResponse): boolean {
    if (!this.connections.has(taskId)) {
      this.connections.set(taskId, new Set());
    }
    const clients = this.connections.get(taskId)!;
    if (clients.size >= SSEManager.MAX_CONNECTIONS_PER_TASK) {
      return false;
    }
    const conn: SSEConnection = { res, seq: 0 };
    clients.add(conn);

    res.on('close', () => {
      const clients = this.connections.get(taskId);
      if (clients) {
        clients.delete(conn);
        if (clients.size === 0) this.connections.delete(taskId);
      }
    });

    return true;
  }

  emit(taskId: string, event: string, data: Record<string, unknown>): void {
    const clients = this.connections.get(taskId);
    if (!clients) return;

    for (const conn of clients) {
      if (conn.res.writableEnded) {
        clients.delete(conn);
        continue;
      }
      this.emitTo(conn, event, data);
    }
  }

  private emitTo(conn: SSEConnection, event: string, data: Record<string, unknown>): void {
    const safeEvent = event.replace(/[\r\n]/g, '');
    conn.seq++;
    const payload = { ...data, seq: conn.seq, timestamp: new Date().toISOString() };
    try {
      conn.res.write(`event: ${safeEvent}\ndata: ${JSON.stringify(payload)}\n\n`);
    } catch {
      // Connection broken, will be cleaned up on next heartbeat/emit
    }
  }
}

export const sseManager = new SSEManager();
