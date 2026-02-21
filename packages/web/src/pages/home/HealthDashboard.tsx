import { useState, useEffect } from 'react';
import { observabilityApi, type HealthStats } from '@/api/client';
import { Activity, AlertTriangle, CheckCircle, Zap } from 'lucide-react';
import { useI18n } from '@/i18n';

export default function HealthDashboard() {
  const [stats, setStats] = useState<HealthStats | null>(null);
  const { t } = useI18n();

  useEffect(() => {
    observabilityApi.getHealthStats()
      .then(res => setStats(res.data))
      .catch(() => {});
  }, []);

  if (!stats) return null;

  const cards = [
    { label: t('health.activeTasks'), value: stats.activeTasks, icon: Activity, bg: 'bg-info/10', color: 'text-info', ring: 'ring-info/20' },
    { label: t('health.failed24h'), value: stats.failedTasksLast24h, icon: AlertTriangle, bg: 'bg-destructive/10', color: 'text-destructive', ring: 'ring-destructive/20' },
    { label: t('health.completed24h'), value: stats.completedTasksLast24h, icon: CheckCircle, bg: 'bg-success/10', color: 'text-success', ring: 'ring-success/20' },
    { label: t('health.totalTokens'), value: stats.totalTokenUsage.toLocaleString(), icon: Zap, bg: 'bg-warning/10', color: 'text-warning', ring: 'ring-warning/20' },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map(c => (
        <div key={c.label} className="bg-card rounded-xl p-5 shadow-sm border border-border/50 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <div className={`p-2 rounded-lg ${c.bg} ring-1 ${c.ring}`}>
              <c.icon className={`h-4 w-4 ${c.color}`} />
            </div>
          </div>
          <p className="text-2xl font-bold tracking-tight">{c.value}</p>
          <p className="text-xs text-muted-foreground mt-1">{c.label}</p>
        </div>
      ))}
    </div>
  );
}
