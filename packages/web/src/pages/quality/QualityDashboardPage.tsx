import { useState, useEffect, useCallback } from 'react';
import { qualityApi, type QualityTrendData, type QualityRankingItem, type QualityAlerts } from '@/api/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { Loader2 } from 'lucide-react';
import { useI18n } from '@/i18n';

type Tab = 'trend' | 'ranking' | 'alerts';

export default function QualityDashboardPage() {
  const [tab, setTab] = useState<Tab>('trend');
  const { t } = useI18n();

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h2 className="text-2xl font-bold tracking-tight mb-4">{t('quality.title')}</h2>
      <div className="flex gap-2 mb-6">
        {([['trend', t('quality.tabTrend')], ['ranking', t('quality.tabRanking')], ['alerts', t('quality.tabAlerts')]] as [Tab, string][]).map(([key, label]) => (
          <Button key={key} variant={tab === key ? 'default' : 'outline'} size="sm" onClick={() => setTab(key)}>
            {label}
          </Button>
        ))}
      </div>
      {tab === 'trend' && <TrendTab />}
      {tab === 'ranking' && <RankingTab />}
      {tab === 'alerts' && <AlertsTab />}
    </div>
  );
}

function TrendTab() {
  const [data, setData] = useState<QualityTrendData | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { t } = useI18n();

  useEffect(() => {
    qualityApi.getTrend().then(r => setData(r.data)).catch(e => toast(e.message, 'error')).finally(() => setLoading(false));
  }, [toast]);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (!data) return <div className="text-center py-12 text-muted-foreground">{t('common.noData')}</div>;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium mb-3">{t('quality.testTrend')}</h3>
        {data.testTrend.length === 0 ? <p className="text-muted-foreground text-sm">{t('quality.noTestData')}</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b">
                <th className="text-left py-2 px-3">{t('quality.colDate')}</th>
                <th className="text-right py-2 px-3">{t('quality.colRuns')}</th>
                <th className="text-right py-2 px-3">{t('quality.colTotalScenarios')}</th>
                <th className="text-right py-2 px-3">{t('quality.colPassed')}</th>
                <th className="text-right py-2 px-3">{t('quality.colFailed')}</th>
                <th className="text-right py-2 px-3">{t('quality.colPassRate')}</th>
              </tr></thead>
              <tbody>
                {data.testTrend.map(r => (
                  <tr key={r.period} className="border-b">
                    <td className="py-2 px-3">{r.period}</td>
                    <td className="text-right py-2 px-3">{r.totalRuns}</td>
                    <td className="text-right py-2 px-3">{r.totalScenarios}</td>
                    <td className="text-right py-2 px-3 text-success">{r.passedScenarios}</td>
                    <td className="text-right py-2 px-3 text-destructive">{r.failedScenarios}</td>
                    <td className="text-right py-2 px-3">{r.totalScenarios > 0 ? Math.round(r.passedScenarios / r.totalScenarios * 100) : 0}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div>
        <h3 className="text-lg font-medium mb-3">{t('quality.findingTrend')}</h3>
        {data.findingTrend.length === 0 ? <p className="text-muted-foreground text-sm">{t('quality.noFindingData')}</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b">
                <th className="text-left py-2 px-3">{t('quality.colDate')}</th>
                <th className="text-right py-2 px-3">{t('quality.colTotal')}</th>
                <th className="text-right py-2 px-3">{t('quality.colCritical')}</th>
                <th className="text-right py-2 px-3">{t('quality.colWarning')}</th>
              </tr></thead>
              <tbody>
                {data.findingTrend.map(r => (
                  <tr key={r.period} className="border-b">
                    <td className="py-2 px-3">{r.period}</td>
                    <td className="text-right py-2 px-3">{r.total}</td>
                    <td className="text-right py-2 px-3 text-destructive">{r.critical}</td>
                    <td className="text-right py-2 px-3 text-warning">{r.warning}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function RankingTab() {
  const [data, setData] = useState<QualityRankingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { t } = useI18n();

  useEffect(() => {
    qualityApi.getRanking().then(r => setData(r.data)).catch(e => toast(e.message, 'error')).finally(() => setLoading(false));
  }, [toast]);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (data.length === 0) return <div className="text-center py-12 text-muted-foreground">{t('quality.noRankingData')}</div>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="border-b">
          <th className="text-left py-2 px-3">{t('quality.colRank')}</th>
          <th className="text-left py-2 px-3">{t('quality.colEmployee')}</th>
          <th className="text-right py-2 px-3">{t('quality.colTestCount')}</th>
          <th className="text-right py-2 px-3">{t('quality.colTotalScenarios')}</th>
          <th className="text-right py-2 px-3">{t('quality.colPassed')}</th>
          <th className="text-right py-2 px-3">{t('quality.colPassRate')}</th>
        </tr></thead>
        <tbody>
          {data.map((r, i) => (
            <tr key={r.employeeId} className="border-b">
              <td className="py-2 px-3">{i + 1}</td>
              <td className="py-2 px-3">{r.employeeName}</td>
              <td className="text-right py-2 px-3">{r.totalRuns}</td>
              <td className="text-right py-2 px-3">{r.totalScenarios}</td>
              <td className="text-right py-2 px-3">{r.passedScenarios}</td>
              <td className="text-right py-2 px-3">
                <Badge variant={r.passRate >= 80 ? 'success' : r.passRate >= 60 ? 'warning' : 'destructive'}>
                  {r.passRate}%
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AlertsTab() {
  const [data, setData] = useState<QualityAlerts | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { t, locale } = useI18n();

  useEffect(() => {
    qualityApi.getAlerts().then(r => setData(r.data)).catch(e => toast(e.message, 'error')).finally(() => setLoading(false));
  }, [toast]);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (!data) return <div className="text-center py-12 text-muted-foreground">{t('common.noData')}</div>;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium mb-3">{t('quality.qualityDropAlerts')}</h3>
        {data.qualityDropAlerts.length === 0 ? <p className="text-muted-foreground text-sm">{t('quality.noDropAlerts')}</p> : (
          <div className="space-y-2">
            {data.qualityDropAlerts.map(a => (
              <div key={a.employeeId} className="bg-card rounded-2xl p-4 shadow-[var(--shadow-sm)]">
                <div className="flex items-center gap-2">
                  <Badge variant="destructive">{t('quality.drop', { value: a.drop })}</Badge>
                  <span className="font-medium">{a.employeeName}</span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {t('quality.passRateChange', { from: a.previousRate, to: a.currentRate })}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
      <div>
        <h3 className="text-lg font-medium mb-3">{t('quality.criticalFindings')}</h3>
        {data.criticalFindings.length === 0 ? <p className="text-muted-foreground text-sm">{t('quality.noCriticalFindings')}</p> : (
          <div className="space-y-2">
            {data.criticalFindings.map(f => (
              <div key={f.id} className="bg-card rounded-2xl p-4 shadow-[var(--shadow-sm)]">
                <Badge variant="destructive">{t('quality.critical')}</Badge>
                <p className="text-sm mt-1">{f.description}</p>
                <p className="text-xs text-muted-foreground mt-1">{new Date(f.createdAt).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US')}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
