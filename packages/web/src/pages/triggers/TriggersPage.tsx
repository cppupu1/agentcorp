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
import { EmptyState } from '@/components/ui/empty-state';
import { Plus, Pencil, Trash2, Zap, Loader2 } from 'lucide-react';
import { useI18n } from '@/i18n';

const typeVariant: Record<string, 'secondary' | 'success' | 'destructive'> = {
  cron: 'secondary',
  webhook: 'success',
  event: 'destructive',
};
const typeLabelKey: Record<string, string> = {
  cron: 'triggers.typeCron',
  webhook: 'triggers.typeWebhook',
  event: 'triggers.typeEvent',
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
  const { t, locale } = useI18n();

  const load = useCallback(async () => {
    try {
      const [trigRes, teamRes] = await Promise.all([
        triggersApi.list(),
        teamsApi.list(),
      ]);
      setTriggers(trigRes.data);
      setTeams(teamRes.data);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : t('common.loadFailed'), 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const handleToggleEnabled = async (trigger: Trigger) => {
    try {
      await triggersApi.update(trigger.id, { enabled: !trigger.enabled });
      toast(trigger.enabled ? t('triggers.disabled') : t('triggers.enabled'), 'success');
      load();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : t('common.operationFailed'), 'error');
    }
  };

  const handleFire = async (trigger: Trigger) => {
    setFiringId(trigger.id);
    try {
      const res = await triggersApi.fire(trigger.id);
      toast(t('triggers.fired', { taskId: res.data.taskId }), 'success');
      load();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : t('common.operationFailed'), 'error');
    } finally {
      setFiringId(null);
    }
  };

  const handleSave = async (input: TriggerInput) => {
    setSaving(true);
    try {
      if (editing) {
        await triggersApi.update(editing.id, input);
        toast(t('triggers.updated'), 'success');
      } else {
        await triggersApi.create(input);
        toast(t('triggers.created'), 'success');
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
      await triggersApi.delete(deleteTarget.id);
      toast(t('triggers.deleted'), 'success');
      setDeleteTarget(null);
      load();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : t('common.deleteFailed'), 'error');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold tracking-tight">{t('triggers.title')}</h2>
        <Button onClick={() => { setEditing(null); setFormOpen(true); }}>
          <Plus className="h-4 w-4" /> {t('triggers.add')}
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : triggers.length === 0 ? (
        <EmptyState icon={<Zap className="h-10 w-10" />} title={t('triggers.empty')} description={t('triggers.emptyDesc')} action={<Button onClick={() => { setEditing(null); setFormOpen(true); }}><Plus className="h-4 w-4" /> {t('triggers.add')}</Button>} />
      ) : (
        <div className="space-y-2">
          {triggers.map(trig => {
            const variant = typeVariant[trig.type] || typeVariant.event;
            const typeLabel = t(typeLabelKey[trig.type] || typeLabelKey.event);
            return (
              <div key={trig.id} className="bg-card rounded-2xl p-5 shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] transition-all">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm">{trig.name}</div>
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                      <Badge variant={variant}>{typeLabel}</Badge>
                      {trig.teamName && <span>{trig.teamName}</span>}
                      <span>{trig.lastFiredAt ? new Date(trig.lastFiredAt).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US') : '-'}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleToggleEnabled(trig)}
                      className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                        trig.enabled ? 'bg-success/15 text-success hover:bg-success/25' : 'bg-muted text-muted-foreground hover:bg-muted/80'
                      }`}
                    >
                      {trig.enabled ? t('triggers.enabled') : t('triggers.disabled')}
                    </button>
                    <Button variant="ghost" size="sm" onClick={() => handleFire(trig)} disabled={firingId === trig.id}>
                      {firingId === trig.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => { setEditing(trig); setFormOpen(true); }}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(trig)}>
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
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
        title={t('triggers.deleteTrigger')}
        description={t('triggers.deleteConfirm', { name: deleteTarget?.name ?? '' })}
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
  const { t } = useI18n();
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
        <DialogTitle>{editing ? t('triggers.editTrigger') : t('triggers.addTrigger')}</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label>{t('triggers.name')}</Label>
          <Input value={name} onChange={e => setName(e.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label>{t('triggers.type')}</Label>
          <select className="w-full h-10 rounded-xl border-0 bg-muted px-3 py-1 text-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50" value={type} onChange={e => setType(e.target.value as 'cron' | 'webhook' | 'event')}>
            <option value="cron">{t('triggers.typeCron')}</option>
            <option value="webhook">{t('triggers.typeWebhook')}</option>
            <option value="event">{t('triggers.typeEvent')}</option>
          </select>
        </div>

        {type === 'cron' && (
          <div className="space-y-2">
            <Label>{t('triggers.cronExpr')}</Label>
            <Input value={cronExpr} onChange={e => setCronExpr(e.target.value)} placeholder="*/5" />
            <p className="text-xs text-muted-foreground">{t('triggers.cronHint')}</p>
          </div>
        )}
        {type === 'webhook' && (
          <div className="space-y-2">
            <Label>{t('triggers.webhookPath')}</Label>
            <Input value={webhookPath} onChange={e => setWebhookPath(e.target.value)} placeholder="my-webhook" />
            <p className="text-xs text-muted-foreground">{t('triggers.webhookHint', { path: webhookPath || '...' })}</p>
          </div>
        )}
        {type === 'event' && (
          <div className="space-y-2">
            <Label>{t('triggers.eventType')}</Label>
            <Input value={eventType} onChange={e => setEventType(e.target.value)} placeholder="task_completed" />
          </div>
        )}

        <div className="space-y-2">
          <Label>{t('triggers.team')}</Label>
          <select className="w-full h-10 rounded-xl border-0 bg-muted px-3 py-1 text-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50" value={teamId} onChange={e => setTeamId(e.target.value)} required>
            <option value="">{t('triggers.selectTeam')}</option>
            {teams.map(tm => <option key={tm.id} value={tm.id}>{tm.name}</option>)}
          </select>
        </div>

        <div className="border-t pt-4 space-y-3">
          <p className="text-sm font-medium">{t('triggers.taskTemplate')}</p>
          <div className="space-y-2">
            <Label>{t('triggers.taskTitle')}</Label>
            <Input value={taskTitle} onChange={e => setTaskTitle(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label>{t('triggers.taskDesc')}</Label>
            <Textarea value={taskDescription} onChange={e => setTaskDescription(e.target.value)} rows={3} required />
          </div>
          <div className="space-y-2">
            <Label>{t('triggers.execMode')}</Label>
            <select className="w-full h-10 rounded-xl border-0 bg-muted px-3 py-1 text-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50" value={taskMode} onChange={e => setTaskMode(e.target.value)}>
              <option value="suggest">{t('triggers.suggestMode')}</option>
              <option value="auto">{t('triggers.autoMode')}</option>
            </select>
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
