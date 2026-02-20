import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { tasksApi, teamsApi, type TaskSummary, type Team } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { Plus, Trash2, Loader2 } from 'lucide-react';

const STATUS_LABELS: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  draft: { label: '草稿', variant: 'secondary' },
  aligning: { label: '对齐中', variant: 'default' },
  brief_review: { label: '任务书审批', variant: 'outline' },
  team_review: { label: '团队审批', variant: 'outline' },
  plan_review: { label: '计划审批', variant: 'outline' },
  executing: { label: '执行中', variant: 'default' },
  completed: { label: '已完成', variant: 'secondary' },
  failed: { label: '失败', variant: 'destructive' },
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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: { teamId?: string; status?: string } = {};
      if (filterTeam) params.teamId = filterTeam;
      if (filterStatus) params.status = filterStatus;
      const res = await tasksApi.list(params);
      setTasks(res.data);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : '加载失败', 'error');
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
      toast('任务已删除', 'success');
      setDeleteTarget(null);
      load();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : '删除失败', 'error');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold">任务管理</h2>
        <Button onClick={() => navigate('/tasks/new')} data-testid="create-task-btn">
          <Plus className="h-4 w-4" /> 创建任务
        </Button>
      </div>

      <div className="flex gap-3 mb-4">
        <select
          className="border rounded-md px-3 py-2 text-sm bg-background"
          value={filterTeam}
          onChange={e => setFilterTeam(e.target.value)}
        >
          <option value="">全部团队</option>
          {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select
          className="border rounded-md px-3 py-2 text-sm bg-background"
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
        >
          <option value="">全部状态</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">暂无任务</div>
      ) : (
        <div className="border rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-3 font-medium">标题</th>
                <th className="text-left px-4 py-3 font-medium">团队</th>
                <th className="text-left px-4 py-3 font-medium">状态</th>
                <th className="text-left px-4 py-3 font-medium">模式</th>
                <th className="text-left px-4 py-3 font-medium">创建时间</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {tasks.map(task => {
                const st = STATUS_LABELS[task.status ?? ''] || { label: task.status, variant: 'secondary' as const };
                return (
                  <tr
                    key={task.id}
                    data-testid={`task-item-${task.id}`}
                    className="border-t hover:bg-muted/30 cursor-pointer"
                    onClick={() => navigate(`/tasks/${task.id}`)}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium">{task.title || task.description?.slice(0, 50) || '未命名任务'}</div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{task.teamName}</td>
                    <td className="px-4 py-3">
                      <Badge variant={st.variant}>{st.label}</Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{task.mode === 'auto' ? '自动' : '建议'}</td>
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
        title="删除任务"
        description={`确定要删除任务「${deleteTarget?.title || '未命名'}」吗？`}
        onConfirm={handleDelete}
        loading={deleting}
      />
    </div>
  );
}
