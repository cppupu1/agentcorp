import { useState, useEffect, useCallback } from 'react';
import { observerApi, type ObserverFinding } from '@/api/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useI18n } from '@/i18n';
import { Eye, AlertTriangle, CheckCircle, Loader2, RefreshCw } from 'lucide-react';

const SEVERITY_KEYS: Record<string, { key: string; variant: 'default' | 'warning' | 'destructive' }> = {
  info: { key: 'observer.severityInfo', variant: 'default' },
  warning: { key: 'observer.severityWarning', variant: 'warning' },
  critical: { key: 'observer.severityCritical', variant: 'destructive' },
};

const CATEGORY_KEYS: Record<string, string> = {
  factual_error: 'observer.catFactualError',
  contradiction: 'observer.catContradiction',
  goal_drift: 'observer.catGoalDrift',
  quality: 'observer.catQuality',
};

const RESOLUTION_KEYS: Record<string, string> = {
  acknowledged: 'observer.resAcknowledged',
  fixed: 'observer.resFixed',
  dismissed: 'observer.resDismissed',
};

export default function ObserverPanel({ taskId }: { taskId: string }) {
  const { t } = useI18n();
  const [findings, setFindings] = useState<ObserverFinding[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState<string | null>(null);
  const { toast } = useToast();

  const loadFindings = useCallback(async () => {
    try {
      const res = await observerApi.getFindings(taskId);
      setFindings(res.data);
    } catch {
      toast(t('observer.loadFailed'), 'error');
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
      toast(t('observer.markedAs', { resolution: RESOLUTION_KEYS[resolution] ? t(RESOLUTION_KEYS[resolution]) : resolution }), 'success');
    } catch {
      toast(t('common.operationFailed'), 'error');
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
        <p className="text-sm">{t('observer.noFindings')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-4">
        <Eye className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">
          {t('observer.totalFindings', { total: findings.length, pending: findings.filter(f => !f.resolution).length })}
        </span>
        <Button size="sm" variant="ghost" className="ml-auto" onClick={() => loadFindings()}>
          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>
      {findings.map(finding => {
        const sev = SEVERITY_KEYS[finding.severity] || SEVERITY_KEYS.info;
        return (
          <div key={finding.id} className="border rounded-lg p-3 space-y-2">
            <div className="flex items-start gap-2">
              <div className="flex items-center gap-2 flex-1">
                {finding.severity === 'critical' ? (
                  <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
                ) : finding.resolution ? (
                  <CheckCircle className="h-4 w-4 text-success shrink-0" />
                ) : (
                  <Eye className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
                <Badge variant={sev.variant} className="text-xs">{t(sev.key)}</Badge>
                <Badge variant="outline" className="text-xs">{CATEGORY_KEYS[finding.category] ? t(CATEGORY_KEYS[finding.category]) : finding.category}</Badge>
                {finding.resolution && (
                  <Badge variant="secondary" className="text-xs">{RESOLUTION_KEYS[finding.resolution] ? t(RESOLUTION_KEYS[finding.resolution]) : finding.resolution}</Badge>
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
                  {t('observer.acknowledge')}
                </Button>
                <Button
                  size="sm" variant="outline"
                  disabled={resolving === finding.id}
                  onClick={() => handleResolve(finding.id, 'fixed')}
                >
                  {t('observer.fix')}
                </Button>
                <Button
                  size="sm" variant="ghost"
                  disabled={resolving === finding.id}
                  onClick={() => handleResolve(finding.id, 'dismissed')}
                >
                  {t('observer.dismiss')}
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
