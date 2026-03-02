import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { taskReviewApi, type ReviewStats, type TaskReviewFinding } from '@/api/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';
import { useI18n } from '@/i18n';

const CATEGORY_KEYS: Record<string, string> = {
  model_issue: 'review.catModel',
  prompt_issue: 'review.catPrompt',
  tool_issue: 'review.catTool',
  config_issue: 'review.catConfig',
  collaboration_issue: 'review.catCollaboration',
  efficiency_issue: 'review.catEfficiency',
  other: 'review.catOther',
};

const SEVERITY_KEYS: Record<string, string> = {
  info: 'review.sevInfo',
  warning: 'review.sevWarning',
  critical: 'review.sevCritical',
};

export default function ReviewDashboardPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [tab, setTab] = useState('overview');
  const [stats, setStats] = useState<ReviewStats | null>(null);
  const [findings, setFindings] = useState<TaskReviewFinding[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filterCat, setFilterCat] = useState('');
  const [filterSev, setFilterSev] = useState('');

  useEffect(() => {
    taskReviewApi.getStats().then(res => setStats(res.data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const loadFindings = useCallback(async () => {
    try {
      const res = await taskReviewApi.listFindings({
        category: filterCat || undefined,
        severity: filterSev || undefined,
        limit: 50,
      });
      setFindings(res.data.findings);
      setTotal(res.data.total);
    } catch {
      toast(t('common.loadFailed'), 'error');
    }
  }, [filterCat, filterSev, toast, t]);

  useEffect(() => {
    if (tab === 'findings') loadFindings();
  }, [tab, loadFindings]);

  if (loading) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-24 rounded-2xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h2 className="text-3xl font-heading font-medium tracking-tight text-foreground/90 mb-6">{t('review.dashTitle')}</h2>

      <Tabs value={tab} onChange={setTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="overview">{t('review.tabOverview')}</TabsTrigger>
          <TabsTrigger value="findings">{t('review.tabFindings')}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          {stats && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard label={t('review.totalReviews')} value={stats.totalReviews} />
                <StatCard label={t('review.totalFindings')} value={stats.totalFindings} />
                <StatCard label={t('review.sevCritical')} value={stats.bySeverity.find(s => s.severity === 'critical')?.count || 0} className="text-destructive" />
                <StatCard label={t('review.sevWarning')} value={stats.bySeverity.find(s => s.severity === 'warning')?.count || 0} className="text-yellow-500" />
              </div>

              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-3">{t('review.colCategory')}</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {stats.byCategory.map(item => (
                    <div key={item.category} className="rounded-2xl bg-muted/40 p-3 border border-border/40">
                      <p className="text-xs text-muted-foreground">{t(CATEGORY_KEYS[item.category] || 'review.catOther')}</p>
                      <p className="text-lg font-medium">{item.count}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="findings">
          <div className="flex gap-3 mb-4 flex-wrap">
            <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
              className="text-sm border rounded-lg px-3 py-1.5 bg-background">
              <option value="">{t('review.filterAll')} - {t('review.filterCategory')}</option>
              {Object.entries(CATEGORY_KEYS).map(([k, v]) => (
                <option key={k} value={k}>{t(v)}</option>
              ))}
            </select>
            <select value={filterSev} onChange={e => setFilterSev(e.target.value)}
              className="text-sm border rounded-lg px-3 py-1.5 bg-background">
              <option value="">{t('review.filterAll')} - {t('review.filterSeverity')}</option>
              {Object.entries(SEVERITY_KEYS).map(([k, v]) => (
                <option key={k} value={k}>{t(v)}</option>
              ))}
            </select>
            <span className="text-sm text-muted-foreground self-center">{total} {t('review.totalFindings')}</span>
          </div>

          {findings.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">{t('review.noFindings')}</p>
          ) : (
            <div className="space-y-2">
              {findings.map(f => (
                <div key={f.id} className="rounded-2xl bg-muted/40 p-4 border border-border/40">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-sm font-medium">{f.title}</span>
                    <Badge variant={f.severity === 'critical' ? 'destructive' : f.severity === 'warning' ? 'outline' : 'secondary'} className="text-xs">
                      {t(SEVERITY_KEYS[f.severity] || 'review.sevInfo')}
                    </Badge>
                    <Badge variant="outline" className="text-xs">{t(CATEGORY_KEYS[f.category] || 'review.catOther')}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{f.description}</p>
                  {f.taskTitle && (
                    <button className="text-xs text-primary hover:underline mt-1"
                      onClick={() => navigate(`/tasks/${f.taskId}?tab=review`)}>
                      {t('review.colTask')}: {f.taskTitle}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatCard({ label, value, className }: { label: string; value: number; className?: string }) {
  return (
    <div className="rounded-2xl bg-card p-4 border border-border/40 shadow-[var(--shadow-sm)]">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-2xl font-medium ${className || ''}`}>{value}</p>
    </div>
  );
}
