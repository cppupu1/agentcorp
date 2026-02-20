import { useState, useEffect, useCallback } from 'react';
import { observerApi, type ObserverFinding } from '@/api/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { Eye, AlertTriangle, CheckCircle, Loader2, RefreshCw } from 'lucide-react';

const SEVERITY_CONFIG: Record<string, { label: string; variant: 'default' | 'warning' | 'destructive' }> = {
  info: { label: '信息', variant: 'default' },
  warning: { label: '警告', variant: 'warning' },
  critical: { label: '严重', variant: 'destructive' },
};

const CATEGORY_LABELS: Record<string, string> = {
  factual_error: '事实错误',
  contradiction: '矛盾',
  goal_drift: '目标偏离',
  quality: '质量问题',
};

const RESOLUTION_LABELS: Record<string, string> = {
  acknowledged: '已确认',
  fixed: '已修复',
  dismissed: '已忽略',
};

export default function ObserverPanel({ taskId }: { taskId: string }) {
  const [findings, setFindings] = useState<ObserverFinding[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState<string | null>(null);
  const { toast } = useToast();

  const loadFindings = useCallback(async () => {
    try {
      const res = await observerApi.getFindings(taskId);
      setFindings(res.data);
    } catch {
      toast('加载观察者发现失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [taskId, toast]);

  useEffect(() => { loadFindings(); }, [loadFindings]);

  const handleResolve = async (findingId: string, resolution: string) => {
    setResolving(findingId);
    try {
      await observerApi.resolve(taskId, findingId, resolution);
      setFindings(prev => prev.map(f =>
        f.id === findingId ? { ...f, resolution } : f
      ));
      toast(`已标记为${RESOLUTION_LABELS[resolution] || resolution}`, 'success');
    } catch {
      toast('操作失败', 'error');
    } finally {
      setResolving(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (findings.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Eye className="h-8 w-8 mx-auto mb-2 opacity-40" />
        <p className="text-sm">暂无观察者发现</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-4">
        <Eye className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">
          共 {findings.length} 条发现，
          {findings.filter(f => !f.resolution).length} 条待处理
        </span>
        <Button size="sm" variant="ghost" className="ml-auto" onClick={() => loadFindings()}>
          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>
      {findings.map(finding => {
        const sev = SEVERITY_CONFIG[finding.severity] || SEVERITY_CONFIG.info;
        return (
          <div key={finding.id} className="border rounded-lg p-3 space-y-2">
            <div className="flex items-start gap-2">
              <div className="flex items-center gap-2 flex-1">
                {finding.severity === 'critical' ? (
                  <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
                ) : finding.resolution ? (
                  <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
                ) : (
                  <Eye className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
                <Badge variant={sev.variant} className="text-xs">{sev.label}</Badge>
                <Badge variant="outline" className="text-xs">{CATEGORY_LABELS[finding.category] || finding.category}</Badge>
                {finding.resolution && (
                  <Badge variant="secondary" className="text-xs">{RESOLUTION_LABELS[finding.resolution] || finding.resolution}</Badge>
                )}
              </div>
              <span className="text-xs text-muted-foreground shrink-0">
                {finding.observerName}
              </span>
            </div>
            <p className="text-sm pl-6">{finding.description}</p>
            {!finding.resolution && (
              <div className="flex gap-2 pl-6">
                <Button
                  size="sm" variant="outline"
                  disabled={resolving === finding.id}
                  onClick={() => handleResolve(finding.id, 'acknowledged')}
                >
                  {resolving === finding.id ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                  确认
                </Button>
                <Button
                  size="sm" variant="outline"
                  disabled={resolving === finding.id}
                  onClick={() => handleResolve(finding.id, 'fixed')}
                >
                  已修复
                </Button>
                <Button
                  size="sm" variant="ghost"
                  disabled={resolving === finding.id}
                  onClick={() => handleResolve(finding.id, 'dismissed')}
                >
                  忽略
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
