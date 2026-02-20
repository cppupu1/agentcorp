import { useState, useEffect, useCallback } from 'react';
import {
  deploymentApi, employeesApi, teamsApi,
  type DeploymentStage, type DeploymentStageDetail, type StageEvaluation,
  type Employee, type Team,
} from '@/api/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { Plus, ChevronUp, ChevronDown, ClipboardCheck, Trash2, Loader2, ChevronRight } from 'lucide-react';

const STAGES = ['simulation', 'shadow', 'limited_auto', 'full_auto'] as const;

const stageLabel: Record<string, string> = {
  simulation: '模拟',
  shadow: '影子',
  limited_auto: '限制自动',
  full_auto: '完全自动',
};

const stageBadge: Record<string, { variant: 'secondary' | 'default' | 'warning' | 'success'; }> = {
  simulation: { variant: 'secondary' },
  shadow: { variant: 'default' },
  limited_auto: { variant: 'warning' },
  full_auto: { variant: 'success' },
};

function StageIndicator({ current }: { current: string }) {
  const idx = STAGES.indexOf(current as typeof STAGES[number]);
  return (
    <div className="flex items-center gap-1" role="group" aria-label={`当前阶段: ${stageLabel[current]}`}>
      {STAGES.map((s, i) => (
        <div key={s} className="flex items-center gap-1">
          <div
            className={`w-3 h-3 rounded-full transition-colors ${
              i <= idx
                ? s === 'simulation' ? 'bg-gray-400'
                : s === 'shadow' ? 'bg-blue-500'
                : s === 'limited_auto' ? 'bg-yellow-500'
                : 'bg-green-500'
                : 'bg-muted'
            }`}
            title={stageLabel[s]}
          />
          {i < STAGES.length - 1 && (
            <div className={`w-4 h-0.5 ${i < idx ? 'bg-muted-foreground/40' : 'bg-muted'}`} />
          )}
        </div>
      ))}
    </div>
  );
}

