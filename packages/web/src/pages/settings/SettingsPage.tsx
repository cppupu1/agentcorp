import { useState, useEffect, useCallback } from 'react';
import { systemApi, webhookConfigsApi, type WebhookConfig } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { Loader2, Save, Plus, Pencil, Trash2 } from 'lucide-react';

const SETTING_DEFS = [
  { key: 'subtask_token_limit', label: '子任务 Token 限额', description: '单个子任务最大 Token 用量，超限则失败', default: '100000', unit: 'tokens' },
  { key: 'task_token_limit', label: '任务总 Token 限额', description: '单个任务所有子任务累计 Token 上限', default: '500000', unit: 'tokens' },
  { key: 'task_timeout_minutes', label: '任务总超时', description: '任务执行最大时长，超时自动失败', default: '30', unit: '分钟' },
  { key: 'circuit_breaker_threshold', label: '熔断阈值', description: '连续失败子任务数达到此值时暂停任务', default: '3', unit: '次' },
];

const EVENT_OPTIONS = [
  { value: 'task_approval', label: '任务审批' },
  { value: 'task_completed', label: '任务完成' },
  { value: 'task_failed', label: '任务失败' },
  { value: 'circuit_breaker', label: '熔断触发' },
  { value: 'observer_alert', label: '观察者告警' },
];

export default function SettingsPage() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    systemApi.getSettings()
      .then(res => setSettings(res.data))
      .catch(err => toast(err instanceof Error ? err.message : '加载失败', 'error'))
      .finally(() => setLoading(false));
  }, [toast]);

  const handleSave = async (key: string) => {
    const value = settings[key];
    if (value === undefined) return;
    setSaving(key);
    try {
      await systemApi.updateSetting(key, value);
      toast('设置已保存', 'success');
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : '保存失败', 'error');
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
    <div className="p-6 max-w-2xl">
      <h2 className="text-2xl font-semibold mb-6">系统设置</h2>

      <div className="space-y-6">
        {SETTING_DEFS.map(def => (
          <div key={def.key} className="border rounded-lg p-4">
            <label className="block text-sm font-medium mb-1">{def.label}</label>
            <p className="text-xs text-muted-foreground mb-3">{def.description}</p>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                className="max-w-[200px]"
                value={settings[def.key] ?? def.default}
                onChange={e => setSettings(prev => ({ ...prev, [def.key]: e.target.value }))}
                min="1"
              />
              <span className="text-sm text-muted-foreground">{def.unit}</span>
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

  const load = useCallback(async () => {
    try {
      const res = await webhookConfigsApi.list();
      setConfigs(res.data);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : '加载失败', 'error');
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
      toast('Webhook 已删除', 'success');
      setDeleteTarget(null);
      load();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : '删除失败', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const handleToggleEnabled = async (config: WebhookConfig) => {
    try {
      await webhookConfigsApi.update(config.id, { enabled: !config.enabled });
      load();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : '操作失败', 'error');
    }
  };

  return (
    <div className="mt-10">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Webhook 配置</h3>
        <Button size="sm" onClick={() => { setEditing(null); setFormOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" /> 添加
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : configs.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">暂无 Webhook 配置</div>
      ) : (
        <div className="space-y-3">
          {configs.map(c => {
            const events: string[] = (() => { try { return JSON.parse(c.events); } catch { return []; } })();
            return (
              <div key={c.id} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{c.name}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${c.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {c.enabled ? '启用' : '禁用'}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => handleToggleEnabled(c)} title={c.enabled ? '禁用' : '启用'}>
                      <span className="text-xs">{c.enabled ? '禁用' : '启用'}</span>
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
                      {EVENT_OPTIONS.find(o => o.value === e)?.label || e}
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
        title="删除 Webhook"
        description={`确定要删除 Webhook「${deleteTarget?.name}」吗？`}
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
        toast('Webhook 已更新', 'success');
      } else {
        await webhookConfigsApi.create({ name, url, secret: secret || undefined, events, enabled });
        toast('Webhook 已创建', 'success');
      }
      onSaved();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : '保存失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border rounded-lg p-4 mt-4 bg-card">
      <h4 className="text-sm font-medium mb-3">{editing ? '编辑 Webhook' : '添加 Webhook'}</h4>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="wh-name">名称</Label>
          <Input id="wh-name" value={name} onChange={e => setName(e.target.value)} placeholder="如：飞书通知" required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="wh-url">URL</Label>
          <Input id="wh-url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://..." required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="wh-secret">Secret</Label>
          <Input id="wh-secret" type="password" value={secret} onChange={e => setSecret(e.target.value)} placeholder={editing ? '留空表示不修改' : '可选'} />
        </div>
        <div className="space-y-1">
          <Label>事件</Label>
          <div className="flex flex-wrap gap-2 mt-1">
            {EVENT_OPTIONS.map(opt => (
              <label key={opt.value} className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={events.includes(opt.value)}
                  onChange={() => toggleEvent(opt.value)}
                  className="rounded"
                />
                {opt.label}
              </label>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-sm cursor-pointer">
            <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} className="rounded" />
            启用
          </label>
        </div>
        <div className="flex gap-2 pt-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>取消</Button>
          <Button type="submit" size="sm" disabled={saving || events.length === 0}>
            {saving ? '保存中...' : '保存'}
          </Button>
        </div>
      </form>
    </div>
  );
}
