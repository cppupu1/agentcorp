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
    { label: t('health.activeTasks'), value: stats.activeTasks, icon: Activity, color: 'text-blue-500' },
    { label: t('health.failed24h'), value: stats.failedTasksLast24h, icon: AlertTriangle, color: 'text-red-500' },
    { label: t('health.completed24h'), value: stats.completedTasksLast24h, icon: CheckCircle, color: 'text-green-500' },
    { label: t('health.totalTokens'), value: stats.totalTokenUsage.toLocaleString(), icon: Zap, color: 'text-yellow-500' },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
      {cards.map(c => (
        <div key={c.label} className="border rounded-lg p-4 flex items-center gap-3">
          <c.icon className={`h-5 w-5 ${c.color}`} />
          <div>
            <p className="text-lg font-semibold">{c.value}</p>
            <p className="text-xs text-muted-foreground">{c.label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
