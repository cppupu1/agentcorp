import type { ServerResponse } from 'http';

interface SSEConnection {
  res: ServerResponse;
  seq: number;
}

export class SSEManager {
  private connections: Map<string, Set<SSEConnection>> = new Map();

  addConnection(taskId: string, res: ServerResponse): void {
    if (!this.connections.has(taskId)) {
      this.connections.set(taskId, new Set());
    }
    const conn: SSEConnection = { res, seq: 0 };
    this.connections.get(taskId)!.add(conn);

    res.on('close', () => {
      this.connections.get(taskId)?.delete(conn);
    });
  }

  emit(taskId: string, event: string, data: Record<string, unknown>): void {
    const clients = this.connections.get(taskId);
    if (!clients) return;

    for (const conn of clients) {
      conn.seq++;
      const payload = { seq: conn.seq, timestamp: new Date().toISOString(), ...data };
      conn.res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
    }
  }

  getConnectionCount(taskId: string): number {
    return this.connections.get(taskId)?.size ?? 0;
  }
}

export const sseManager = new SSEManager();
