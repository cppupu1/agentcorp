import { db, observerFindings, teamMembers, employees, models, generateId, now } from '@agentcorp/db';
import { eq, and } from 'drizzle-orm';
import { createModel } from '@agentcorp/agent-core';
import { sseManager } from './sse-manager.js';
import { AppError } from '../errors.js';

// Get observers for a team
export async function getTeamObservers(teamId: string) {
  return db.select({
    employeeId: teamMembers.employeeId,
    name: employees.name,
    modelId: employees.modelId,
    systemPrompt: employees.systemPrompt,
  })
  .from(teamMembers)
  .innerJoin(employees, eq(teamMembers.employeeId, employees.id))
  .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.role, 'observer')));
}

// Run observer check on subtask output (non-blocking)
export async function runObserverCheck(
  taskId: string,
  teamId: string,
  subtaskId: string,
  subtaskTitle: string,
  subtaskOutput: string,
  brief: Record<string, unknown>,
): Promise<void> {
  const observers = await getTeamObservers(teamId);
  if (observers.length === 0) return;

  const observerTasks = observers.map(async (observer) => {
    if (!observer.modelId) return;

    const [model] = await db.select().from(models).where(eq(models.id, observer.modelId));
    if (!model) return;

    try {
      const { generateText } = await import('ai');
      const aiModel = createModel({ apiKey: model.apiKey, baseURL: model.baseUrl, modelId: model.modelId });

      const prompt = `${observer.systemPrompt || ''}

你是质量观察者。请审查以下子任务的输出，检查是否存在问题。

任务书摘要：
${JSON.stringify(brief, null, 2)}

子任务：${subtaskTitle}
子任务输出：
${subtaskOutput}

请以JSON格式返回审查结果：
{
  "findings": [
    {
      "severity": "info|warning|critical",
      "category": "factual_error|contradiction|goal_drift|quality",
      "description": "问题描述"
    }
  ]
}

如果没有发现问题，返回 {"findings": []}
只返回JSON。`;

      const result = await generateText({
        model: aiModel as any,
        prompt,
        abortSignal: AbortSignal.timeout(60000),
      });

      const text = result.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      let parsed: { findings?: Array<{ severity?: string; category?: string; description?: string }> } | undefined;
      try {
        parsed = JSON.parse(text);
      } catch {
        const match = text.match(/\{[\s\S]*\}/);
        if (match) parsed = JSON.parse(match[0]);
        else return;
      }

      if (parsed && parsed.findings && parsed.findings.length > 0) {
        for (const finding of parsed.findings) {
          const id = generateId();
          await db.insert(observerFindings).values({
            id,
            taskId,
            observerId: observer.employeeId,
            severity: finding.severity || 'info',
            category: finding.category || 'quality',
            description: finding.description || '未知问题',
            relatedSubtaskId: subtaskId,
            createdAt: now(),
          });

          sseManager.emit(taskId, 'observer_finding', {
            id,
            observerName: observer.name,
            severity: finding.severity,
            category: finding.category,
            description: finding.description,
          });

          if (finding.severity === 'critical') {
            console.warn(`Observer ${observer.name} found critical issue in task ${taskId}: ${finding.description}`);
          }
        }
      }
    } catch (err) {
      console.error(`Observer check failed for ${observer.name}:`, err);
    }
  });

  await Promise.allSettled(observerTasks);
}

// List findings for a task
export async function listObserverFindings(taskId: string) {
  return db.select({
    id: observerFindings.id,
    taskId: observerFindings.taskId,
    observerId: observerFindings.observerId,
    observerName: employees.name,
    severity: observerFindings.severity,
    category: observerFindings.category,
    description: observerFindings.description,
    relatedSubtaskId: observerFindings.relatedSubtaskId,
    resolution: observerFindings.resolution,
    createdAt: observerFindings.createdAt,
  })
  .from(observerFindings)
  .leftJoin(employees, eq(observerFindings.observerId, employees.id))
  .where(eq(observerFindings.taskId, taskId))
  .orderBy(observerFindings.createdAt);
}

// Resolve a finding
export async function resolveFinding(taskId: string, findingId: string, resolution: string) {
  const [finding] = await db.select().from(observerFindings)
    .where(and(eq(observerFindings.id, findingId), eq(observerFindings.taskId, taskId)));
  if (!finding) throw new AppError('NOT_FOUND', `发现 ${findingId} 不存在`);

  await db.update(observerFindings)
    .set({ resolution })
    .where(eq(observerFindings.id, findingId));

  return { id: findingId, resolution };
}
