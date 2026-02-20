import { db, notifications, webhookConfigs, generateId, now } from '@agentcorp/db';
import { eq, desc, sql } from 'drizzle-orm';
import { createHmac } from 'crypto';

/** Block webhooks to private/internal IP ranges */
function isPrivateUrl(urlStr: string): boolean {
  try {
    const url = new URL(urlStr);
    const hostname = url.hostname.toLowerCase();
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '0.0.0.0') return true;
    // Block metadata endpoints
    if (hostname === '169.254.169.254') return true;
    // Block private IP ranges
    const parts = hostname.split('.').map(Number);
    if (parts.length === 4 && parts.every(p => !isNaN(p))) {
      if (parts[0] === 10) return true;
      if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
      if (parts[0] === 192 && parts[1] === 168) return true;
    }
    return false;
  } catch {
    return true; // Block malformed URLs
  }
}

export async function notify(type: string, title: string, content: string, taskId?: string) {
  const id = generateId();
  const timestamp = now();
  const [row] = await db.insert(notifications).values({
    id,
    type,
    title,
    content,
    taskId: taskId ?? null,
    read: 0,
    createdAt: timestamp,
  }).returning();

  // Fire-and-forget webhook dispatch
  dispatchWebhooks(type, { id, type, title, content, taskId: taskId ?? null, createdAt: timestamp })
    .catch(err => console.error('Webhook dispatch failed:', err));

  return row;
}

export async function listNotifications(read?: number, limit = 100) {
  if (read !== undefined) {
    return db.select().from(notifications).where(eq(notifications.read, read)).orderBy(desc(notifications.createdAt)).limit(limit);
  }
  return db.select().from(notifications).orderBy(desc(notifications.createdAt)).limit(limit);
}

export async function markRead(id: string) {
  const [row] = await db.select().from(notifications).where(eq(notifications.id, id));
  if (!row) {
    const { AppError } = await import('../errors.js');
    throw new AppError('NOT_FOUND', `通知 ${id} 不存在`);
  }
  await db.update(notifications).set({ read: 1 }).where(eq(notifications.id, id));
  return { id };
}

export async function markAllRead() {
  await db.update(notifications).set({ read: 1 }).where(eq(notifications.read, 0));
  return { success: true };
}

export async function getUnreadCount() {
  const [result] = await db.select({ count: sql<number>`count(*)` }).from(notifications).where(eq(notifications.read, 0));
  return { count: result.count };
}

export async function dispatchWebhooks(type: string, payload: Record<string, unknown>) {
  const configs = await db.select().from(webhookConfigs).where(eq(webhookConfigs.enabled, 1));
  const body = JSON.stringify(payload);

  for (const config of configs) {
    let events: string[];
    try { events = JSON.parse(config.events); } catch { continue; }
    if (!events.includes(type)) continue;

    // SSRF protection: block private/internal URLs
    if (isPrivateUrl(config.url)) {
      console.warn(`Webhook ${config.name}: blocked private URL ${config.url}`);
      continue;
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (config.secret) {
      const signature = createHmac('sha256', config.secret).update(body).digest('hex');
      headers['X-Webhook-Signature'] = signature;
    }

    fetch(config.url, { method: 'POST', headers, body, signal: AbortSignal.timeout(10000) }).catch(err => {
      console.error(`Webhook ${config.name} (${config.url}) failed:`, err);
    });
  }
}
