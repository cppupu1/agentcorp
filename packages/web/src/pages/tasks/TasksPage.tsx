import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { tasksApi, teamsApi, type TaskSummary, type Team } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Plus, Trash2, Loader2, Search, Clock, ClipboardList, Sparkles } from 'lucide-react';
import { useI18n } from '@/i18n';
import { MagicInput } from '@/components/MagicInput';

const STATUS_KEYS: Record<string, { key: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' | 'success' | 'warning' }> = {
  draft: { key: 'tasks.statusDraft', variant: 'secondary' },
  aligning: { key: 'tasks.statusAligning', variant: 'default' },
  brief_review: { key: 'tasks.statusBriefApproval', variant: 'outline' },
  team_review: { key: 'tasks.statusTeamApproval', variant: 'outline' },
  plan_review: { key: 'tasks.statusPlanApproval', variant: 'outline' },
  executing: { key: 'tasks.statusExecuting', variant: 'warning' },
  completed: { key: 'tasks.statusCompleted', variant: 'success' },
  failed: { key: 'tasks.statusFailed', variant: 'destructive' },
};

export default function TasksPage() {
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterTeam, setFilterTeam] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<TaskSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();
  const { t } = useI18n();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: { teamId?: string; status?: string } = {};
      if (filterTeam) params.teamId = filterTeam;
      if (filterStatus) params.status = filterStatus;
      const res = await tasksApi.list(params);
      setTasks(res.data);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : t('common.loadFailed'), 'error');
    } finally {
      setLoading(false);
    }
  }, [toast, filterTeam, filterStatus]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    teamsApi.list().then(res => setTeams(res.data)).catch(() => {});
  }, []);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await tasksApi.delete(deleteTarget.id);
      toast(t('tasks.deleted'), 'success');
      setDeleteTarget(null);
      load();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : t('common.deleteFailed'), 'error');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8 pb-4 border-b border-border/40">
        <h2 className="text-3xl font-heading font-medium tracking-tight text-foreground/90">{t('tasks.title')}</h2>
        <Button onClick={() => navigate('/tasks/new')} data-testid="create-task-btn">
          <Plus className="h-4 w-4" /> {t('tasks.create')}
        </Button>
      </div>

      <MagicInput type="task" />

      <div className="flex gap-3 mb-5">
        <select className="h-12 rounded-2xl border border-transparent bg-muted/80 px-4 py-2 text-[15px] transition-all duration-200 ease-out hover:bg-muted focus-visible:outline-none focus-visible:bg-background focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/20" value={filterTeam} onChange={e => setFilterTeam(e.target.value)}>
          <option value="">{t('tasks.allTeams')}</option>
          {teams.map(tm => <option key={tm.id} value={tm.id}>{tm.name}</option>)}
        </select>
        <select className="h-12 rounded-2xl border border-transparent bg-muted/80 px-4 py-2 text-[15px] transition-all duration-200 ease-out hover:bg-muted focus-visible:outline-none focus-visible:bg-background focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/20" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">{t('tasks.allStatus')}</option>
          {Object.entries(STATUS_KEYS).map(([k, v]) => (
            <option key={k} value={k}>{t(v.key)}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
      ) : tasks.length === 0 && !filterTeam && !filterStatus ? (
        <div className="space-y-8">
          <EmptyState icon={<ClipboardList className="h-10 w-10" />} title={t('tasks.empty')} description={t('tasks.emptyDesc')} action={<Button onClick={() => navigate('/tasks/new')}><Plus className="h-4 w-4" /> {t('tasks.create')}</Button>} />
          <div>
            <p className="text-sm text-muted-foreground text-center mb-4">{t('templates.quickStartTask')}</p>
            <div className="grid gap-3 sm:grid-cols-3 max-w-3xl mx-auto">
              {(['templates.taskSuggestion1', 'templates.taskSuggestion2', 'templates.taskSuggestion3'] as const).map((key) => (
                <div key={key} className="bg-card rounded-2xl p-4 border border-border/40 shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5 transition-all cursor-pointer group" onClick={() => navigate('/tasks/new', { state: { magicPrefill: { description: t(key) } } })}>
                  <Sparkles className="h-4 w-4 text-primary/60 group-hover:text-primary transition-colors mb-2" />
                  <p className="text-sm">{t(key)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : tasks.length === 0 ? (
        <EmptyState icon={<ClipboardList className="h-10 w-10" />} title={t('common.noData')} description={t('tasks.emptyDesc')} />
      ) : (
        <div className="space-y-2">
          {tasks.map(task => {
            const st = STATUS_KEYS[task.status ?? ''] || { key: task.status, variant: 'secondary' as const };
            return (
              <div
                key={task.id}
                data-testid={`task-item-${task.id}`}
                className="bg-card rounded-3xl p-6 border border-border/40 shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] hover:ring-1 hover:ring-primary/20 hover:-translate-y-0.5 cursor-pointer transition-all"
                role="button"
                tabIndex={0}
                onClick={() => navigate(`/tasks/${task.id}`)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') navigate(`/tasks/${task.id}`); }}
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm">{task.title || task.description?.slice(0, 50) || t('tasks.unnamed')}</div>
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                      {task.teamName && <span>{task.teamName}</span>}
                      <span>{task.mode === 'auto' ? t('tasks.auto') : t('tasks.suggest')}</span>
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{new Date(task.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={st.variant}>{t(st.key)}</Badge>
                    <Button variant="ghost" size="sm" onClick={e => { e.stopPropagation(); setDeleteTarget(task); }} disabled={task.status === 'executing'}>
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={() => setDeleteTarget(null)}
        title={t('tasks.deleteTask')}
        description={t('tasks.deleteConfirm').replace('{name}', deleteTarget?.title || t('tasks.unnamed'))}
        onConfirm={handleDelete}
        loading={deleting}
      />
    </div>
  );
}
