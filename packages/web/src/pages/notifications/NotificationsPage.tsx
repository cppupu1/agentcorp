import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { notificationsApi, type Notification } from '@/api/client';
import MarkdownContent from '@/components/MarkdownContent';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { useI18n } from '@/i18n';
import { Bell, Check, CheckCheck, Loader2 } from 'lucide-react';

const typeKeys: Record<string, { key: string; variant: 'secondary' | 'success' | 'destructive' }> = {
  task_approval: { key: 'notifications.typeApproval', variant: 'secondary' },
  task_completed: { key: 'notifications.typeCompleted', variant: 'success' },
  task_failed: { key: 'notifications.typeFailed', variant: 'destructive' },
  circuit_breaker: { key: 'notifications.typeCircuitBreaker', variant: 'destructive' },
  observer_alert: { key: 'notifications.typeObserver', variant: 'secondary' },
  trigger_fired: { key: 'notifications.typeTrigger', variant: 'secondary' },
  improvement_suggestion: { key: 'notifications.typeImprovementSuggestion', variant: 'secondary' },
};

type FilterTab = 'all' | 'unread' | 'read';

export default function NotificationsPage() {
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<FilterTab>('all');
  const { toast } = useToast();
  const { t, locale } = useI18n();
  const navigate = useNavigate();

  const load = useCallback(async () => {
    try {
      const readParam = tab === 'unread' ? 0 : tab === 'read' ? 1 : undefined;
      const res = await notificationsApi.list(readParam);
      setItems(res.data);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : t('common.loadFailed'), 'error');
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
      toast(err instanceof Error ? err.message : t('common.operationFailed'), 'error');
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await notificationsApi.markAllRead();
      toast(t('notifications.allMarkedRead'), 'success');
      load();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : t('common.operationFailed'), 'error');
    }
  };

  const tabs: { key: FilterTab; label: string }[] = [
    { key: 'all', label: t('notifications.tabAll') },
    { key: 'unread', label: t('notifications.tabUnread') },
    { key: 'read', label: t('notifications.tabRead') },
  ];

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8 pb-4 border-b border-border/40">
        <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Bell className="h-6 w-6" /> {t('notifications.title')}
        </h2>
        <Button variant="outline" size="sm" onClick={handleMarkAllRead}>
          <CheckCheck className="h-4 w-4 mr-1" /> {t('notifications.markAllRead')}
        </Button>
      </div>

      <div className="flex gap-2 mb-4">
        {tabs.map(item => (
          <button
            key={item.key}
            onClick={() => setTab(item.key)}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              tab === item.key
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-[15px] text-muted-foreground bg-muted/30 rounded-3xl border border-dashed border-border/50">{t('notifications.empty')}</div>
      ) : (
        <div className="space-y-2">
          {items.map(item => {
            const tp = typeKeys[item.type] || { key: '', variant: 'secondary' as const };
            return (
              <div
                key={item.id}
                className={`bg-card rounded-3xl p-6 border border-border/40 flex items-start gap-3 transition-all shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] ${
                  item.read ? 'opacity-60' : ''
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant={tp.variant}>{tp.key ? t(tp.key) : item.type}</Badge>
                    <span className="font-medium text-sm">{item.title}</span>
                    {!item.read && <span className="h-2 w-2 rounded-full bg-blue-500 flex-shrink-0" />}
                  </div>
                  <MarkdownContent content={item.content} className="text-sm text-muted-foreground mb-1" />
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{new Date(item.createdAt).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US')}</span>
                    {item.taskId && (
                      <button
                        className="text-primary hover:underline"
                        onClick={() => navigate(`/tasks/${item.taskId}`)}
                      >
                        {t('notifications.viewTask')}
                      </button>
                    )}
                    {item.taskId && item.type === 'task_completed' && (
                      <button
                        className="text-primary hover:underline"
                        onClick={() => navigate(`/tasks/${item.taskId}`, { state: { openTab: 'review' } })}
                      >
                        {t('notifications.viewReport')}
                      </button>
                    )}
                  </div>
                </div>
                {!item.read && (
                  <Button variant="ghost" size="icon" onClick={() => handleMarkRead(item.id)} title={t('notifications.markRead')}>
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
