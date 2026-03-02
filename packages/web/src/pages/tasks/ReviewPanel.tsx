import { useState, useEffect, useCallback } from 'react';
import { taskReviewApi, type TaskReview } from '@/api/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import MarkdownContent from '@/components/MarkdownContent';
import { Loader2, RefreshCw, AlertTriangle, Info, AlertCircle } from 'lucide-react';
import { useToast } from '@/components/ui/toast';
import { useI18n } from '@/i18n';

const SEVERITY_CONFIG: Record<string, { icon: typeof Info; color: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  info: { icon: Info, color: 'text-blue-500', variant: 'secondary' },
  warning: { icon: AlertTriangle, color: 'text-yellow-500', variant: 'outline' },
  critical: { icon: AlertCircle, color: 'text-destructive', variant: 'destructive' },
};

const CATEGORY_KEYS: Record<string, string> = {
  model_issue: 'review.catModel',
  prompt_issue: 'review.catPrompt',
  tool_issue: 'review.catTool',
  config_issue: 'review.catConfig',
  collaboration_issue: 'review.catCollaboration',
  efficiency_issue: 'review.catEfficiency',
  other: 'review.catOther',
};

export default function ReviewPanel({ taskId }: { taskId: string }) {
  const { t } = useI18n();
  const { toast } = useToast();
  const [review, setReview] = useState<TaskReview | null>(null);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);

  const loadReview = useCallback(async () => {
    try {
      const res = await taskReviewApi.getByTask(taskId);
      setReview(res.data);
    } catch (err) {
      // null response means no review yet; surface actual network errors
      if (err instanceof Error && err.message !== 'NOT_FOUND') {
        console.error('Failed to load review:', err);
      }
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => { loadReview(); }, [loadReview]);

  // Poll while analyzing, timeout after 2 minutes
  useEffect(() => {
    if (review?.status !== 'analyzing') return;
    const created = review.createdAt ? new Date(review.createdAt).getTime() : Date.now();
    const maxWait = 2 * 60 * 1000;
    const timer = setInterval(() => {
      if (Date.now() - created > maxWait) {
        clearInterval(timer);
        return;
      }
      loadReview();
    }, 3000);
    return () => clearInterval(timer);
  }, [review?.status, review?.createdAt, loadReview]);

  const handleTrigger = async () => {
    setTriggering(true);
    try {
      await taskReviewApi.trigger(taskId);
      toast(t('review.triggered'), 'success');
      await loadReview();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : t('common.operationFailed'), 'error');
    } finally {
      setTriggering(false);
    }
  };

  if (loading) {
    return <div className="space-y-3"><Skeleton className="h-20 rounded-2xl" /><Skeleton className="h-16 rounded-2xl" /></div>;
  }

  if (!review) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground mb-4">{t('review.noReview')}</p>
        <Button onClick={handleTrigger} disabled={triggering}>
          {triggering ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
          {t('review.startReview')}
        </Button>
      </div>
    );
  }

  if (review.status === 'analyzing') {
    return (
      <div className="text-center py-12">
        <Loader2 className="h-6 w-6 animate-spin mx-auto mb-3 text-primary" />
        <p className="text-muted-foreground">{t('review.analyzing')}</p>
      </div>
    );
  }

  if (review.status === 'failed') {
    return (
      <div className="text-center py-12">
        <p className="text-destructive mb-4">{t('common.operationFailed')}</p>
        <Button onClick={handleTrigger} disabled={triggering}>
          {triggering ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
          {t('review.retrigger')}
        </Button>
      </div>
    );
  }

  const findings = review.findings || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">{t('review.title')}</h3>
        <Button variant="outline" size="sm" onClick={handleTrigger} disabled={triggering}>
          {triggering ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
          {t('review.retrigger')}
        </Button>
      </div>

      {review.summary && (
        <div className="bg-card rounded-2xl p-5 border border-border/40 shadow-[var(--shadow-sm)]">
          <p className="text-sm text-muted-foreground mb-1">{t('review.summary')}</p>
          <MarkdownContent content={review.summary} className="text-sm" />
        </div>
      )}

      {findings.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">{t('review.noFindings')}</p>
      ) : (
        <div className="space-y-3">
          {findings.map(f => {
            const sev = SEVERITY_CONFIG[f.severity] || SEVERITY_CONFIG.info;
            const SevIcon = sev.icon;
            return (
              <div key={f.id} className="rounded-2xl bg-muted/40 p-4 border border-border/40">
                <div className="flex items-start gap-3">
                  <SevIcon className={`h-4 w-4 mt-0.5 shrink-0 ${sev.color}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-sm font-medium">{f.title}</span>
                      <Badge variant={sev.variant} className="text-xs">{t(`review.sev${f.severity.charAt(0).toUpperCase() + f.severity.slice(1)}`)}</Badge>
                      <Badge variant="outline" className="text-xs">{t(CATEGORY_KEYS[f.category] || 'review.catOther')}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{f.description}</p>
                    {f.suggestion && (
                      <div className="mt-2 text-sm text-primary/80">
                        <span className="font-medium">{t('review.suggestion')}:</span> {f.suggestion}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
