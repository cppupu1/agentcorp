import { useState, useEffect, useCallback } from 'react';
import { errorTraceApi, type ErrorTrace } from '@/api/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertOctagon, RefreshCw, ArrowRight } from 'lucide-react';

const ERROR_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  validation_failed: { label: '校验失败', color: 'bg-yellow-100 text-yellow-800' },
  execution_error: { label: '执行错误', color: 'bg-red-100 text-red-800' },
  timeout: { label: '超时', color: 'bg-orange-100 text-orange-800' },
  quality_rejected: { label: '质量不合格', color: 'bg-purple-100 text-purple-800' },
};

const RESOLUTION_LABELS: Record<string, { label: string; icon: React.ReactNode }> = {
  retried: { label: '已重试', icon: <RefreshCw className="h-3 w-3" /> },
  reassigned: { label: '已重新分配', icon: <ArrowRight className="h-3 w-3" /> },
  skipped: { label: '已跳过', icon: null },
  escalated: { label: '已上报', icon: <AlertOctagon className="h-3 w-3" /> },
};

export default function ErrorTracePanel({ taskId }: { taskId: string }) {
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
    return <p className="text-sm text-muted-foreground py-4">加载中...</p>;
  }

  if (traces.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-muted-foreground">暂无错误记录</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{traces.length} 条错误记录</p>
        <Button size="sm" variant="ghost" onClick={() => fetchData(true)} disabled={refreshing}>
          <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} />
        </Button>
      </div>
      <div className="relative">
        <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />
        {traces.map((trace) => {
          const typeInfo = ERROR_TYPE_LABELS[trace.errorType] || { label: trace.errorType, color: 'bg-gray-100 text-gray-800' };
          const resInfo = trace.resolution ? RESOLUTION_LABELS[trace.resolution] : null;
          return (
            <div key={trace.id} className="relative pl-10 pb-4">
              <div className="absolute left-2.5 top-1.5 w-3 h-3 rounded-full bg-destructive/60 border-2 border-background" />
              <div className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${typeInfo.color}`}>{typeInfo.label}</span>
                  {trace.subtaskTitle && (
                    <span className="text-xs text-muted-foreground">子任务: {trace.subtaskTitle}</span>
                  )}
                  <span className="text-xs text-muted-foreground ml-auto">
                    重试 #{trace.retryAttempt}
                  </span>
                </div>
                <p className="text-sm">{trace.errorMessage}</p>
                <div className="flex items-center gap-2">
                  {resInfo && (
                    <Badge variant="outline" className="text-xs gap-1">
                      {resInfo.icon}
                      {resInfo.label}
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {new Date(trace.createdAt).toLocaleString()}
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
