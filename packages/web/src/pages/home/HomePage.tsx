import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router';
import { templatesApi, modelsApi, tasksApi, type TemplateSummary, type Model, type TaskSummary } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2, ArrowRight, Users, Plus, UserPlus, UsersRound, ClipboardList, ChevronRight } from 'lucide-react';
import { useI18n } from '@/i18n';
import HealthDashboard from './HealthDashboard';

export default function HomePage() {
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const { toast } = useToast();
  const navigate = useNavigate();
  const { t, locale } = useI18n();

  useEffect(() => {
    Promise.all([templatesApi.list(), modelsApi.list(), tasksApi.list()])
      .then(([tplRes, modelRes, taskRes]) => {
        setTemplates(tplRes.data);
        const available = modelRes.data.filter(m => m.status === 'available');
        setModels(available);
        if (available.length > 0) setSelectedModel(available[0].id);
        setTasks(taskRes.data.slice(0, 5));
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
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
        <div className="grid lg:grid-cols-5 gap-6">
          <div className="lg:col-span-2 space-y-3">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-12 rounded-xl" />)}</div>
          <div className="lg:col-span-3 grid gap-3 sm:grid-cols-2">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-36 rounded-xl" />)}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Welcome header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight">{t('home.welcome')}</h2>
        <p className="text-muted-foreground mt-1">{t('home.welcomeDesc')}</p>
      </div>

      {/* Stats */}
      <HealthDashboard />

      {/* Quick actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <button onClick={() => navigate('/employees/new')} className="flex items-center gap-3 p-4 bg-card rounded-2xl shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] hover:ring-1 hover:ring-primary/20 transition-all">
          <div className="p-2 rounded-lg bg-primary/10 text-primary"><UserPlus className="h-4 w-4" /></div>
          <span className="text-sm font-medium">{t('home.addEmployee')}</span>
        </button>
        <button onClick={() => navigate('/teams/new')} className="flex items-center gap-3 p-4 bg-card rounded-2xl shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] hover:ring-1 hover:ring-primary/20 transition-all">
          <div className="p-2 rounded-lg bg-accent text-accent-foreground"><UsersRound className="h-4 w-4" /></div>
          <span className="text-sm font-medium">{t('home.createTeam')}</span>
        </button>
        <button onClick={() => navigate('/tasks/new')} className="flex items-center gap-3 p-4 bg-card rounded-2xl shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] hover:ring-1 hover:ring-primary/20 transition-all">
          <div className="p-2 rounded-lg bg-success/10 text-success"><ClipboardList className="h-4 w-4" /></div>
          <span className="text-sm font-medium">{t('home.createTask')}</span>
        </button>
      </div>

      {/* Two-column: Recent Tasks + Templates */}
      <div className="grid lg:grid-cols-5 gap-6">
        {/* Recent tasks */}
        <div className="lg:col-span-2 bg-card rounded-2xl shadow-[var(--shadow-sm)]">
          <div className="flex items-center justify-between px-5 py-4">
            <h3 className="text-sm font-semibold">{t('home.recentTasks')}</h3>
            <Link to="/tasks" className="text-xs text-primary hover:underline flex items-center gap-0.5">
              {t('home.viewAll')} <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="divide-y divide-border/50">
            {tasks.length === 0 ? (
              <p className="px-5 py-8 text-sm text-muted-foreground text-center">{t('home.noTasks')}</p>
            ) : tasks.map(task => (
              <Link key={task.id} to={`/tasks/${task.id}`} className="flex items-center justify-between px-5 py-3 hover:bg-muted/50 transition-colors">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{task.title || task.description?.slice(0, 40)}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{task.teamName || '-'}</p>
                </div>
                <Badge variant={task.status === 'completed' ? 'success' : task.status === 'failed' ? 'destructive' : 'secondary'} className="shrink-0 ml-2">
                  {task.status}
                </Badge>
              </Link>
            ))}
          </div>
        </div>

        {/* Templates */}
        <div className="lg:col-span-3 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">{t('home.templates')}</h3>
            {models.length > 0 && (
              <select className="h-8 rounded-xl border-0 bg-muted px-3 py-1 text-xs transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50" value={selectedModel} onChange={e => setSelectedModel(e.target.value)}>
                {models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            )}
          </div>

          {models.length === 0 && (
            <div className="p-4 rounded-xl border border-warning/30 bg-warning/10 text-warning text-sm">
              {t('home.noModels')}
              <a href="/models" className="underline font-medium mx-1">{t('home.addModelLink')}</a>
              {t('home.noModelsAfter')}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            {templates.map(tpl => (
              <div key={tpl.id} className="bg-card rounded-2xl p-5 shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] hover:ring-1 hover:ring-primary/20 transition-all space-y-3">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{tpl.icon}</span>
                  <div className="min-w-0">
                    <h4 className="font-semibold text-sm">{tpl.name}</h4>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Users className="h-3 w-3" />
                      <span>{tpl.employeeCount}{t('common.members')}</span>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2">{tpl.description}</p>
                <Button size="sm" className="w-full" disabled={!selectedModel || applying !== null} onClick={() => handleApply(tpl.id)}>
                  {applying === tpl.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowRight className="h-3 w-3" />}
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
