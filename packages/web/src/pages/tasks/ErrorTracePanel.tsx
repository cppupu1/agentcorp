import { useState, useEffect, useCallback } from 'react';
import { errorTraceApi, type ErrorTrace } from '@/api/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/i18n';
import { AlertOctagon, RefreshCw, ArrowRight } from 'lucide-react';

const ERROR_TYPE_KEYS: Record<string, { key: string; color: string }> = {
  validation_failed: { key: 'errorTrace.validationFailed', color: 'bg-warning/15 text-warning' },
  execution_error: { key: 'errorTrace.executionError', color: 'bg-destructive/15 text-destructive' },
  timeout: { key: 'errorTrace.timeout', color: 'bg-warning/20 text-warning' },
  quality_rejected: { key: 'errorTrace.qualityRejected', color: 'bg-primary/15 text-primary' },
};

const RESOLUTION_KEYS: Record<string, { key: string; icon: React.ReactNode }> = {
  retried: { key: 'errorTrace.retried', icon: <RefreshCw className="h-3 w-3" /> },
  reassigned: { key: 'errorTrace.reassigned', icon: <ArrowRight className="h-3 w-3" /> },
  skipped: { key: 'errorTrace.skipped', icon: null },
  escalated: { key: 'errorTrace.escalated', icon: <AlertOctagon className="h-3 w-3" /> },
};

export default function ErrorTracePanel({ taskId }: { taskId: string }) {
  const { t, locale } = useI18n();
  const [traces, setTraces] = useState<ErrorTrace[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const res = await errorTraceApi.getTrace(taskId);
      setTraces(res.data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [taskId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return <p className="text-sm text-muted-foreground py-4">{t('errorTrace.loading')}</p>;
  }

  if (traces.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-muted-foreground">{t('errorTrace.noRecords')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{t('errorTrace.count', { count: traces.length })}</p>
        <Button size="sm" variant="ghost" onClick={() => fetchData(true)} disabled={refreshing}>
          <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} />
        </Button>
      </div>
      <div className="relative">
        <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />
        {traces.map((trace) => {
          const typeInfo = ERROR_TYPE_KEYS[trace.errorType] || { key: '', color: 'bg-muted text-muted-foreground' };
          const resInfo = trace.resolution ? RESOLUTION_KEYS[trace.resolution] : null;
          return (
            <div key={trace.id} className="relative pl-10 pb-4">
              <div className="absolute left-2.5 top-1.5 w-3 h-3 rounded-full bg-destructive/60 border-2 border-background" />
              <div className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${typeInfo.color}`}>{typeInfo.key ? t(typeInfo.key) : trace.errorType}</span>
                  {trace.subtaskTitle && (
                    <span className="text-xs text-muted-foreground">{t('errorTrace.subtask', { title: trace.subtaskTitle })}</span>
                  )}
                  <span className="text-xs text-muted-foreground ml-auto">
                    {t('errorTrace.retry', { attempt: trace.retryAttempt })}
                  </span>
                </div>
                <p className="text-sm">{trace.errorMessage}</p>
                <div className="flex items-center gap-2">
                  {resInfo && (
                    <Badge variant="outline" className="text-xs gap-1">
                      {resInfo.icon}
                      {t(resInfo.key)}
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {new Date(trace.createdAt).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US')}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
