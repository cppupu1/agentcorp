import { useState, useEffect, useCallback } from 'react';
import { useI18n } from '@/i18n';
import { modelsApi, costApi, type Model, type ModelInput } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { Plus, Pencil, Trash2, Zap, Loader2 } from 'lucide-react';

const statusVariant: Record<string, 'secondary' | 'success' | 'destructive'> = {
  untested: 'secondary',
  available: 'success',
  unavailable: 'destructive',
};

const statusLabelKey: Record<string, string> = {
  untested: 'models.statusUntested',
  available: 'models.statusAvailable',
  unavailable: 'models.statusUnavailable',
};

export default function ModelsPage() {
  const { t } = useI18n();
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
      toast(err instanceof Error ? err.message : t('common.loadFailed'), 'error');
    } finally {
      setLoading(false);
    }
  }, [toast, t]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (input: ModelInput & { inputPricePerMToken?: string; outputPricePerMToken?: string }) => {
    setSaving(true);
    try {
      const { inputPricePerMToken, outputPricePerMToken, ...modelInput } = input;
      let modelId: string;
      if (editing) {
        await modelsApi.update(editing.id, modelInput);
        modelId = editing.id;
        toast(t('models.updated'), 'success');
      } else {
        const res = await modelsApi.create(modelInput);
        modelId = res.data.id;
        toast(t('models.created'), 'success');
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
      toast(err instanceof Error ? err.message : t('common.saveFailed'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await modelsApi.delete(deleteTarget.id);
      toast(t('models.deleted'), 'success');
      setDeleteTarget(null);
      load();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : t('common.deleteFailed'), 'error');
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
      toast(err instanceof Error ? err.message : t('common.operationFailed'), 'error');
    } finally {
      setTestingId(null);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold tracking-tight">{t('models.title')}</h2>
        <Button data-testid="create-model-btn" onClick={() => { setEditing(null); setFormOpen(true); }}>
          <Plus className="h-4 w-4" /> {t('models.add')}
        </Button>
      </div>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-40 rounded-2xl" />)}</div>
      ) : models.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">{t('models.empty')}</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {models.map(m => {
            const variant = statusVariant[m.status] || statusVariant.untested;
            const label = t(statusLabelKey[m.status] || statusLabelKey.untested);
            return (
              <div key={m.id} data-testid={`model-item-${m.id}`} className="bg-card rounded-2xl p-5 shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] transition-all space-y-3">
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <div className="font-medium text-sm">{m.name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5 font-mono">{m.modelId}</div>
                  </div>
                  <Badge variant={variant} data-testid={`model-status-${m.id}`}>{label}</Badge>
                </div>
                <div className="text-xs text-muted-foreground truncate">{m.baseUrl}</div>
                <div className="flex gap-1 pt-1 border-t border-border/50">
                  <Button variant="ghost" size="sm" onClick={() => { setEditing(m); setFormOpen(true); }}>
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="sm" data-testid="test-model-btn" disabled={testingId === m.id} onClick={() => handleTest(m)}>
                    {testingId === m.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(m)} className="ml-auto">
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              </div>
            );
          })}
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
        title={t('models.deleteModel')}
        description={t('models.deleteConfirm', { name: deleteTarget?.name ?? '' })}
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
  const { t } = useI18n();
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
        <DialogTitle>{editing ? t('models.editModel') : t('models.addModel')}</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="model-name">{t('models.name')}</Label>
          <Input id="model-name" data-testid="model-name-input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. GPT-4o" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="model-baseUrl">Base URL</Label>
          <Input id="model-baseUrl" data-testid="model-baseUrl-input" value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder="https://api.openai.com/v1" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="model-modelId">{t('models.modelId')}</Label>
          <Input id="model-modelId" data-testid="model-modelId-input" value={modelId} onChange={e => setModelId(e.target.value)} placeholder="gpt-4o" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="model-apiKey">API Key</Label>
          <Input id="model-apiKey" data-testid="model-apiKey-input" type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder={editing ? t('models.apiKeyHint') : 'sk-...'} required={!editing} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="model-notes">{t('models.notes')}</Label>
          <Input id="model-notes" data-testid="model-notes-input" value={notes} onChange={e => setNotes(e.target.value)} placeholder={t('models.notesPlaceholder')} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="model-input-price">{t('models.inputPrice') + ' ' + t('models.perMToken')}</Label>
            <Input id="model-input-price" type="number" step="0.01" min="0" value={inputPrice} onChange={e => setInputPrice(e.target.value)} placeholder="e.g. 2.50" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="model-output-price">{t('models.outputPrice') + ' ' + t('models.perMToken')}</Label>
            <Input id="model-output-price" type="number" step="0.01" min="0" value={outputPrice} onChange={e => setOutputPrice(e.target.value)} placeholder="e.g. 10.00" />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
          <Button type="submit" disabled={saving}>{saving ? t('common.saving') : t('common.save')}</Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
