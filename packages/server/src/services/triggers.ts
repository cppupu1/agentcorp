import { db, triggers, teams, tasks, generateId, now } from '@agentcorp/db';
import { eq, and, desc } from 'drizzle-orm';
import { timingSafeEqual } from 'crypto';
import { AppError } from '../errors.js';
import { notify } from './notifications.js';

// ---- List ----

export async function listTriggers() {
  const rows = await db
    .select({
      id: triggers.id,
      name: triggers.name,
      type: triggers.type,
      config: triggers.config,
      teamId: triggers.teamId,
      teamName: teams.name,
      taskTemplate: triggers.taskTemplate,
      enabled: triggers.enabled,
      lastFiredAt: triggers.lastFiredAt,
      createdAt: triggers.createdAt,
      updatedAt: triggers.updatedAt,
    })
    .from(triggers)
    .leftJoin(teams, eq(triggers.teamId, teams.id))
    .orderBy(desc(triggers.createdAt));

  return rows.map(r => ({
    ...r,
    teamName: r.teamName ?? '',
    config: safeJsonParse(r.config, {}),
    taskTemplate: safeJsonParse(r.taskTemplate, {}),
  }));
}

// ---- Get ----

export async function getTrigger(id: string) {
  const [row] = await db
    .select({
      id: triggers.id,
      name: triggers.name,
      type: triggers.type,
      config: triggers.config,
      teamId: triggers.teamId,
      teamName: teams.name,
      taskTemplate: triggers.taskTemplate,
      enabled: triggers.enabled,
      lastFiredAt: triggers.lastFiredAt,
      createdAt: triggers.createdAt,
      updatedAt: triggers.updatedAt,
    })
    .from(triggers)
    .leftJoin(teams, eq(triggers.teamId, teams.id))
    .where(eq(triggers.id, id));

  if (!row) throw new AppError('NOT_FOUND', `触发器 ${id} 不存在`);

  return {
    ...row,
    teamName: row.teamName ?? '',
    config: safeJsonParse(row.config, {}),
    taskTemplate: safeJsonParse(row.taskTemplate, {}),
  };
}

// ---- Create ----

interface TriggerInput {
  name: string;
  type: 'cron' | 'webhook' | 'event';
  config: Record<string, unknown>;
  teamId: string;
  taskTemplate: { title: string; description: string; mode?: string };
  enabled?: boolean;
}

const VALID_TYPES = ['cron', 'webhook', 'event'] as const;

