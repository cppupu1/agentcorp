import type { FastifyInstance } from 'fastify';
import { db } from '@agentcorp/db';
import { sql } from 'drizzle-orm';

export function registerHealthRoute(app: FastifyInstance) {
  app.get('/api/health', async () => {
    let dbStatus = 'connected';
    try {
      db.run(sql`SELECT 1`);
    } catch {
      dbStatus = 'disconnected';
    }

    return {
      status: 'ok',
      version: '1.0.0',
      database: dbStatus,
      uptime: Math.floor(process.uptime()),
    };
  });
}
