import { useState, useEffect, useCallback } from 'react';
import { triggersApi, teamsApi, type Trigger, type TriggerInput, type Team } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { Plus, Pencil, Trash2, Zap, Loader2 } from 'lucide-react';

const typeBadge: Record<string, { variant: 'secondary' | 'success' | 'destructive'; label: string }> = {
  cron: { variant: 'secondary', label: '定时' },
  webhook: { variant: 'success', label: 'Webhook' },
  event: { variant: 'destructive', label: '事件' },
};

export default function TriggersPage() {
  const [triggers, setTriggers] = useState<Trigger[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Trigger | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Trigger | null>(null);
  const [firingId, setFiringId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [teams, setTeams] = useState<Team[]>([]);
  const { toast } = useToast();

  const load = useCallback(async () => {
    try {
      const [trigRes, teamRes] = await Promise.all([
        triggersApi.list(),
        teamsApi.list(),
      ]);
      setTriggers(trigRes.data);
      setTeams(teamRes.data);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : '加载失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const handleToggleEnabled = async (trigger: Trigger) => {
    try {
      await triggersApi.update(trigger.id, { enabled: !trigger.enabled });
      toast(trigger.enabled ? '已禁用' : '已启用', 'success');
      load();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : '操作失败', 'error');
    }
  };

  const handleFire = async (trigger: Trigger) => {
    setFiringId(trigger.id);
    try {
      const res = await triggersApi.fire(trigger.id);
      toast(`触发器已触发，任务 ID: ${res.data.taskId}`, 'success');
      load();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : '触发失败', 'error');
    } finally {
      setFiringId(null);
    }
  };

  const handleSave = async (input: TriggerInput) => {
    setSaving(true);
    try {
      if (editing) {
        await triggersApi.update(editing.id, input);
        toast('触发器已更新', 'success');
      } else {
        await triggersApi.create(input);
        toast('触发器已创建', 'success');
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
      await triggersApi.delete(deleteTarget.id);
      toast('触发器已删除', 'success');
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
        <h2 className="text-2xl font-semibold">触发器管理</h2>
        <Button onClick={() => { setEditing(null); setFormOpen(true); }}>
          <Plus className="h-4 w-4" /> 添加触发器
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : triggers.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">暂无触发器</div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-3 font-medium">名称</th>
                <th className="text-left px-4 py-3 font-medium">类型</th>
                <th className="text-left px-4 py-3 font-medium">团队</th>
                <th className="text-left px-4 py-3 font-medium">状态</th>
                <th className="text-left px-4 py-3 font-medium">上次触发</th>
                <th className="text-right px-4 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {triggers.map(t => {
                const tb = typeBadge[t.type] || typeBadge.event;
                return (
                  <tr key={t.id} className="border-t">
                    <td className="px-4 py-3 font-medium">{t.name}</td>
                    <td className="px-4 py-3"><Badge variant={tb.variant}>{tb.label}</Badge></td>
                    <td className="px-4 py-3 text-muted-foreground">{t.teamName || '-'}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleToggleEnabled(t)}
                        className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                          t.enabled ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}
                      >
                        {t.enabled ? '已启用' : '已禁用'}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {t.lastFiredAt ? new Date(t.lastFiredAt).toLocaleString() : '-'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => handleFire(t)} disabled={firingId === t.id}>
                          {firingId === t.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => { setEditing(t); setFormOpen(true); }}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(t)}>
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <TriggerFormDialog
        open={formOpen}
        onOpenChange={(v) => { setFormOpen(v); if (!v) setEditing(null); }}
        editing={editing}
        teams={teams}
        onSave={handleSave}
        saving={saving}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={() => setDeleteTarget(null)}
        title="删除触发器"
        description={`确定要删除触发器「${deleteTarget?.name}」吗？`}
        onConfirm={handleDelete}
        loading={deleting}
      />
    </div>
  );
}

function TriggerFormDialog({
  open, onOpenChange, editing, teams, onSave, saving,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: Trigger | null;
  teams: Team[];
  onSave: (input: TriggerInput) => void;
  saving: boolean;
}) {
  const [name, setName] = useState('');
  const [type, setType] = useState<'cron' | 'webhook' | 'event'>('cron');
  const [teamId, setTeamId] = useState('');
  const [cronExpr, setCronExpr] = useState('');
  const [webhookPath, setWebhookPath] = useState('');
  const [eventType, setEventType] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [taskMode, setTaskMode] = useState('suggest');

  useEffect(() => {
    if (open) {
      setName(editing?.name ?? '');
      setType(editing?.type ?? 'cron');
      setTeamId(editing?.teamId ?? '');
      const cfg = editing?.config ?? {};
      setCronExpr((cfg.cron as string) ?? '');
      setWebhookPath((cfg.webhookPath as string) ?? '');
      setEventType((cfg.eventType as string) ?? '');
      const tpl = editing?.taskTemplate ?? { title: '', description: '', mode: 'suggest' };
      setTaskTitle(tpl.title ?? '');
      setTaskDescription(tpl.description ?? '');
      setTaskMode(tpl.mode ?? 'suggest');
    }
  }, [open, editing]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const config: Record<string, unknown> = {};
    if (type === 'cron') config.cron = cronExpr;
    if (type === 'webhook') config.webhookPath = webhookPath;
    if (type === 'event') config.eventType = eventType;
    onSave({
      name, type, config, teamId,
      taskTemplate: { title: taskTitle, description: taskDescription, mode: taskMode },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>{editing ? '编辑触发器' : '添加触发器'}</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label>名称</Label>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="触发器名称" required />
        </div>
        <div className="space-y-2">
          <Label>类型</Label>
          <select className="w-full border rounded-md px-3 py-2 text-sm bg-background" value={type} onChange={e => setType(e.target.value as 'cron' | 'webhook' | 'event')}>
            <option value="cron">定时 (Cron)</option>
            <option value="webhook">Webhook</option>
            <option value="event">事件</option>
          </select>
        </div>

        {type === 'cron' && (
          <div className="space-y-2">
            <Label>Cron 表达式</Label>
            <Input value={cronExpr} onChange={e => setCronExpr(e.target.value)} placeholder="*/5 (每5分钟)" />
            <p className="text-xs text-muted-foreground">MVP 仅支持 */N 分钟模式</p>
          </div>
        )}
        {type === 'webhook' && (
          <div className="space-y-2">
            <Label>Webhook 路径</Label>
            <Input value={webhookPath} onChange={e => setWebhookPath(e.target.value)} placeholder="my-webhook" />
            <p className="text-xs text-muted-foreground">触发地址: POST /api/webhooks/{webhookPath || '...'}</p>
          </div>
        )}
        {type === 'event' && (
          <div className="space-y-2">
            <Label>事件类型</Label>
            <Input value={eventType} onChange={e => setEventType(e.target.value)} placeholder="task_completed" />
          </div>
        )}

        <div className="space-y-2">
          <Label>关联团队</Label>
          <select className="w-full border rounded-md px-3 py-2 text-sm bg-background" value={teamId} onChange={e => setTeamId(e.target.value)} required>
            <option value="">请选择团队</option>
            {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>

        <div className="border-t pt-4 space-y-3">
          <p className="text-sm font-medium">任务模板</p>
          <div className="space-y-2">
            <Label>任务标题</Label>
            <Input value={taskTitle} onChange={e => setTaskTitle(e.target.value)} placeholder="任务标题" required />
          </div>
          <div className="space-y-2">
            <Label>任务描述</Label>
            <Textarea value={taskDescription} onChange={e => setTaskDescription(e.target.value)} placeholder="任务描述" rows={3} required />
          </div>
          <div className="space-y-2">
            <Label>执行模式</Label>
            <select className="w-full border rounded-md px-3 py-2 text-sm bg-background" value={taskMode} onChange={e => setTaskMode(e.target.value)}>
              <option value="suggest">建议模式 (suggest)</option>
              <option value="auto">自动模式 (auto)</option>
            </select>
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
