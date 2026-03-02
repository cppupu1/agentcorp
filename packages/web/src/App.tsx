import { BrowserRouter, Routes, Route, NavLink, useNavigate, useLocation } from 'react-router';
import { useState, useEffect, createContext, useContext } from 'react';
import { ToastProvider, useToast } from '@/components/ui/toast';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { SystemStatusProvider, useSystemStatus } from '@/contexts/SystemStatusContext';
import { systemApi, notificationsApi } from '@/api/client';
import {
  Bell, Languages, Home, Brain, Wrench, Bot, Users, UsersRound, MessageSquarePlus,
  ClipboardList, Timer, ShieldCheck, BookOpen, BarChart3, DollarSign,
  Microscope, AlertTriangle, Rocket, FlaskConical, RefreshCw,
  Settings, HelpCircle, Search, PanelLeftClose, PanelLeft, ChevronDown,
  Sun, Moon, Monitor, ClipboardCheck,
} from 'lucide-react';
import { useI18n, type TranslationKeys } from '@/i18n';
import { useTheme } from '@/contexts/ThemeContext';
import ModelsPage from '@/pages/models/ModelsPage';
import ToolsPage from '@/pages/tools/ToolsPage';
import EmployeesPage from '@/pages/employees/EmployeesPage';
import EmployeeFormPage from '@/pages/employees/EmployeeFormPage';
import EmployeeChatPage from '@/pages/employees/EmployeeChatPage';
import TeamsPage from '@/pages/teams/TeamsPage';
import TeamFormPage from '@/pages/teams/TeamFormPage';
import TasksPage from '@/pages/tasks/TasksPage';
import TaskCreatePage from '@/pages/tasks/TaskCreatePage';
import TaskDetailPage from '@/pages/tasks/TaskDetailPage';
import HomePage from '@/pages/home/HomePage';
import SettingsPage from '@/pages/settings/SettingsPage';
import NotificationsPage from '@/pages/notifications/NotificationsPage';
import IncidentsPage from '@/pages/incidents/IncidentsPage';
import IncidentDetailPage from '@/pages/incidents/IncidentDetailPage';
import PoliciesPage from '@/pages/policies/PoliciesPage';
import KnowledgeBasesPage from '@/pages/knowledge/KnowledgeBasesPage';
import TriggersPage from '@/pages/triggers/TriggersPage';
import DeploymentPage from '@/pages/deployment/DeploymentPage';
import ChangeTestConfigsPage from '@/pages/testing/ChangeTestConfigsPage';
import TestingPage from '@/pages/testing/TestingPage';
import HelpPage from '@/pages/help/HelpPage';
import HrAssistantPage from '@/pages/hr/HrAssistantPage';
import PmAssistantPage from '@/pages/pm/PmAssistantPage';
import QualityDashboardPage from '@/pages/quality/QualityDashboardPage';
import RoiReviewPage from '@/pages/roi/RoiReviewPage';
import ImprovementPage from '@/pages/improvement/ImprovementPage';
import ReviewDashboardPage from '@/pages/review/ReviewDashboardPage';
import PageLayout from '@/components/PageLayout';
import CommandPalette from '@/components/CommandPalette';
import ChatDrawer from '@/components/ChatDrawer';
import { ChatDrawerProvider } from '@/contexts/ChatDrawerContext';
import './index.css';

type NavItem = { path: string; labelKey: TranslationKeys; icon: React.ComponentType<{ className?: string }> };
type NavGroup = { groupKey: TranslationKeys; items: NavItem[] };

