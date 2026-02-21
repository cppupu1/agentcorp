import { useState, useEffect, useCallback } from 'react';
import { improvementApi, employeesApi, type ImprovementProposal, type Employee } from '@/api/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { useToast } from '@/components/ui/toast';
import { Loader2 } from 'lucide-react';
import { useI18n } from '@/i18n';

type Tab = 'diagnose' | 'proposals';

export default function ImprovementPage() {
  const [tab, setTab] = useState<Tab>('diagnose');
  const { t } = useI18n();

  return (
    <div className="p-6 max-w-5xl">
      <h2 className="text-2xl font-semibold mb-4">{t('improvement.title')}</h2>
      <div className="flex gap-2 mb-6">
        {([['diagnose', t('improvement.tabDiagnose')], ['proposals', t('improvement.tabProposals')]] as [Tab, string][]).map(([key, label]) => (
          <Button key={key} variant={tab === key ? 'default' : 'outline'} size="sm" onClick={() => setTab(key)}>
            {label}
          </Button>
        ))}
      </div>
      {tab === 'diagnose' && <DiagnoseTab />}
      {tab === 'proposals' && <ProposalsTab />}
    </div>
  );
}

function DiagnoseTab() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [diagnosis, setDiagnosis] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const { toast } = useToast();
  const { t } = useI18n();

  useEffect(() => {
    employeesApi.list().then(r => setEmployees(r.data)).catch(() => {});
  }, []);

  const handleDiagnose = async () => {
    if (!selectedId) return;
    setLoading(true);
    setDiagnosis(null);
    try {
      const r = await improvementApi.diagnose(selectedId);
      setDiagnosis(r.data);
    } catch (e: any) { toast(e.message, 'error'); }
    finally { setLoading(false); }
  };

  const handleGenerate = async () => {
    if (!selectedId || !diagnosis) return;
    setGenerating(true);
    try {
      await improvementApi.optimizePrompt(selectedId, diagnosis);
      toast(t('improvement.generated'), 'success');
    } catch (e: any) { toast(e.message, 'error'); }
    finally { setGenerating(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-3 items-end">
        <div className="flex-1 max-w-xs">
          <label className="text-sm font-medium mb-1 block">{t('improvement.selectEmployee')}</label>
          <Select value={selectedId} onChange={e => setSelectedId(e.target.value)}>
            <option value="">{t('roi.pleaseSelect')}</option>
            {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </Select>
        </div>
        <Button size="sm" onClick={handleDiagnose} disabled={!selectedId || loading}>
          {loading ? t('improvement.diagnosing') : t('improvement.startDiagnose')}
        </Button>
      </div>

      {diagnosis && (
        <div className="border rounded-lg p-4 space-y-3">
          <h3 className="font-medium">{t('improvement.diagnosisResult', { name: diagnosis.employeeName })}</h3>
          <p className="text-sm">{t('improvement.analysisPeriod', { period: diagnosis.period })}</p>
          {diagnosis.testPassRate !== null && (
            <p className="text-sm">{t('improvement.testPassRate')}<Badge variant={diagnosis.testPassRate >= 80 ? 'success' : 'warning'}>{diagnosis.testPassRate}%</Badge></p>
          )}
          {diagnosis.topErrors?.length > 0 && (
            <div>
              <p className="text-sm font-medium">{t('improvement.topErrors')}</p>
              <ul className="text-sm text-muted-foreground list-disc ml-4">
                {diagnosis.topErrors.map((e: any, i: number) => (
                  <li key={i}>{e.errorType}: {e.errorMessage} ({t('improvement.times', { count: e.count })})</li>
                ))}
              </ul>
            </div>
          )}
          {diagnosis.observerIssues?.length > 0 && (
            <div>
              <p className="text-sm font-medium">{t('improvement.observerIssues')}</p>
              <ul className="text-sm text-muted-foreground list-disc ml-4">
                {diagnosis.observerIssues.map((f: any, i: number) => (
                  <li key={i}>{f.category} ({t('improvement.times', { count: f.count })})</li>
                ))}
              </ul>
            </div>
          )}
          <Button size="sm" onClick={handleGenerate} disabled={generating}>
            {generating ? t('improvement.generating') : t('improvement.generateSuggestion')}
          </Button>
        </div>
      )}
    </div>
  );
}

function ProposalsTab() {
  const [items, setItems] = useState<ImprovementProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { t } = useI18n();

  const load = useCallback(async () => {
    try {
      const r = await improvementApi.listProposals();
      setItems(r.data);
    } catch (e: any) { toast(e.message, 'error'); }
    finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const handleAction = async (id: string, action: 'approve' | 'reject' | 'apply') => {
    try {
      await improvementApi[action](id);
      toast(t('common.operationSuccess'), 'success');
      load();
    } catch (e: any) { toast(e.message, 'error'); }
  };

  const statusLabels: Record<string, { label: string; variant: 'secondary' | 'warning' | 'success' | 'destructive' }> = {
    pending: { label: t('improvement.statusPending'), variant: 'warning' },
    approved: { label: t('improvement.statusApproved'), variant: 'success' },
    rejected: { label: t('improvement.statusRejected'), variant: 'destructive' },
    applied: { label: t('improvement.statusApplied'), variant: 'secondary' },
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (items.length === 0) return <div className="text-center py-12 text-muted-foreground">{t('improvement.noProposals')}</div>;

  return (
    <div className="space-y-2">
      {items.map(item => {
        const st = statusLabels[item.status] || { label: item.status, variant: 'secondary' as const };
        let suggestion: any = {};
        try { suggestion = JSON.parse(item.suggestion); } catch {}
        return (
          <div key={item.id} className="border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant={st.variant}>{st.label}</Badge>
              <Badge variant="secondary">{item.category}</Badge>
              <span className="text-sm text-muted-foreground">{item.targetType}: {item.targetId.slice(0, 8)}</span>
            </div>
            {suggestion.recommendations && (
              <ul className="text-sm list-disc ml-4 mb-2">
                {suggestion.recommendations.map((r: string, i: number) => <li key={i}>{r}</li>)}
              </ul>
            )}
            <div className="flex gap-2 mt-2">
              {item.status === 'pending' && (
                <>
                  <Button size="sm" onClick={() => handleAction(item.id, 'approve')}>{t('improvement.approve')}</Button>
                  <Button size="sm" variant="outline" onClick={() => handleAction(item.id, 'reject')}>{t('improvement.reject')}</Button>
                </>
              )}
              {item.status === 'approved' && (
                <Button size="sm" onClick={() => handleAction(item.id, 'apply')}>{t('improvement.apply')}</Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
