import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router';
import { incidentsApi, type IncidentReport } from '@/api/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useI18n } from '@/i18n';
import { Loader2, ArrowLeft, Sparkles, Save } from 'lucide-react';

export default function IncidentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t, locale } = useI18n();
  const [report, setReport] = useState<IncidentReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    rootCause: '',
    impact: '',
    resolution: '',
    preventionPlan: '',
  });

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const res = await incidentsApi.get(id);
      setReport(res.data);
      setForm({
        rootCause: res.data.rootCause || '',
        impact: res.data.impact || '',
        resolution: res.data.resolution || '',
        preventionPlan: res.data.preventionPlan || '',
      });
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : t('common.loadFailed'), 'error');
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!id) return;
    setSaving(true);
    try {
      const res = await incidentsApi.update(id, form);
      setReport(res.data);
      toast(t('incidentDetail.saved'), 'success');
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : t('common.saveFailed'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleAnalyze = async () => {
    if (!id) return;
    setAnalyzing(true);
    try {
      const res = await incidentsApi.analyze(id);
      setReport(res.data);
      toast(t('incidentDetail.analysisDone'), 'success');
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : t('common.operationFailed'), 'error');
    } finally {
      setAnalyzing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!report) {
    return <div className="p-6 text-center text-muted-foreground">{t('incidentDetail.notFound')}</div>;
  }

  const triggerLabels: Record<string, { label: string; variant: 'destructive' | 'warning' | 'secondary' }> = {
    emergency_stop: { label: t('incidents.triggerEmergency'), variant: 'destructive' },
    circuit_breaker: { label: t('incidents.triggerCircuitBreaker'), variant: 'destructive' },
    observer_critical: { label: t('incidents.triggerObserver'), variant: 'warning' },
    manual: { label: t('incidents.triggerManual'), variant: 'secondary' },
  };
  const statusLabels: Record<string, { label: string; variant: 'secondary' | 'warning' | 'success' }> = {
    draft: { label: t('incidents.statusDraft'), variant: 'secondary' },
    analyzing: { label: t('incidents.statusAnalyzing'), variant: 'warning' },
    completed: { label: t('incidents.statusCompleted'), variant: 'success' },
  };
  const trigger = triggerLabels[report.triggerType] || { label: report.triggerType, variant: 'secondary' as const };
  const status = statusLabels[report.status || 'draft'] || { label: report.status, variant: 'secondary' as const };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <button onClick={() => navigate('/incidents')} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="h-4 w-4" /> {t('incidentDetail.backToList')}
      </button>

      <div className="flex items-center gap-3 mb-6">
        <h2 className="text-2xl font-bold tracking-tight">{t('incidentDetail.title')}</h2>
        <Badge variant={trigger.variant}>{trigger.label}</Badge>
        <Badge variant={status.variant}>{status.label}</Badge>
      </div>

      <div className="text-sm text-muted-foreground mb-6 space-y-1">
        <div>{t('incidentDetail.relatedTask', { title: report.taskTitle || t('incidents.unknownTask') })}</div>
        <div>{t('incidentDetail.createdAt', { time: new Date(report.createdAt).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US') })}</div>
      </div>

      {/* Timeline */}
      {report.timeline.length > 0 && (
        <div className="mb-8">
          <h3 className="text-lg font-medium mb-3">{t('incidentDetail.timeline')}</h3>
          <div className="relative pl-6 border-l-2 border-muted space-y-3">
            {report.timeline.map((event, i) => {
              const typeColors: Record<string, string> = {
                error: 'bg-destructive',
                finding: 'bg-warning',
                decision: 'bg-info',
                tool_call: 'bg-muted-foreground',
              };
              return (
                <div key={i} className="relative">
                  <div className={`absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full ${typeColors[event.type] || 'bg-muted-foreground'}`} />
                  <div className="text-xs text-muted-foreground">{new Date(event.time).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US')}</div>
                  <div className="text-sm">{event.summary}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Editable fields */}
      <div className="space-y-4 mb-8">
        {([
          { key: 'rootCause' as const, label: t('incidentDetail.rootCause') },
          { key: 'impact' as const, label: t('incidentDetail.impact') },
          { key: 'resolution' as const, label: t('incidentDetail.resolution') },
          { key: 'preventionPlan' as const, label: t('incidentDetail.preventionPlan') },
        ]).map(field => (
          <div key={field.key}>
            <label className="block text-sm font-medium mb-1">{field.label}</label>
            <textarea
              className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm resize-y"
              value={form[field.key]}
              onChange={e => setForm(prev => ({ ...prev, [field.key]: e.target.value }))}
              placeholder={t('incidentDetail.inputPlaceholder', { field: field.label })}
            />
          </div>
        ))}
        <Button onClick={handleSave} disabled={saving} className="gap-1">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {t('common.save')}
        </Button>
      </div>

      {/* AI Analysis */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-3">
          <h3 className="text-lg font-medium">{t('incidentDetail.aiAnalysis')}</h3>
          <Button size="sm" variant="outline" onClick={handleAnalyze} disabled={analyzing} className="gap-1">
            {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {analyzing ? t('incidentDetail.analyzing') : t('incidentDetail.analyze')}
          </Button>
        </div>
        {report.aiAnalysis ? (
          <div className="rounded-md border bg-muted/30 p-4 text-sm whitespace-pre-wrap">{report.aiAnalysis}</div>
        ) : (
          <div className="text-sm text-muted-foreground">{t('incidentDetail.noAnalysis')}</div>
        )}
      </div>
    </div>
  );
}