export default function DeploymentPage() {
  const [stages, setStages] = useState<DeploymentStage[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DeploymentStage | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DeploymentStageDetail | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const { toast } = useToast();

  const load = useCallback(async () => {
    try {
      const res = await deploymentApi.list();
      setStages(res.data);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : '加载失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const handleExpand = async (id: string) => {
    if (expandedId === id) { setExpandedId(null); setDetail(null); return; }
    try {
      const res = await deploymentApi.get(id);
      setDetail(res.data);
      setExpandedId(id);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : '加载详情失败', 'error');
    }
  };

  const handleAction = async (id: string, action: 'evaluate' | 'promote' | 'demote') => {
    setActionLoading(`${id}-${action}`);
    try {
      const fn = action === 'evaluate' ? deploymentApi.evaluate
        : action === 'promote' ? deploymentApi.promote
        : deploymentApi.demote;
      const res = await fn(id);
      if (action === 'evaluate') {
        const lastEval = res.data.evaluations[0];
        if (lastEval?.result === 'promoted') {
          toast(`已晋升至 ${stageLabel[lastEval.toStage]}`, 'success');
        } else if (lastEval?.result === 'rejected') {
          toast(`未满足晋升条件: ${lastEval.reason}`, 'error');
        }
      } else {
        toast(action === 'promote' ? '已手动晋升' : '已手动降级', 'success');
      }
      if (expandedId === id) { setDetail(res.data); }
      load();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : '操作失败', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deploymentApi.delete(deleteTarget.id);
      toast('已删除', 'success');
      setDeleteTarget(null);
      if (expandedId === deleteTarget.id) { setExpandedId(null); setDetail(null); }
      load();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : '删除失败', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const handleCreate = async (employeeId: string, teamId?: string) => {
    try {
      await deploymentApi.create({ employeeId, teamId });
      toast('部署阶段已创建', 'success');
      setCreateOpen(false);
      load();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : '创建失败', 'error');
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold">上线管理</h2>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> 新建部署
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : stages.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">暂无部署阶段记录</div>
      ) : (
        <div className="space-y-3">
          {stages.map(s => {
            const badge = stageBadge[s.stage] || stageBadge.simulation;
            const isExpanded = expandedId === s.id;
            return (
              <div key={s.id} className="border rounded-lg overflow-hidden">
                <div
                  className="flex items-center gap-4 px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => handleExpand(s.id)}
                  role="button"
                  tabIndex={0}
                  aria-expanded={isExpanded}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') handleExpand(s.id); }}
                >
                  <ChevronRight className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{s.employeeName}</span>
                      {s.teamName && <span className="text-xs text-muted-foreground">({s.teamName})</span>}
                    </div>
                  </div>
                  <StageIndicator current={s.stage} />
                  <Badge variant={badge.variant}>{stageLabel[s.stage]}</Badge>
                  <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                    <Button
                      variant="ghost" size="sm"
                      onClick={() => handleAction(s.id, 'evaluate')}
                      disabled={actionLoading === `${s.id}-evaluate` || s.stage === 'full_auto'}
                      title="评估晋升"
                    >
                      {actionLoading === `${s.id}-evaluate` ? <Loader2 className="h-3 w-3 animate-spin" /> : <ClipboardCheck className="h-3 w-3" />}
                    </Button>
                    <Button
                      variant="ghost" size="sm"
                      onClick={() => handleAction(s.id, 'promote')}
                      disabled={actionLoading === `${s.id}-promote` || s.stage === 'full_auto'}
                      title="手动晋升"
                    >
                      {actionLoading === `${s.id}-promote` ? <Loader2 className="h-3 w-3 animate-spin" /> : <ChevronUp className="h-3 w-3" />}
                    </Button>
                    <Button
                      variant="ghost" size="sm"
                      onClick={() => handleAction(s.id, 'demote')}
                      disabled={actionLoading === `${s.id}-demote` || s.stage === 'simulation'}
                      title="手动降级"
                    >
                      {actionLoading === `${s.id}-demote` ? <Loader2 className="h-3 w-3 animate-spin" /> : <ChevronDown className="h-3 w-3" />}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(s)} title="删除">
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                </div>

                {isExpanded && detail && (
                  <div className="border-t px-4 py-3 bg-muted/10">
                    <h4 className="text-sm font-medium mb-2">评估历史</h4>
                    {detail.evaluations.length === 0 ? (
                      <p className="text-xs text-muted-foreground">暂无评估记录</p>
                    ) : (
                      <div className="space-y-2">
                        {detail.evaluations.map(ev => (
                          <EvaluationRow key={ev.id} evaluation={ev} />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <CreateDeploymentDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSave={handleCreate}
        employees={employees}
        teams={teams}
        onLoadData={async () => {
          const [empRes, teamRes] = await Promise.all([employeesApi.list(), teamsApi.list()]);
          setEmployees(empRes.data);
          setTeams(teamRes.data);
        }}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={() => setDeleteTarget(null)}
        title="删除部署阶段"
        description={`确定要删除「${deleteTarget?.employeeName}」的部署阶段记录吗？`}
        onConfirm={handleDelete}
        loading={deleting}
      />
    </div>
  );
}

function EvaluationRow({ evaluation: ev }: { evaluation: StageEvaluation }) {
  const resultBadge = ev.result === 'promoted'
    ? { variant: 'success' as const, label: '通过' }
    : ev.result === 'rejected'
    ? { variant: 'destructive' as const, label: '未通过' }
    : { variant: 'secondary' as const, label: '待定' };

  const metrics = ev.metrics as { taskCount?: number; completedCount?: number; successRate?: number };

  return (
    <div className="flex items-start gap-3 text-xs border rounded-md p-2">
      <Badge variant={resultBadge.variant}>{resultBadge.label}</Badge>
      <div className="flex-1 min-w-0">
        <div className="text-muted-foreground">
          {stageLabel[ev.fromStage]} → {stageLabel[ev.toStage]}
        </div>
        {metrics.taskCount !== undefined && (
          <div className="text-muted-foreground mt-0.5">
            任务: {metrics.completedCount ?? 0}/{metrics.taskCount ?? 0}, 成功率: {metrics.successRate !== undefined ? (metrics.successRate * 100).toFixed(1) + '%' : '-'}
          </div>
        )}
        {ev.reason && <div className="mt-0.5">{ev.reason}</div>}
      </div>
      <span className="text-muted-foreground whitespace-nowrap">{new Date(ev.createdAt).toLocaleString()}</span>
    </div>
  );
}

function CreateDeploymentDialog({
  open, onOpenChange, onSave, employees, teams, onLoadData,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSave: (employeeId: string, teamId?: string) => void;
  employees: Employee[];
  teams: Team[];
  onLoadData: () => Promise<void>;
}) {
  const [employeeId, setEmployeeId] = useState('');
  const [teamId, setTeamId] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (open && !loaded) {
      onLoadData().then(() => setLoaded(true));
    }
    if (open) { setEmployeeId(''); setTeamId(''); }
  }, [open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(employeeId, teamId || undefined);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>新建部署阶段</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label>员工</Label>
          <select
            className="w-full border rounded-md px-3 py-2 text-sm bg-background"
            value={employeeId}
            onChange={e => setEmployeeId(e.target.value)}
            required
          >
            <option value="">请选择员工</option>
            {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <Label>团队 (可选)</Label>
          <select
            className="w-full border rounded-md px-3 py-2 text-sm bg-background"
            value={teamId}
            onChange={e => setTeamId(e.target.value)}
          >
            <option value="">不关联团队</option>
            {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button type="submit" disabled={!employeeId}>创建</Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
