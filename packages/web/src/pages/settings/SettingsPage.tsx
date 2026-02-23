import { useState, useEffect, useCallback } from 'react';
import { systemApi, webhookConfigsApi, type WebhookConfig } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { useI18n } from '@/i18n';
import { Loader2, Save, Plus, Pencil, Trash2 } from 'lucide-react';

const SETTING_DEFS = [
  { key: 'subtask_token_limit', labelKey: 'settings.subtaskTokenLimit', descKey: 'settings.subtaskTokenLimitDesc', default: '100000', unitKey: 'settings.unitTokens' },
  { key: 'task_token_limit', labelKey: 'settings.taskTokenLimit', descKey: 'settings.taskTokenLimitDesc', default: '500000', unitKey: 'settings.unitTokens' },
  { key: 'task_timeout_minutes', labelKey: 'settings.taskTimeout', descKey: 'settings.taskTimeoutDesc', default: '30', unitKey: 'settings.unitMinutes' },
  { key: 'circuit_breaker_threshold', labelKey: 'settings.circuitBreaker', descKey: 'settings.circuitBreakerDesc', default: '3', unitKey: 'settings.unitTimes' },
];

const EVENT_OPTIONS = [
  { value: 'task_approval', labelKey: 'settings.eventApproval' },
  { value: 'task_completed', labelKey: 'settings.eventCompleted' },
  { value: 'task_failed', labelKey: 'settings.eventFailed' },
  { value: 'circuit_breaker', labelKey: 'settings.eventCircuitBreaker' },
  { value: 'observer_alert', labelKey: 'settings.eventObserverAlert' },
];

export default function SettingsPage() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const { toast } = useToast();
  const { t } = useI18n();

  useEffect(() => {
    systemApi.getSettings()
      .then(res => setSettings(res.data))
      .catch(err => toast(err instanceof Error ? err.message : t('common.loadFailed'), 'error'))
      .finally(() => setLoading(false));
  }, [toast]);

  const handleSave = async (key: string) => {
    const value = settings[key];
    if (value === undefined) return;
    setSaving(key);
    try {
      await systemApi.updateSetting(key, value);
      toast(t('settings.saved'), 'success');
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : t('common.saveFailed'), 'error');
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h2 className="text-2xl font-bold tracking-tight mb-6">{t('settings.title')}</h2>

      <div className="space-y-6">
        {SETTING_DEFS.map(def => (
          <div key={def.key} className="bg-card rounded-2xl p-5 shadow-[var(--shadow-sm)]">
            <label className="block text-sm font-medium mb-1">{t(def.labelKey)}</label>
            <p className="text-xs text-muted-foreground mb-3">{t(def.descKey)}</p>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                className="max-w-[200px]"
                value={settings[def.key] ?? def.default}
                onChange={e => setSettings(prev => ({ ...prev, [def.key]: e.target.value }))}
                min="1"
              />
              <span className="text-sm text-muted-foreground">{t(def.unitKey)}</span>
              <Button
                size="sm"
                variant="outline"
                disabled={saving === def.key}
                onClick={() => handleSave(def.key)}
              >
                {saving === def.key ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
              </Button>
            </div>
          </div>
        ))}
      </div>

      <WebhookSection />
    </div>
  );
}