const navGroups: NavGroup[] = [
  {
    groupKey: 'nav.group.workspace',
    items: [
      { path: '/', labelKey: 'nav.home', icon: Home },
      { path: '/hr', labelKey: 'nav.hr', icon: Bot },
      { path: '/pm', labelKey: 'nav.pm', icon: MessageSquarePlus },
      { path: '/tasks', labelKey: 'nav.tasks', icon: ClipboardList },
    ],
  },
  {
    groupKey: 'nav.group.resources',
    items: [
      { path: '/models', labelKey: 'nav.models', icon: Brain },
      { path: '/tools', labelKey: 'nav.tools', icon: Wrench },
      { path: '/employees', labelKey: 'nav.employees', icon: Users },
      { path: '/teams', labelKey: 'nav.teams', icon: UsersRound },
    ],
  },
  {
    groupKey: 'nav.group.operations',
    items: [
      { path: '/triggers', labelKey: 'nav.triggers', icon: Timer },
      { path: '/policies', labelKey: 'nav.policies', icon: ShieldCheck },
      { path: '/knowledge', labelKey: 'nav.knowledge', icon: BookOpen },
    ],
  },
  {
    groupKey: 'nav.group.monitoring',
    items: [
      { path: '/quality', labelKey: 'nav.quality', icon: BarChart3 },
      { path: '/roi', labelKey: 'nav.roi', icon: DollarSign },
      { path: '/improvement', labelKey: 'nav.improvement', icon: Microscope },
      { path: '/incidents', labelKey: 'nav.incidents', icon: AlertTriangle },
      { path: '/reviews', labelKey: 'nav.reviews', icon: ClipboardCheck },
      { path: '/deployment', labelKey: 'nav.deployment', icon: Rocket },
      { path: '/testing', labelKey: 'nav.testing', icon: FlaskConical },
      { path: '/change-tests', labelKey: 'nav.changeTests', icon: RefreshCw },
    ],
  },
  {
    groupKey: 'nav.group.system',
    items: [
      { path: '/settings', labelKey: 'nav.settings', icon: Settings },
      { path: '/help', labelKey: 'nav.help', icon: HelpCircle },
    ],
  },
];

// Sidebar collapse context
const SidebarContext = createContext({ collapsed: false, toggle: () => {} });
const useSidebar = () => useContext(SidebarContext);

