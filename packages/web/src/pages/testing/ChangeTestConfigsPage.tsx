import { useState, useEffect, useCallback } from 'react';
import {
  changeTestingApi, testingApi,
  type ChangeTestConfig, type ChangeTestConfigInput,
  type ChangeTestConfigDetail, type TestScenario,
} from '@/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { useI18n } from '@/i18n';
import { EmptyState } from '@/components/ui/empty-state';
import { Plus, Pencil, Trash2, ChevronDown, ChevronRight, Loader2, FlaskConical } from 'lucide-react';

const watchTargetKeys: Record<string, string> = {
  employee: 'changeTest.watchEmployee',
  tool: 'changeTest.watchTool',
  policy: 'changeTest.watchPolicy',
};

function parseScenarioIds(raw: string): string[] {
  try { return JSON.parse(raw); } catch { return []; }
}

export default function ChangeTestConfigsPage() {
  const [configs, setConfigs] = useState<ChangeTestConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ChangeTestConfig | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ChangeTestConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedDetail, setExpandedDetail] = useState<ChangeTestConfigDetail | null>(null);
  const [scenarios, setScenarios] = useState<TestScenario[]>([]);
  const { toast } = useToast();
  const { t } = useI18n();

  const load = useCallback(async () => {
    try {
      const [configRes, scenarioRes] = await Promise.all([
        changeTestingApi.list(),
        testingApi.listScenarios(),
      ]);
      setConfigs(configRes.data);
      setScenarios(scenarioRes.data);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : t('common.loadFailed'), 'error');
    } finally {
      setLoading(false);
    }
  }, [toast, t]);

  useEffect(() => { load(); }, [load]);

  const handleToggleEnabled = async (config: ChangeTestConfig) => {
    try {
      await changeTestingApi.update(config.id, { enabled: !config.enabled });
      toast(config.enabled ? t('changeTest.disabled') : t('changeTest.enabled'), 'success');
      load();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : t('common.operationFailed'), 'error');
    }
  };

  const handleExpand = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      setExpandedDetail(null);
      return;
    }
    try {
      const res = await changeTestingApi.get(id);
      setExpandedDetail(res.data);
      setExpandedId(id);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : t('common.loadFailed'), 'error');
    }
  };

  const handleSave = async (input: ChangeTestConfigInput) => {
    setSaving(true);
    try {
      if (editing) {
        await changeTestingApi.update(editing.id, input);
        toast(t('changeTest.updated'), 'success');
      } else {
        await changeTestingApi.create(input);
        toast(t('changeTest.created'), 'success');
      }
      setFormOpen(false);
      setEditing(null);
      load();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : t('common.saveFailed'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await changeTestingApi.delete(deleteTarget.id);
      toast(t('changeTest.deleted'), 'success');
      setDeleteTarget(null);
      load();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : t('common.deleteFailed'), 'error');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold tracking-tight">{t('changeTest.title')}</h2>
        <Button onClick={() => { setEditing(null); setFormOpen(true); }}>
          <Plus className="h-4 w-4" /> {t('changeTest.create')}
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : configs.length === 0 ? (
        <EmptyState icon={<FlaskConical className="h-10 w-10" />} title={t('changeTest.empty')} description={t('changeTest.emptyDesc')} action={<Button onClick={() => { setEditing(null); setFormOpen(true); }}><Plus className="h-4 w-4" /> {t('changeTest.create')}</Button>} />
      ) : (
        <div className="space-y-2">
          {configs.map(c => {
            const sIds = parseScenarioIds(c.scenarioIds);
            const isExpanded = expandedId === c.id;
            return (
              <ConfigCard
                key={c.id}
                config={c}
                scenarioCount={sIds.length}
                isExpanded={isExpanded}
                detail={isExpanded ? expandedDetail : null}
                scenarios={scenarios}
                onExpand={() => handleExpand(c.id)}
                onToggle={() => handleToggleEnabled(c)}
                onEdit={() => { setEditing(c); setFormOpen(true); }}
                onDelete={() => setDeleteTarget(c)}
              />
            );
          })}
        </div>
      )}

      <ConfigFormDialog
        open={formOpen}
        onOpenChange={(v) => { setFormOpen(v); if (!v) setEditing(null); }}
        editing={editing}
        scenarios={scenarios}
        onSave={handleSave}
        saving={saving}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={() => setDeleteTarget(null)}
        title={t('changeTest.deleteConfig')}
        description={t('changeTest.deleteConfirm').replace('{name}', deleteTarget?.name || '')}
        onConfirm={handleDelete}
        loading={deleting}
      />
    </div>
  );
}

