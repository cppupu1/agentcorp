import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { notificationsApi, type Notification } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { Bell, Check, CheckCheck, Loader2 } from 'lucide-react';

const typeLabels: Record<string, { label: string; variant: 'secondary' | 'success' | 'destructive' }> = {
  task_approval: { label: '审批', variant: 'secondary' },
  task_completed: { label: '完成', variant: 'success' },
  task_failed: { label: '失败', variant: 'destructive' },
  circuit_breaker: { label: '熔断', variant: 'destructive' },
  observer_alert: { label: '观察', variant: 'secondary' },
  trigger_fired: { label: '触发', variant: 'secondary' },
};

type FilterTab = 'all' | 'unread' | 'read';

export default function NotificationsPage() {
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<FilterTab>('all');
  const { toast } = useToast();
  const navigate = useNavigate();

  const load = useCallback(async () => {
    try {
      const readParam = tab === 'unread' ? 0 : tab === 'read' ? 1 : undefined;
      const res = await notificationsApi.list(readParam);
      setItems(res.data);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : '加载失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [tab, toast]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  const handleMarkRead = async (id: string) => {
    try {
      await notificationsApi.markRead(id);
      load();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : '操作失败', 'error');
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await notificationsApi.markAllRead();
      toast('已全部标记为已读', 'success');
      load();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : '操作失败', 'error');
    }
  };

  const tabs: { key: FilterTab; label: string }[] = [
    { key: 'all', label: '全部' },
    { key: 'unread', label: '未读' },
    { key: 'read', label: '已读' },
  ];

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold flex items-center gap-2">
          <Bell className="h-6 w-6" /> 通知中心
        </h2>
        <Button variant="outline" size="sm" onClick={handleMarkAllRead}>
          <CheckCheck className="h-4 w-4 mr-1" /> 全部已读
        </Button>
      </div>

      <div className="flex gap-2 mb-4">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              tab === t.key
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">暂无通知</div>
      ) : (
        <div className="space-y-2">
          {items.map(item => {
            const t = typeLabels[item.type] || { label: item.type, variant: 'secondary' as const };
            return (
              <div
                key={item.id}
                className={`border rounded-lg p-4 flex items-start gap-3 transition-colors ${
                  item.read ? 'opacity-60' : 'bg-card'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant={t.variant}>{t.label}</Badge>
                    <span className="font-medium text-sm">{item.title}</span>
                    {!item.read && <span className="h-2 w-2 rounded-full bg-blue-500 flex-shrink-0" />}
                  </div>
                  <p className="text-sm text-muted-foreground mb-1">{item.content}</p>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{new Date(item.createdAt).toLocaleString('zh-CN')}</span>
                    {item.taskId && (
                      <button
                        className="text-primary hover:underline"
                        onClick={() => navigate(`/tasks/${item.taskId}`)}
                      >
                        查看任务
                      </button>
                    )}
                  </div>
                </div>
                {!item.read && (
                  <Button variant="ghost" size="icon" onClick={() => handleMarkRead(item.id)} title="标记已读">
                    <Check className="h-4 w-4" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
