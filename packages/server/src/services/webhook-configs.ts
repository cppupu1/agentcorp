import { db, webhookConfigs, generateId, now } from '@agentcorp/db';
import { eq } from 'drizzle-orm';
import { AppError } from '../errors.js';

export async function listWebhookConfigs() {
  return db.select().from(webhookConfigs).orderBy(webhookConfigs.createdAt);
}

export async function getWebhookConfig(id: string) {
  const [row] = await db.select().from(webhookConfigs).where(eq(webhookConfigs.id, id));
  if (!row) throw new AppError('NOT_FOUND', `Webhook 配置 ${id} 不存在`);
  return row;
}

interface CreateInput {
  name: string;
  url: string;
  secret?: string;
  events: string[];
  enabled?: boolean;
}

export async function createWebhookConfig(input: CreateInput) {
  const id = generateId();
  const timestamp = now();
  const [row] = await db.insert(webhookConfigs).values({
    id,
    name: input.name,
    url: input.url,
    secret: input.secret ?? null,
    events: JSON.stringify(input.events),
    enabled: input.enabled === false ? 0 : 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  }).returning();
  return row;
}

interface UpdateInput {
  name?: string;
  url?: string;
  secret?: string;
  events?: string[];
  enabled?: boolean;
}

export async function updateWebhookConfig(id: string, input: UpdateInput) {
  await getWebhookConfig(id);
  const updates: Record<string, unknown> = { updatedAt: now() };
  if (input.name !== undefined) updates.name = input.name;
  if (input.url !== undefined) updates.url = input.url;
  if (input.secret !== undefined) updates.secret = input.secret;
  if (input.events !== undefined) updates.events = JSON.stringify(input.events);
  if (input.enabled !== undefined) updates.enabled = input.enabled ? 1 : 0;
  await db.update(webhookConfigs).set(updates).where(eq(webhookConfigs.id, id));
  return getWebhookConfig(id);
}

export async function deleteWebhookConfig(id: string) {
  await getWebhookConfig(id);
  await db.delete(webhookConfigs).where(eq(webhookConfigs.id, id));
  return { id };
}
