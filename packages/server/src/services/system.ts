import { db, systemSettings, tasks, subtasks, now } from '@agentcorp/db';
import { eq, inArray } from 'drizzle-orm';
import { cancelAllExecutions } from './task-executor.js';
import { sseManager } from './sse-manager.js';
import { AppError } from '../errors.js';
import { createIncidentReport } from './incidents.js';

// ---- System Status ----

export function getSystemStatus(): 'normal' | 'frozen' {
  const [row] = db.select().from(systemSettings).where(eq(systemSettings.key, 'system_status')).all();
  return (row?.value as 'normal' | 'frozen') || 'normal';
}

export async function emergencyStop(): Promise<void> {
  const timestamp = now();

  // Set system to frozen
  db.insert(systemSettings)
    .values({ key: 'system_status', value: 'frozen', updatedAt: timestamp })
    .onConflictDoUpdate({ target: systemSettings.key, set: { value: 'frozen', updatedAt: timestamp } })
    .run();

  // Cancel all active executions
  await cancelAllExecutions();

  // Pause all executing tasks
  const executingTasks = db.select({ id: tasks.id }).from(tasks).where(eq(tasks.status, 'executing')).all();
  if (executingTasks.length > 0) {
    const ids = executingTasks.map(t => t.id);
    db.update(tasks)
      .set({ status: 'paused', updatedAt: timestamp })
      .where(inArray(tasks.id, ids))
      .run();

    // Pause running subtasks
    db.update(subtasks)
      .set({ status: 'paused', updatedAt: timestamp })
      .where(eq(subtasks.status, 'running'))
      .run();

    // Notify via SSE
    for (const t of executingTasks) {
      sseManager.emit(t.id, 'task_status', { taskId: t.id, status: 'paused', previousStatus: 'executing' });
    }

    // Auto-create incident reports for affected tasks
    for (const t of executingTasks) {
      createIncidentReport(t.id, 'emergency_stop').catch(err => {
        console.error(`Failed to create incident report for task ${t.id}:`, err);
      });
    }
  }
}

export async function emergencyResume(): Promise<void> {
  const timestamp = now();
  db.insert(systemSettings)
    .values({ key: 'system_status', value: 'normal', updatedAt: timestamp })
    .onConflictDoUpdate({ target: systemSettings.key, set: { value: 'normal', updatedAt: timestamp } })
    .run();
  // Note: does NOT auto-resume paused tasks — user must manually restart
}

// ---- Settings CRUD ----

export function getSetting(key: string): string | null {
  const [row] = db.select().from(systemSettings).where(eq(systemSettings.key, key)).all();
  return row?.value ?? null;
}

export function getSettings(): Record<string, string> {
  const rows = db.select().from(systemSettings).all();
  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.key] = row.value;
  }
  return result;
}

export function updateSetting(key: string, value: string): void {
  const timestamp = now();
  db.insert(systemSettings)
    .values({ key, value, updatedAt: timestamp })
    .onConflictDoUpdate({ target: systemSettings.key, set: { value, updatedAt: timestamp } })
    .run();
}

// ---- Frozen Guard ----

export function assertNotFrozen(): void {
  if (getSystemStatus() === 'frozen') {
    throw new AppError('INVALID_STATE', '系统已冻结，无法执行此操作。请联系管理员解除冻结。');
  }
}
