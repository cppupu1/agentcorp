import { useState, useEffect, useCallback } from 'react';
import {
  policiesApi,
  type PolicyPackage,
  type PolicyPackageDetail,
  type PolicyVersion,
} from '@/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { useI18n } from '@/i18n';
import { Plus, Trash2, Loader2, ChevronDown, ChevronRight, Pencil, RotateCcw, ShieldCheck } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';

export default function PoliciesPage() {
  const [packages, setPackages] = useState<PolicyPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PolicyPackageDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PolicyPackage | null>(null);
  const [versionFormOpen, setVersionFormOpen] = useState(false);
  const [versionTarget, setVersionTarget] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PolicyPackage | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { toast } = useToast();
  const { t } = useI18n();

  const load = useCallback(async () => {
    try {
      const res = await policiesApi.list();
      setPackages(res.data);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : t('common.loadFailed'), 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

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
      const res = await policiesApi.get(id);
      setDetail(res.data);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : t('common.loadFailed'), 'error');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleSavePackage = async (input: { name: string; description?: string; scenario?: string; rules?: unknown[] }) => {
    setSaving(true);
    try {
      if (editing) {
        await policiesApi.update(editing.id, input);
        toast(t('policies.updated'), 'success');
      } else {
        await policiesApi.create({ ...input, rules: input.rules || [] });
        toast(t('policies.created'), 'success');
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
      await policiesApi.delete(deleteTarget.id);
      toast(t('policies.deleted'), 'success');
      setDeleteTarget(null);
      if (expandedId === deleteTarget.id) {
        setExpandedId(null);
        setDetail(null);
      }
      load();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : t('common.deleteFailed'), 'error');
    } finally {
      setDeleting(false);
    }
  };

  const handleActivate = async (packageId: string, versionId: string) => {
    try {
      const res = await policiesApi.activateVersion(packageId, versionId);
      setDetail(res.data);
      toast(t('policies.versionActivated'), 'success');
      load();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : t('common.operationFailed'), 'error');
    }
  };

  const handleSaveVersion = async (rules: unknown[], changelog: string) => {
    if (!versionTarget) return;
    setSaving(true);
    try {
      const res = await policiesApi.createVersion(versionTarget, { rules, changelog });
      setDetail(res.data);
      setVersionFormOpen(false);
      setVersionTarget(null);
      toast(t('policies.versionCreated'), 'success');
      load();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : t('common.operationFailed'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const severityColor: Record<string, string> = {
    critical: 'destructive',
    high: 'destructive',
    medium: 'secondary',
    low: 'secondary',
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8 pb-4 border-b border-border/40">
        <h2 className="text-3xl font-heading font-medium tracking-tight text-foreground/90">{t('policies.title')}</h2>
        <Button onClick={() => { setEditing(null); setFormOpen(true); }}>
          <Plus className="h-4 w-4" /> {t('policies.create')}
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-16 rounded-2xl" />)}</div>
      ) : packages.length === 0 ? (
        <EmptyState icon={<ShieldCheck className="h-10 w-10" />} title={t('policies.empty')} description={t('policies.emptyDesc')} action={<Button onClick={() => { setEditing(null); setFormOpen(true); }}><Plus className="h-4 w-4" /> {t('policies.create')}</Button>} />
      ) : (
        <div className="space-y-3">
          {packages.map(pkg => (
            <div key={pkg.id} className="bg-card rounded-3xl border border-border/40 shadow-[var(--shadow-sm)] md-transition">
              <button
                className="flex items-center gap-3 w-full px-4 py-3 text-left hover:bg-muted/50"
                onClick={() => toggleExpand(pkg.id)}
              >
                {expandedId === pkg.id ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{pkg.name}</span>
                    {pkg.isBuiltin ? <Badge variant="secondary">{t('policies.builtin')}</Badge> : null}
                    {pkg.scenario && <Badge variant="secondary">{pkg.scenario}</Badge>}
                  </div>
                  {pkg.description && <p className="text-xs text-muted-foreground mt-0.5 truncate">{pkg.description}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="secondary">{t('policies.versionCount', { count: pkg.versionCount })}</Badge>
                  {pkg.activeVersion && <Badge variant="default">v{pkg.activeVersion}</Badge>}
                </div>
              </button>

              {expandedId === pkg.id && (
                <div className="px-4 pb-4 border-t">
                  <div className="flex gap-2 py-3">
                    {!pkg.isBuiltin && (
                      <>
                        <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); setEditing(pkg); setFormOpen(true); }}>
                          <Pencil className="h-3 w-3" /> {t('common.edit')}
                        </Button>
                        <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); setDeleteTarget(pkg); }}>
                          <Trash2 className="h-3 w-3 text-destructive" /> {t('common.delete')}
                        </Button>
                      </>
                    )}
                    <Button variant="outline" size="sm" onClick={() => { setVersionTarget(pkg.id); setVersionFormOpen(true); }}>
                      <Plus className="h-3 w-3" /> {t('policies.newVersion')}
                    </Button>
                  </div>

                  {detailLoading ? (
                    <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                  ) : detail?.versions.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-2">{t('policies.noVersions')}</p>
                  ) : (
                    <div className="space-y-2">
                      {detail?.versions.map(ver => (
                        <div key={ver.id} className={`border rounded-md p-3 ${ver.isActive ? 'border-primary bg-primary/5' : ''}`}>
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">v{ver.version}</span>
                              {ver.isActive ? <Badge variant="default">{t('policies.activeVersion')}</Badge> : null}
                              {ver.changelog && <span className="text-xs text-muted-foreground">{ver.changelog}</span>}
                            </div>
                            <div className="flex gap-1">
                              {!ver.isActive && (
                                <Button variant="ghost" size="sm" onClick={() => handleActivate(pkg.id, ver.id)} title={t('policies.activate')}>
                                  <RotateCcw className="h-3 w-3" /> {t('policies.activate')}
                                </Button>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {(ver.rules as Array<{ type?: string; rule?: string; severity?: string }>).map((rule, i) => (
                              <Badge key={i} variant={(severityColor[rule.severity || ''] as 'destructive' | 'secondary') || 'secondary'}>
                                [{rule.type}] {rule.rule} ({rule.severity})
                              </Badge>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <PackageFormDialog
        open={formOpen}
        onOpenChange={(v) => { setFormOpen(v); if (!v) setEditing(null); }}
        editing={editing}
        onSave={handleSavePackage}
        saving={saving}
      />

      <VersionFormDialog
        open={versionFormOpen}
        onOpenChange={(v) => { setVersionFormOpen(v); if (!v) setVersionTarget(null); }}
        onSave={handleSaveVersion}
        saving={saving}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={() => setDeleteTarget(null)}
        title={t('policies.deletePolicy')}
        description={`${deleteTarget?.name}`}
        onConfirm={handleDelete}
        loading={deleting}
      />
    </div>
  );
}

function PackageFormDialog({
  open, onOpenChange, editing, onSave, saving,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: PolicyPackage | null;
  onSave: (input: { name: string; description?: string; scenario?: string; rules?: unknown[] }) => void;
  saving: boolean;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [scenario, setScenario] = useState('');
  const [rulesText, setRulesText] = useState('[]');
  const [rulesError, setRulesError] = useState<string | null>(null);
  const { t } = useI18n();

  useEffect(() => {
    if (open) {
      setName(editing?.name ?? '');
      setDescription(editing?.description ?? '');
      setScenario(editing?.scenario ?? '');
      setRulesText('[]');
      setRulesError(null);
    }
  }, [open, editing]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editing) {
      onSave({ name, description: description || undefined, scenario: scenario || undefined });
    } else {
      let rules: unknown[];
      try {
        rules = JSON.parse(rulesText);
        if (!Array.isArray(rules)) throw new Error();
      } catch {
        setRulesError(t('policies.rulesHint'));
        return;
      }
      setRulesError(null);
      onSave({ name, description: description || undefined, scenario: scenario || undefined, rules });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>{editing ? t('policies.editPolicy') : t('policies.createPolicy')}</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label>{t('policies.name')}</Label>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder={t('policies.name')} required />
        </div>
        <div className="space-y-2">
          <Label>{t('policies.desc')}</Label>
          <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder={t('policies.desc')} rows={2} />
        </div>
        <div className="space-y-2">
          <Label>{t('policies.scenario')}</Label>
          <Input value={scenario} onChange={e => setScenario(e.target.value)} placeholder={t('policies.scenario')} />
        </div>
        {!editing && (
          <div className="space-y-2">
            <Label>{t('policies.rules')}</Label>
            <Textarea
              value={rulesText}
              onChange={e => { setRulesText(e.target.value); setRulesError(null); }}
              placeholder='[{"type":"guardrail","rule":"...","severity":"high"}]'
              rows={5}
              className={`font-mono text-xs ${rulesError ? 'border-destructive' : ''}`}
            />
            {rulesError && <p className="text-xs text-destructive">{rulesError}</p>}
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
          <Button type="submit" disabled={saving}>{saving ? t('common.saving') : t('common.save')}</Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}

function VersionFormDialog({
  open, onOpenChange, onSave, saving,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSave: (rules: unknown[], changelog: string) => void;
  saving: boolean;
}) {
  const [rulesText, setRulesText] = useState('[]');
  const [changelog, setChangelog] = useState('');
  const [rulesError, setRulesError] = useState<string | null>(null);
  const { t } = useI18n();

  useEffect(() => {
    if (open) {
      setRulesText('[]');
      setChangelog('');
      setRulesError(null);
    }
  }, [open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    let rules: unknown[];
    try {
      rules = JSON.parse(rulesText);
      if (!Array.isArray(rules)) throw new Error();
    } catch {
      setRulesError(t('policies.rulesHint'));
      return;
    }
    setRulesError(null);
    onSave(rules, changelog);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>{t('policies.createVersion')}</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label>{t('policies.rules')}</Label>
          <Textarea
            value={rulesText}
            onChange={e => { setRulesText(e.target.value); setRulesError(null); }}
            placeholder='[{"type":"guardrail","rule":"...","severity":"high"}]'
            rows={8}
            className={`font-mono text-xs ${rulesError ? 'border-destructive' : ''}`}
            required
          />
          {rulesError && <p className="text-xs text-destructive">{rulesError}</p>}
        </div>
        <div className="space-y-2">
          <Label>{t('policies.changelog')}</Label>
          <Input value={changelog} onChange={e => setChangelog(e.target.value)} placeholder={t('policies.changelog')} />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
          <Button type="submit" disabled={saving}>{saving ? t('common.creating') : t('policies.createVersion')}</Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