function ConfigCard({
  config, scenarioCount, isExpanded, detail, scenarios,
  onExpand, onToggle, onEdit, onDelete,
}: {
  config: ChangeTestConfig;
  scenarioCount: number;
  isExpanded: boolean;
  detail: ChangeTestConfigDetail | null;
  scenarios: TestScenario[];
  onExpand: () => void;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t, locale } = useI18n();
  return (
    <div className="bg-card border border-border/50 rounded-xl shadow-sm overflow-hidden">
      <div className="p-4 flex items-center gap-4 cursor-pointer hover:bg-muted/30 transition-colors" onClick={onExpand}>
        {isExpanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm">{config.name}</div>
          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
            <Badge variant="secondary">{watchTargetKeys[config.watchTarget] ? t(watchTargetKeys[config.watchTarget]) : config.watchTarget}</Badge>
            <span className="font-mono">{config.watchId || t('common.all')}</span>
            <span>{scenarioCount} scenarios</span>
            <span>{config.lastTriggeredAt ? new Date(config.lastTriggeredAt).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US') : '-'}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0" onClick={e => e.stopPropagation()}>
          <button
            onClick={onToggle}
            className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
              config.enabled ? 'bg-success/15 text-success hover:bg-success/25' : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            {config.enabled ? t('changeTest.enabled') : t('changeTest.disabled')}
          </button>
          <Button variant="ghost" size="sm" onClick={onEdit}><Pencil className="h-3 w-3" /></Button>
          <Button variant="ghost" size="sm" onClick={onDelete}><Trash2 className="h-3 w-3 text-destructive" /></Button>
        </div>
      </div>
      {isExpanded && detail && (
        <div className="border-t border-border/50 px-8 py-4 bg-muted/10">
          <p className="text-sm font-medium mb-2">{t('changeTest.runs')}</p>
          {detail.runs.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t('changeTest.noRuns')}</p>
          ) : (
            <div className="space-y-1">
              {detail.runs.map(run => (
                <div key={run.id} className="flex items-center gap-4 text-xs py-1">
                  <span className="text-muted-foreground">{new Date(run.createdAt).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US')}</span>
                  <Badge variant="secondary">{run.changeType}</Badge>
                  <span className="font-mono text-muted-foreground">{run.testRunId || '-'}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ConfigFormDialog({
  open, onOpenChange, editing, scenarios, onSave, saving,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: ChangeTestConfig | null;
  scenarios: TestScenario[];
  onSave: (input: ChangeTestConfigInput) => void;
  saving: boolean;
}) {
  const [name, setName] = useState('');
  const [watchTarget, setWatchTarget] = useState('employee');
  const [watchId, setWatchId] = useState('');
  const [selectedScenarioIds, setSelectedScenarioIds] = useState<string[]>([]);
  const [enabled, setEnabled] = useState(true);
  const { t } = useI18n();

  useEffect(() => {
    if (open) {
      setName(editing?.name ?? '');
      setWatchTarget(editing?.watchTarget ?? 'employee');
      setWatchId(editing?.watchId ?? '');
      setSelectedScenarioIds(editing ? parseScenarioIds(editing.scenarioIds) : []);
      setEnabled(editing ? !!editing.enabled : true);
    }
  }, [open, editing]);

  const toggleScenario = (id: string) => {
    setSelectedScenarioIds(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      name,
      watchTarget,
      watchId: watchId || null,
      scenarioIds: selectedScenarioIds,
      enabled,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>{editing ? t('changeTest.editConfig') : t('changeTest.createConfig')}</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label>{t('changeTest.configName')}</Label>
          <Input value={name} onChange={e => setName(e.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label>{t('changeTest.watchTarget')}</Label>
          <select
            className="w-full border rounded-md px-3 py-2 text-sm bg-background"
            value={watchTarget}
            onChange={e => setWatchTarget(e.target.value)}
          >
            <option value="employee">{t('changeTest.watchEmployee')}</option>
            <option value="tool">{t('changeTest.watchTool')}</option>
            <option value="policy">{t('changeTest.watchPolicy')}</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label>{t('changeTest.watchId')}</Label>
          <Input value={watchId} onChange={e => setWatchId(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>{t('changeTest.selectScenarios')}</Label>
          {scenarios.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t('testing.noScenariosHint')}</p>
          ) : (
            <div className="border rounded-md max-h-48 overflow-y-auto p-2 space-y-1">
              {scenarios.map(s => (
                <label key={s.id} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-muted/50 cursor-pointer text-sm">
                  <input
                    type="checkbox"
                    checked={selectedScenarioIds.includes(s.id)}
                    onChange={() => toggleScenario(s.id)}
                    className="rounded"
                  />
                  <span>{s.name}</span>
                  {s.category && <Badge variant="secondary" className="text-xs">{s.category}</Badge>}
                </label>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Label>{t('changeTest.enabled')}</Label>
          <button
            type="button"
            onClick={() => setEnabled(!enabled)}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
              enabled ? 'bg-primary' : 'bg-muted-foreground/30'
            }`}
            role="switch"
            aria-checked={enabled}
          >
            <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
              enabled ? 'translate-x-4.5' : 'translate-x-0.5'
            }`} />
          </button>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
          <Button type="submit" disabled={saving || selectedScenarioIds.length === 0}>
            {saving ? t('common.saving') : t('common.save')}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
