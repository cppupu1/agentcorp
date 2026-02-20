import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router';
import { tasksApi, ApiError, type TaskDetail, type TaskMessage } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { Loader2, Send, ArrowLeft, Check, X } from 'lucide-react';
import CostPanel from './CostPanel';
import ErrorTracePanel from './ErrorTracePanel';
import TaskTimeline from './TaskTimeline';
import ToolTracePanel from './ToolTracePanel';
import ObserverPanel from './ObserverPanel';
import EvidencePanel from './EvidencePanel';
import TaskDAG from './TaskDAG';

const STATUS_LABELS: Record<string, string> = {
  draft: '草稿', aligning: '对齐中', brief_review: '任务书审批',
  team_review: '团队审批', plan_review: '计划审批',
  executing: '执行中', paused: '已暂停', completed: '已完成', failed: '失败',
};

export default function TaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [activeTab, setActiveTab] = useState<'execution' | 'timeline' | 'tool-trace' | 'evidence' | 'dag'>('execution');

  const loadTask = useCallback(async () => {
    if (!id) return;
    try {
      const res = await tasksApi.get(id);
      setTask(res.data);
      setLoadError(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '加载失败';
      toast(msg, 'error');
      setLoadError(msg);
      // Only navigate away for 404
      if (err instanceof ApiError && err.code === 'NOT_FOUND') navigate('/tasks');
    } finally {
      setLoading(false);
    }
  }, [id, navigate, toast]);

  useEffect(() => { loadTask(); }, [loadTask]);

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  if (!task) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground mb-4">{loadError || '加载失败'}</p>
        <Button variant="outline" onClick={() => navigate('/tasks')}>返回任务列表</Button>
      </div>
    );
  }

  const status = task.status ?? 'draft';

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="sm" onClick={() => navigate('/tasks')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h2 className="text-2xl font-semibold">{task.title || '未命名任务'}</h2>
          <p className="text-sm text-muted-foreground">{task.teamName} · {STATUS_LABELS[status] || status}{task.mode === 'auto' ? ' · 自动模式' : ''}</p>
        </div>
        <Badge variant={status === 'executing' ? 'default' : status === 'paused' ? 'destructive' : 'secondary'}>{STATUS_LABELS[status] || status}</Badge>
        {(task.tokenUsage ?? 0) > 0 && (
          <span className="text-xs text-muted-foreground ml-2">
            Token: {(task.tokenUsage ?? 0).toLocaleString()}
          </span>
        )}
      </div>

      {task.description && (
        <div className="mb-6 p-4 bg-muted/30 rounded-lg">
          <p className="text-sm text-muted-foreground mb-1">任务描述</p>
          <p className="text-sm">{task.description}</p>
        </div>
      )}

      {/* Chat section for draft/aligning */}
      {(status === 'draft' || status === 'aligning') && (
        <div data-testid="task-aligning-panel">
          <ChatSection taskId={task.id} onStatusChange={loadTask} />
        </div>
      )}

      {/* Brief review */}
      {status === 'brief_review' && task.brief && (
        <BriefReviewSection
          task={task}
          approving={approving}
          onApprove={async (approved) => {
            setApproving(true);
            try {
              const res = await tasksApi.approveBrief(task.id, { approved });
              setTask(res.data);
              toast(approved ? '任务书已通过' : '已退回修改', 'success');
            } catch (err: unknown) {
              toast(err instanceof Error ? err.message : '操作失败', 'error');
            } finally {
              setApproving(false);
            }
          }}
        />
      )}

      {/* Team review */}
      {status === 'team_review' && task.teamConfig && (
        <TeamReviewSection
          task={task}
          approving={approving}
          onApprove={async (approved) => {
            setApproving(true);
            try {
              const res = await tasksApi.approveTeam(task.id, { approved });
              setTask(res.data);
              toast(approved ? '团队配置已确认' : '已退回修改', 'success');
            } catch (err: unknown) {
              toast(err instanceof Error ? err.message : '操作失败', 'error');
            } finally {
              setApproving(false);
            }
          }}
        />
      )}

      {/* Plan review */}
      {status === 'plan_review' && task.plan && (
        <PlanReviewSection
          task={task}
          approving={approving}
          onApprove={async (approved) => {
            setApproving(true);
            try {
              const res = await tasksApi.approvePlan(task.id, { approved });
              setTask(res.data);
              toast(approved ? '执行计划已通过，开始执行' : '已退回修改', 'success');
            } catch (err: unknown) {
              toast(err instanceof Error ? err.message : '操作失败', 'error');
            } finally {
              setApproving(false);
            }
          }}
        />
      )}

      {/* Executing / Completed / Failed with tabs */}
      {['executing', 'completed', 'failed'].includes(status) && (
        <>
          <div className="flex gap-1 border-b mb-4">
            {[
              { key: 'execution' as const, label: '执行' },
              { key: 'timeline' as const, label: '时间线' },
              { key: 'tool-trace' as const, label: '工具追踪' },
              { key: 'evidence' as const, label: '证据链' },
              { key: 'dag' as const, label: '可视化' },
            ].map(tab => (
              <button
                key={tab.key}
                className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  activeTab === tab.key
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === 'execution' && (
            <>
              {status === 'executing' && (
                <div data-testid="task-executing-panel">
                  <ExecutingSection task={task} onStatusChange={loadTask} />
                </div>
              )}
              {status === 'completed' && <CompletedSection task={task} />}
              {status === 'failed' && (
                <div className="space-y-4">
                  <h3 className="text-lg font-medium text-destructive">任务失败</h3>
                  {task.result != null && (
                    <div className="border border-destructive/30 rounded-lg p-4">
                      <p className="text-sm">{(task.result as any).error || '未知错误'}</p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {activeTab === 'timeline' && <TaskTimeline taskId={task.id} />}
          {activeTab === 'tool-trace' && <ToolTracePanel taskId={task.id} />}
          {activeTab === 'evidence' && <EvidencePanel taskId={task.id} />}
          {activeTab === 'dag' && <TaskDAG taskId={task.id} />}

          {/* Cost Panel */}
          <div className="mt-6">
            <CostPanel taskId={task.id} />
          </div>

          {/* Error Trace Panel */}
          <div className="mt-6">
            <details className="group">
              <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
                错误追踪
              </summary>
              <div className="mt-3">
                <ErrorTracePanel taskId={task.id} />
              </div>
            </details>
          </div>

          {/* Observer Panel */}
          <div className="mt-6">
            <details className="group">
              <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
                观察者
              </summary>
              <div className="mt-3">
                <ObserverPanel taskId={task.id} />
              </div>
            </details>
          </div>
        </>
      )}
    </div>
  );
}

// ---- Chat Section ----

function ChatSection({ taskId, onStatusChange }: { taskId: string; onStatusChange: () => void }) {
  const [messages, setMessages] = useState<TaskMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [streamText, setStreamText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    tasksApi.messages(taskId, 'chat').then(res => setMessages(res.data)).catch(() => {});
  }, [taskId]);

  // Abort in-flight request on unmount
  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamText]);

  const handleSend = async () => {
    if (!input.trim() || sending) return;
    const msg = input.trim();
    setInput('');
    setSending(true);
    setStreamText('');

    // Optimistic user message
    const tempUserMsg: TaskMessage = {
      id: `temp-${Date.now()}`,
      taskId,
      role: 'user',
      senderId: null,
      content: msg,
      messageType: 'chat',
      metadata: null,
      createdAt: new Date().toISOString(),
    };
    setMessages(prev => [...prev, tempUserMsg]);

    try {
      abortRef.current = new AbortController();
      const res = await fetch(`/api/tasks/${taskId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error?.message || res.statusText);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';
      let statusChanged = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        let eventType = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7);
          } else if (line.startsWith('data: ') && eventType) {
            try {
              const data = JSON.parse(line.slice(6));
              if (eventType === 'delta' && data.text) {
                fullText += data.text;
                setStreamText(fullText);
              } else if (eventType === 'status_change') {
                statusChanged = true;
              } else if (eventType === 'error') {
                toast(data.message || '对话出错', 'error');
              }
            } catch {}
          } else if (line === '') {
            // Blank line = end of SSE event
            eventType = '';
          }
        }
      }

      // Add assistant message
      if (fullText) {
        const assistantMsg: TaskMessage = {
          id: `assistant-${Date.now()}`,
          taskId,
          role: 'assistant',
          senderId: null,
          content: fullText,
          messageType: 'chat',
          metadata: null,
          createdAt: new Date().toISOString(),
        };
        setMessages(prev => [...prev, assistantMsg]);
      }
      setStreamText('');

      if (statusChanged) {
        onStatusChange();
      }
    } catch (err: unknown) {
      if ((err as Error).name !== 'AbortError') {
        toast(err instanceof Error ? err.message : '发送失败', 'error');
      }
    } finally {
      setSending(false);
      abortRef.current = null;
    }
  };

  return (
    <div className="border rounded-lg">
      <div className="h-96 overflow-y-auto p-4 space-y-3">
        {messages.filter(m => m.content).map(msg => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-lg px-4 py-2 text-sm ${
              msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'
            }`}>
              {msg.content}
            </div>
          </div>
        ))}
        {streamText && (
          <div className="flex justify-start">
            <div className="max-w-[80%] rounded-lg px-4 py-2 text-sm bg-muted">{streamText}</div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <div className="border-t p-3 flex gap-2">
        <Textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="输入消息与PM对话..."
          rows={2}
          className="flex-1 resize-none"
          data-testid="chat-input"
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); handleSend(); } }}
        />
        <Button onClick={handleSend} disabled={sending || !input.trim()} className="self-end" data-testid="chat-send-btn">
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}

// ---- Brief Review ----

function BriefReviewSection({ task, approving, onApprove }: { task: TaskDetail; approving: boolean; onApprove: (approved: boolean) => void }) {
  const brief = task.brief;
  if (!brief) return null;
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium">任务书审批</h3>
      <div className="border rounded-lg p-4 space-y-3">
        <div><span className="text-sm text-muted-foreground">标题：</span><span className="font-medium">{brief.title}</span></div>
        <div><span className="text-sm text-muted-foreground">目标：</span><p className="text-sm mt-1">{brief.objective}</p></div>
        <div><span className="text-sm text-muted-foreground">交付物：</span><p className="text-sm mt-1">{brief.deliverables}</p></div>
        {brief.constraints && <div><span className="text-sm text-muted-foreground">约束条件：</span><p className="text-sm mt-1">{brief.constraints}</p></div>}
        <div><span className="text-sm text-muted-foreground">验收标准：</span><p className="text-sm mt-1">{brief.acceptanceCriteria}</p></div>
      </div>
      <div className="flex gap-3">
        <Button onClick={() => onApprove(true)} disabled={approving} data-testid="approve-brief-btn">
          {approving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Check className="h-4 w-4 mr-1" />}
          通过
        </Button>
        <Button variant="outline" onClick={() => onApprove(false)} disabled={approving} data-testid="reject-brief-btn">
          <X className="h-4 w-4 mr-1" /> 退回修改
        </Button>
      </div>
    </div>
  );
}

