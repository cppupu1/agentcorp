import { useState, useEffect, useCallback } from 'react';
import {
  testingApi, employeesApi,
  type TestScenario, type TestRun, type TestRunDetail, type Employee,
} from '@/api/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { useI18n } from '@/i18n';
import { Loader2, Plus, Trash2, Play, ChevronDown, ChevronRight } from 'lucide-react';

const categoryKeys: Record<string, { key: string; variant: 'default' | 'secondary' | 'warning' | 'destructive' }> = {
  safety: { key: 'testing.catSafety', variant: 'destructive' },
  quality: { key: 'testing.catQuality', variant: 'default' },
  performance: { key: 'testing.catPerformance', variant: 'warning' },
  compliance: { key: 'testing.catCompliance', variant: 'secondary' },
};

const statusKeys: Record<string, { key: string; variant: 'secondary' | 'warning' | 'success' | 'destructive' }> = {
  pending: { key: 'testing.statusPending', variant: 'secondary' },
  running: { key: 'testing.statusRunning', variant: 'warning' },
  completed: { key: 'testing.statusCompleted', variant: 'success' },
  failed: { key: 'testing.statusFailed', variant: 'destructive' },
};

const resultKeys: Record<string, { key: string; variant: 'success' | 'destructive' | 'warning' }> = {
  passed: { key: 'testing.resultPassed', variant: 'success' },
  failed: { key: 'testing.resultFailed', variant: 'destructive' },
  error: { key: 'testing.resultError', variant: 'warning' },
};

