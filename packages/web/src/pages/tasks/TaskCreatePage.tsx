import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { tasksApi, teamsApi, employeesApi, type Team, type Employee } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toast';
import { Loader2, AlertCircle } from 'lucide-react';
import { useI18n } from '@/i18n';
import { Link } from 'react-router';

export default function TaskCreatePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { t } = useI18n();
  const prefill = (location.state as any)?.magicPrefill;
  const [createMode, setCreateMode] = useState<'quick' | 'team'>('quick');
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamId, setTeamId] = useState('');
  const [allEmployees, setAllEmployees] = useState<Employee[]>([]);
  const [pmEmployeeId, setPmEmployeeId] = useState('');
  const [description, setDescription] = useState(prefill?.description ?? '');
  const [mode, setMode] = useState(prefill?.mode ?? 'suggest');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    employeesApi.list().then(res => setAllEmployees(res.data)).catch(err => {
      toast(err instanceof Error ? err.message : t('taskCreate.loadEmployeesFailed'), 'error');
    });
    teamsApi.list().then(res => setTeams(res.data)).catch(err => {
      toast(err instanceof Error ? err.message : t('taskCreate.loadTeamsFailed'), 'error');
    });
  }, [toast]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (createMode === 'quick' && !pmEmployeeId) {
      toast(t('taskCreate.pmRequired'), 'error');
      return;
    }
    if (createMode === 'team' && !teamId) {
      toast(t('taskCreate.teamRequired'), 'error');
      return;
    }
    if (!description.trim()) {
      toast(t('taskCreate.descRequired'), 'error');
      return;
    }
    setSaving(true);
    try {
      const body = createMode === 'quick'
        ? { pmEmployeeId, description: description.trim(), mode }
        : { teamId, description: description.trim(), mode };
      const res = await tasksApi.create(body);
      toast(t('taskCreate.created'), 'success');
      navigate(`/tasks/${res.data.id}`);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : t('taskCreate.failed'), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold tracking-tight mb-6">{t('taskCreate.title')}</h2>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-2">
          <Label>{t('taskCreate.method')}</Label>
          <div className="flex gap-3">
            <label className={`flex-1 rounded-xl p-3 cursor-pointer transition-colors ${createMode === 'quick' ? 'bg-primary/10 ring-2 ring-primary/30' : 'bg-muted/30'}`}>
              <input type="radio" name="createMode" value="quick" checked={createMode === 'quick'} onChange={() => setCreateMode('quick')} className="sr-only" />
              <div className="font-medium text-sm mb-1">{t('taskCreate.quickMode')}</div>
              <div className="text-xs text-muted-foreground">{t('taskCreate.quickModeDesc')}</div>
            </label>
            <label className={`flex-1 rounded-xl p-3 cursor-pointer transition-colors ${createMode === 'team' ? 'bg-primary/10 ring-2 ring-primary/30' : 'bg-muted/30'}`}>
              <input type="radio" name="createMode" value="team" checked={createMode === 'team'} onChange={() => setCreateMode('team')} className="sr-only" />
              <div className="font-medium text-sm mb-1">{t('taskCreate.teamMode')}</div>
              <div className="text-xs text-muted-foreground">{t('taskCreate.teamModeDesc')}</div>
            </label>
          </div>
        </div>
        {createMode === 'quick' ? (
          <div className="space-y-2">
            <Label>{t('taskCreate.selectPm')} *</Label>
            {allEmployees.length === 0 ? (
              <div className="flex items-center gap-3 p-4 rounded-2xl border border-warning/30 bg-warning/10 text-sm">
                <AlertCircle className="h-5 w-5 text-warning shrink-0" />
                <span>{t('onboarding.noEmployees')}</span>
                <Link to="/employees/new" className="text-primary hover:underline font-medium ml-auto shrink-0">{t('onboarding.goCreate')}</Link>
              </div>
            ) : (
              <select
                className="w-full h-12 rounded-2xl border border-transparent bg-muted/80 px-4 py-2 text-[15px] transition-all duration-200 ease-out hover:bg-muted focus-visible:outline-none focus-visible:bg-background focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/20"
                value={pmEmployeeId}
                onChange={e => setPmEmployeeId(e.target.value)}
              >
                <option value="">{t('taskCreate.selectPm')}...</option>
                {allEmployees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <Label>{t('taskCreate.selectTeam')} *</Label>
            {teams.length === 0 ? (
              <div className="flex items-center gap-3 p-4 rounded-2xl border border-warning/30 bg-warning/10 text-sm">
                <AlertCircle className="h-5 w-5 text-warning shrink-0" />
                <span>{t('onboarding.noTeams')}</span>
                <Link to="/teams/new" className="text-primary hover:underline font-medium ml-auto shrink-0">{t('onboarding.goCreate')}</Link>
              </div>
            ) : (
              <select
                className="w-full h-12 rounded-2xl border border-transparent bg-muted/80 px-4 py-2 text-[15px] transition-all duration-200 ease-out hover:bg-muted focus-visible:outline-none focus-visible:bg-background focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/20"
                value={teamId}
                onChange={e => setTeamId(e.target.value)}
                data-testid="task-teamId-input"
              >
                <option value="">{t('taskCreate.selectTeam')}...</option>
                {teams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}
              </select>
            )}
          </div>
        )}
        <div className="space-y-2">
          <Label>{t('taskCreate.description')} *</Label>
          <Textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder={t('taskCreate.descPlaceholder')}
            rows={6}
            maxLength={5000}
            data-testid="task-description-input"
            required
          />
          <p className="text-xs text-muted-foreground">{description.length}/5000</p>
        </div>
        <div className="space-y-2">
          <Label>{t('taskCreate.execMode')}</Label>
          <div className="flex gap-3">
            <label className={`flex-1 rounded-xl p-3 cursor-pointer transition-colors ${mode === 'suggest' ? 'bg-primary/10 ring-2 ring-primary/30' : 'bg-muted/30'}`}>
              <input type="radio" name="mode" value="suggest" checked={mode === 'suggest'} onChange={() => setMode('suggest')} className="sr-only" />
              <div className="font-medium text-sm mb-1">{t('taskCreate.suggestMode')}</div>
              <div className="text-xs text-muted-foreground">{t('taskCreate.suggestModeDetail')}</div>
            </label>
            <label className={`flex-1 rounded-xl p-3 cursor-pointer transition-colors ${mode === 'auto' ? 'bg-primary/10 ring-2 ring-primary/30' : 'bg-muted/30'}`}>
              <input type="radio" name="mode" value="auto" checked={mode === 'auto'} onChange={() => setMode('auto')} className="sr-only" />
              <div className="font-medium text-sm mb-1">{t('taskCreate.autoMode')}</div>
              <div className="text-xs text-muted-foreground">{t('taskCreate.autoModeDetail')}</div>
            </label>
          </div>
        </div>
        <div className="flex gap-3 pt-4 border-t">
          <Button type="submit" disabled={saving}>
            {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-1" /> {t('common.creating')}</> : t('tasks.create')}
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate('/tasks')}>{t('common.cancel')}</Button>
        </div>
      </form>
    </div>
  );
}
