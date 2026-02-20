import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router';
import { incidentsApi, type IncidentReport } from '@/api/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { Loader2, ArrowLeft, Sparkles, Save } from 'lucide-react';

const triggerLabels: Record<string, { label: string; variant: 'destructive' | 'warning' | 'secondary' }> = {
  emergency_stop: { label: '紧急停止', variant: 'destructive' },
  circuit_breaker: { label: '熔断', variant: 'destructive' },
  observer_critical: { label: '观察者告警', variant: 'warning' },
  manual: { label: '手动创建', variant: 'secondary' },
};

const statusLabels: Record<string, { label: string; variant: 'secondary' | 'warning' | 'success' }> = {
  draft: { label: '草稿', variant: 'secondary' },
  analyzing: { label: '分析中', variant: 'warning' },
  completed: { label: '已完成', variant: 'success' },
};

export default function IncidentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
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
      toast(err instanceof Error ? err.message : '加载失败', 'error');
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
      toast('已保存', 'success');
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : '保存失败', 'error');
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
      toast('AI分析完成', 'success');
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : '分析失败', 'error');
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
    return <div className="p-6 text-center text-muted-foreground">报告不存在</div>;
  }

  const trigger = triggerLabels[report.triggerType] || { label: report.triggerType, variant: 'secondary' as const };
  const status = statusLabels[report.status || 'draft'] || { label: report.status, variant: 'secondary' as const };

  return (
    <div className="p-6 max-w-4xl">
      <button onClick={() => navigate('/incidents')} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="h-4 w-4" /> 返回列表
      </button>

      <div className="flex items-center gap-3 mb-6">
        <h2 className="text-2xl font-semibold">事故报告</h2>
        <Badge variant={trigger.variant}>{trigger.label}</Badge>
        <Badge variant={status.variant}>{status.label}</Badge>
      </div>

      <div className="text-sm text-muted-foreground mb-6 space-y-1">
        <div>关联任务：{report.taskTitle || '未知'}</div>
        <div>创建时间：{new Date(report.createdAt).toLocaleString('zh-CN')}</div>
      </div>

      {/* Timeline */}
      {report.timeline.length > 0 && (
        <div className="mb-8">
          <h3 className="text-lg font-medium mb-3">事件时间线</h3>
          <div className="relative pl-6 border-l-2 border-muted space-y-3">
            {report.timeline.map((event, i) => {
              const typeColors: Record<string, string> = {
                error: 'bg-red-500',
                finding: 'bg-yellow-500',
                decision: 'bg-blue-500',
                tool_call: 'bg-gray-400',
              };
              return (
                <div key={i} className="relative">
                  <div className={`absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full ${typeColors[event.type] || 'bg-gray-400'}`} />
                  <div className="text-xs text-muted-foreground">{new Date(event.time).toLocaleString('zh-CN')}</div>
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
          { key: 'rootCause' as const, label: '根因分析' },
          { key: 'impact' as const, label: '影响评估' },
          { key: 'resolution' as const, label: '解决方案' },
          { key: 'preventionPlan' as const, label: '预防计划' },
        ]).map(field => (
          <div key={field.key}>
            <label className="block text-sm font-medium mb-1">{field.label}</label>
            <textarea
              className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm resize-y"
              value={form[field.key]}
              onChange={e => setForm(prev => ({ ...prev, [field.key]: e.target.value }))}
              placeholder={`输入${field.label}...`}
            />
          </div>
        ))}
        <Button onClick={handleSave} disabled={saving} className="gap-1">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          保存
        </Button>
      </div>

      {/* AI Analysis */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-3">
          <h3 className="text-lg font-medium">AI 分析</h3>
          <Button size="sm" variant="outline" onClick={handleAnalyze} disabled={analyzing} className="gap-1">
            {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {analyzing ? '分析中...' : '分析'}
          </Button>
        </div>
        {report.aiAnalysis ? (
          <div className="rounded-md border bg-muted/30 p-4 text-sm whitespace-pre-wrap">{report.aiAnalysis}</div>
        ) : (
          <div className="text-sm text-muted-foreground">尚未进行AI分析，点击上方按钮开始</div>
        )}
      </div>
    </div>
  );
}