export async function createTrigger(input: TriggerInput) {
  if (!VALID_TYPES.includes(input.type)) {
    throw new AppError('VALIDATION_ERROR', `type 必须是 ${VALID_TYPES.join('/')} 之一`);
  }
  if (!input.name || typeof input.name !== 'string') {
    throw new AppError('VALIDATION_ERROR', 'name 必填');
  }
  if (!input.teamId) {
    throw new AppError('VALIDATION_ERROR', 'teamId 必填');
  }
  const [team] = await db.select({ id: teams.id }).from(teams).where(eq(teams.id, input.teamId));
  if (!team) throw new AppError('NOT_FOUND', `团队 ${input.teamId} 不存在`);

  if (!input.taskTemplate?.title || !input.taskTemplate?.description) {
    throw new AppError('VALIDATION_ERROR', 'taskTemplate 需要 title 和 description');
  }

  const id = generateId();
  const timestamp = now();
  await db.insert(triggers).values({
    id,
    name: input.name,
    type: input.type,
    config: JSON.stringify(input.config ?? {}),
    teamId: input.teamId,
    taskTemplate: JSON.stringify(input.taskTemplate),
    enabled: input.enabled !== false ? 1 : 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  return getTrigger(id);
}

// ---- Update ----

export async function updateTrigger(id: string, input: Partial<TriggerInput>) {
  const [existing] = await db.select().from(triggers).where(eq(triggers.id, id));
  if (!existing) throw new AppError('NOT_FOUND', `触发器 ${id} 不存在`);

  if (input.type !== undefined && !VALID_TYPES.includes(input.type)) {
    throw new AppError('VALIDATION_ERROR', `type 必须是 ${VALID_TYPES.join('/')} 之一`);
  }
  if (input.teamId !== undefined) {
    const [team] = await db.select({ id: teams.id }).from(teams).where(eq(teams.id, input.teamId));
    if (!team) throw new AppError('NOT_FOUND', `团队 ${input.teamId} 不存在`);
  }

  const updates: Record<string, unknown> = { updatedAt: now() };
  if (input.name !== undefined) updates.name = input.name;
  if (input.type !== undefined) updates.type = input.type;
  if (input.config !== undefined) updates.config = JSON.stringify(input.config);
  if (input.teamId !== undefined) updates.teamId = input.teamId;
  if (input.taskTemplate !== undefined) updates.taskTemplate = JSON.stringify(input.taskTemplate);
  if (input.enabled !== undefined) updates.enabled = input.enabled ? 1 : 0;

  await db.update(triggers).set(updates).where(eq(triggers.id, id));
  return getTrigger(id);
}

// ---- Delete ----

export async function deleteTrigger(id: string) {
  const [existing] = await db.select().from(triggers).where(eq(triggers.id, id));
  if (!existing) throw new AppError('NOT_FOUND', `触发器 ${id} 不存在`);
  await db.delete(triggers).where(eq(triggers.id, id));
  return { id };
}

// ---- Fire ----

export async function fireTrigger(triggerId: string) {
  const trigger = await getTrigger(triggerId);
  const template = trigger.taskTemplate as { title: string; description: string; mode?: string };

  if (!trigger.teamId) {
    throw new AppError('VALIDATION_ERROR', '触发器未关联团队');
  }

  const taskId = generateId();
  const timestamp = now();
  await db.insert(tasks).values({
    id: taskId,
    teamId: trigger.teamId,
    title: template.title,
    description: template.description,
    status: 'draft',
    mode: template.mode ?? 'suggest',
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  await db.update(triggers).set({ lastFiredAt: timestamp, updatedAt: timestamp }).where(eq(triggers.id, triggerId));

  await notify('trigger_fired', `触发器「${trigger.name}」已触发`, `已创建任务「${template.title}」`, taskId);

  return { taskId, triggerName: trigger.name };
}

// ---- Webhook handler ----

export async function handleWebhookTrigger(path: string, secret?: string) {
  const rows = await db
    .select()
    .from(triggers)
    .where(and(eq(triggers.type, 'webhook'), eq(triggers.enabled, 1)));

  const match = rows.find(r => {
    const config = safeJsonParse<{ webhookPath?: string }>(r.config, {});
    return config.webhookPath === path;
  });

  if (!match) throw new AppError('NOT_FOUND', `未找到匹配的 webhook 触发器: ${path}`);

  // Verify secret if the trigger has one configured (timing-safe comparison)
  const config = safeJsonParse<{ webhookPath?: string; secret?: string }>(match.config, {});
  if (config.secret) {
    if (!secret) {
      throw new AppError('FORBIDDEN', 'Webhook secret 验证失败');
    }
    const expected = Buffer.from(config.secret, 'utf8');
    const actual = Buffer.from(secret, 'utf8');
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      throw new AppError('FORBIDDEN', 'Webhook secret 验证失败');
    }
  }

  return fireTrigger(match.id);
}

// ---- Cron scheduler ----

let cronTimer: ReturnType<typeof setInterval> | null = null;

function matchesCron(cronExpr: string): boolean {
  // Simple MVP: support */N patterns for minutes
  const match = cronExpr.match(/^\*\/(\d+)$/);
  if (!match) return false;
  const interval = parseInt(match[1], 10);
  if (interval <= 0) return false;
  const currentMinute = new Date().getMinutes();
  return currentMinute % interval === 0;
}

async function checkCronTriggers() {
  try {
    const rows = await db
      .select()
      .from(triggers)
      .where(and(eq(triggers.type, 'cron'), eq(triggers.enabled, 1)));

    for (const row of rows) {
      const config = safeJsonParse<{ cron?: string }>(row.config, {});
      if (config.cron && matchesCron(config.cron)) {
        // Prevent duplicate firing within the same minute
        if (row.lastFiredAt) {
          const lastFired = new Date(row.lastFiredAt);
          const nowDate = new Date();
          if (lastFired.getFullYear() === nowDate.getFullYear()
            && lastFired.getMonth() === nowDate.getMonth()
            && lastFired.getDate() === nowDate.getDate()
            && lastFired.getHours() === nowDate.getHours()
            && lastFired.getMinutes() === nowDate.getMinutes()) {
            continue;
          }
        }
        fireTrigger(row.id).catch(err => {
          console.error(`Cron trigger ${row.name} (${row.id}) failed:`, err);
        });
      }
    }
  } catch (err) {
    console.error('Cron scheduler check failed:', err);
  }
}

export function initCronScheduler() {
  if (cronTimer) return;
  console.log('Cron scheduler started (60s interval)');
  cronTimer = setInterval(checkCronTriggers, 60_000);
}

export function stopCronScheduler() {
  if (cronTimer) {
    clearInterval(cronTimer);
    cronTimer = null;
  }
}

// ---- Helpers ----

function safeJsonParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw); }
  catch { return fallback; }
}