// ---- Team Review ----

function TeamReviewSection({ task, approving, onApprove }: { task: TaskDetail; approving: boolean; onApprove: (approved: boolean) => void }) {
  const config = task.teamConfig;
  if (!config) return null;
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium">团队配置审批</h3>
      {config.pm && (
        <div className="border rounded-lg p-3">
          <p className="text-sm text-muted-foreground mb-1">项目经理</p>
          <p className="font-medium">{config.pm.name}</p>
        </div>
      )}
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">参与成员 ({config.members.length})</p>
        {config.members.map(m => (
          <div key={m.id} className="border rounded-lg p-3">
            <p className="font-medium text-sm">{m.name}</p>
            {m.taskPrompt && <p className="text-xs text-muted-foreground mt-1">{m.taskPrompt}</p>}
          </div>
        ))}
      </div>
      <div className="flex gap-3">
        <Button onClick={() => onApprove(true)} disabled={approving} data-testid="approve-team-btn">
          {approving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Check className="h-4 w-4 mr-1" />}
          确认团队
        </Button>
        <Button variant="outline" onClick={() => onApprove(false)} disabled={approving} data-testid="reject-team-btn">
          <X className="h-4 w-4 mr-1" /> 退回修改
        </Button>
      </div>
    </div>
  );
}

