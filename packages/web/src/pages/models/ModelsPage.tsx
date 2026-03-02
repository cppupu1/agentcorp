import { useState, useEffect, useCallback } from 'react';
import { useI18n } from '@/i18n';
import { modelsApi, costApi, systemApi, type Model, type ModelInput } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { Plus, Pencil, Trash2, Zap, Loader2, Brain, Settings2, Save } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';

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
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8 pb-4 border-b border-border/40">
        <div>
          <h2 className="text-3xl font-heading font-medium tracking-tight text-foreground/90">{t('models.title')}</h2>
          <p className="text-[15px] text-muted-foreground mt-1.5">{t('nav.models')}</p>
        </div>
        <Button data-testid="create-model-btn" onClick={() => { setEditing(null); setFormOpen(true); }} className="shadow-[var(--shadow-sm)]">
          <Plus className="h-4 w-4 mr-1.5" /> {t('models.add')}
        </Button>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-44 rounded-3xl" />)}</div>
      ) : models.length === 0 ? (
        <EmptyState icon={<Brain className="h-10 w-10" />} title={t('models.empty')} description={t('models.emptyDesc')} action={<Button onClick={() => { setEditing(null); setFormOpen(true); }}><Plus className="h-4 w-4" /> {t('models.add')}</Button>} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {models.map(m => {
            const variant = statusVariant[m.status] || statusVariant.untested;
            const label = t(statusLabelKey[m.status] || statusLabelKey.untested);
            return (
              <div key={m.id} data-testid={`model-item-${m.id}`} className="bg-card rounded-3xl p-6 shadow-[var(--shadow-sm)] border border-border/40 hover:shadow-[var(--shadow-md)] hover:-translate-y-1 md-transition flex flex-col h-full">
                <div className="flex items-start justify-between mb-4">
                  <div className="min-w-0 pr-3">
                    <div className="font-heading font-medium text-base text-foreground/90">{m.name}</div>
                    <div className="text-[13px] text-muted-foreground mt-1 font-mono bg-muted/50 px-2 py-0.5 rounded-md inline-block max-w-full truncate">{m.modelId}</div>
                  </div>
                  <Badge variant={variant} data-testid={`model-status-${m.id}`}>{label}</Badge>
                </div>
                <div className="text-[14px] text-muted-foreground truncate mb-4">{m.baseUrl}</div>
                <div className="flex gap-2 pt-4 mt-auto border-t border-border/30">
                  <Button variant="secondary" size="sm" className="rounded-2xl flex-1" onClick={() => { setEditing(m); setFormOpen(true); }}>
                    <Pencil className="h-4 w-4 mr-1.5" /> {t('common.edit')}
                  </Button>
                  <Button variant="outline" size="sm" className="rounded-2xl flex-1" data-testid="test-model-btn" disabled={testingId === m.id} onClick={() => handleTest(m)}>
                    {testingId === m.id ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Zap className="h-4 w-4 mr-1.5" />} {t('models.test')}
                  </Button>
                  <Button variant="ghost" size="icon" className="rounded-2xl shrink-0" onClick={() => setDeleteTarget(m)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
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

      {!loading && models.length > 0 && <ModelSettings models={models} />}
    </div>
  );
}

const FEATURE_MODEL_KEYS = [
  { key: 'default_model_id', labelKey: 'models.defaultModel', descKey: 'models.defaultModelDesc', isDefault: true },
  { key: 'hr_assistant_model_id', labelKey: 'models.hrModel' },
  { key: 'pm_assistant_model_id', labelKey: 'models.pmModel' },
  { key: 'ai_parse_model_id', labelKey: 'models.aiParseModel' },
  { key: 'task_review_model_id', labelKey: 'models.taskReviewModel' },
  { key: 'tool_assign_model_id', labelKey: 'models.toolAssignModel' },
] as const;

function ModelSettings({ models }: { models: Model[] }) {
  const { t } = useI18n();
  const { toast } = useToast();
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    systemApi.getSettings()
      .then(res => setSettings(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (key: string) => {
    setSavingKey(key);
    try {
      const value = settings[key] || '';
      await systemApi.updateSetting(key, value);
      toast(t('models.settingsSaved'), 'success');
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : t('common.saveFailed'), 'error');
    } finally {
      setSavingKey(null);
    }
  };

  const defaultModelName = models.find(m => m.id === settings['default_model_id'])?.name;

  return (
    <div className="mt-10">
      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border/40">
        <Settings2 className="h-5 w-5 text-muted-foreground" />
        <div>
          <h3 className="text-lg font-heading font-medium text-foreground/90">{t('models.settingsTitle')}</h3>
          <p className="text-[13px] text-muted-foreground">{t('models.settingsDesc')}</p>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {FEATURE_MODEL_KEYS.map(feat => (
            <FeatureModelCard
              key={feat.key}
              settingKey={feat.key}
              label={t(feat.labelKey)}
              desc={'descKey' in feat ? t(feat.descKey!) : undefined}
              isDefault={'isDefault' in feat}
              models={models}
              value={settings[feat.key] || ''}
              defaultModelName={defaultModelName}
              saving={savingKey === feat.key}
              onChange={(val) => setSettings(prev => ({ ...prev, [feat.key]: val }))}
              onSave={() => handleSave(feat.key)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FeatureModelCard({ settingKey, label, desc, isDefault, models, value, defaultModelName, saving, onChange, onSave }: {
  settingKey: string;
  label: string;
  desc?: string;
  isDefault?: boolean;
  models: Model[];
  value: string;
  defaultModelName?: string;
  saving: boolean;
  onChange: (val: string) => void;
  onSave: () => void;
}) {
  const { t } = useI18n();

  return (
    <div className="bg-card rounded-2xl p-4 border border-border/40 shadow-[var(--shadow-sm)] flex flex-col gap-2">
      <div>
        <div className="text-sm font-medium text-foreground/90">{label}</div>
        {desc && <div className="text-xs text-muted-foreground">{desc}</div>}
      </div>
      <div className="flex items-center gap-2 mt-auto">
        <select
          className="flex-1 h-8 rounded-lg border border-input bg-background px-2 text-sm truncate"
          value={value}
          onChange={e => onChange(e.target.value)}
        >
          {isDefault
            ? <option value="">{t('models.noDefault')}</option>
            : <option value="">{defaultModelName ? `${t('models.useDefault')} (${defaultModelName})` : t('models.useDefault')}</option>
          }
          {models.map(m => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
        <Button
          size="icon"
          variant="outline"
          className="h-8 w-8 shrink-0 rounded-lg"
          disabled={saving}
          onClick={onSave}
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
        </Button>
      </div>
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
      setInputPrice(editing?.inputPricePerMToken != null ? String(editing.inputPricePerMToken / 100) : '');
      setOutputPrice(editing?.outputPricePerMToken != null ? String(editing.outputPricePerMToken / 100) : '');
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
