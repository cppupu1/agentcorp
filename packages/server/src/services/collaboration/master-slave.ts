import type { CollaborationStrategy, CollaborationContext } from './types.js';
import { runAgentWithTools } from './utils.js';
import { completeTask, failTask } from '../task-executor.js';
import { sseManager } from '../sse-manager.js';
import { recordEvidence } from '../evidence.js';

export class MasterSlaveStrategy implements CollaborationStrategy {
  async execute(ctx: CollaborationContext): Promise<void> {
    const { taskId, brief, teamConfig, signal, teamToolIds } = ctx;

    const memberIds: string[] = (teamConfig.members ?? []).map((m) => m.id);
    const pmId = teamConfig.pm?.id;

    if (!pmId) {
      await failTask(taskId, '主从模式需要PM作为主节点');
      return;
    }

    // Master = PM, Slaves = members
    const masterId = pmId;
    const slaveIds = memberIds.filter(id => id !== masterId);

    if (slaveIds.length === 0) {
      await failTask(taskId, '主从模式需要至少一个从节点成员');
      return;
    }

    const briefText = JSON.stringify(brief, null, 2);

    // Phase 1: Master creates detailed plan
    sseManager.emit(taskId, 'master_slave_phase', { phase: 'planning', message: '主节点规划中...' });

    const planPrompt = `你是主节点（Master），请为以下任务创建详细的执行计划。将任务分解为 ${slaveIds.length} 个可并行执行的子项，每个子项用 【子项N: 标题】 开头，后跟详细说明。\n\n任务:\n${briefText}`;

    let masterPlan: string;
    try {
      masterPlan = await runAgentWithTools({
        employeeId: masterId, prompt: planPrompt, signal, teamToolIds, taskId,
        phaseLabel: 'planning', maxSteps: 10,
      });
    } catch (err) {
      await failTask(taskId, `主节点规划失败: ${(err as Error).message}`);
      return;
    }

    sseManager.emit(taskId, 'master_slave_phase', { phase: 'planning_done', plan: masterPlan.slice(0, 500) });
    recordEvidence({ taskId, type: 'output', title: '主节点执行计划', content: masterPlan, source: 'pm' }).catch(() => {});

    if (signal.aborted) { await failTask(taskId, '任务被取消'); return; }

    // Phase 2: Slaves execute plan items in parallel
    sseManager.emit(taskId, 'master_slave_phase', { phase: 'execution', message: '从节点并行执行中...' });

    // Split plan into items for each slave using multiple regex patterns
    let planItems: string[] = [];

    // Try pattern 1: 【子项N...】
    planItems = masterPlan.split(/【子项\d+/).filter(s => s.trim());
    if (planItems.length < slaveIds.length) {
      // Try pattern 2: ## 子项
      planItems = masterPlan.split(/## 子项/).filter(s => s.trim());
    }
    if (planItems.length < slaveIds.length) {
      // Try pattern 3: numbered list (1. 2. 3.)
      planItems = masterPlan.split(/(?=\d+\.\s)/).filter(s => s.trim());
    }
    if (planItems.length < slaveIds.length) {
      // Fallback: split on double newlines and distribute evenly
      const paragraphs = masterPlan.split(/\n\n+/).filter(s => s.trim());
      if (paragraphs.length >= slaveIds.length) {
        const chunkSize = Math.ceil(paragraphs.length / slaveIds.length);
        planItems = [];
        for (let i = 0; i < paragraphs.length; i += chunkSize) {
          planItems.push(paragraphs.slice(i, i + chunkSize).join('\n\n'));
        }
      } else {
        planItems = paragraphs;
      }
    }

    // If splitting didn't work well, just distribute the whole plan
    const assignments = slaveIds.map((slaveId, i) => {
      const member = (teamConfig.members ?? []).find((m) => m.id === slaveId);
      const item = planItems[i] || masterPlan;
      return { slaveId, name: member?.name || slaveId, task: item };
    });

    const execPromises = assignments.map(async ({ slaveId, name, task }) => {
      const prompt = `你是从节点，请执行主节点分配给你的任务：\n\n${task}\n\n完整任务背景:\n${briefText}`;
      try {
        const result = await runAgentWithTools({
          employeeId: slaveId, prompt, signal, teamToolIds, taskId,
          phaseLabel: 'execution', maxSteps: 20,
        });
        return { slaveId, name, result, success: true };
      } catch (err) {
        return { slaveId, name, result: `[执行失败] ${(err as Error).message}`, success: false };
      }
    });

    const results = await Promise.all(execPromises);

    for (const r of results) {
      recordEvidence({ taskId, type: 'output', title: `${r.name} 执行结果`, content: r.result, source: 'employee' }).catch(() => {});
    }

    sseManager.emit(taskId, 'master_slave_phase', {
      phase: 'execution_done',
      succeeded: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
    });

    if (signal.aborted) { await failTask(taskId, '任务被取消'); return; }

    // Phase 3: Master reviews and aggregates
    sseManager.emit(taskId, 'master_slave_phase', { phase: 'aggregation', message: '主节点汇总中...' });

    const allResultsText = results.map(r =>
      `【${r.name}】(${r.success ? '成功' : '失败'}):\n${r.result}`
    ).join('\n\n---\n\n');

    const aggregatePrompt = `你是主节点（Master），从节点已完成执行。请审查所有结果并汇总为最终交付物：\n\n原始任务:\n${briefText}\n\n你的执行计划:\n${masterPlan}\n\n各从节点结果:\n${allResultsText}\n\n请整合所有结果，生成最终交付物。`;

    try {
      const finalResult = await runAgentWithTools({
        employeeId: masterId, prompt: aggregatePrompt, signal, teamToolIds, taskId,
        phaseLabel: 'aggregation', maxSteps: 10,
      });
      recordEvidence({ taskId, type: 'decision', title: '主节点汇总结论', content: finalResult, source: 'pm' }).catch(() => {});
      await completeTask(taskId, '主从模式执行完成', finalResult);
    } catch (err) {
      await failTask(taskId, `主节点汇总失败: ${(err as Error).message}`);
    }
  }
}
