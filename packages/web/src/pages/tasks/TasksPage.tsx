import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { tasksApi, teamsApi, type TaskSummary, type Team } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import { useI18n } from '@/i18n';

const STATUS_KEYS: Record<string, { key: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  draft: { key: 'tasks.statusDraft', variant: 'secondary' },
  aligning: { key: 'tasks.statusAligning', variant: 'default' },
  brief_review: { key: 'tasks.statusBriefApproval', variant: 'outline' },
  team_review: { key: 'tasks.statusTeamApproval', variant: 'outline' },
  plan_review: { key: 'tasks.statusPlanApproval', variant: 'outline' },
  executing: { key: 'tasks.statusExecuting', variant: 'default' },
  completed: { key: 'tasks.statusCompleted', variant: 'secondary' },
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
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold">{t('tasks.title')}</h2>
        <Button onClick={() => navigate('/tasks/new')} data-testid="create-task-btn">
          <Plus className="h-4 w-4" /> {t('tasks.create')}
        </Button>
      </div>

      <div className="flex gap-3 mb-4">
        <select
          className="border rounded-md px-3 py-2 text-sm bg-background"
          value={filterTeam}
          onChange={e => setFilterTeam(e.target.value)}
        >
          <option value="">{t('tasks.allTeams')}</option>
          {teams.map(tm => <option key={tm.id} value={tm.id}>{tm.name}</option>)}
        </select>
        <select
          className="border rounded-md px-3 py-2 text-sm bg-background"
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
        >
          <option value="">{t('tasks.allStatus')}</option>
          {Object.entries(STATUS_KEYS).map(([k, v]) => (
            <option key={k} value={k}>{t(v.key)}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">{t('tasks.empty')}</div>
      ) : (
        <div className="border rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-3 font-medium">{t('tasks.colTitle')}</th>
                <th className="text-left px-4 py-3 font-medium">{t('tasks.colTeam')}</th>
                <th className="text-left px-4 py-3 font-medium">{t('tasks.colStatus')}</th>
                <th className="text-left px-4 py-3 font-medium">{t('tasks.colMode')}</th>
                <th className="text-left px-4 py-3 font-medium">{t('tasks.colCreatedAt')}</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {tasks.map(task => {
                const st = STATUS_KEYS[task.status ?? ''] || { key: task.status, variant: 'secondary' as const };
                return (
                  <tr
                    key={task.id}
                    data-testid={`task-item-${task.id}`}
                    className="border-t hover:bg-muted/30 cursor-pointer"
                    onClick={() => navigate(`/tasks/${task.id}`)}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium">{task.title || task.description?.slice(0, 50) || t('tasks.unnamed')}</div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{task.teamName}</td>
                    <td className="px-4 py-3">
                      <Badge variant={st.variant}>{t(st.key)}</Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{task.mode === 'auto' ? t('tasks.auto') : t('tasks.suggest')}</td>
                    <td className="px-4 py-3 text-muted-foreground">{new Date(task.createdAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={e => { e.stopPropagation(); setDeleteTarget(task); }}
                        disabled={task.status === 'executing'}
                      >
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
