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
import { useI18n } from '@/i18n';
import { Plus, ChevronUp, ChevronDown, ClipboardCheck, Trash2, Loader2, ChevronRight } from 'lucide-react';

const STAGES = ['simulation', 'shadow', 'limited_auto', 'full_auto'] as const;

const stageLabelKeys: Record<string, string> = {
  simulation: 'deployment.stageSimulation',
  shadow: 'deployment.stageShadow',
  limited_auto: 'deployment.stageLimitedAuto',
  full_auto: 'deployment.stageFullAuto',
};

const stageBadge: Record<string, { variant: 'secondary' | 'default' | 'warning' | 'success'; }> = {
  simulation: { variant: 'secondary' },
  shadow: { variant: 'default' },
  limited_auto: { variant: 'warning' },
  full_auto: { variant: 'success' },
};

function StageIndicator({ current }: { current: string }) {
  const { t } = useI18n();
  const stageLabel = (s: string) => t(stageLabelKeys[s] as any);
  const idx = STAGES.indexOf(current as typeof STAGES[number]);
  return (
    <div className="flex items-center gap-1" role="group" aria-label={`${t('deployment.currentStage')} ${stageLabel(current)}`}>
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
            title={stageLabel(s)}
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
  const { t } = useI18n();
  const stageLabel = (s: string) => t(stageLabelKeys[s] as any);

  const load = useCallback(async () => {
    try {
      const res = await deploymentApi.list();
      setStages(res.data);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : t('common.loadFailed'), 'error');
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
      toast(err instanceof Error ? err.message : t('common.loadFailed'), 'error');
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
          toast(t('deployment.promoted', { stage: stageLabel(lastEval.toStage) }), 'success');
        } else if (lastEval?.result === 'rejected') {
          toast(t('deployment.notPromoted') + ': ' + lastEval.reason, 'error');
        }
      } else {
        toast(action === 'promote' ? t('deployment.manualPromoted') : t('deployment.manualDemoted'), 'success');
      }
      if (expandedId === id) { setDetail(res.data); }
      load();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : t('common.operationFailed'), 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deploymentApi.delete(deleteTarget.id);
      toast(t('incidents.deleted'), 'success');
      setDeleteTarget(null);
      if (expandedId === deleteTarget.id) { setExpandedId(null); setDetail(null); }
      load();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : t('common.deleteFailed'), 'error');
    } finally {
      setDeleting(false);
    }
  };

  const handleCreate = async (employeeId: string, teamId?: string) => {
    try {
      await deploymentApi.create({ employeeId, teamId });
      toast(t('deployment.created'), 'success');
      setCreateOpen(false);
      load();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : t('common.operationFailed'), 'error');
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold">{t('deployment.title')}</h2>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> {t('deployment.create')}
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : stages.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">{t('deployment.empty')}</div>
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
                  <Badge variant={badge.variant}>{stageLabel(s.stage)}</Badge>
                  <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                    <Button
                      variant="ghost" size="sm"
                      onClick={() => handleAction(s.id, 'evaluate')}
                      disabled={actionLoading === `${s.id}-evaluate` || s.stage === 'full_auto'}
                      title={t('deployment.evaluate')}
                    >
                      {actionLoading === `${s.id}-evaluate` ? <Loader2 className="h-3 w-3 animate-spin" /> : <ClipboardCheck className="h-3 w-3" />}
                    </Button>
                    <Button
                      variant="ghost" size="sm"
                      onClick={() => handleAction(s.id, 'promote')}
                      disabled={actionLoading === `${s.id}-promote` || s.stage === 'full_auto'}
                      title={t('deployment.promote')}
                    >
                      {actionLoading === `${s.id}-promote` ? <Loader2 className="h-3 w-3 animate-spin" /> : <ChevronUp className="h-3 w-3" />}
                    </Button>
                    <Button
                      variant="ghost" size="sm"
                      onClick={() => handleAction(s.id, 'demote')}
                      disabled={actionLoading === `${s.id}-demote` || s.stage === 'simulation'}
                      title={t('deployment.demote')}
                    >
                      {actionLoading === `${s.id}-demote` ? <Loader2 className="h-3 w-3 animate-spin" /> : <ChevronDown className="h-3 w-3" />}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(s)} title={t('common.delete')}>
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                </div>

                {isExpanded && detail && (
                  <div className="border-t px-4 py-3 bg-muted/10">
                    <h4 className="text-sm font-medium mb-2">{t('deployment.evalHistory')}</h4>
                    {detail.evaluations.length === 0 ? (
                      <p className="text-xs text-muted-foreground">{t('deployment.noEvals')}</p>
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
        title={t('deployment.deleteStage')}
        description={`${deleteTarget?.employeeName}`}
        onConfirm={handleDelete}
        loading={deleting}
      />
    </div>
  );
}

function EvaluationRow({ evaluation: ev }: { evaluation: StageEvaluation }) {
  const { t, locale } = useI18n();
  const stageLabel = (s: string) => t(stageLabelKeys[s] as any);
  const resultBadge = ev.result === 'promoted'
    ? { variant: 'success' as const, label: t('deployment.evalPromoted') }
    : ev.result === 'rejected'
    ? { variant: 'destructive' as const, label: t('deployment.evalRejected') }
    : { variant: 'secondary' as const, label: t('deployment.evalPending') };

  const metrics = ev.metrics as { taskCount?: number; completedCount?: number; successRate?: number };

  return (
    <div className="flex items-start gap-3 text-xs border rounded-md p-2">
      <Badge variant={resultBadge.variant}>{resultBadge.label}</Badge>
      <div className="flex-1 min-w-0">
        <div className="text-muted-foreground">
          {stageLabel(ev.fromStage)} &rarr; {stageLabel(ev.toStage)}
        </div>
        {metrics.taskCount !== undefined && (
          <div className="text-muted-foreground mt-0.5">
            {t('deployment.evalTask', { total: metrics.taskCount ?? 0, success: metrics.completedCount ?? 0 })}{metrics.successRate !== undefined ? (metrics.successRate * 100).toFixed(1) + '%' : '-'}
          </div>
        )}
        {ev.reason && <div className="mt-0.5">{ev.reason}</div>}
      </div>
      <span className="text-muted-foreground whitespace-nowrap">{new Date(ev.createdAt).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US')}</span>
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
  const { t } = useI18n();

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
        <DialogTitle>{t('deployment.createDialog')}</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label>{t('deployment.selectEmployee')}</Label>
          <select
            className="w-full border rounded-md px-3 py-2 text-sm bg-background"
            value={employeeId}
            onChange={e => setEmployeeId(e.target.value)}
            required
          >
            <option value="">{t('deployment.selectEmployeePlaceholder')}</option>
            {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <Label>{t('deployment.selectTeam')}</Label>
          <select
            className="w-full border rounded-md px-3 py-2 text-sm bg-background"
            value={teamId}
            onChange={e => setTeamId(e.target.value)}
          >
            <option value="">{t('deployment.noTeam')}</option>
            {teams.map(tm => <option key={tm.id} value={tm.id}>{tm.name}</option>)}
          </select>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
          <Button type="submit" disabled={!employeeId}>{t('common.create')}</Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