function NavGroupSection({ group, collapsed, onNavigate }: { group: NavGroup; collapsed: boolean; onNavigate?: () => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(true);

  return (
    <div className="mb-1">
      {!collapsed && (
        <button
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="flex items-center justify-between w-full px-5 py-2.5 text-[12px] font-medium tracking-wide text-sidebar-foreground/60 hover:text-sidebar-foreground transition-colors md-transition"
        >
          <span>{t(group.groupKey)}</span>
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? '' : '-rotate-90'}`} />
        </button>
      )}
      {(open || collapsed) && (
        <div className="space-y-0.5">
          {group.items.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              onClick={onNavigate}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-full text-[14px] font-medium transition-all duration-200 md-transition ${
                  collapsed ? 'justify-center px-2 py-2.5 mx-1' : 'px-4 py-2.5 mx-2'
                } ${
                  isActive
                    ? 'bg-sidebar-primary/10 text-sidebar-primary'
                    : 'text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
                }`
              }
              title={collapsed ? t(item.labelKey) : undefined}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span>{t(item.labelKey)}</span>}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { collapsed } = useSidebar();
  return (
    <nav className="flex-1 overflow-y-auto py-2 space-y-1" aria-label="Navigation">
      {navGroups.map((group) => (
        <NavGroupSection key={group.groupKey} group={group} collapsed={collapsed} onNavigate={onNavigate} />
      ))}
    </nav>
  );
}

function NotificationBell() {
  const [count, setCount] = useState(0);
  const [prevCount, setPrevCount] = useState(0);
  const navigate = useNavigate();
  const { t } = useI18n();

  // Request browser notification permission on mount
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  useEffect(() => {
    const fetchCount = () => {
      notificationsApi.unreadCount().then(res => {
        const newCount = res.data.count;
        // Trigger browser notification when unread count increases
        if (newCount > prevCount && prevCount >= 0 && 'Notification' in window && Notification.permission === 'granted') {
          new Notification(t('notifications.newNotification'), {
            body: t('notifications.title'),
            icon: '/favicon.ico',
          });
        }
        setPrevCount(count);
        setCount(newCount);
      }).catch(() => {});
    };
    fetchCount();
    const timer = setInterval(fetchCount, 30000);
    return () => clearInterval(timer);
  }, [prevCount, count]);

  return (
    <button
      onClick={() => navigate('/notifications')}
      className="relative p-1.5 rounded-lg hover:bg-sidebar-accent/50 transition-colors"
      aria-label={t('nav.notifications')}
    >
      <Bell className="h-4 w-4" />
      {count > 0 && (
        <span className="absolute -top-0.5 -right-0.5 h-4 min-w-[16px] px-1 flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-medium">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </button>
  );
}

function EmergencyButton() {
  const { status, refresh } = useSystemStatus();
  const { toast } = useToast();
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);

  const handleToggle = async () => {
    setLoading(true);
    try {
      if (status === 'frozen') {
        await systemApi.emergencyResume();
        toast(t('common.operationSuccess'), 'success');
      } else {
        await systemApi.emergencyStop();
        toast(t('common.operationSuccess'), 'success');
      }
      await refresh();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : t('common.operationFailed'), 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleToggle}
      disabled={loading || status === 'loading'}
      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
        status === 'frozen'
          ? 'bg-success hover:bg-success/90 text-success-foreground'
          : 'bg-destructive hover:bg-destructive/90 text-destructive-foreground'
      } disabled:opacity-50`}
    >
      {loading ? '...' : status === 'frozen' ? t('app.emergencyResume') : t('app.emergencyStop')}
    </button>
  );
}

function FrozenBanner() {
  const { status } = useSystemStatus();
  const { t } = useI18n();
  if (status !== 'frozen') return null;
  return (
    <div className="bg-destructive text-destructive-foreground text-center py-1.5 text-sm font-medium">
      {t('app.frozen')}
    </div>
  );
}

function LanguageToggle() {
  const { locale, setLocale } = useI18n();
  return (
    <button
      onClick={() => setLocale(locale === 'zh' ? 'en' : 'zh')}
      className="p-1.5 rounded-lg hover:bg-sidebar-accent/50 transition-colors text-xs font-medium"
      title={locale === 'zh' ? 'English' : '中文'}
      aria-label={locale === 'zh' ? 'Switch to English' : '切换到中文'}
    >
      <Languages className="h-4 w-4" />
    </button>
  );
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const { t } = useI18n();
  const next = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light';
  const Icon = theme === 'dark' ? Moon : theme === 'system' ? Monitor : Sun;
  const label = theme === 'light' ? t('theme.light') : theme === 'dark' ? t('theme.dark') : t('theme.system');
  return (
    <button
      onClick={() => setTheme(next)}
      className="p-1.5 rounded-lg hover:bg-sidebar-accent/50 transition-colors"
      title={label}
      aria-label={label}
      data-testid="theme-toggle"
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

function MobileHeader() {
  const [open, setOpen] = useState(false);
  return (
    <div className="md:hidden border-b border-sidebar-border bg-sidebar-background text-sidebar-foreground">
      <div className="flex items-center justify-between px-4 h-16">
        <h1 className="text-xl font-heading font-medium tracking-tight">AgentCorp</h1>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <LanguageToggle />
          <NotificationBell />
          <EmergencyButton />
          <button
            onClick={() => setOpen(!open)}
            className="p-1.5 rounded-lg hover:bg-sidebar-accent/50"
            aria-label="Toggle navigation"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {open ? <path d="M18 6L6 18M6 6l12 12" /> : <path d="M3 12h18M3 6h18M3 18h18" />}
            </svg>
          </button>
        </div>
      </div>
      {open && (
        <div className="pb-2">
          <Sidebar onNavigate={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}

function DesktopSidebar() {
  const { collapsed, toggle } = useSidebar();
  const { t } = useI18n();
  return (
    <aside className={`hidden md:flex h-screen flex-col bg-sidebar-background text-sidebar-foreground border-r border-border/40 transition-all duration-300 md-transition ${collapsed ? 'w-20' : 'w-72'}`}>
      <div className={`flex items-center h-16 shrink-0 ${collapsed ? 'justify-center px-2' : 'justify-between px-6'}`}>
        {!collapsed && <h1 className="text-xl font-heading font-medium text-sidebar-foreground tracking-tight">AgentCorp</h1>}
        <button onClick={toggle} className="p-2 rounded-full hover:bg-sidebar-accent/50 text-sidebar-foreground/60 hover:text-sidebar-foreground transition-colors md-transition" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={collapsed ? 'Expand' : 'Collapse'}>
          {collapsed ? <PanelLeft className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
        </button>
      </div>
      <Sidebar />
      <div className={`mt-auto pb-4 pt-2 px-4 shrink-0 ${collapsed ? 'flex flex-col items-center gap-3' : 'flex items-center gap-3'}`}>
        <ThemeToggle />
        <LanguageToggle />
        <NotificationBell />
        {!collapsed && <EmergencyButton />}
      </div>
    </aside>
  );
}

function NotFoundPage() {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center">
      <h2 className="text-4xl font-bold text-muted-foreground mb-2">404</h2>
      <p className="text-sm text-muted-foreground mb-4">{t('app.notFound')}</p>
      <a href="/tasks" className="px-6 py-2 text-sm rounded-full bg-primary text-primary-foreground hover:bg-primary/90">
        {t('app.backHome')}
      </a>
    </div>
  );
}

export default function App() {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <BrowserRouter>
      <ToastProvider>
        <SystemStatusProvider>
          <ChatDrawerProvider>
          <SidebarContext.Provider value={{ collapsed, toggle: () => setCollapsed(c => !c) }}>
            <CommandPalette />
            <ChatDrawer />
            <FrozenBanner />
            <div className="flex flex-col md:flex-row h-screen">
              <MobileHeader />
              <DesktopSidebar />
              <main className="flex-1 min-w-0 bg-background">
                <ErrorBoundary>
                  <PageLayout>
                  <Routes>
                  <Route path="/" element={<HomePage />} />
                  <Route path="/models" element={<ModelsPage />} />
                  <Route path="/tools" element={<ToolsPage />} />
                  <Route path="/hr" element={<HrAssistantPage />} />
                  <Route path="/pm" element={<PmAssistantPage />} />
                  <Route path="/employees" element={<EmployeesPage />} />
                  <Route path="/employees/new" element={<EmployeeFormPage />} />
                  <Route path="/employees/:id/edit" element={<EmployeeFormPage />} />
                  <Route path="/employees/:id/chat" element={<EmployeeChatPage />} />
                  <Route path="/teams" element={<TeamsPage />} />
                  <Route path="/teams/new" element={<TeamFormPage />} />
                  <Route path="/teams/:id" element={<TeamFormPage />} />
                  <Route path="/teams/:id/edit" element={<TeamFormPage />} />
                  <Route path="/tasks" element={<TasksPage />} />
                  <Route path="/tasks/new" element={<TaskCreatePage />} />
                  <Route path="/tasks/:id" element={<TaskDetailPage />} />
                  <Route path="/triggers" element={<TriggersPage />} />
                  <Route path="/quality" element={<QualityDashboardPage />} />
                  <Route path="/roi" element={<RoiReviewPage />} />
                  <Route path="/improvement" element={<ImprovementPage />} />
                  <Route path="/reviews" element={<ReviewDashboardPage />} />
                  <Route path="/incidents" element={<IncidentsPage />} />
                  <Route path="/incidents/:id" element={<IncidentDetailPage />} />
                  <Route path="/policies" element={<PoliciesPage />} />
                  <Route path="/knowledge" element={<KnowledgeBasesPage />} />
                  <Route path="/deployment" element={<DeploymentPage />} />
                  <Route path="/testing" element={<TestingPage />} />
                  <Route path="/change-tests" element={<ChangeTestConfigsPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="/help" element={<HelpPage />} />
                  <Route path="/notifications" element={<NotificationsPage />} />
                  <Route path="*" element={<NotFoundPage />} />
                </Routes>
                  </PageLayout>
                </ErrorBoundary>
              </main>
            </div>
          </SidebarContext.Provider>
          </ChatDrawerProvider>
        </SystemStatusProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
