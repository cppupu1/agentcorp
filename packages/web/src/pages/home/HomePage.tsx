import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router';
import { templatesApi, modelsApi, tasksApi, toolsApi, employeesApi, teamsApi, type TemplateSummary, type Model, type TaskSummary } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2, ArrowRight, Users, Plus, UserPlus, UsersRound, ClipboardList, ChevronRight } from 'lucide-react';
import { useI18n } from '@/i18n';
import HealthDashboard from './HealthDashboard';
import OnboardingMilestones from './OnboardingMilestones';

export default function HomePage() {
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [onboardingCounts, setOnboardingCounts] = useState({ models: 0, tools: 0, employees: 0, teams: 0, tasks: 0 });
  const { toast } = useToast();
  const navigate = useNavigate();
  const { t, locale } = useI18n();

  useEffect(() => {
    Promise.all([templatesApi.list(), modelsApi.list(), tasksApi.list(), toolsApi.list(), employeesApi.list(), teamsApi.list()])
      .then(([tplRes, modelRes, taskRes, toolRes, empRes, teamRes]) => {
        setTemplates(tplRes.data);
        const available = modelRes.data.filter(m => m.status === 'available');
        setModels(available);
        if (available.length > 0) setSelectedModel(available[0].id);
        setTasks(taskRes.data.slice(0, 5));
        setOnboardingCounts({
          models: modelRes.data.length,
          tools: toolRes.data.length,
          employees: empRes.data.length,
          teams: teamRes.data.length,
          tasks: taskRes.data.length,
        });
      })
      .catch(err => toast(err instanceof Error ? err.message : t('common.loadFailed'), 'error'))
      .finally(() => setLoading(false));
  }, [toast, t]);

  const handleApply = async (templateId: string) => {
    if (!selectedModel) {
      toast(t('home.selectModelFirst'), 'error');
      return;
    }
    setApplying(templateId);
    try {
      const res = await templatesApi.apply(templateId, selectedModel);
      toast(t('home.teamCreated'), 'success');
      navigate(`/teams/${res.data.teamId}/edit`);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : t('home.applyFailed'), 'error');
    } finally {
      setApplying(null);
    }
  };

  if (loading) {
    return (
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <div><Skeleton className="h-8 w-48" /><Skeleton className="h-4 w-72 mt-2" /></div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-28 rounded-3xl" />)}</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-16 rounded-2xl" />)}</div>
        <div className="grid lg:grid-cols-5 gap-6">
          <div className="lg:col-span-2 space-y-3">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-14 rounded-2xl" />)}</div>
          <div className="lg:col-span-3 grid gap-3 sm:grid-cols-2">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-40 rounded-3xl" />)}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Welcome header */}
      <div className="pt-2 pb-4">
        <h2 className="text-3xl font-heading font-medium tracking-tight text-foreground/90">{t('home.welcome')}</h2>
        <p className="text-[16px] text-muted-foreground mt-2">{t('home.welcomeDesc')}</p>
      </div>

      {/* Onboarding */}
      <OnboardingMilestones counts={onboardingCounts} />

      {/* Stats */}
      <HealthDashboard />

      {/* Quick actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <button onClick={() => navigate('/employees/new')} className="flex items-center gap-4 p-5 bg-card rounded-3xl md-transition shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] hover:-translate-y-1 hover:ring-1 hover:ring-primary/10">
          <div className="p-3 rounded-full bg-primary/10 text-primary"><UserPlus className="h-6 w-6" /></div>
          <span className="text-[15px] font-heading font-medium tracking-wide">{t('home.addEmployee')}</span>
        </button>
        <button onClick={() => navigate('/teams/new')} className="flex items-center gap-4 p-5 bg-card rounded-3xl md-transition shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] hover:-translate-y-1 hover:ring-1 hover:ring-primary/10">
          <div className="p-3 rounded-full bg-accent/80 text-accent-foreground"><UsersRound className="h-6 w-6" /></div>
          <span className="text-[15px] font-heading font-medium tracking-wide">{t('home.createTeam')}</span>
        </button>
        <button onClick={() => navigate('/tasks/new')} className="flex items-center gap-4 p-5 bg-card rounded-3xl md-transition shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] hover:-translate-y-1 hover:ring-1 hover:ring-primary/10">
          <div className="p-3 rounded-full bg-success/10 text-success"><ClipboardList className="h-6 w-6" /></div>
          <span className="text-[15px] font-heading font-medium tracking-wide">{t('home.createTask')}</span>
        </button>
      </div>

      {/* Two-column: Recent Tasks + Templates */}
      <div className="grid lg:grid-cols-5 gap-8">
        {/* Recent tasks */}
        <div className="lg:col-span-2 bg-card rounded-3xl shadow-[var(--shadow-sm)] border border-border/40 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-5 bg-card border-b border-border/30">
            <h3 className="text-base font-heading font-medium">{t('home.recentTasks')}</h3>
            <Link to="/tasks" className="text-sm text-primary hover:underline flex items-center gap-1 font-medium">
              {t('home.viewAll')} <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="divide-y divide-border/30">
            {tasks.length === 0 ? (
              <div className="px-6 py-10 text-center">
                <ClipboardList className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
                <p className="text-[15px] text-muted-foreground">{t('home.noTasks')}</p>
                <p className="text-sm text-muted-foreground/70 mt-1">{t('home.noTasksDesc')}</p>
                <Link to="/tasks/new" className="text-sm text-primary hover:underline mt-2 inline-block">{t('home.createTask')}</Link>
              </div>
            ) : tasks.map(task => (
              <Link key={task.id} to={`/tasks/${task.id}`} className="flex items-center justify-between px-6 py-4 hover:bg-muted/40 transition-colors md-transition">
                <div className="min-w-0 pr-4">
                  <p className="text-[15px] font-medium truncate text-foreground/90">{task.title || task.description?.slice(0, 40)}</p>
                  <p className="text-[13px] text-muted-foreground mt-1 truncate">{task.teamName || '-'}</p>
                </div>
                <Badge variant={task.status === 'completed' ? 'success' : task.status === 'failed' ? 'destructive' : 'secondary'} className="shrink-0">
                  {task.status}
                </Badge>
              </Link>
            ))}
          </div>
        </div>

        {/* Templates */}
        <div className="lg:col-span-3 space-y-6">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-base font-heading font-medium">{t('home.templates')}</h3>
            {models.length > 0 && (
              <select className="h-10 rounded-xl border border-border/50 bg-background px-4 py-1 text-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 hover:bg-muted/50 cursor-pointer" value={selectedModel} onChange={e => setSelectedModel(e.target.value)}>
                {models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            )}
          </div>

          {models.length === 0 && (
            <div className="p-4 rounded-2xl border border-warning/30 bg-warning/10 text-warning-foreground text-[15px]">
              {t('home.noModels')}
              <a href="/models" className="underline font-medium mx-1 hover:text-warning">{t('home.addModelLink')}</a>
              {t('home.noModelsAfter')}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            {templates.map(tpl => (
              <div key={tpl.id} className="bg-card rounded-3xl p-6 shadow-[var(--shadow-sm)] border border-border/40 hover:shadow-[var(--shadow-md)] hover:-translate-y-1 transition-all md-transition flex flex-col h-full">
                <div className="flex items-start gap-4 mb-4">
                  <span className="text-3xl bg-muted/50 p-3 rounded-2xl">{tpl.icon}</span>
                  <div className="min-w-0 pt-1">
                    <h4 className="font-heading font-medium text-base text-foreground/90 leading-tight">{tpl.name}</h4>
                    <div className="flex items-center gap-1.5 text-[13px] text-muted-foreground mt-2 font-medium">
                      <Users className="h-4 w-4 opacity-70" />
                      <span>{tpl.employeeCount} {t('common.members')}</span>
                    </div>
                  </div>
                </div>
                <p className="text-[14px] text-muted-foreground line-clamp-2 flex-1 mb-5">{tpl.description}</p>
                <Button variant="secondary" className="w-full mt-auto font-medium" disabled={!selectedModel || applying !== null} onClick={() => handleApply(tpl.id)}>
                  {applying === tpl.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                  {t('home.useTemplate')}
                </Button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
