import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CollaborationContext } from './types.js';

// ---- Mocks ----

const mockRunAgentOnce = vi.fn<(id: string, prompt: string, signal: AbortSignal) => Promise<string>>();
const mockRunAgentWithTools = vi.fn<(opts: any) => Promise<string>>();
vi.mock('./utils.js', () => ({
  runAgentOnce: (...args: any[]) => mockRunAgentOnce(...args),
  runAgentWithTools: (...args: any[]) => mockRunAgentWithTools(...args),
}));

const mockCompleteTask = vi.fn<(id: string, summary: string, deliverables: string) => Promise<void>>();
const mockFailTask = vi.fn<(id: string, error: string) => Promise<void>>();
const mockExecuteSubtask = vi.fn<(...args: any[]) => Promise<string>>();
const mockLoadTeamToolIds = vi.fn<(teamId: string) => Promise<string[]>>();
vi.mock('../task-executor.js', () => ({
  completeTask: (...args: any[]) => mockCompleteTask(...args),
  failTask: (...args: any[]) => mockFailTask(...args),
  executeSubtask: (...args: any[]) => mockExecuteSubtask(...args),
  loadTeamToolIds: (...args: any[]) => mockLoadTeamToolIds(...args),
}));

const mockEmit = vi.fn();
vi.mock('../sse-manager.js', () => ({ sseManager: { emit: (...args: any[]) => mockEmit(...args) } }));

const mockDbSelect = vi.fn();
const mockDbUpdate = vi.fn().mockReturnValue({ set: () => ({ where: () => Promise.resolve() }) });
vi.mock('@agentcorp/db', () => ({
  db: {
    select: () => ({ from: (t: any) => ({ where: (w: any) => ({ orderBy: mockDbSelect }) }) }),
    update: (...args: any[]) => mockDbUpdate(...args),
  },
  subtasks: {},
  now: () => new Date().toISOString(),
  eq: vi.fn(),
  and: vi.fn(),
}));

// ---- Helpers ----

