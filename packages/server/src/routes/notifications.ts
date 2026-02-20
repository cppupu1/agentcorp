import type { FastifyInstance } from 'fastify';
import * as notificationService from '../services/notifications.js';

export function registerNotificationRoutes(app: FastifyInstance) {
  // List notifications
  app.get<{ Querystring: { read?: string } }>('/api/notifications', async (req) => {
    const read = req.query.read !== undefined ? parseInt(req.query.read, 10) : undefined;
    return { data: await notificationService.listNotifications(read) };
  });

  // Unread count
  app.get('/api/notifications/unread-count', async () => {
    return { data: await notificationService.getUnreadCount() };
  });

  // Mark one as read
  app.post<{ Params: { id: string } }>('/api/notifications/:id/read', async (req) => {
    return { data: await notificationService.markRead(req.params.id) };
  });

  // Mark all as read
  app.post('/api/notifications/read-all', async () => {
    return { data: await notificationService.markAllRead() };
  });
}
