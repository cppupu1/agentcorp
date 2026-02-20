import { useState, useEffect, useCallback } from 'react';
import { modelsApi, costApi, type Model, type ModelInput } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { Plus, Pencil, Trash2, Zap, Loader2 } from 'lucide-react';

const statusBadge: Record<string, { variant: 'secondary' | 'success' | 'destructive'; label: string }> = {
  untested: { variant: 'secondary', label: '未测试' },
  available: { variant: 'success', label: '可用' },
  unavailable: { variant: 'destructive', label: '不可用' },
};

export default function ModelsPage() {
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Model | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Model | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { toast } = useToast();

  const load = useCallback(async () => {
    try {
      const res = await modelsApi.list();
      setModels(res.data);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : '加载失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (input: ModelInput & { inputPricePerMToken?: string; outputPricePerMToken?: string }) => {
    setSaving(true);
    try {
      const { inputPricePerMToken, outputPricePerMToken, ...modelInput } = input;
      let modelId: string;
      if (editing) {
        await modelsApi.update(editing.id, modelInput);
        modelId = editing.id;
        toast('模型已更新', 'success');
      } else {
        const res = await modelsApi.create(modelInput);
        modelId = res.data.id;
        toast('模型已创建', 'success');
      }
      // Save pricing if provided
      const ip = parseFloat(inputPricePerMToken || '');
      const op = parseFloat(outputPricePerMToken || '');
      if (!isNaN(ip) && !isNaN(op)) {
        await costApi.updateModelPricing(modelId, {
          inputPricePerMToken: Math.round(ip * 100),
          outputPricePerMToken: Math.round(op * 100),
        }).catch(() => {});
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
      await modelsApi.delete(deleteTarget.id);
      toast('模型已删除', 'success');
      setDeleteTarget(null);
      load();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : '删除失败', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const handleTest = async (model: Model) => {
    setTestingId(model.id);
    try {
      const res = await modelsApi.test(model.id);
      toast(res.message, res.success ? 'success' : 'error');
      load();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : '测试失败', 'error');
    } finally {
      setTestingId(null);
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold">模型管理</h2>
        <Button data-testid="create-model-btn" onClick={() => { setEditing(null); setFormOpen(true); }}>
          <Plus className="h-4 w-4" /> 添加模型
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : models.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">暂无模型，点击右上角添加</div>
      ) : (
        <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>名称</TableHead>
              <TableHead>模型标识</TableHead>
              <TableHead>Base URL</TableHead>
              <TableHead>状态</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {models.map(m => {
              const s = statusBadge[m.status] || statusBadge.untested;
              return (
                <TableRow key={m.id} data-testid={`model-item-${m.id}`}>
                  <TableCell className="font-medium">{m.name}</TableCell>
                  <TableCell className="text-muted-foreground">{m.modelId}</TableCell>
                  <TableCell className="text-muted-foreground text-xs max-w-[200px] truncate">{m.baseUrl}</TableCell>
                  <TableCell>
                    <Badge variant={s.variant} data-testid={`model-status-${m.id}`}>{s.label}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => { setEditing(m); setFormOpen(true); }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost" size="icon"
                        data-testid="test-model-btn"
                        disabled={testingId === m.id}
                        onClick={() => handleTest(m)}
                      >
                        {testingId === m.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(m)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        </div>
      )}

      <ModelFormDialog
        open={formOpen}
        onOpenChange={(v) => { setFormOpen(v); if (!v) setEditing(null); }}
        editing={editing}
        onSave={handleSave}
        saving={saving}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={() => setDeleteTarget(null)}
        title="删除模型"
        description={`确定要删除模型「${deleteTarget?.name}」吗？此操作不可撤销。`}
        onConfirm={handleDelete}
        loading={deleting}
      />
    </div>
  );
}

function ModelFormDialog({
  open, onOpenChange, editing, onSave, saving,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: Model | null;
  onSave: (input: ModelInput & { inputPricePerMToken?: string; outputPricePerMToken?: string }) => void;
  saving: boolean;
}) {
  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [modelId, setModelId] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [notes, setNotes] = useState('');
  const [inputPrice, setInputPrice] = useState('');
  const [outputPrice, setOutputPrice] = useState('');

  useEffect(() => {
    if (open) {
      setName(editing?.name ?? '');
      setBaseUrl(editing?.baseUrl ?? '');
      setModelId(editing?.modelId ?? '');
      setApiKey('');
      setNotes(editing?.notes ?? '');
      setInputPrice('');
      setOutputPrice('');
    }
  }, [open, editing]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({ name, baseUrl, modelId, apiKey, notes, inputPricePerMToken: inputPrice, outputPricePerMToken: outputPrice });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>{editing ? '编辑模型' : '添加模型'}</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="model-name">名称</Label>
          <Input id="model-name" data-testid="model-name-input" value={name} onChange={e => setName(e.target.value)} placeholder="如：GPT-4o" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="model-baseUrl">Base URL</Label>
          <Input id="model-baseUrl" data-testid="model-baseUrl-input" value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder="https://api.openai.com/v1" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="model-modelId">模型标识</Label>
          <Input id="model-modelId" data-testid="model-modelId-input" value={modelId} onChange={e => setModelId(e.target.value)} placeholder="gpt-4o" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="model-apiKey">API Key</Label>
          <Input id="model-apiKey" data-testid="model-apiKey-input" type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder={editing ? '留空表示不修改' : 'sk-...'} required={!editing} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="model-notes">备注</Label>
          <Input id="model-notes" data-testid="model-notes-input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="可选" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="model-input-price">输入价格 ($/M tokens)</Label>
            <Input id="model-input-price" type="number" step="0.01" min="0" value={inputPrice} onChange={e => setInputPrice(e.target.value)} placeholder="如：2.50" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="model-output-price">输出价格 ($/M tokens)</Label>
            <Input id="model-output-price" type="number" step="0.01" min="0" value={outputPrice} onChange={e => setOutputPrice(e.target.value)} placeholder="如：10.00" />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button type="submit" disabled={saving}>{saving ? '保存中...' : '保存'}</Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
