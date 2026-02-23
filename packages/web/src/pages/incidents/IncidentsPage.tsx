import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { incidentsApi, type IncidentReport } from '@/api/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { useI18n } from '@/i18n';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2, Plus, Trash2 } from 'lucide-react';

export default function IncidentsPage() {
  const [items, setItems] = useState<IncidentReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<IncidentReport | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { toast } = useToast();
  const { t, locale } = useI18n();
  const navigate = useNavigate();

  const triggerLabels: Record<string, { label: string; variant: 'destructive' | 'warning' | 'secondary' }> = {
    emergency_stop: { label: t('incidents.triggerEmergency'), variant: 'destructive' },
    circuit_breaker: { label: t('incidents.triggerCircuitBreaker'), variant: 'destructive' },
    observer_critical: { label: t('incidents.triggerObserver'), variant: 'warning' },
    manual: { label: t('incidents.triggerManual'), variant: 'secondary' },
  };

  const statusLabels: Record<string, { label: string; variant: 'secondary' | 'warning' | 'success' }> = {
    draft: { label: t('incidents.statusDraft'), variant: 'secondary' },
    analyzing: { label: t('incidents.statusAnalyzing'), variant: 'warning' },
    completed: { label: t('incidents.statusCompleted'), variant: 'success' },
  };

  const load = useCallback(async () => {
    try {
      const res = await incidentsApi.list();
      setItems(res.data);
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
      await incidentsApi.delete(deleteTarget.id);
      toast(t('incidents.deleted'), 'success');
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
        <h2 className="text-2xl font-bold tracking-tight">{t('incidents.title')}</h2>
        <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-1">
          <Plus className="h-4 w-4" /> {t('incidents.manualCreate')}
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-16 rounded-2xl" />)}</div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-muted-foreground">{t('incidents.empty')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(item => {
            const trigger = triggerLabels[item.triggerType] || { label: item.triggerType, variant: 'secondary' as const };
            const status = statusLabels[item.status || 'draft'] || { label: item.status, variant: 'secondary' as const };
            return (
              <div
                key={item.id}
                onClick={() => navigate(`/incidents/${item.id}`)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') navigate(`/incidents/${item.id}`); }}
                role="button"
                tabIndex={0}
                className="bg-card rounded-2xl p-5 flex items-center gap-3 cursor-pointer shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] transition-all"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant={trigger.variant}>{trigger.label}</Badge>
                    <Badge variant={status.variant}>{status.label}</Badge>
                    <span className="font-medium text-sm truncate">{item.taskTitle || t('incidents.unknownTask')}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(item.createdAt).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US')}
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); setDeleteTarget(item); }} title={t('common.delete')}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      <CreateIncidentDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(id) => { setCreateOpen(false); load(); navigate(`/incidents/${id}`); }}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={() => setDeleteTarget(null)}
        title={t('incidents.deleteIncident')}
        description={t('incidents.deleteConfirm')}
        onConfirm={handleDelete}
        loading={deleting}
      />
    </div>
  );
}

function CreateIncidentDialog({
  open, onOpenChange, onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (id: string) => void;
}) {
  const [taskId, setTaskId] = useState('');
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const { t } = useI18n();

  useEffect(() => { if (open) setTaskId(''); }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskId.trim()) return;
    setSaving(true);
    try {
      const res = await incidentsApi.create({ taskId: taskId.trim(), triggerType: 'manual' });
      onCreated(res.data.id);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : t('incidents.createFailed'), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>{t('incidents.createDialog')}</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label>{t('incidents.taskId')}</Label>
          <Input value={taskId} onChange={e => setTaskId(e.target.value)} placeholder={t('incidents.taskIdPlaceholder')} required />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
          <Button type="submit" disabled={saving}>{saving ? t('common.creating') : t('common.create')}</Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
