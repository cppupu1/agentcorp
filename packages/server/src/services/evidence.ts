import { db, evidenceItems, generateId, now } from '@agentcorp/db';
import { eq, and, sql } from 'drizzle-orm';

export interface RecordEvidenceParams {
  taskId: string;
  subtaskId?: string;
  type: 'input' | 'output' | 'decision' | 'tool_call' | 'review' | 'approval';
  title: string;
  content: unknown;
  source: 'pm' | 'employee' | 'system' | 'observer';
}

export async function recordEvidence(params: RecordEvidenceParams): Promise<string> {
  const id = generateId();
  await db.insert(evidenceItems).values({
    id,
    taskId: params.taskId,
    subtaskId: params.subtaskId ?? null,
    type: params.type,
    title: params.title,
    content: JSON.stringify(params.content),
    source: params.source,
    createdAt: now(),
  });
  return id;
}

export async function getTaskEvidence(taskId: string) {
  return db.select().from(evidenceItems)
    .where(eq(evidenceItems.taskId, taskId))
    .orderBy(evidenceItems.createdAt);
}

export async function getSubtaskEvidence(taskId: string, subtaskId: string) {
  return db.select().from(evidenceItems)
    .where(and(eq(evidenceItems.taskId, taskId), eq(evidenceItems.subtaskId, subtaskId)))
    .orderBy(evidenceItems.createdAt);
}

export async function getEvidenceChainSummary(taskId: string) {
  const items = await getTaskEvidence(taskId);

  const byType: Record<string, number> = {};
  const bySource: Record<string, number> = {};

  for (const item of items) {
    byType[item.type] = (byType[item.type] || 0) + 1;
    const src = item.source ?? 'unknown';
    bySource[src] = (bySource[src] || 0) + 1;
  }

  const timeline = items.map(item => ({
    id: item.id,
    type: item.type,
    title: item.title,
    source: item.source,
    subtaskId: item.subtaskId,
    createdAt: item.createdAt,
  }));

  return {
    totalItems: items.length,
    byType,
    bySource,
    timeline,
  };
}