export default function TestingPage() {
  const [tab, setTab] = useState<'scenarios' | 'runs'>('scenarios');
  const { t } = useI18n();

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold">{t('testing.title')}</h2>
      </div>
      <div className="flex gap-2 mb-4 border-b">
        <button
          onClick={() => setTab('scenarios')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === 'scenarios' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          {t('testing.tabScenarios')}
        </button>
        <button
          onClick={() => setTab('runs')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === 'runs' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          {t('testing.tabRuns')}
        </button>
      </div>
      {tab === 'scenarios' ? <ScenariosTab /> : <RunsTab />}
    </div>
  );
}

// ============ Scenarios Tab ============

function ScenariosTab() {
  const [items, setItems] = useState<TestScenario[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<TestScenario | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TestScenario | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [runOpen, setRunOpen] = useState(false);
  const { toast } = useToast();
  const { t } = useI18n();

  const load = useCallback(async () => {
    try {
      const res = await testingApi.listScenarios();
      setItems(res.data);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : t('common.loadFailed'), 'error');
    } finally {
      setLoading(false);
    }
  }, [toast, t]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await testingApi.deleteScenario(deleteTarget.id);
      toast(t('common.delete'), 'success');
      setDeleteTarget(null);
      load();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : t('common.deleteFailed'), 'error');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <div className="flex gap-2 mb-4">
        <Button size="sm" onClick={() => { setEditTarget(null); setEditOpen(true); }} className="gap-1">
          <Plus className="h-4 w-4" /> {t('testing.newScenario')}
        </Button>
        <Button size="sm" variant="outline" onClick={() => setRunOpen(true)} className="gap-1">
          <Play className="h-4 w-4" /> {t('testing.runTest')}
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">{t('testing.noScenarios')}</div>
      ) : (
        <div className="space-y-2">
          {items.map(item => {
            const cat = categoryKeys[item.category || ''];
            const catLabel = cat ? t(cat.key) : (item.category || t('testing.uncategorized'));
            const catVariant = cat?.variant || 'secondary' as const;
            return (
              <div
                key={item.id}
                className="border rounded-lg p-4 flex items-center gap-3 hover:bg-muted/50 transition-colors cursor-pointer"
                onClick={() => { setEditTarget(item); setEditOpen(true); }}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant={catVariant}>{catLabel}</Badge>
                    <span className="font-medium text-sm truncate">{item.name}</span>
                  </div>
                  {item.description && (
                    <p className="text-xs text-muted-foreground truncate">{item.description}</p>
                  )}
                  <div className="flex gap-1 mt-1">
                    {(item.tags || []).map(tag => (
                      <Badge key={tag} variant="outline" className="text-[10px]">{tag}</Badge>
                    ))}
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); setDeleteTarget(item); }} title={t('common.delete')}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      <ScenarioDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        scenario={editTarget}
        onSaved={() => { setEditOpen(false); load(); }}
      />

      <RunTestDialog
        open={runOpen}
        onOpenChange={setRunOpen}
        scenarios={items}
        onStarted={() => { setRunOpen(false); }}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={() => setDeleteTarget(null)}
        title={t('testing.deleteScenario')}
        description={t('testing.deleteConfirm').replace('{name}', deleteTarget?.name || '')}
        onConfirm={handleDelete}
        loading={deleting}
      />
    </>
  );
}

// ============ Scenario Create/Edit Dialog ============

function ScenarioDialog({
  open, onOpenChange, scenario, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  scenario: TestScenario | null;
  onSaved: () => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [input, setInput] = useState('');
  const [expectedBehavior, setExpectedBehavior] = useState('');
  const [tags, setTags] = useState('');
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const { t } = useI18n();

  useEffect(() => {
    if (open) {
      if (scenario) {
        setName(scenario.name);
        setDescription(scenario.description || '');
        setCategory(scenario.category || '');
        setInput(typeof scenario.input === 'string' ? scenario.input : JSON.stringify(scenario.input, null, 2));
        setExpectedBehavior(scenario.expectedBehavior);
        setTags((scenario.tags || []).join(', '));
      } else {
        setName(''); setDescription(''); setCategory('');
        setInput(''); setExpectedBehavior(''); setTags('');
      }
    }
  }, [open, scenario]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !input.trim() || !expectedBehavior.trim()) return;
    setSaving(true);
    try {
      const body = {
        name: name.trim(),
        description: description.trim() || undefined,
        category: category || undefined,
        input: input.trim(),
        expectedBehavior: expectedBehavior.trim(),
        tags: tags.trim() ? tags.split(',').map(s => s.trim()).filter(Boolean) : undefined,
      };
      if (scenario) {
        await testingApi.updateScenario(scenario.id, body);
        toast(t('testing.updated'), 'success');
      } else {
        await testingApi.createScenario(body);
        toast(t('testing.created'), 'success');
      }
      onSaved();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : t('common.saveFailed'), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>{scenario ? t('testing.editScenario') : t('testing.createScenario')}</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="space-y-1">
          <Label>{t('testing.scenarioName')}</Label>
          <Input value={name} onChange={e => setName(e.target.value)} required />
        </div>
        <div className="space-y-1">
          <Label>{t('testing.category')}</Label>
          <Select value={category} onChange={e => setCategory(e.target.value)}>
            <option value="">{t('testing.uncategorized')}</option>
            <option value="safety">{t('testing.catSafety')}</option>
            <option value="quality">{t('testing.catQuality')}</option>
            <option value="performance">{t('testing.catPerformance')}</option>
            <option value="compliance">{t('testing.catCompliance')}</option>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>{t('testing.description')}</Label>
          <Input value={description} onChange={e => setDescription(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>{t('testing.testInput')}</Label>
          <Textarea value={input} onChange={e => setInput(e.target.value)} rows={3} required />
        </div>
        <div className="space-y-1">
          <Label>{t('testing.expectedBehavior')}</Label>
          <Textarea value={expectedBehavior} onChange={e => setExpectedBehavior(e.target.value)} rows={2} required />
        </div>
        <div className="space-y-1">
          <Label>{t('testing.tagsComma')}</Label>
          <Input value={tags} onChange={e => setTags(e.target.value)} placeholder="tag1, tag2" />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
          <Button type="submit" disabled={saving}>{saving ? t('common.saving') : t('common.save')}</Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}

// ============ Run Test Dialog ============

function RunTestDialog({
  open, onOpenChange, scenarios, onStarted,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  scenarios: TestScenario[];
  onStarted: () => void;
}) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeId, setEmployeeId] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [running, setRunning] = useState(false);
  const { toast } = useToast();
  const { t } = useI18n();

  useEffect(() => {
    if (open) {
      setEmployeeId('');
      setSelectedIds(new Set());
      employeesApi.list().then(res => setEmployees(res.data)).catch(() => {});
    }
  }, [open]);

  const toggleScenario = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === scenarios.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(scenarios.map(s => s.id)));
    }
  };

  const handleRun = async () => {
    if (!employeeId || selectedIds.size === 0) return;
    setRunning(true);
    try {
      await testingApi.startRun({ employeeId, scenarioIds: Array.from(selectedIds) });
      toast(t('testing.started'), 'success');
      onStarted();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : t('testing.startFailed'), 'error');
    } finally {
      setRunning(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>{t('testing.runDialog')}</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div className="space-y-1">
          <Label>{t('testing.selectEmployee')}</Label>
          <Select value={employeeId} onChange={e => setEmployeeId(e.target.value)}>
            <option value="">...</option>
            {employees.map(emp => (
              <option key={emp.id} value={emp.id}>{emp.name}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <Label>{t('testing.selectScenarios')}</Label>
            <button type="button" onClick={selectAll} className="text-xs text-primary hover:underline">
              {selectedIds.size === scenarios.length ? t('testing.deselectAll') : t('testing.selectAll')}
            </button>
          </div>
          <div className="max-h-48 overflow-auto border rounded-md p-2 space-y-1">
            {scenarios.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t('testing.noScenariosHint')}</p>
            ) : scenarios.map(s => {
              const cat = categoryKeys[s.category || ''];
              return (
                <label key={s.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(s.id)}
                    onChange={() => toggleScenario(s.id)}
                    className="rounded"
                  />
                  <span className="truncate">{s.name}</span>
                  {s.category && (
                    <Badge variant={cat?.variant || 'secondary'} className="text-[10px] ml-auto shrink-0">
                      {cat ? t(cat.key) : s.category}
                    </Badge>
                  )}
                </label>
              );
            })}
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
        <Button onClick={handleRun} disabled={running || !employeeId || selectedIds.size === 0}>
          {running ? t('testing.running') : t('testing.runCount').replace('{count}', String(selectedIds.size))}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

// ============ Runs Tab ============

function RunsTab() {
  const [items, setItems] = useState<TestRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TestRunDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const { toast } = useToast();
  const { t, locale } = useI18n();

  const load = useCallback(async () => {
    try {
      const res = await testingApi.listRuns();
      setItems(res.data);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : t('common.loadFailed'), 'error');
    } finally {
      setLoading(false);
    }
  }, [toast, t]);

  useEffect(() => { load(); }, [load]);

  const toggleExpand = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      setDetail(null);
      return;
    }
    setExpandedId(id);
    setDetailLoading(true);
    try {
      const res = await testingApi.getRun(id);
      setDetail(res.data);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : t('testing.loadDetailFailed'), 'error');
    } finally {
      setDetailLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (items.length === 0) {
    return <div className="text-center py-12 text-muted-foreground">{t('testing.noRuns')}</div>;
  }

  return (
    <div className="space-y-2">
      {items.map(run => {
        const st = statusKeys[run.status || 'pending'];
        const stLabel = st ? t(st.key) : run.status;
        const stVariant = st?.variant || 'secondary' as const;
        const isExpanded = expandedId === run.id;
        return (
          <div key={run.id} className="border rounded-lg overflow-hidden">
            <div
              className="p-4 flex items-center gap-3 cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => toggleExpand(run.id)}
            >
              {isExpanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant={stVariant}>{stLabel}</Badge>
                  <span className="font-medium text-sm">{run.employeeName || t('testing.unknownEmployee')}</span>
                  <span className="text-xs text-muted-foreground ml-auto">
                    {new Date(run.createdAt).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US')}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>{t('testing.totalScenarios').replace('{count}', String(run.totalScenarios ?? 0))}</span>
                  <span className="text-green-600">{t('testing.passed').replace('{count}', String(run.passedScenarios ?? 0))}</span>
                  <span className="text-red-600">{t('testing.failed').replace('{count}', String(run.failedScenarios ?? 0))}</span>
                  {run.summary && <span className="truncate">- {run.summary}</span>}
                </div>
              </div>
            </div>
            {isExpanded && (
              <div className="border-t px-4 py-3 bg-muted/30">
                {detailLoading ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                ) : detail && detail.results.length > 0 ? (
                  <div className="space-y-2">
                    {detail.results.map(r => {
                      const rl = resultKeys[r.status];
                      const rlLabel = rl ? t(rl.key) : r.status;
                      const rlVariant = rl?.variant || 'secondary' as const;
                      const evalData = r.evaluation as Record<string, unknown> | null;
                      return (
                        <div key={r.id} className="border rounded p-3 bg-background">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant={rlVariant}>{rlLabel}</Badge>
                            <span className="text-sm font-medium">{r.scenarioName || r.scenarioId}</span>
                            {r.score !== null && (
                              <span className={`text-xs font-mono ml-auto ${r.score >= 60 ? 'text-green-600' : 'text-red-600'}`}>
                                {t('testing.score').replace('{score}', String(r.score))}
                              </span>
                            )}
                            {r.durationMs !== null && (
                              <span className="text-xs text-muted-foreground">{r.durationMs}ms</span>
                            )}
                          </div>
                          {evalData && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {(evalData.summary as string) || (evalData.details as string) || (evalData.error as string) || ''}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-2">{t('testing.noResults')}</p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