function makeCtx(overrides?: Partial<CollaborationContext>): CollaborationContext {
  return {
    taskId: 'task-1',
    teamId: 'team-1',
    brief: { title: 'Test task' },
    plan: {},
    teamConfig: {
      pm: { id: 'pm-1', name: 'PM' },
      members: [
        { id: 'member-1', name: 'Alice', taskPrompt: 'Frontend dev' },
        { id: 'member-2', name: 'Bob', taskPrompt: 'Backend dev' },
      ],
    },
    signal: new AbortController().signal,
    teamToolIds: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---- Debate ----

describe('DebateStrategy', () => {
  it('runs 3 phases: analysis → cross-review → PM synthesis', async () => {
    const { DebateStrategy } = await import('./debate.js');
    mockRunAgentWithTools.mockResolvedValue('mock response');
    const ctx = makeCtx();

    await new DebateStrategy().execute(ctx);

    // 2 members analyze + 2 members review + 1 PM synthesize = 5 calls
    expect(mockRunAgentWithTools).toHaveBeenCalledTimes(5);
    expect(mockCompleteTask).toHaveBeenCalledWith('task-1', '辩论模式执行完成', 'mock response');
    expect(mockEmit).toHaveBeenCalledWith('task-1', 'debate_phase', expect.objectContaining({ phase: 'analysis' }));
    expect(mockEmit).toHaveBeenCalledWith('task-1', 'debate_phase', expect.objectContaining({ phase: 'cross_review' }));
    expect(mockEmit).toHaveBeenCalledWith('task-1', 'debate_phase', expect.objectContaining({ phase: 'synthesis' }));
  });

  it('fails without PM', async () => {
    const { DebateStrategy } = await import('./debate.js');
    const ctx = makeCtx({ teamConfig: { members: [{ id: 'm1', name: 'A' }] } });

    await new DebateStrategy().execute(ctx);

    expect(mockFailTask).toHaveBeenCalledWith('task-1', '辩论模式需要PM和至少一个成员');
  });

  it('fails without members', async () => {
    const { DebateStrategy } = await import('./debate.js');
    const ctx = makeCtx({ teamConfig: { pm: { id: 'pm-1', name: 'PM' }, members: [] } });

    await new DebateStrategy().execute(ctx);

    expect(mockFailTask).toHaveBeenCalledWith('task-1', '辩论模式需要PM和至少一个成员');
  });

  it('handles agent error gracefully in analysis phase', async () => {
    const { DebateStrategy } = await import('./debate.js');
    mockRunAgentWithTools
      .mockRejectedValueOnce(new Error('model down'))
      .mockResolvedValue('ok');
    const ctx = makeCtx();

    await new DebateStrategy().execute(ctx);

    expect(mockCompleteTask).toHaveBeenCalled();
  });

  it('aborts after analysis if signal is aborted', async () => {
    const { DebateStrategy } = await import('./debate.js');
    const ac = new AbortController();
    mockRunAgentWithTools.mockImplementation(async () => {
      ac.abort();
      return 'done';
    });
    const ctx = makeCtx({ signal: ac.signal });

    await new DebateStrategy().execute(ctx);

    expect(mockFailTask).toHaveBeenCalledWith('task-1', '任务被取消');
    expect(mockCompleteTask).not.toHaveBeenCalled();
  });
});

// ---- Vote ----

describe('VoteStrategy', () => {
  it('runs voting then PM tallies', async () => {
    const { VoteStrategy } = await import('./vote.js');
    mockRunAgentWithTools.mockResolvedValue('方案内容\n【方案标签: 方案A】');
    const ctx = makeCtx();

    await new VoteStrategy().execute(ctx);

    // 2 members vote + 1 PM tally = 3 calls
    expect(mockRunAgentWithTools).toHaveBeenCalledTimes(3);
    expect(mockCompleteTask).toHaveBeenCalledWith('task-1', '投票模式执行完成', expect.any(String));
    expect(mockEmit).toHaveBeenCalledWith('task-1', 'vote_phase', expect.objectContaining({ phase: 'voting' }));
    expect(mockEmit).toHaveBeenCalledWith('task-1', 'vote_phase', expect.objectContaining({ phase: 'tallying' }));
  });

  it('fails without PM', async () => {
    const { VoteStrategy } = await import('./vote.js');
    const ctx = makeCtx({ teamConfig: { members: [{ id: 'm1', name: 'A' }] } });

    await new VoteStrategy().execute(ctx);

    expect(mockFailTask).toHaveBeenCalledWith('task-1', '投票模式需要PM和至少一个成员');
  });

  it('extracts vote label from response', async () => {
    const { VoteStrategy } = await import('./vote.js');
    mockRunAgentWithTools
      .mockResolvedValueOnce('分析...\n【方案标签: 重构方案】')
      .mockResolvedValueOnce('分析...\n【方案标签: 渐进方案】')
      .mockResolvedValueOnce('PM最终结论');
    const ctx = makeCtx();

    await new VoteStrategy().execute(ctx);

    // PM tally prompt should contain the labels
    const pmCall = mockRunAgentWithTools.mock.calls[2][0];
    expect(pmCall.employeeId).toBe('pm-1');
    expect(pmCall.prompt).toContain('重构方案');
    expect(pmCall.prompt).toContain('渐进方案');
  });

  it('handles PM tally failure', async () => {
    const { VoteStrategy } = await import('./vote.js');
    mockRunAgentWithTools
      .mockResolvedValueOnce('vote1')
      .mockResolvedValueOnce('vote2')
      .mockRejectedValueOnce(new Error('PM error'));
    const ctx = makeCtx();

    await new VoteStrategy().execute(ctx);

    expect(mockFailTask).toHaveBeenCalledWith('task-1', 'PM统计投票失败: PM error');
  });
});

// ---- MasterSlave ----

describe('MasterSlaveStrategy', () => {
  it('runs 3 phases: plan → execute → aggregate', async () => {
    const { MasterSlaveStrategy } = await import('./master-slave.js');
    mockRunAgentWithTools
      .mockResolvedValueOnce('【子项1: 前端】做页面\n【子项2: 后端】做API')
      .mockResolvedValueOnce('前端完成')
      .mockResolvedValueOnce('后端完成')
      .mockResolvedValueOnce('最终汇总');
    const ctx = makeCtx();

    await new MasterSlaveStrategy().execute(ctx);

    // PM plan + 2 slaves + PM aggregate = 4 calls
    expect(mockRunAgentWithTools).toHaveBeenCalledTimes(4);
    expect(mockRunAgentWithTools.mock.calls[0][0].employeeId).toBe('pm-1'); // plan
    expect(mockRunAgentWithTools.mock.calls[3][0].employeeId).toBe('pm-1'); // aggregate
    expect(mockCompleteTask).toHaveBeenCalledWith('task-1', '主从模式执行完成', '最终汇总');
  });

  it('fails without PM', async () => {
    const { MasterSlaveStrategy } = await import('./master-slave.js');
    const ctx = makeCtx({ teamConfig: { members: [{ id: 'm1', name: 'A' }] } });

    await new MasterSlaveStrategy().execute(ctx);

    expect(mockFailTask).toHaveBeenCalledWith('task-1', '主从模式需要PM作为主节点');
  });

  it('fails without slave members', async () => {
    const { MasterSlaveStrategy } = await import('./master-slave.js');
    const ctx = makeCtx({ teamConfig: { pm: { id: 'pm-1', name: 'PM' }, members: [] } });

    await new MasterSlaveStrategy().execute(ctx);

    expect(mockFailTask).toHaveBeenCalledWith('task-1', '主从模式需要至少一个从节点成员');
  });

  it('handles master planning failure', async () => {
    const { MasterSlaveStrategy } = await import('./master-slave.js');
    mockRunAgentWithTools.mockRejectedValueOnce(new Error('plan failed'));
    const ctx = makeCtx();

    await new MasterSlaveStrategy().execute(ctx);

    expect(mockFailTask).toHaveBeenCalledWith('task-1', '主节点规划失败: plan failed');
  });
});

// ---- Pipeline ----

describe('PipelineStrategy', () => {
  it('executes subtasks sequentially, passing output forward', async () => {
    const { PipelineStrategy } = await import('./pipeline.js');
    mockDbSelect.mockResolvedValue([
      { id: 'st-1', taskId: 'task-1', title: 'Step 1', description: 'Do A', assigneeId: 'member-1', sortOrder: 0, maxRetries: 0 },
      { id: 'st-2', taskId: 'task-1', title: 'Step 2', description: 'Do B', assigneeId: 'member-2', sortOrder: 1, maxRetries: 0 },
    ]);
    mockLoadTeamToolIds.mockResolvedValue(['tool-1']);
    mockExecuteSubtask
      .mockResolvedValueOnce('output from step 1')
      .mockResolvedValueOnce('output from step 2');
    const ctx = makeCtx();

    await new PipelineStrategy().execute(ctx);

    expect(mockExecuteSubtask).toHaveBeenCalledTimes(2);
    // Second subtask should receive first subtask's output
    const secondCall = mockExecuteSubtask.mock.calls[1];
    expect(secondCall[3]).toContain('output from step 1');
    expect(mockCompleteTask).toHaveBeenCalledWith('task-1', '流水线执行完成', 'output from step 2');
  });

  it('fails when no subtasks exist', async () => {
    const { PipelineStrategy } = await import('./pipeline.js');
    mockDbSelect.mockResolvedValue([]);
    const ctx = makeCtx();

    await new PipelineStrategy().execute(ctx);

    expect(mockFailTask).toHaveBeenCalledWith('task-1', '没有子任务可执行');
  });

  it('fails when subtask has no assignee', async () => {
    const { PipelineStrategy } = await import('./pipeline.js');
    mockDbSelect.mockResolvedValue([
      { id: 'st-1', taskId: 'task-1', title: 'Step 1', description: 'Do A', assigneeId: null, sortOrder: 0 },
    ]);
    mockLoadTeamToolIds.mockResolvedValue([]);
    const ctx = makeCtx();

    await new PipelineStrategy().execute(ctx);

    expect(mockFailTask).toHaveBeenCalledWith('task-1', '子任务 st-1 未分配执行人');
  });

  it('retries failed subtask up to maxRetries', async () => {
    const { PipelineStrategy } = await import('./pipeline.js');
    mockDbSelect.mockResolvedValue([
      { id: 'st-1', taskId: 'task-1', title: 'Step 1', description: 'Do A', assigneeId: 'member-1', sortOrder: 0, maxRetries: 2 },
    ]);
    mockLoadTeamToolIds.mockResolvedValue([]);
    mockExecuteSubtask
      .mockResolvedValueOnce('[子任务执行失败] error 1')
      .mockResolvedValueOnce('[子任务执行失败] error 2')
      .mockResolvedValueOnce('success');
    const ctx = makeCtx();

    await new PipelineStrategy().execute(ctx);

    expect(mockExecuteSubtask).toHaveBeenCalledTimes(3);
    expect(mockCompleteTask).toHaveBeenCalled();
  });

  it('fails pipeline when retries exhausted', async () => {
    const { PipelineStrategy } = await import('./pipeline.js');
    mockDbSelect.mockResolvedValue([
      { id: 'st-1', taskId: 'task-1', title: 'Fail Step', description: 'Do A', assigneeId: 'member-1', sortOrder: 0, maxRetries: 1 },
    ]);
    mockLoadTeamToolIds.mockResolvedValue([]);
    mockExecuteSubtask.mockResolvedValue('[子任务执行失败] always fails');
    const ctx = makeCtx();

    await new PipelineStrategy().execute(ctx);

    expect(mockExecuteSubtask).toHaveBeenCalledTimes(2); // initial + 1 retry
    expect(mockFailTask).toHaveBeenCalledWith('task-1', expect.stringContaining('重试 1 次后仍失败'));
  });
});
