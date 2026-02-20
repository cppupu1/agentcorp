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
import { Plus, Pencil, Trash2, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';

const watchTargetLabels: Record<string, string> = {
  employee: '员工',
  model: '模型',
  tool: '工具',
  prompt: '提示词',
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

  const load = useCallback(async () => {
    try {
      const [configRes, scenarioRes] = await Promise.all([
        changeTestingApi.list(),
        testingApi.listScenarios(),
      ]);
      setConfigs(configRes.data);
      setScenarios(scenarioRes.data);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : '加载失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const handleToggleEnabled = async (config: ChangeTestConfig) => {
    try {
      await changeTestingApi.update(config.id, { enabled: !config.enabled });
      toast(config.enabled ? '已禁用' : '已启用', 'success');
      load();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : '操作失败', 'error');
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
      toast(err instanceof Error ? err.message : '加载详情失败', 'error');
    }
  };

  const handleSave = async (input: ChangeTestConfigInput) => {
    setSaving(true);
    try {
      if (editing) {
        await changeTestingApi.update(editing.id, input);
        toast('配置已更新', 'success');
      } else {
        await changeTestingApi.create(input);
        toast('配置已创建', 'success');
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
      await changeTestingApi.delete(deleteTarget.id);
      toast('配置已删除', 'success');
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
        <h2 className="text-2xl font-semibold">变更测试配置</h2>
        <Button onClick={() => { setEditing(null); setFormOpen(true); }}>
          <Plus className="h-4 w-4" /> 添加配置
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : configs.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">暂无变更测试配置</div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-3 font-medium w-8"></th>
                <th className="text-left px-4 py-3 font-medium">名称</th>
                <th className="text-left px-4 py-3 font-medium">监控目标</th>
                <th className="text-left px-4 py-3 font-medium">监控ID</th>
                <th className="text-left px-4 py-3 font-medium">场景数</th>
                <th className="text-left px-4 py-3 font-medium">状态</th>
                <th className="text-left px-4 py-3 font-medium">上次触发</th>
                <th className="text-right px-4 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {configs.map(c => {
                const sIds = parseScenarioIds(c.scenarioIds);
                const isExpanded = expandedId === c.id;
                return (
                  <ConfigRow
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
            </tbody>
          </table>
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
        title="删除配置"
        description={`确定要删除变更测试配置「${deleteTarget?.name}」吗？`}
        onConfirm={handleDelete}
        loading={deleting}
      />
    </div>
  );
}

function ConfigRow({
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
  return (
    <>
      <tr className="border-t">
        <td className="px-4 py-3">
          <button onClick={onExpand} className="p-0.5 hover:bg-muted rounded" aria-label="展开详情">
            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        </td>
        <td className="px-4 py-3 font-medium">{config.name}</td>
        <td className="px-4 py-3">
          <Badge variant="secondary">{watchTargetLabels[config.watchTarget] || config.watchTarget}</Badge>
        </td>
        <td className="px-4 py-3 text-muted-foreground text-xs font-mono">
          {config.watchId || '全部'}
        </td>
        <td className="px-4 py-3">{scenarioCount}</td>
        <td className="px-4 py-3">
          <button
            onClick={onToggle}
            className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
              config.enabled ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            {config.enabled ? '已启用' : '已禁用'}
          </button>
        </td>
        <td className="px-4 py-3 text-muted-foreground text-xs">
          {config.lastTriggeredAt ? new Date(config.lastTriggeredAt).toLocaleString() : '-'}
        </td>
        <td className="px-4 py-3 text-right">
          <div className="flex justify-end gap-1">
            <Button variant="ghost" size="sm" onClick={onEdit}>
              <Pencil className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="sm" onClick={onDelete}>
              <Trash2 className="h-3 w-3 text-destructive" />
            </Button>
          </div>
        </td>
      </tr>
      {isExpanded && detail && (
        <tr className="border-t bg-muted/30">
          <td colSpan={8} className="px-8 py-4">
            <p className="text-sm font-medium mb-2">最近变更测试运行</p>
            {detail.runs.length === 0 ? (
              <p className="text-xs text-muted-foreground">暂无运行记录</p>
            ) : (
              <div className="space-y-1">
                {detail.runs.map(run => (
                  <div key={run.id} className="flex items-center gap-4 text-xs py-1">
                    <span className="text-muted-foreground">{new Date(run.createdAt).toLocaleString()}</span>
                    <Badge variant="secondary">{run.changeType}</Badge>
                    <span className="font-mono text-muted-foreground">{run.testRunId || '-'}</span>
                  </div>
                ))}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
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
        <DialogTitle>{editing ? '编辑变更测试配置' : '添加变更测试配置'}</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label>名称</Label>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="配置名称" required />
        </div>
        <div className="space-y-2">
          <Label>监控目标</Label>
          <select
            className="w-full border rounded-md px-3 py-2 text-sm bg-background"
            value={watchTarget}
            onChange={e => setWatchTarget(e.target.value)}
          >
            <option value="employee">员工</option>
            <option value="model">模型</option>
            <option value="tool">工具</option>
            <option value="prompt">提示词</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label>监控ID (留空表示监控全部)</Label>
          <Input value={watchId} onChange={e => setWatchId(e.target.value)} placeholder="特定实体ID，留空=全部" />
        </div>
        <div className="space-y-2">
          <Label>测试场景</Label>
          {scenarios.length === 0 ? (
            <p className="text-xs text-muted-foreground">暂无可用测试场景，请先创建测试场景</p>
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
          <p className="text-xs text-muted-foreground">已选 {selectedScenarioIds.length} 个场景</p>
        </div>
        <div className="flex items-center gap-2">
          <Label>启用</Label>
          <button
            type="button"
            onClick={() => setEnabled(!enabled)}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
              enabled ? 'bg-primary' : 'bg-gray-300'
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
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button type="submit" disabled={saving || selectedScenarioIds.length === 0}>
            {saving ? '保存中...' : '保存'}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}