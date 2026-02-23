import { useState } from 'react';
import { Link } from 'react-router';
import { useI18n } from '@/i18n';
import { Brain, Wrench, UserPlus, UsersRound, ClipboardList, Check, ChevronDown, ChevronRight, PartyPopper } from 'lucide-react';

interface Props {
  counts: { models: number; tools: number; employees: number; teams: number; tasks: number };
}

const STEPS = [
  { key: 'step1', icon: Brain, path: '/models', donePath: '/models' },
  { key: 'step2', icon: Wrench, path: '/tools', donePath: '/tools' },
  { key: 'step3', icon: UserPlus, path: '/employees/new', donePath: '/employees' },
  { key: 'step4', icon: UsersRound, path: '/teams/new', donePath: '/teams' },
  { key: 'step5', icon: ClipboardList, path: '/tasks/new', donePath: '/tasks' },
] as const;

export default function OnboardingMilestones({ counts }: Props) {
  const { t } = useI18n();
  const [dismissed, setDismissed] = useState(() => localStorage.getItem('agentcorp_onboarding_dismissed') === 'true');

  const completed = [
    counts.models > 0,
    counts.tools > 0,
    counts.employees > 0,
    counts.teams > 0,
    counts.tasks > 0,
  ];
  const allDone = completed.every(Boolean);
  const currentStep = completed.indexOf(false);

  if (dismissed) {
    return (
      <button
        onClick={() => { setDismissed(false); localStorage.removeItem('agentcorp_onboarding_dismissed'); }}
        className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 mb-2"
      >
        <ChevronRight className="h-3 w-3" /> {t('onboarding.show')}
      </button>
    );
  }

  return (
    <div className="bg-card rounded-3xl border border-border/40 shadow-[var(--shadow-sm)] p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-heading font-medium">{t('onboarding.title')}</h3>
          <p className="text-sm text-muted-foreground mt-0.5">{t('onboarding.subtitle')}</p>
        </div>
        <button
          onClick={() => { setDismissed(true); localStorage.setItem('agentcorp_onboarding_dismissed', 'true'); }}
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
        >
          <ChevronDown className="h-3 w-3" /> {t('onboarding.dismiss')}
        </button>
      </div>

      {allDone ? (
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-success/10 text-success">
          <PartyPopper className="h-5 w-5" />
          <div>
            <div className="font-medium text-sm">{t('onboarding.completed')}</div>
            <div className="text-xs opacity-80">{t('onboarding.completedDesc')}</div>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {STEPS.map((step, i) => {
            const done = completed[i];
            const active = i === currentStep;
            const Icon = step.icon;
            return (
              <Link
                key={step.key}
                to={done ? step.donePath : step.path}
                className={`flex items-center gap-2 px-4 py-3 rounded-2xl text-sm whitespace-nowrap transition-all flex-1 min-w-0 ${
                  done
                    ? 'bg-success/10 text-success'
                    : active
                      ? 'bg-primary/10 text-primary ring-2 ring-primary/20'
                      : 'bg-muted/30 text-muted-foreground'
                }`}
              >
                {done ? (
                  <Check className="h-4 w-4 shrink-0" />
                ) : (
                  <Icon className="h-4 w-4 shrink-0" />
                )}
                <div className="min-w-0">
                  <div className="font-medium text-xs truncate">{t(`onboarding.${step.key}`)}</div>
                  <div className="text-[10px] opacity-70 truncate">{t(`onboarding.${step.key}Desc`)}</div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
