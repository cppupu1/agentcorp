import type { CollaborationStrategy, CollaborationContext } from './types.js';
import { runAgentWithTools } from './utils.js';
import { completeTask, failTask } from '../task-executor.js';
import { sseManager } from '../sse-manager.js';
import { recordEvidence } from '../evidence.js';

export class DebateStrategy implements CollaborationStrategy {
  async execute(ctx: CollaborationContext): Promise<void> {
    const { taskId, brief, teamConfig, signal, teamToolIds } = ctx;

    const memberIds: string[] = (teamConfig.members ?? []).map((m) => m.id);
    const pmId = teamConfig.pm?.id;

    if (!pmId || memberIds.length === 0) {
      await failTask(taskId, '辩论模式需要PM和至少一个成员');
      return;
    }

    const briefText = JSON.stringify(brief, null, 2);

    // Phase 1: All members analyze in parallel (with MCP tools)
    sseManager.emit(taskId, 'debate_phase', { phase: 'analysis', message: '所有成员并行调研分析中...', memberCount: memberIds.length });

    const analysisPromises = memberIds.map(async (memberId) => {
      const member = (teamConfig.members ?? []).find((m) => m.id === memberId);
      const prompt = `请从你的专业角度分析以下任务。你拥有工具可以查询真实数据，请充分利用工具获取信息后再给出分析。

任务：
${briefText}

你的角色: ${member?.taskPrompt || '团队成员'}

要求：
- 使用工具获取相关数据和信息
- 基于真实数据给出有依据的分析
- 输出结构化的分析报告（Markdown格式）`;
      try {
        const result = await runAgentWithTools({
          employeeId: memberId, prompt, signal, teamToolIds, taskId,
          phaseLabel: 'analysis', maxSteps: 20,
        });
        return { memberId, name: member?.name || memberId, analysis: result };
      } catch (err) {
        return { memberId, name: member?.name || memberId, analysis: `[分析失败] ${(err as Error).message}` };
      }
    });

    const analyses = await Promise.all(analysisPromises);
    sseManager.emit(taskId, 'debate_phase', { phase: 'analysis_done', count: analyses.length });

    // Record analysis evidence
    for (const a of analyses) {
      recordEvidence({ taskId, type: 'output', title: `${a.name} 分析报告`, content: a.analysis, source: 'employee' }).catch(() => {});
    }

    if (signal.aborted) { await failTask(taskId, '任务被取消'); return; }

    // Phase 2: Cross-review (with tools for fact-checking)
    sseManager.emit(taskId, 'debate_phase', { phase: 'cross_review', message: '交叉审查中（可使用工具验证观点）...' });

    const allAnalysesText = analyses.map(a => `【${a.name}】的分析:\n${a.analysis}`).join('\n\n---\n\n');

    const reviewPromises = memberIds.map(async (memberId) => {
      const member = (teamConfig.members ?? []).find((m) => m.id === memberId);
      const prompt = `以下是所有成员对任务的分析。请审查其他人的观点，你可以使用工具验证他们的数据是否准确。

任务：
${briefText}

各成员分析：
${allAnalysesText}

要求：
- 指出你同意和不同意的地方，给出理由
- 如果对某个数据有疑问，使用工具验证
- 补充其他成员遗漏的重要信息`;
      try {
        const result = await runAgentWithTools({
          employeeId: memberId, prompt, signal, teamToolIds, taskId,
          phaseLabel: 'cross_review', maxSteps: 15,
        });
        return { memberId, name: member?.name || memberId, review: result };
      } catch (err) {
        return { memberId, name: member?.name || memberId, review: `[审查失败] ${(err as Error).message}` };
      }
    });

    const reviews = await Promise.all(reviewPromises);
    sseManager.emit(taskId, 'debate_phase', { phase: 'cross_review_done', count: reviews.length });

    // Record review evidence
    for (const r of reviews) {
      recordEvidence({ taskId, type: 'review', title: `${r.name} 交叉审查`, content: r.review, source: 'employee' }).catch(() => {});
    }

    if (signal.aborted) { await failTask(taskId, '任务被取消'); return; }

    // Phase 3: PM synthesizes (with tools for final verification)
    sseManager.emit(taskId, 'debate_phase', { phase: 'synthesis', message: 'PM综合分析中...' });

    const allReviewsText = reviews.map(r => `【${r.name}】的审查意见:\n${r.review}`).join('\n\n---\n\n');

    const synthesisPrompt = `你是项目经理，请基于以下所有成员的分析和交叉审查意见，直接综合形成最终结论和方案。不要再调用工具，所有数据已由成员提供。

任务：
${briefText}

初始分析：
${allAnalysesText}

交叉审查：
${allReviewsText}

请直接输出最终综合结论（Markdown格式），包含：
1. 核心共识
2. 主要分歧及你的判断
3. 最终方案与建议`;

    try {
      const synthesis = await runAgentWithTools({
        employeeId: pmId, prompt: synthesisPrompt, signal, teamToolIds: [], taskId,
        phaseLabel: 'synthesis', maxSteps: 5,
      });
      recordEvidence({ taskId, type: 'decision', title: 'PM 综合结论', content: synthesis, source: 'pm' }).catch(() => {});
      await completeTask(taskId, '辩论模式执行完成', synthesis);
    } catch (err) {
      await failTask(taskId, `PM综合分析失败: ${(err as Error).message}`);
    }
  }
}
