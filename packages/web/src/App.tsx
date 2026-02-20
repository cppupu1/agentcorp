import { BrowserRouter, Routes, Route, NavLink, useNavigate } from 'react-router';
import { useState, useEffect } from 'react';
import { ToastProvider, useToast } from '@/components/ui/toast';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { SystemStatusProvider, useSystemStatus } from '@/contexts/SystemStatusContext';
import { systemApi, notificationsApi } from '@/api/client';
import { Bell } from 'lucide-react';
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
import './index.css';

const navItems = [
  { path: '/', label: '首页', icon: '🏠' },
  { path: '/models', label: '模型', icon: '🧠' },
  { path: '/tools', label: '工具', icon: '🔧' },
  { path: '/hr', label: 'HR助手', icon: '🤖' },
  { path: '/employees', label: '员工', icon: '👤' },
  { path: '/teams', label: '团队', icon: '👥' },
  { path: '/tasks', label: '任务', icon: '📋' },
  { path: '/triggers', label: '触发器', icon: '⏰' },
  { path: '/policies', label: '策略', icon: '📜' },
  { path: '/knowledge', label: '知识库', icon: '📚' },
  { path: '/incidents', label: '事故', icon: '🚨' },
  { path: '/deployment', label: '上线', icon: '🚀' },
  { path: '/testing', label: '测试', icon: '🧪' },
  { path: '/change-tests', label: '变更测试', icon: '🔄' },
  { path: '/settings', label: '设置', icon: '⚙️' },
  { path: '/help', label: '帮助', icon: '❓' },
];

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex-1 p-2 space-y-1" aria-label="主导航">
      {navItems.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          end={item.path === '/'}
          onClick={onNavigate}
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
              isActive
                ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                : 'text-sidebar-foreground hover:bg-sidebar-accent/50'
            }${item.path === '/hr' ? ' font-semibold border border-primary/30 bg-primary/5' : ''}`
          }
        >
          <span aria-hidden="true">{item.icon}</span>
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

function NotificationBell() {
  const [count, setCount] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchCount = () => {
      notificationsApi.unreadCount().then(res => setCount(res.data.count)).catch(() => {});
    };
    fetchCount();
    const timer = setInterval(fetchCount, 30000);
    return () => clearInterval(timer);
  }, []);

  return (
    <button
      onClick={() => navigate('/notifications')}
      className="relative p-1.5 rounded-md hover:bg-sidebar-accent/50 transition-colors"
      aria-label="通知"
    >
      <Bell className="h-4 w-4" />
      {count > 0 && (
        <span className="absolute -top-0.5 -right-0.5 h-4 min-w-[16px] px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-medium">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </button>
  );
}

function EmergencyButton() {
  const { status, refresh } = useSystemStatus();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const handleToggle = async () => {
    setLoading(true);
    try {
      if (status === 'frozen') {
        await systemApi.emergencyResume();
        toast('系统已恢复正常', 'success');
      } else {
        await systemApi.emergencyStop();
        toast('系统已紧急冻结', 'success');
      }
      await refresh();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : '操作失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleToggle}
      disabled={loading || status === 'loading'}
      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
        status === 'frozen'
          ? 'bg-green-600 hover:bg-green-700 text-white'
          : 'bg-red-600 hover:bg-red-700 text-white'
      } disabled:opacity-50`}
    >
      {loading ? '...' : status === 'frozen' ? '解除冻结' : '紧急停止'}
    </button>
  );
}

function FrozenBanner() {
  const { status } = useSystemStatus();
  if (status !== 'frozen') return null;
  return (
    <div className="bg-red-600 text-white text-center py-1.5 text-sm font-medium">
      系统已冻结 — 所有任务执行已暂停，新任务创建已禁止
    </div>
  );
}

function MobileHeader() {
  const [open, setOpen] = useState(false);
  return (
    <div className="md:hidden border-b border-border bg-sidebar-background">
      <div className="flex items-center justify-between px-4 py-3">
        <h1 className="text-lg font-semibold">AgentCorp</h1>
        <div className="flex items-center gap-2">
          <NotificationBell />
          <EmergencyButton />
          <button
            onClick={() => setOpen(!open)}
            className="p-1 rounded-md hover:bg-sidebar-accent/50"
            aria-label="切换导航菜单"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {open ? (
                <path d="M18 6L6 18M6 6l12 12" />
              ) : (
                <path d="M3 12h18M3 6h18M3 18h18" />
              )}
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
  return (
    <aside className="hidden md:flex w-56 h-screen border-r border-border bg-sidebar-background flex-col">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <h1 className="text-lg font-semibold text-sidebar-foreground">AgentCorp</h1>
        <div className="flex items-center gap-1">
          <NotificationBell />
          <EmergencyButton />
        </div>
      </div>
      <Sidebar />
    </aside>
  );
}

function NotFoundPage() {
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center">
      <h2 className="text-4xl font-bold text-muted-foreground mb-2">404</h2>
      <p className="text-sm text-muted-foreground mb-4">页面不存在</p>
      <a href="/tasks" className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90">
        返回首页
      </a>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <SystemStatusProvider>
          <FrozenBanner />
          <div className="flex flex-col md:flex-row h-screen">
            <MobileHeader />
            <DesktopSidebar />
            <main className="flex-1 overflow-auto min-w-0">
              <ErrorBoundary>
                <Routes>
                  <Route path="/" element={<HomePage />} />
                  <Route path="/models" element={<ModelsPage />} />
                  <Route path="/tools" element={<ToolsPage />} />
                  <Route path="/hr" element={<HrAssistantPage />} />
                  <Route path="/employees" element={<EmployeesPage />} />
                  <Route path="/employees/new" element={<EmployeeFormPage />} />
                  <Route path="/employees/:id/edit" element={<EmployeeFormPage />} />
                  <Route path="/employees/:id/chat" element={<EmployeeChatPage />} />
                  <Route path="/teams" element={<TeamsPage />} />
                  <Route path="/teams/new" element={<TeamFormPage />} />
                  <Route path="/teams/:id/edit" element={<TeamFormPage />} />
                  <Route path="/tasks" element={<TasksPage />} />
                  <Route path="/tasks/new" element={<TaskCreatePage />} />
                  <Route path="/tasks/:id" element={<TaskDetailPage />} />
                  <Route path="/triggers" element={<TriggersPage />} />
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
              </ErrorBoundary>
            </main>
          </div>
        </SystemStatusProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
