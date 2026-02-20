import type { CollaborationStrategy, CollaborationContext } from './types.js';
import { runAgentOnce } from './utils.js';
import { completeTask, failTask } from '../task-executor.js';
import { sseManager } from '../sse-manager.js';

export class DebateStrategy implements CollaborationStrategy {
  async execute(ctx: CollaborationContext): Promise<void> {
    const { taskId, teamId, brief, teamConfig, signal } = ctx;

    const memberIds: string[] = (teamConfig.members ?? []).map((m) => m.id);
    const pmId = teamConfig.pm?.id;

    if (!pmId || memberIds.length === 0) {
      await failTask(taskId, '辩论模式需要PM和至少一个成员');
      return;
    }

    const briefText = JSON.stringify(brief, null, 2);

    // Phase 1: All members analyze in parallel
    sseManager.emit(taskId, 'debate_phase', { phase: 'analysis', message: '所有成员并行分析中...' });

    const analysisPromises = memberIds.map(async (memberId) => {
      const member = (teamConfig.members ?? []).find((m) => m.id === memberId);
      const prompt = `请从你的专业角度分析以下任务，给出你的见解和建议：\n\n${briefText}\n\n你的角色: ${member?.taskPrompt || '团队成员'}`;
      try {
        const result = await runAgentOnce(memberId, prompt, signal);
        return { memberId, name: member?.name || memberId, analysis: result };
      } catch (err) {
        return { memberId, name: member?.name || memberId, analysis: `[分析失败] ${(err as Error).message}` };
      }
    });

    const analyses = await Promise.all(analysisPromises);
    sseManager.emit(taskId, 'debate_phase', { phase: 'analysis_done', count: analyses.length });

    if (signal.aborted) { await failTask(taskId, '任务被取消'); return; }

    // Phase 2: Cross-review
    sseManager.emit(taskId, 'debate_phase', { phase: 'cross_review', message: '交叉审查中...' });

    const allAnalysesText = analyses.map(a => `【${a.name}】的分析:\n${a.analysis}`).join('\n\n---\n\n');

    const reviewPromises = memberIds.map(async (memberId) => {
      const member = (teamConfig.members ?? []).find((m) => m.id === memberId);
      const prompt = `以下是所有成员对任务的分析，请审查其他人的观点，指出你同意和不同意的地方，并补充你的看法：\n\n任务:\n${briefText}\n\n各成员分析:\n${allAnalysesText}`;
      try {
        const result = await runAgentOnce(memberId, prompt, signal);
        return { memberId, name: member?.name || memberId, review: result };
      } catch (err) {
        return { memberId, name: member?.name || memberId, review: `[审查失败] ${(err as Error).message}` };
      }
    });

    const reviews = await Promise.all(reviewPromises);
    sseManager.emit(taskId, 'debate_phase', { phase: 'cross_review_done', count: reviews.length });

    if (signal.aborted) { await failTask(taskId, '任务被取消'); return; }

    // Phase 3: PM synthesizes
    sseManager.emit(taskId, 'debate_phase', { phase: 'synthesis', message: 'PM综合分析中...' });

    const allReviewsText = reviews.map(r => `【${r.name}】的审查意见:\n${r.review}`).join('\n\n---\n\n');

    const synthesisPrompt = `你是项目经理，请综合以下所有成员的分析和交叉审查意见，形成最终的结论和方案：\n\n任务:\n${briefText}\n\n初始分析:\n${allAnalysesText}\n\n交叉审查:\n${allReviewsText}\n\n请给出最终综合结论，包含：\n1. 核心共识\n2. 主要分歧及你的判断\n3. 最终方案`;

    try {
      const synthesis = await runAgentOnce(pmId, synthesisPrompt, signal);
      await completeTask(taskId, '辩论模式执行完成', synthesis);
    } catch (err) {
      await failTask(taskId, `PM综合分析失败: ${(err as Error).message}`);
    }
  }
}
