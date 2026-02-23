import { useI18n } from '@/i18n';

export default function HelpPage() {
  const { t } = useI18n();

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8">
      <h2 className="text-3xl font-heading font-medium tracking-tight text-foreground/90">{t('help.title')}</h2>
      <p className="text-muted-foreground">
        {t('help.intro')}
      </p>

      <Section icon="🧠" title={t('help.models')} id="models">
        <p>{t('help.modelsDesc')}</p>
        <ul>
          <li>{t('help.modelsItem1')}</li>
          <li>{t('help.modelsItem2')}</li>
        </ul>
      </Section>

      <Section icon="🔧" title={t('help.tools')} id="tools">
        <p>{t('help.toolsDesc')}</p>
        <ul>
          <li>{t('help.toolsItem1')}</li>
          <li>{t('help.toolsItem2')}</li>
          <li>{t('help.toolsItem3')}</li>
        </ul>
      </Section>

      <Section icon="👤" title={t('help.employees')} id="employees">
        <p>{t('help.employeesDesc')}</p>
        <ul>
          <li>{t('help.employeesItem1')}</li>
          <li>{t('help.employeesItem2')}</li>
          <li>{t('help.employeesItem3')}</li>
        </ul>
      </Section>

      <Section icon="👥" title={t('help.teams')} id="teams">
        <p>{t('help.teamsDesc')}</p>
        <ul>
          <li>{t('help.teamsItem1')}</li>
          <li>{t('help.teamsItem2')}</li>
          <li>{t('help.teamsItem3')}</li>
        </ul>
      </Section>

      <Section icon="📋" title={t('help.tasks')} id="tasks">
        <p>{t('help.tasksDesc')}</p>
        <ul>
          <li>{t('help.tasksItem1')}</li>
          <li>{t('help.tasksItem2')}</li>
          <li>{t('help.tasksItem3')}</li>
        </ul>
      </Section>

      <Section icon="⏰" title={t('help.triggers')} id="triggers">
        <p>{t('help.triggersDesc')}</p>
      </Section>

      <Section icon="📚" title={t('help.knowledge')} id="knowledge">
        <p>{t('help.knowledgeDesc')}</p>
      </Section>

      <Section icon="📜" title={t('help.policies')} id="policies">
        <p>{t('help.policiesDesc')}</p>
      </Section>

      <Section icon="🚨" title={t('help.emergency')} id="emergency">
        <p>{t('help.emergencyDesc')}</p>
      </Section>

      <div className="bg-card rounded-3xl p-6 border border-border/40 text-sm text-muted-foreground shadow-[var(--shadow-sm)]">
        {t('help.recommendedFlow')}
      </div>
    </div>
  );
}

function Section({ icon, title, id, children }: {
  icon: string; title: string; id: string; children: React.ReactNode;
}) {
  return (
    <section id={id} className="space-y-2">
      <h3 className="text-lg font-medium flex items-center gap-2">
        <span>{icon}</span>{title}
      </h3>
      <div className="text-sm text-muted-foreground space-y-2 pl-7 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1">
        {children}
      </div>
    </section>
  );
}
