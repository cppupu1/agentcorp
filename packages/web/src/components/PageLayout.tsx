import { type ReactNode } from 'react';
import { useLocation, Link } from 'react-router';
import { useI18n, type TranslationKeys } from '@/i18n';
import { ChevronRight } from 'lucide-react';

const routeLabels: Record<string, TranslationKeys> = {
  '/': 'nav.home',
  '/models': 'nav.models',
  '/tools': 'nav.tools',
  '/hr': 'nav.hr',
  '/employees': 'nav.employees',
  '/teams': 'nav.teams',
  '/tasks': 'nav.tasks',
  '/triggers': 'nav.triggers',
  '/policies': 'nav.policies',
  '/knowledge': 'nav.knowledge',
  '/quality': 'nav.quality',
  '/roi': 'nav.roi',
  '/improvement': 'nav.improvement',
  '/incidents': 'nav.incidents',
  '/deployment': 'nav.deployment',
  '/testing': 'nav.testing',
  '/change-tests': 'nav.changeTests',
  '/settings': 'nav.settings',
  '/help': 'nav.help',
  '/notifications': 'nav.notifications',
};

function Breadcrumbs() {
  const { pathname } = useLocation();
  const { t } = useI18n();

  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) return null;

  const crumbs: { label: string; path: string }[] = [];
  let accumulated = '';
  for (const seg of segments) {
    accumulated += '/' + seg;
    const key = routeLabels[accumulated];
    crumbs.push({ label: key ? t(key) : seg, path: accumulated });
  }

  return (
    <nav className="flex items-center gap-1 text-sm text-muted-foreground" aria-label="Breadcrumb">
      <Link to="/" className="hover:text-foreground hover:underline underline-offset-4 transition-colors">{t('nav.home')}</Link>
      {crumbs.map((c) => (
        <span key={c.path} className="flex items-center gap-1">
          <ChevronRight className="h-3 w-3" />
          <Link to={c.path} className="hover:text-foreground hover:underline underline-offset-4 transition-colors">{c.label}</Link>
        </span>
      ))}
    </nav>
  );
}

export default function PageLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col h-full">
      <header className="shrink-0 h-14 flex items-center px-6 bg-card shadow-[var(--shadow-sm)]">
        <Breadcrumbs />
      </header>
      <div className="flex-1 overflow-auto">
        {children}
      </div>
    </div>
  );
}