function WebhookSection() {
  const [configs, setConfigs] = useState<WebhookConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<WebhookConfig | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WebhookConfig | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { toast } = useToast();
  const { t } = useI18n();

  const load = useCallback(async () => {
    try {
      const res = await webhookConfigsApi.list();
      setConfigs(res.data);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : t('common.loadFailed'), 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await webhookConfigsApi.delete(deleteTarget.id);
      toast(t('settings.webhookDeleted'), 'success');
      setDeleteTarget(null);
      load();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : t('common.deleteFailed'), 'error');
    } finally {
      setDeleting(false);
    }
  };

  const handleToggleEnabled = async (config: WebhookConfig) => {
    try {
      await webhookConfigsApi.update(config.id, { enabled: !config.enabled });
      load();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : t('common.operationFailed'), 'error');
    }
  };

  return (
    <div className="mt-10">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">{t('settings.webhookTitle')}</h3>
        <Button size="sm" onClick={() => { setEditing(null); setFormOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" /> {t('common.add')}
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : configs.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">{t('settings.webhookEmpty')}</div>
      ) : (
        <div className="space-y-3">
          {configs.map(c => {
            const events: string[] = (() => { try { return JSON.parse(c.events); } catch { return []; } })();
            return (
              <div key={c.id} className="bg-card rounded-2xl p-5 shadow-[var(--shadow-sm)]">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{c.name}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${c.enabled ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground'}`}>
                      {c.enabled ? t('settings.webhookEnabled') : t('settings.webhookDisabled')}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => handleToggleEnabled(c)} title={c.enabled ? t('settings.webhookDisabled') : t('settings.webhookEnabled')}>
                      <span className="text-xs">{c.enabled ? t('settings.webhookDisabled') : t('settings.webhookEnabled')}</span>
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => { setEditing(c); setFormOpen(true); }}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(c)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground truncate mb-1">{c.url}</p>
                <div className="flex flex-wrap gap-1">
                  {events.map(e => (
                    <span key={e} className="text-xs bg-muted px-1.5 py-0.5 rounded">
                      {(() => { const found = EVENT_OPTIONS.find(o => o.value === e); return found ? t(found.labelKey) : e; })()}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {formOpen && (
        <WebhookForm
          editing={editing}
          onClose={() => { setFormOpen(false); setEditing(null); }}
          onSaved={() => { setFormOpen(false); setEditing(null); load(); }}
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={() => setDeleteTarget(null)}
        title={t('settings.deleteWebhook')}
        description={`${t('settings.deleteWebhookConfirm').replace('{name}', deleteTarget?.name || '')}`}
        onConfirm={handleDelete}
        loading={deleting}
      />
    </div>
  );
}

function WebhookForm({ editing, onClose, onSaved }: {
  editing: WebhookConfig | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [events, setEvents] = useState<string[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const { t } = useI18n();

  useEffect(() => {
    if (editing) {
      setName(editing.name);
      setUrl(editing.url);
      setSecret('');
      try { setEvents(JSON.parse(editing.events)); } catch { setEvents([]); }
      setEnabled(!!editing.enabled);
    } else {
      setName(''); setUrl(''); setSecret(''); setEvents([]); setEnabled(true);
    }
  }, [editing]);

  const toggleEvent = (val: string) => {
    setEvents(prev => prev.includes(val) ? prev.filter(e => e !== val) : [...prev, val]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await webhookConfigsApi.update(editing.id, {
          name, url, events, enabled,
          ...(secret ? { secret } : {}),
        });
        toast(t('settings.webhookUpdated'), 'success');
      } else {
        await webhookConfigsApi.create({ name, url, secret: secret || undefined, events, enabled });
        toast(t('settings.webhookCreated'), 'success');
      }
      onSaved();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : t('common.saveFailed'), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-card rounded-2xl p-5 mt-4 shadow-[var(--shadow-sm)]">
      <h4 className="text-sm font-medium mb-3">{editing ? t('settings.editWebhook') : t('settings.addWebhook')}</h4>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="wh-name">{t('settings.webhookName')}</Label>
          <Input id="wh-name" value={name} onChange={e => setName(e.target.value)} placeholder={t('settings.webhookNamePlaceholder')} required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="wh-url">URL</Label>
          <Input id="wh-url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://..." required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="wh-secret">Secret</Label>
          <Input id="wh-secret" type="password" value={secret} onChange={e => setSecret(e.target.value)} placeholder={editing ? t('settings.webhookSecretHint') : t('settings.webhookSecretOptional')} />
        </div>
        <div className="space-y-1">
          <Label>{t('settings.webhookEvents')}</Label>
          <div className="flex flex-wrap gap-2 mt-1">
            {EVENT_OPTIONS.map(opt => (
              <label key={opt.value} className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={events.includes(opt.value)}
                  onChange={() => toggleEvent(opt.value)}
                  className="rounded accent-primary h-4 w-4"
                />
                {t(opt.labelKey)}
              </label>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-sm cursor-pointer">
            <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} className="rounded accent-primary h-4 w-4" />
            {t('settings.webhookEnabled')}
          </label>
        </div>
        <div className="flex gap-2 pt-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" size="sm" disabled={saving || events.length === 0}>
            {saving ? t('common.saving') : t('common.save')}
          </Button>
        </div>
      </form>
    </div>
  );
}
