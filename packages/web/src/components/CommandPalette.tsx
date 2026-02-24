import { useEffect, useState, useMemo } from 'react';
import { Command } from 'cmdk';
import { useNavigate, useLocation } from 'react-router';
import { useI18n } from '@/i18n';
import { useTheme } from '@/contexts/ThemeContext';
import { tasksApi, employeesApi, type TaskSummary, type Employee } from '@/api/client';
import {
  Home, Bot, ClipboardList, Brain, Wrench, Users, UsersRound,
  Timer, ShieldCheck, BookOpen, BarChart3, DollarSign, Microscope,
  AlertTriangle, Rocket, FlaskConical, RefreshCw, Settings, HelpCircle,
  UserPlus, Sun, Moon, Languages, Search
} from 'lucide-react';

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { t, locale, setLocale } = useI18n();
  const { theme, setTheme } = useTheme();

  const [recentTasks, setRecentTasks] = useState<TaskSummary[]>([]);
  const [recentEmployees, setRecentEmployees] = useState<Employee[]>([]);

  const contextActions = useMemo(() => {
    const path = location.pathname;
    const taskMatch = path.match(/^\/tasks\/([^/]+)$/);
    const empMatch = path.match(/^\/employees\/([^/]+)/);
    const teamMatch = path.match(/^\/teams\/([^/]+)$/);
    const actions: Array<{ label: string; action: () => void; icon: typeof ClipboardList }> = [];
    if (taskMatch && taskMatch[1] !== 'new') {
      const id = taskMatch[1];
      actions.push({ label: t('command.viewSubtasks'), action: () => navigate(`/tasks/${id}?tab=execution`), icon: ClipboardList });
      actions.push({ label: t('command.viewTimeline'), action: () => navigate(`/tasks/${id}?tab=timeline`), icon: Timer });
    }
    if (empMatch && empMatch[1] !== 'new') {
      const id = empMatch[1];
      actions.push({ label: t('command.chatWithEmployee'), action: () => navigate(`/employees/${id}/chat`), icon: Bot });
      actions.push({ label: t('command.editEmployee'), action: () => navigate(`/employees/${id}/edit`), icon: Users });
    }
    if (teamMatch && teamMatch[1] !== 'new') {
      const id = teamMatch[1];
      actions.push({ label: t('command.editTeam'), action: () => navigate(`/teams/${id}/edit`), icon: UsersRound });
    }
    return actions;
  }, [location.pathname, t, navigate]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(o => !o);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
      // Fetch dynamic data when palette opens
      tasksApi.list().then(res => setRecentTasks(res.data.slice(0, 5))).catch(() => {});
      employeesApi.list().then(res => setRecentEmployees(res.data.slice(0, 5))).catch(() => {});
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  const go = (path: string) => { navigate(path); setOpen(false); };
  const run = (fn: () => void) => { fn(); setOpen(false); };

  const navItems = useMemo(() => [
    { path: '/', label: t('nav.home'), icon: Home },
    { path: '/hr', label: t('nav.hr'), icon: Bot },
    { path: '/tasks', label: t('nav.tasks'), icon: ClipboardList },
    { path: '/models', label: t('nav.models'), icon: Brain },
    { path: '/tools', label: t('nav.tools'), icon: Wrench },
    { path: '/employees', label: t('nav.employees'), icon: Users },
    { path: '/teams', label: t('nav.teams'), icon: UsersRound },
    { path: '/triggers', label: t('nav.triggers'), icon: Timer },
    { path: '/policies', label: t('nav.policies'), icon: ShieldCheck },
    { path: '/knowledge', label: t('nav.knowledge'), icon: BookOpen },
    { path: '/quality', label: t('nav.quality'), icon: BarChart3 },
    { path: '/roi', label: t('nav.roi'), icon: DollarSign },
    { path: '/improvement', label: t('nav.improvement'), icon: Microscope },
    { path: '/incidents', label: t('nav.incidents'), icon: AlertTriangle },
    { path: '/deployment', label: t('nav.deployment'), icon: Rocket },
    { path: '/testing', label: t('nav.testing'), icon: FlaskConical },
    { path: '/change-tests', label: t('nav.changeTests'), icon: RefreshCw },
    { path: '/settings', label: t('nav.settings'), icon: Settings },
    { path: '/help', label: t('nav.help'), icon: HelpCircle },
  ], [t]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]" role="dialog" aria-modal="true">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" aria-hidden="true" onClick={() => setOpen(false)} />
      <Command
        className="relative w-full max-w-lg rounded-[28px] bg-popover border border-border/40 shadow-2xl overflow-hidden"
        label="Command palette"
      >
        <Command.Input
          placeholder={t('command.placeholder')}
          className="w-full px-6 py-4 text-[15px] bg-transparent border-b border-border/40 outline-none placeholder:text-muted-foreground"
          autoFocus
        />
        <Command.List className="max-h-[60vh] overflow-y-auto p-2">
          <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
            {t('command.noResults')}
          </Command.Empty>

          {contextActions.length > 0 && (
            <Command.Group heading={t('command.context')} className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground">
              {contextActions.map(ca => (
                <Command.Item key={ca.label} value={ca.label} onSelect={() => { ca.action(); setOpen(false); }} className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-[14px] cursor-pointer data-[selected=true]:bg-accent transition-colors">
                  <ca.icon className="h-4 w-4 text-primary shrink-0" /> {ca.label}
                </Command.Item>
              ))}
            </Command.Group>
          )}

          {recentTasks.length > 0 && (
            <Command.Group heading={t('home.recentTasks')} className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground">
              {recentTasks.map(task => (
                <Command.Item key={`task-${task.id}`} value={`task ${task.title || task.description} ${task.id}`} onSelect={() => go(`/tasks/${task.id}`)} className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-[14px] cursor-pointer data-[selected=true]:bg-accent transition-colors">
                  <ClipboardList className="h-4 w-4 text-primary shrink-0" /> 
                  <span className="truncate flex-1">{task.title || task.description?.slice(0, 30)}</span>
                  <span className="text-xs text-muted-foreground opacity-60 ml-auto">{task.status}</span>
                </Command.Item>
              ))}
            </Command.Group>
          )}

          {recentEmployees.length > 0 && (
            <Command.Group heading={t('nav.employees')} className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground">
              {recentEmployees.map(emp => (
                <Command.Item key={`emp-${emp.id}`} value={`employee ${emp.name} ${emp.id}`} onSelect={() => go(`/employees/${emp.id}/edit`)} className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-[14px] cursor-pointer data-[selected=true]:bg-accent transition-colors">
                  <span className="text-base leading-none bg-muted w-6 h-6 rounded flex items-center justify-center shrink-0">{emp.avatar || '👤'}</span>
                  <span className="font-medium">{emp.name}</span>
                  <span className="text-[12px] text-muted-foreground ml-auto truncate max-w-[120px]">{emp.description}</span>
                </Command.Item>
              ))}
            </Command.Group>
          )}

          <Command.Group heading={t('command.navigation')} className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground">
            {navItems.map(item => (
              <Command.Item
                key={item.path}
                value={item.label + ' ' + item.path}
                onSelect={() => go(item.path)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm cursor-pointer data-[selected=true]:bg-accent"
              >
                <item.icon className="h-4 w-4 text-muted-foreground" />
                {item.label}
              </Command.Item>
            ))}
          </Command.Group>

          <Command.Group heading={t('command.quickCreate')} className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground">
            <Command.Item value={t('command.newEmployee')} onSelect={() => go('/employees/new')} className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm cursor-pointer data-[selected=true]:bg-accent">
              <UserPlus className="h-4 w-4 text-muted-foreground" /> {t('command.newEmployee')}
            </Command.Item>
            <Command.Item value={t('command.newTeam')} onSelect={() => go('/teams/new')} className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm cursor-pointer data-[selected=true]:bg-accent">
              <UsersRound className="h-4 w-4 text-muted-foreground" /> {t('command.newTeam')}
            </Command.Item>
            <Command.Item value={t('command.newTask')} onSelect={() => go('/tasks/new')} className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm cursor-pointer data-[selected=true]:bg-accent">
              <ClipboardList className="h-4 w-4 text-muted-foreground" /> {t('command.newTask')}
            </Command.Item>
          </Command.Group>

          <Command.Group heading={t('command.actions')} className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground">
            <Command.Item
              value={t('command.toggleTheme')}
              onSelect={() => run(() => setTheme(theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light'))}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm cursor-pointer data-[selected=true]:bg-accent"
            >
              {theme === 'dark' ? <Moon className="h-4 w-4 text-muted-foreground" /> : <Sun className="h-4 w-4 text-muted-foreground" />}
              {t('command.toggleTheme')}
            </Command.Item>
            <Command.Item
              value={t('command.toggleLanguage')}
              onSelect={() => run(() => setLocale(locale === 'zh' ? 'en' : 'zh'))}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm cursor-pointer data-[selected=true]:bg-accent"
            >
              <Languages className="h-4 w-4 text-muted-foreground" /> {t('command.toggleLanguage')}
            </Command.Item>
          </Command.Group>
        </Command.List>
      </Command>
    </div>
  );
}
