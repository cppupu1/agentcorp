import { useState, useEffect } from 'react';
import { roiApi, employeesApi, teamsApi, type CostTrendItem, type CompetencyScore, type Employee, type Team } from '@/api/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { useToast } from '@/components/ui/toast';
import { Loader2 } from 'lucide-react';
import { useI18n } from '@/i18n';

type Tab = 'cost' | 'competency' | 'team';

export default function RoiReviewPage() {
  const [tab, setTab] = useState<Tab>('cost');
  const { t } = useI18n();

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h2 className="text-2xl font-bold tracking-tight mb-4">{t('roi.title')}</h2>
      <div className="flex gap-2 mb-6">
        {([['cost', t('roi.tabCost')], ['competency', t('roi.tabCompetency')], ['team', t('roi.tabTeam')]] as [Tab, string][]).map(([key, label]) => (
          <Button key={key} variant={tab === key ? 'default' : 'outline'} size="sm" onClick={() => setTab(key)}>
            {label}
          </Button>
        ))}
      </div>
      {tab === 'cost' && <CostTrendTab />}
      {tab === 'competency' && <CompetencyTab />}
      {tab === 'team' && <TeamTab />}
    </div>
  );
}

function CostTrendTab() {
  const [data, setData] = useState<CostTrendItem[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { t } = useI18n();

  useEffect(() => {
    roiApi.getCostTrend().then(r => setData(r.data)).catch(e => toast(e.message, 'error')).finally(() => setLoading(false));
  }, [toast]);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (data.length === 0) return <div className="text-center py-12 text-muted-foreground">{t('roi.noCostData')}</div>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="border-b">
          <th className="text-left py-2 px-3">{t('roi.colDate')}</th>
          <th className="text-right py-2 px-3">{t('roi.colCost')}</th>
          <th className="text-right py-2 px-3">{t('roi.colTokens')}</th>
          <th className="text-right py-2 px-3">{t('roi.colTaskCount')}</th>
        </tr></thead>
        <tbody>
          {data.map(r => (
            <tr key={r.period} className="border-b">
              <td className="py-2 px-3">{r.period}</td>
              <td className="text-right py-2 px-3">{r.totalCost}</td>
              <td className="text-right py-2 px-3">{r.totalTokens.toLocaleString()}</td>
              <td className="text-right py-2 px-3">{r.taskCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CompetencyTab() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [history, setHistory] = useState<CompetencyScore[]>([]);
  const [loading, setLoading] = useState(false);
  const [computing, setComputing] = useState(false);
  const { toast } = useToast();
  const { t } = useI18n();

  useEffect(() => {
    employeesApi.list().then(r => setEmployees(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    setLoading(true);
    roiApi.getCompetencyHistory(selectedId).then(r => setHistory(r.data)).catch(e => toast(e.message, 'error')).finally(() => setLoading(false));
  }, [selectedId, toast]);

  const handleCompute = async () => {
    if (!selectedId) return;
    setComputing(true);
    try {
      await roiApi.computeCompetency(selectedId);
      const r = await roiApi.getCompetencyHistory(selectedId);
      setHistory(r.data);
      toast(t('roi.computed'), 'success');
    } catch (e: any) { toast(e.message, 'error'); }
    finally { setComputing(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-3 items-end">
        <div className="flex-1 max-w-xs">
          <label className="text-sm font-medium mb-1 block">{t('roi.selectEmployee')}</label>
          <Select value={selectedId} onChange={e => setSelectedId(e.target.value)}>
            <option value="">{t('roi.pleaseSelect')}</option>
            {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </Select>
        </div>
        <Button size="sm" onClick={handleCompute} disabled={!selectedId || computing}>
          {computing ? t('roi.computing') : t('roi.computeCompetency')}
        </Button>
      </div>

      {loading ? <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /> : history.length === 0 ? (
        <p className="text-muted-foreground text-sm">{selectedId ? t('roi.noCompetencyData') : t('roi.selectEmployeeHint')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b">
              <th className="text-left py-2 px-3">{t('roi.colMonth')}</th>
              <th className="text-right py-2 px-3">{t('roi.colCompletionRate')}</th>
              <th className="text-right py-2 px-3">{t('roi.colQuality')}</th>
              <th className="text-right py-2 px-3">{t('roi.colEfficiency')}</th>
              <th className="text-right py-2 px-3">{t('roi.colStability')}</th>
              <th className="text-right py-2 px-3">{t('roi.colOverall')}</th>
              <th className="text-right py-2 px-3">{t('roi.colTaskCount')}</th>
            </tr></thead>
            <tbody>
              {history.map(s => (
                <tr key={s.id} className="border-b">
                  <td className="py-2 px-3">{s.period}</td>
                  <td className="text-right py-2 px-3">{s.completionRate ?? '-'}</td>
                  <td className="text-right py-2 px-3">{s.qualityScore ?? '-'}</td>
                  <td className="text-right py-2 px-3">{s.efficiencyScore ?? '-'}</td>
                  <td className="text-right py-2 px-3">{s.stabilityScore ?? '-'}</td>
                  <td className="text-right py-2 px-3">
                    <Badge variant={(s.overallScore ?? 0) >= 70 ? 'success' : (s.overallScore ?? 0) >= 50 ? 'warning' : 'destructive'}>
                      {s.overallScore ?? '-'}
                    </Badge>
                  </td>
                  <td className="text-right py-2 px-3">{s.taskCount ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TeamTab() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const { t } = useI18n();

  useEffect(() => {
    teamsApi.list().then(r => setTeams(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    setLoading(true);
    roiApi.getTeamEffectiveness(selectedId).then(r => setData(r.data)).catch(e => toast(e.message, 'error')).finally(() => setLoading(false));
  }, [selectedId, toast]);

  return (
    <div className="space-y-4">
      <div className="max-w-xs">
        <label className="text-sm font-medium mb-1 block">{t('roi.selectTeam')}</label>
        <Select value={selectedId} onChange={e => setSelectedId(e.target.value)}>
          <option value="">{t('roi.pleaseSelect')}</option>
          {teams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}
        </Select>
      </div>

      {loading ? <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /> : !data ? (
        <p className="text-muted-foreground text-sm">{selectedId ? t('common.noData') : t('roi.selectTeamHint')}</p>
      ) : (
        <div>
          <div className="mb-4 p-4 bg-card rounded-2xl shadow-[var(--shadow-sm)]">
            <span className="text-sm text-muted-foreground">{t('roi.teamAvgScore')}</span>
            <Badge variant={data.avgScore >= 70 ? 'success' : data.avgScore >= 50 ? 'warning' : 'destructive'}>
              {data.avgScore}
            </Badge>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b">
                <th className="text-left py-2 px-3">{t('roi.colMember')}</th>
                <th className="text-left py-2 px-3">{t('roi.colRole')}</th>
                <th className="text-right py-2 px-3">{t('roi.colOverallScore')}</th>
                <th className="text-right py-2 px-3">{t('roi.colEvalMonth')}</th>
              </tr></thead>
              <tbody>
                {data.members.map((m: any) => (
                  <tr key={m.employeeId} className="border-b">
                    <td className="py-2 px-3">{m.employeeName}</td>
                    <td className="py-2 px-3">{m.role}</td>
                    <td className="text-right py-2 px-3">{m.competency?.overallScore ?? '-'}</td>
                    <td className="text-right py-2 px-3">{m.competency?.period ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
