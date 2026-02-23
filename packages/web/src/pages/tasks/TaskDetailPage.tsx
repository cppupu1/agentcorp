import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router';
import { tasksApi, ApiError, type TaskDetail, type TaskMessage } from '@/api/client';
import { Button } from '@/components/ui/button';
import MarkdownContent from '@/components/MarkdownContent';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2, Send, ArrowLeft, Check, X } from 'lucide-react';
import CostPanel from './CostPanel';
import ErrorTracePanel from './ErrorTracePanel';
import TaskTimeline from './TaskTimeline';
import ToolTracePanel from './ToolTracePanel';
import ObserverPanel from './ObserverPanel';
import EvidencePanel from './EvidencePanel';
import TaskDAG from './TaskDAG';
import { useI18n } from '@/i18n';

const STATUS_KEYS: Record<string, string> = {
  draft: 'tasks.statusDraft', aligning: 'tasks.statusAligning', brief_review: 'tasks.statusBriefApproval',
  team_review: 'tasks.statusTeamApproval', plan_review: 'tasks.statusPlanApproval',
  executing: 'tasks.statusExecuting', paused: 'tasks.statusPaused', completed: 'tasks.statusCompleted', failed: 'tasks.statusFailed',
};

export default function TaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useI18n();
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
      const msg = err instanceof Error ? err.message : t('common.loadFailed');
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
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded" />
          <div className="flex-1"><Skeleton className="h-7 w-64" /><Skeleton className="h-4 w-40 mt-1" /></div>
        </div>
        <Skeleton className="h-8 w-full rounded-full" />
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-48 rounded-lg" />
      </div>
    );
  }

  if (!task) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground mb-4">{loadError || t('common.loadFailed')}</p>
        <Button variant="outline" onClick={() => navigate('/tasks')}>{t('taskDetail.backToTaskList')}</Button>
      </div>
    );
  }

  const status = task.status ?? 'draft';

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="sm" onClick={() => navigate('/tasks')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h2 className="text-2xl font-bold tracking-tight">{task.title || t('taskDetail.unnamed')}</h2>
          <p className="text-sm text-muted-foreground">{task.teamName} · {STATUS_KEYS[status] ? t(STATUS_KEYS[status]) : status}{task.mode === 'auto' ? ` · ${t('taskDetail.autoMode')}` : ''}</p>
        </div>
        <Badge variant={status === 'executing' ? 'default' : status === 'paused' ? 'destructive' : 'secondary'}>{STATUS_KEYS[status] ? t(STATUS_KEYS[status]) : status}</Badge>
        {(task.tokenUsage ?? 0) > 0 && (
          <span className="text-xs text-muted-foreground ml-2">
            Token: {(task.tokenUsage ?? 0).toLocaleString()}
          </span>
        )}
      </div>

      <WorkflowStepper status={status} />

      {task.description && (
        <div className="mb-6 p-5 bg-muted/30 rounded-2xl shadow-[var(--shadow-sm)]">
          <p className="text-sm text-muted-foreground mb-1">{t('taskDetail.description')}</p>
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
              toast(approved ? t('taskDetail.briefApproved') : t('taskDetail.returnedForRevision'), 'success');
            } catch (err: unknown) {
              toast(err instanceof Error ? err.message : t('taskDetail.approvalFailed'), 'error');
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
              toast(approved ? t('taskDetail.teamConfirmed') : t('taskDetail.returnedForRevision'), 'success');
            } catch (err: unknown) {
              toast(err instanceof Error ? err.message : t('taskDetail.approvalFailed'), 'error');
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
              toast(approved ? t('taskDetail.planApprovedStart') : t('taskDetail.returnedForRevision'), 'success');
            } catch (err: unknown) {
              toast(err instanceof Error ? err.message : t('taskDetail.approvalFailed'), 'error');
            } finally {
              setApproving(false);
            }
          }}
        />
      )}

      {/* Executing / Completed / Failed with tabs */}
      {['executing', 'completed', 'failed'].includes(status) && (
        <Tabs value={activeTab} onChange={setActiveTab as (v: string) => void}>
          <TabsList className="mb-4">
            <TabsTrigger value="execution">{t('taskDetail.tabExecution')}</TabsTrigger>
            <TabsTrigger value="timeline">{t('taskDetail.tabTimeline')}</TabsTrigger>
            <TabsTrigger value="tool-trace">{t('taskDetail.tabToolTrace')}</TabsTrigger>
            <TabsTrigger value="evidence">{t('taskDetail.tabEvidence')}</TabsTrigger>
            <TabsTrigger value="dag">{t('taskDetail.tabVisualization')}</TabsTrigger>
          </TabsList>

          <TabsContent value="execution">
            {status === 'executing' && (
              <div data-testid="task-executing-panel">
                <ExecutingSection task={task} onStatusChange={loadTask} />
              </div>
            )}
            {status === 'completed' && <CompletedSection task={task} />}
            {status === 'failed' && (
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-destructive">{t('taskDetail.taskFailed')}</h3>
                {task.result != null && (
                  <div className="rounded-2xl p-4 bg-destructive/5 shadow-[var(--shadow-sm)]">
                    <p className="text-sm">{(task.result as any).error || t('taskDetail.unknownError')}</p>
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="timeline"><TaskTimeline taskId={task.id} /></TabsContent>
          <TabsContent value="tool-trace"><ToolTracePanel taskId={task.id} /></TabsContent>
          <TabsContent value="evidence"><EvidencePanel taskId={task.id} /></TabsContent>
          <TabsContent value="dag"><TaskDAG taskId={task.id} /></TabsContent>

          {/* Cost Panel */}
          <div className="mt-6">
            <CostPanel taskId={task.id} />
          </div>

          {/* Error Trace Panel */}
          <div className="mt-6">
            <details className="group">
              <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
                {t('taskDetail.tabErrorTrace')}
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
                {t('taskDetail.tabObserver')}
              </summary>
              <div className="mt-3">
                <ObserverPanel taskId={task.id} />
              </div>
            </details>
          </div>
        </Tabs>
      )}
    </div>
  );
}

// ---- Workflow Stepper ----

const STEPS = [
  { key: 'draft', labelKey: 'taskDetail.stepDraft' },
  { key: 'aligning', labelKey: 'taskDetail.stepAligning' },
  { key: 'review', labelKey: 'taskDetail.stepReview' },
  { key: 'executing', labelKey: 'taskDetail.stepExecuting' },
  { key: 'completed', labelKey: 'taskDetail.stepCompleted' },
] as const;

function statusToStep(status: string): number {
  if (status === 'draft') return 0;
  if (status === 'aligning') return 1;
  if (['brief_review', 'team_review', 'plan_review'].includes(status)) return 2;
  if (status === 'executing' || status === 'paused') return 3;
  if (status === 'completed') return 4;
  if (status === 'failed') return 3;
  return 0;
}

function WorkflowStepper({ status }: { status: string }) {
  const { t } = useI18n();
  const current = statusToStep(status);
  const failed = status === 'failed';

  return (
    <div className="flex items-center gap-1 mb-6" data-testid="workflow-stepper">
      {STEPS.map((step, i) => {
        const done = i < current;
        const active = i === current;
        const isFailed = active && failed;
        return (
          <div key={step.key} className="flex items-center gap-1 flex-1">
            <div className="flex flex-col items-center flex-1">
              <div className={`h-2 w-full rounded-full transition-colors ${
                done ? 'bg-success' : isFailed ? 'bg-destructive' : active ? 'bg-primary' : 'bg-muted'
              }`} />
              <span className={`text-[11px] mt-1 ${
                active ? (isFailed ? 'text-destructive' : 'text-primary') : done ? 'text-success' : 'text-muted-foreground'
              }`}>
                {t(step.labelKey)}
              </span>
            </div>
          </div>
        );
      })}
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
  const { t } = useI18n();

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
                toast(data.message || t('taskDetail.chatError'), 'error');
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
        toast(err instanceof Error ? err.message : t('taskDetail.sendFailed'), 'error');
      }
    } finally {
      setSending(false);
      abortRef.current = null;
    }
  };

  return (
    <div className="bg-card rounded-2xl shadow-[var(--shadow-sm)] overflow-hidden">
      <div className="h-96 overflow-y-auto p-4 space-y-3">
        {messages.filter(m => m.content).map(msg => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-lg px-4 py-2 text-sm ${
              msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'
            }`}>
              {msg.role === 'user' ? msg.content : <MarkdownContent content={msg.content} className="text-sm" />}
            </div>
          </div>
        ))}
        {streamText && (
          <div className="flex justify-start">
            <div className="max-w-[80%] rounded-lg px-4 py-2 text-sm bg-muted">
              <MarkdownContent content={streamText} className="text-sm" />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <div className="border-t border-border/50 p-3 flex gap-2">
        <Textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder={t('taskDetail.chatPlaceholder')}
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
  const { t } = useI18n();
  if (!brief) return null;
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium">{t('taskDetail.briefApproval')}</h3>
      <div className="bg-card rounded-2xl p-5 shadow-[var(--shadow-sm)] space-y-3">
        <div><span className="text-sm text-muted-foreground">{t('taskDetail.briefTitle')}</span><span className="font-medium">{brief.title}</span></div>
        <div><span className="text-sm text-muted-foreground">{t('taskDetail.briefObjective')}</span><p className="text-sm mt-1">{brief.objective}</p></div>
        <div><span className="text-sm text-muted-foreground">{t('taskDetail.briefDeliverables')}</span><p className="text-sm mt-1">{brief.deliverables}</p></div>
        {brief.constraints && <div><span className="text-sm text-muted-foreground">{t('taskDetail.briefConstraints')}</span><p className="text-sm mt-1">{brief.constraints}</p></div>}
        <div><span className="text-sm text-muted-foreground">{t('taskDetail.briefAcceptanceCriteria')}</span><p className="text-sm mt-1">{brief.acceptanceCriteria}</p></div>
      </div>
      <div className="flex gap-3">
        <Button onClick={() => onApprove(true)} disabled={approving} data-testid="approve-brief-btn">
          {approving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Check className="h-4 w-4 mr-1" />}
          {t('taskDetail.pass')}
        </Button>
        <Button variant="outline" onClick={() => onApprove(false)} disabled={approving} data-testid="reject-brief-btn">
          <X className="h-4 w-4 mr-1" /> {t('taskDetail.returnRevision')}
        </Button>
      </div>
    </div>
  );
}

// ---- Team Review ----

function TeamReviewSection({ task, approving, onApprove }: { task: TaskDetail; approving: boolean; onApprove: (approved: boolean) => void }) {
  const config = task.teamConfig;
  const { t } = useI18n();
  if (!config) return null;
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium">{t('taskDetail.teamConfigApproval')}</h3>
      {config.pm && (
        <div className="rounded-xl bg-muted/30 p-3">
          <p className="text-sm text-muted-foreground mb-1">{t('taskDetail.projectManager')}</p>
          <p className="font-medium">{config.pm.name}</p>
        </div>
      )}
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">{t('taskDetail.participantMembers')} ({config.members.length})</p>
        {config.members.map(m => (
          <div key={m.id} className="rounded-xl bg-muted/30 p-3">
            <p className="font-medium text-sm">{m.name}</p>
            {m.taskPrompt && <p className="text-xs text-muted-foreground mt-1">{m.taskPrompt}</p>}
          </div>
        ))}
      </div>
      <div className="flex gap-3">
        <Button onClick={() => onApprove(true)} disabled={approving} data-testid="approve-team-btn">
          {approving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Check className="h-4 w-4 mr-1" />}
          {t('taskDetail.confirmTeam')}
        </Button>
        <Button variant="outline" onClick={() => onApprove(false)} disabled={approving} data-testid="reject-team-btn">
          <X className="h-4 w-4 mr-1" /> {t('taskDetail.returnRevision')}
        </Button>
      </div>
    </div>
  );
}

// ---- Plan Review ----

function PlanReviewSection({ task, approving, onApprove }: { task: TaskDetail; approving: boolean; onApprove: (approved: boolean) => void }) {
  const plan = task.plan;
  const { t } = useI18n();
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
      <h3 className="text-lg font-medium">{t('taskDetail.planApproval')}</h3>
      <div className="space-y-2">
        {plan.subtasks.map((st, i) => (
          <div key={st.id} className="rounded-xl bg-muted/30 p-3 flex items-start gap-3">
            <span className="text-xs bg-muted rounded-full w-6 h-6 flex items-center justify-center shrink-0">{i + 1}</span>
            <div className="flex-1">
              <p className="font-medium text-sm">{st.title}</p>
              {st.description && <p className="text-xs text-muted-foreground mt-1">{st.description}</p>}
              <div className="flex gap-2 mt-1">
                <Badge variant="outline" className="text-xs">{t('taskDetail.assignee')}: {nameMap.get(st.assigneeId) || st.assigneeId}</Badge>
                {st.dependsOn.length > 0 && <Badge variant="secondary" className="text-xs">{t('taskDetail.dependency')}: {st.dependsOn.map(id => titleMap.get(id) || id).join(', ')}</Badge>}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-3">
        <Button onClick={() => onApprove(true)} disabled={approving} data-testid="approve-plan-btn">
          {approving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Check className="h-4 w-4 mr-1" />}
          {t('taskDetail.startExecution')}
        </Button>
        <Button variant="outline" onClick={() => onApprove(false)} disabled={approving} data-testid="reject-plan-btn">
          <X className="h-4 w-4 mr-1" /> {t('taskDetail.returnRevision')}
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
  const { t } = useI18n();
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
      addLog(data.timestamp, `${t('taskDetail.subtaskStarted').replace('{title}', data.title).replace('{name}', data.employeeName)}`);
    });

    es.addEventListener('subtask_completed', (e) => {
      const data = JSON.parse(e.data);
      setSubs(prev => prev.map(s =>
        s.id === data.subtaskId ? { ...s, status: 'completed', output: data.output?.summary } : s
      ));
      addLog(data.timestamp, t('taskDetail.subtaskCompleted'));
    });

    es.addEventListener('subtask_failed', (e) => {
      const data = JSON.parse(e.data);
      setSubs(prev => prev.map(s =>
        s.id === data.subtaskId ? { ...s, status: 'failed', error: data.error } : s
      ));
      addLog(data.timestamp, t('taskDetail.subtaskFailed').replace('{error}', data.error));
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
          s.id === data.subtaskId ? { ...s, status: 'pending', error: undefined, assigneeName: t('taskDetail.reassigning') } : s
        ));
      }
      addLog(data.timestamp, t('taskDetail.errorProtection').replace('{message}', data.message));
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
      <h3 className="text-lg font-medium">{t('taskDetail.executing')}</h3>
      <div className="flex items-center gap-3" data-testid="task-progress">
        <div className="flex-1 bg-muted rounded-full h-2">
          <div className="bg-primary rounded-full h-2 transition-all" style={{ width: `${progress}%` }} />
        </div>
        <span className="text-sm text-muted-foreground">{completed}/{total}</span>
      </div>
      <div className="space-y-2">
        {subs.map(st => (
          <div key={st.id} data-testid={`subtask-item-${st.id}`} className="rounded-xl bg-muted/30 p-3 flex items-center gap-3">
            <Badge variant={st.status === 'completed' ? 'default' : st.status === 'running' ? 'secondary' : st.status === 'failed' ? 'destructive' : 'outline'} className="text-xs">
              {st.status === 'completed' ? t('taskDetail.statusCompleted') : st.status === 'running' ? t('taskDetail.statusRunning') : st.status === 'failed' ? t('taskDetail.statusFailed') : t('taskDetail.statusPending')}
            </Badge>
            <div className="flex-1">
              <p className="text-sm font-medium">{st.title}</p>
              <p className="text-xs text-muted-foreground">{st.assigneeName || t('taskDetail.unassigned')}</p>
              {st.error && <p className="text-xs text-destructive mt-1">{st.error}</p>}
              {st.output && <p className="text-xs text-muted-foreground mt-1">{st.output}</p>}
            </div>
            {st.status === 'running' && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>
        ))}
      </div>
      {logs.length > 0 && (
        <div className="rounded-xl bg-muted/30 p-3 max-h-48 overflow-y-auto">
          <p className="text-sm text-muted-foreground mb-2">{t('taskDetail.executionLog')}</p>
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
  const { t, locale } = useI18n();
  const result = task.result as any;
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium">{t('taskDetail.taskCompleted')}</h3>
      {result && (
        <div className="bg-card rounded-2xl p-5 shadow-[var(--shadow-sm)] space-y-3">
          {result.summary && <div><p className="text-sm text-muted-foreground">{t('taskDetail.summary')}</p><p className="text-sm mt-1">{result.summary}</p></div>}
          {result.deliverables && (
            <div>
              <p className="text-sm text-muted-foreground">{t('taskDetail.resultDeliverables')}</p>
              <MarkdownContent content={result.deliverables} className="text-sm mt-1" />
            </div>
          )}
          {result.subtaskSummary && (
            <div className="flex gap-4 text-sm">
              <span>{t('taskDetail.total')}: {result.subtaskSummary.total}</span>
              <span className="text-success">{t('taskDetail.completed')}: {result.subtaskSummary.completed}</span>
              {result.subtaskSummary.failed > 0 && <span className="text-destructive">{t('taskDetail.failed')}: {result.subtaskSummary.failed}</span>}
            </div>
          )}
          {result.completedAt && <p className="text-xs text-muted-foreground">{t('taskDetail.completedTime')}: {new Date(result.completedAt).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US')}</p>}
        </div>
      )}
      {task.subtasks.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">{t('taskDetail.subtaskSummary')}</p>
          {task.subtasks.map(st => (
            <div key={st.id} className="rounded-xl bg-muted/30 p-3 flex items-center gap-3">
              <Badge variant={st.status === 'completed' ? 'default' : 'destructive'} className="text-xs">
                {st.status === 'completed' ? t('taskDetail.statusCompleted') : st.status}
              </Badge>
              <span className="text-sm">{st.title}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
