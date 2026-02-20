import type { CollaborationStrategy, CollaborationContext } from './types.js';
import { runAgentOnce } from './utils.js';
import { completeTask, failTask } from '../task-executor.js';
import { sseManager } from '../sse-manager.js';

export class VoteStrategy implements CollaborationStrategy {
  async execute(ctx: CollaborationContext): Promise<void> {
    const { taskId, brief, teamConfig, signal } = ctx;

    const memberIds: string[] = (teamConfig.members ?? []).map((m) => m.id);
    const pmId = teamConfig.pm?.id;

    if (!pmId || memberIds.length === 0) {
      await failTask(taskId, '投票模式需要PM和至少一个成员');
      return;
    }

    const briefText = JSON.stringify(brief, null, 2);

    // Phase 1: All members independently produce solutions
    sseManager.emit(taskId, 'vote_phase', { phase: 'voting', message: '所有成员独立判断中...' });

    const votePromises = memberIds.map(async (memberId) => {
      const member = (teamConfig.members ?? []).find((m) => m.id === memberId);
      const prompt = `请独立分析以下任务并给出你的方案。在回答的最后一行，用 【方案标签: XXX】 的格式给出一个简短的方案标签（如"方案A"、"重构方案"等），以便投票统计。\n\n${briefText}\n\n你的角色: ${member?.taskPrompt || '团队成员'}`;
      try {
        const result = await runAgentOnce(memberId, prompt, signal);
        // Extract vote label from last line
        const labelMatch = result.match(/【方案标签:\s*(.+?)】/);
        const label = labelMatch ? labelMatch[1].trim() : `${member?.name || memberId}的方案`;
        return { memberId, name: member?.name || memberId, solution: result, label };
      } catch (err) {
        return { memberId, name: member?.name || memberId, solution: `[投票失败] ${(err as Error).message}`, label: '失败' };
      }
    });

    const votes = await Promise.all(votePromises);
    sseManager.emit(taskId, 'vote_phase', { phase: 'voting_done', count: votes.length });

    if (signal.aborted) { await failTask(taskId, '任务被取消'); return; }

    // Phase 2: Count votes / PM breaks ties
    sseManager.emit(taskId, 'vote_phase', { phase: 'tallying', message: 'PM统计投票结果...' });

    const allSolutionsText = votes.map((v, i) =>
      `【${v.name}】(标签: ${v.label}):\n${v.solution}`
    ).join('\n\n---\n\n');

    const tallyPrompt = `你是项目经理，以下是所有成员对任务的独立方案。请：\n1. 分析各方案的优劣\n2. 选出最佳方案（多数票优先，平票时由你决定）\n3. 基于获胜方案整合出最终交付物\n\n任务:\n${briefText}\n\n各成员方案:\n${allSolutionsText}`;

    try {
      const finalResult = await runAgentOnce(pmId, tallyPrompt, signal);
      await completeTask(taskId, '投票模式执行完成', finalResult);
    } catch (err) {
      await failTask(taskId, `PM统计投票失败: ${(err as Error).message}`);
    }
  }
}
