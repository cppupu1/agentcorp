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
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { Plus, Trash2, Loader2, ChevronDown, ChevronRight, Pencil, RotateCcw } from 'lucide-react';

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

  const load = useCallback(async () => {
    try {
      const res = await policiesApi.list();
      setPackages(res.data);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : '加载失败', 'error');
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
      toast(err instanceof Error ? err.message : '加载详情失败', 'error');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleSavePackage = async (input: { name: string; description?: string; scenario?: string; rules?: unknown[] }) => {
    setSaving(true);
    try {
      if (editing) {
        await policiesApi.update(editing.id, input);
        toast('策略包已更新', 'success');
      } else {
        await policiesApi.create({ ...input, rules: input.rules || [] });
        toast('策略包已创建', 'success');
      }
      setFormOpen(false);
      setEditing(null);
      load();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : '保存失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await policiesApi.delete(deleteTarget.id);
      toast('策略包已删除', 'success');
      setDeleteTarget(null);
      if (expandedId === deleteTarget.id) {
        setExpandedId(null);
        setDetail(null);
      }
      load();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : '删除失败', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const handleActivate = async (packageId: string, versionId: string) => {
    try {
      const res = await policiesApi.activateVersion(packageId, versionId);
      setDetail(res.data);
      toast('版本已激活', 'success');
      load();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : '激活失败', 'error');
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
      toast('新版本已创建', 'success');
      load();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : '创建版本失败', 'error');
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
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold">策略包管理</h2>
        <Button onClick={() => { setEditing(null); setFormOpen(true); }}>
          <Plus className="h-4 w-4" /> 创建策略包
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : packages.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">暂无策略包</div>
      ) : (
        <div className="space-y-3">
          {packages.map(pkg => (
            <div key={pkg.id} className="border rounded-lg">
              <button
                className="flex items-center gap-3 w-full px-4 py-3 text-left hover:bg-muted/50"
                onClick={() => toggleExpand(pkg.id)}
              >
                {expandedId === pkg.id ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{pkg.name}</span>
                    {pkg.isBuiltin ? <Badge variant="secondary">内置</Badge> : null}
                    {pkg.scenario && <Badge variant="secondary">{pkg.scenario}</Badge>}
                  </div>
                  {pkg.description && <p className="text-xs text-muted-foreground mt-0.5 truncate">{pkg.description}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="secondary">{pkg.versionCount} 个版本</Badge>
                  {pkg.activeVersion && <Badge variant="default">v{pkg.activeVersion}</Badge>}
                </div>
              </button>

              {expandedId === pkg.id && (
                <div className="px-4 pb-4 border-t">
                  <div className="flex gap-2 py-3">
                    {!pkg.isBuiltin && (
                      <>
                        <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); setEditing(pkg); setFormOpen(true); }}>
                          <Pencil className="h-3 w-3" /> 编辑
                        </Button>
                        <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); setDeleteTarget(pkg); }}>
                          <Trash2 className="h-3 w-3 text-destructive" /> 删除
                        </Button>
                      </>
                    )}
                    <Button variant="outline" size="sm" onClick={() => { setVersionTarget(pkg.id); setVersionFormOpen(true); }}>
                      <Plus className="h-3 w-3" /> 新版本
                    </Button>
                  </div>

                  {detailLoading ? (
                    <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                  ) : detail?.versions.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-2">暂无版本</p>
                  ) : (
                    <div className="space-y-2">
                      {detail?.versions.map(ver => (
                        <div key={ver.id} className={`border rounded-md p-3 ${ver.isActive ? 'border-primary bg-primary/5' : ''}`}>
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">v{ver.version}</span>
                              {ver.isActive ? <Badge variant="default">当前激活</Badge> : null}
                              {ver.changelog && <span className="text-xs text-muted-foreground">{ver.changelog}</span>}
                            </div>
                            <div className="flex gap-1">
                              {!ver.isActive && (
                                <Button variant="ghost" size="sm" onClick={() => handleActivate(pkg.id, ver.id)} title="激活此版本">
                                  <RotateCcw className="h-3 w-3" /> 激活
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
        title="删除策略包"
        description={`确定要删除策略包「${deleteTarget?.name}」吗？所有版本和团队关联将被删除。`}
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
        setRulesError('rules 必须是合法的 JSON 数组');
        return;
      }
      setRulesError(null);
      onSave({ name, description: description || undefined, scenario: scenario || undefined, rules });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>{editing ? '编辑策略包' : '创建策略包'}</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label>名称</Label>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="策略包名称" required />
        </div>
        <div className="space-y-2">
          <Label>描述</Label>
          <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="策略包描述" rows={2} />
        </div>
        <div className="space-y-2">
          <Label>场景</Label>
          <Input value={scenario} onChange={e => setScenario(e.target.value)} placeholder="如：通用、安全、质量" />
        </div>
        {!editing && (
          <div className="space-y-2">
            <Label>规则 (JSON)</Label>
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
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button type="submit" disabled={saving}>{saving ? '保存中...' : '保存'}</Button>
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
      setRulesError('rules 必须是合法的 JSON 数组');
      return;
    }
    setRulesError(null);
    onSave(rules, changelog);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>创建新版本</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label>规则 (JSON)</Label>
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
          <Label>变更说明</Label>
          <Input value={changelog} onChange={e => setChangelog(e.target.value)} placeholder="本次变更说明" />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button type="submit" disabled={saving}>{saving ? '创建中...' : '创建版本'}</Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
