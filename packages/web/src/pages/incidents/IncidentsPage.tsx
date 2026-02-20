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
import { Loader2, Plus, Trash2 } from 'lucide-react';

const triggerLabels: Record<string, { label: string; variant: 'destructive' | 'warning' | 'secondary' }> = {
  emergency_stop: { label: '紧急停止', variant: 'destructive' },
  circuit_breaker: { label: '熔断', variant: 'destructive' },
  observer_critical: { label: '观察者告警', variant: 'warning' },
  manual: { label: '手动创建', variant: 'secondary' },
};

const statusLabels: Record<string, { label: string; variant: 'secondary' | 'warning' | 'success' }> = {
  draft: { label: '草稿', variant: 'secondary' },
  analyzing: { label: '分析中', variant: 'warning' },
  completed: { label: '已完成', variant: 'success' },
};

export default function IncidentsPage() {
  const [items, setItems] = useState<IncidentReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<IncidentReport | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  const load = useCallback(async () => {
    try {
      const res = await incidentsApi.list();
      setItems(res.data);
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
      await incidentsApi.delete(deleteTarget.id);
      toast('已删除', 'success');
      setDeleteTarget(null);
      load();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : '删除失败', 'error');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold">事故复盘</h2>
        <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-1">
          <Plus className="h-4 w-4" /> 手动创建
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">暂无事故报告</div>
      ) : (
        <div className="space-y-2">
          {items.map(item => {
            const trigger = triggerLabels[item.triggerType] || { label: item.triggerType, variant: 'secondary' as const };
            const status = statusLabels[item.status || 'draft'] || { label: item.status, variant: 'secondary' as const };
            return (
              <div
                key={item.id}
                onClick={() => navigate(`/incidents/${item.id}`)}
                className="border rounded-lg p-4 flex items-center gap-3 cursor-pointer hover:bg-muted/50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant={trigger.variant}>{trigger.label}</Badge>
                    <Badge variant={status.variant}>{status.label}</Badge>
                    <span className="font-medium text-sm truncate">{item.taskTitle || '未知任务'}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(item.createdAt).toLocaleString('zh-CN')}
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); setDeleteTarget(item); }} title="删除">
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
        title="删除事故报告"
        description={`确定要删除此事故报告吗？`}
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

  useEffect(() => { if (open) setTaskId(''); }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskId.trim()) return;
    setSaving(true);
    try {
      const res = await incidentsApi.create({ taskId: taskId.trim(), triggerType: 'manual' });
      onCreated(res.data.id);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : '创建失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>手动创建事故报告</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label>关联任务 ID</Label>
          <Input value={taskId} onChange={e => setTaskId(e.target.value)} placeholder="输入任务 ID" required />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button type="submit" disabled={saving}>{saving ? '创建中...' : '创建'}</Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