// ---- Plan Review ----

function PlanReviewSection({ task, approving, onApprove }: { task: TaskDetail; approving: boolean; onApprove: (approved: boolean) => void }) {
  const plan = task.plan;
  if (!plan) return null;
  // Build assignee name lookup from teamConfig
  const nameMap = new Map<string, string>();
  if (task.teamConfig) {
    if (task.teamConfig.pm) nameMap.set(task.teamConfig.pm.id, task.teamConfig.pm.name);
    for (const m of task.teamConfig.members) nameMap.set(m.id, m.name);
  }
  // Build subtask title lookup for dependency display
  const titleMap = new Map(plan.subtasks.map(st => [st.id, st.title]));
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium">执行计划审批</h3>
      <div className="space-y-2">
        {plan.subtasks.map((st, i) => (
          <div key={st.id} className="border rounded-lg p-3 flex items-start gap-3">
            <span className="text-xs bg-muted rounded-full w-6 h-6 flex items-center justify-center shrink-0">{i + 1}</span>
            <div className="flex-1">
              <p className="font-medium text-sm">{st.title}</p>
              {st.description && <p className="text-xs text-muted-foreground mt-1">{st.description}</p>}
              <div className="flex gap-2 mt-1">
                <Badge variant="outline" className="text-xs">负责人: {nameMap.get(st.assigneeId) || st.assigneeId}</Badge>
                {st.dependsOn.length > 0 && <Badge variant="secondary" className="text-xs">依赖: {st.dependsOn.map(id => titleMap.get(id) || id).join(', ')}</Badge>}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-3">
        <Button onClick={() => onApprove(true)} disabled={approving} data-testid="approve-plan-btn">
          {approving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Check className="h-4 w-4 mr-1" />}
          开始执行
        </Button>
        <Button variant="outline" onClick={() => onApprove(false)} disabled={approving} data-testid="reject-plan-btn">
          <X className="h-4 w-4 mr-1" /> 退回修改
        </Button>
      </div>
    </div>
  );
}

// ---- Executing ----

interface SubtaskState {
  id: string;
  title: string;
  status: string;
  assigneeId: string | null;
  assigneeName: string;
  output?: string;
  error?: string;
}

function ExecutingSection({ task, onStatusChange }: { task: TaskDetail; onStatusChange: () => void }) {
  const [subs, setSubs] = useState<SubtaskState[]>(
    task.subtasks.map(s => ({
      id: s.id, title: s.title, status: s.status || 'pending',
      assigneeId: s.assigneeId, assigneeName: s.assigneeName,
    }))
  );
  const [logs, setLogs] = useState<Array<{ time: string; text: string }>>([]);
  const onStatusChangeRef = useRef(onStatusChange);
  onStatusChangeRef.current = onStatusChange;

  const MAX_LOGS = 200;
  const addLog = useCallback((time: string, text: string) => {
    setLogs(prev => {
      const next = [...prev, { time, text }];
      return next.length > MAX_LOGS ? next.slice(-MAX_LOGS) : next;
    });
  }, []);

  useEffect(() => {
    let terminated = false;
    const es = new EventSource(`/api/tasks/${task.id}/events`);

    es.addEventListener('subtask_started', (e) => {
      const data = JSON.parse(e.data);
      setSubs(prev => prev.map(s =>
        s.id === data.subtaskId ? { ...s, status: 'running', assigneeName: data.employeeName || s.assigneeName } : s
      ));
      addLog(data.timestamp, `子任务「${data.title}」开始执行 (${data.employeeName})`);
    });

    es.addEventListener('subtask_completed', (e) => {
      const data = JSON.parse(e.data);
      setSubs(prev => prev.map(s =>
        s.id === data.subtaskId ? { ...s, status: 'completed', output: data.output?.summary } : s
      ));
      addLog(data.timestamp, `子任务完成`);
    });

    es.addEventListener('subtask_failed', (e) => {
      const data = JSON.parse(e.data);
      setSubs(prev => prev.map(s =>
        s.id === data.subtaskId ? { ...s, status: 'failed', error: data.error } : s
      ));
      addLog(data.timestamp, `子任务失败: ${data.error}`);
    });

    es.addEventListener('pm_decision', (e) => {
      const data = JSON.parse(e.data);
      addLog(data.timestamp, `PM: ${data.decision}`);
    });

    es.addEventListener('error_protection', (e) => {
      const data = JSON.parse(e.data);
      if (data.action === 'retried') {
        setSubs(prev => prev.map(s =>
          s.id === data.subtaskId ? { ...s, status: 'pending', error: undefined } : s
        ));
      } else if (data.action === 'reassigned') {
        setSubs(prev => prev.map(s =>
          s.id === data.subtaskId ? { ...s, status: 'pending', error: undefined, assigneeName: '重新分配中' } : s
        ));
      }
      addLog(data.timestamp, `错误保护: ${data.message}`);
    });

    es.addEventListener('task_status', (e) => {
      const data = JSON.parse(e.data);
      if (data.status === 'completed' || data.status === 'failed') {
        terminated = true;
        onStatusChangeRef.current();
        es.close();
      }
    });

    let errorCount = 0;
    es.onerror = () => {
      errorCount++;
      // Allow a few auto-reconnects for transient errors, then give up
      if (errorCount > 3 || es.readyState === EventSource.CLOSED) {
        es.close();
      }
    };

    es.onopen = () => {
      if (terminated) es.close();
    };

    return () => { terminated = true; es.close(); };
  }, [task.id, addLog]);

  const total = subs.length;
  const completed = subs.filter(s => s.status === 'completed').length;
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium">执行中</h3>
      <div className="flex items-center gap-3" data-testid="task-progress">
        <div className="flex-1 bg-muted rounded-full h-2">
          <div className="bg-primary rounded-full h-2 transition-all" style={{ width: `${progress}%` }} />
        </div>
        <span className="text-sm text-muted-foreground">{completed}/{total}</span>
      </div>
      <div className="space-y-2">
        {subs.map(st => (
          <div key={st.id} data-testid={`subtask-item-${st.id}`} className="border rounded-lg p-3 flex items-center gap-3">
            <Badge variant={st.status === 'completed' ? 'default' : st.status === 'running' ? 'secondary' : st.status === 'failed' ? 'destructive' : 'outline'} className="text-xs">
              {st.status === 'completed' ? '完成' : st.status === 'running' ? '执行中' : st.status === 'failed' ? '失败' : '待执行'}
            </Badge>
            <div className="flex-1">
              <p className="text-sm font-medium">{st.title}</p>
              <p className="text-xs text-muted-foreground">{st.assigneeName || '未分配'}</p>
              {st.error && <p className="text-xs text-destructive mt-1">{st.error}</p>}
              {st.output && <p className="text-xs text-muted-foreground mt-1">{st.output}</p>}
            </div>
            {st.status === 'running' && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>
        ))}
      </div>
      {logs.length > 0 && (
        <div className="border rounded-lg p-3 max-h-48 overflow-y-auto">
          <p className="text-sm text-muted-foreground mb-2">执行日志</p>
          {logs.map((log, i) => (
            <p key={i} className="text-xs text-muted-foreground">
              <span className="text-muted-foreground/60">{new Date(log.time).toLocaleTimeString()}</span> {log.text}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Completed ----

function CompletedSection({ task }: { task: TaskDetail }) {
  const result = task.result as any;
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium">任务完成</h3>
      {result && (
        <div className="border rounded-lg p-4 space-y-3">
          {result.summary && <div><p className="text-sm text-muted-foreground">摘要</p><p className="text-sm mt-1">{result.summary}</p></div>}
          {result.deliverables && (
            <div>
              <p className="text-sm text-muted-foreground">交付物</p>
              <div className="text-sm mt-1 prose prose-sm max-w-none whitespace-pre-wrap">{result.deliverables}</div>
            </div>
          )}
          {result.subtaskSummary && (
            <div className="flex gap-4 text-sm">
              <span>总计: {result.subtaskSummary.total}</span>
              <span className="text-green-600">完成: {result.subtaskSummary.completed}</span>
              {result.subtaskSummary.failed > 0 && <span className="text-destructive">失败: {result.subtaskSummary.failed}</span>}
            </div>
          )}
          {result.completedAt && <p className="text-xs text-muted-foreground">完成时间: {new Date(result.completedAt).toLocaleString()}</p>}
        </div>
      )}
      {task.subtasks.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">子任务摘要</p>
          {task.subtasks.map(st => (
            <div key={st.id} className="border rounded-lg p-3 flex items-center gap-3">
              <Badge variant={st.status === 'completed' ? 'default' : 'destructive'} className="text-xs">
                {st.status === 'completed' ? '完成' : st.status}
              </Badge>
              <span className="text-sm">{st.title}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
