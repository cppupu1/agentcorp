import { useState, useEffect, useCallback } from 'react';
import { observabilityApi, type TimelineEvent } from '@/api/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/i18n';
import { Loader2, Clock, Wrench, Brain, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';

export default function TaskTimeline({ taskId }: { taskId: string }) {
  const { t } = useI18n();
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const res = await observabilityApi.getTimeline(taskId);
      setEvents(res.data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [taskId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground py-4">{t('timeline.noEvents')}</p>;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-end">
        <Button size="sm" variant="ghost" onClick={() => fetchData(true)} disabled={refreshing}>
          <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} />
        </Button>
      </div>
      {events.map(ev => (
        <TimelineItem key={ev.id} event={ev} />
      ))}
    </div>
  );
}

const ACTOR_LABELS: Record<string, string> = { pm: 'timeline.actorPm', employee: 'timeline.actorEmployee', system: 'timeline.actorSystem' };

function TimelineItem({ event }: { event: TimelineEvent }) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const isDecision = event.type === 'decision';
  const time = new Date(event.createdAt).toLocaleTimeString();

  return (
    <div className="border rounded-lg p-3">
      <div className="flex items-center gap-2 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        {expanded ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
        {isDecision ? <Brain className="h-4 w-4 text-blue-500" /> : <Wrench className="h-4 w-4 text-orange-500" />}
        <span className="text-sm font-medium flex-1">
          {isDecision ? event.action : event.toolName}
        </span>
        {isDecision && event.actor && (
          <Badge variant="outline" className="text-xs">{ACTOR_LABELS[event.actor] ? t(ACTOR_LABELS[event.actor]) : event.actor}</Badge>
        )}
        {!isDecision && event.isError && (
          <Badge variant="destructive" className="text-xs">{t('timeline.error')}</Badge>
        )}
        {!isDecision && event.durationMs != null && (
          <span className="text-xs text-muted-foreground">{event.durationMs}ms</span>
        )}
        <span className="text-xs text-muted-foreground flex items-center gap-1">
          <Clock className="h-3 w-3" />{time}
        </span>
      </div>
      {expanded && (
        <div className="mt-2 space-y-2 pl-7">
          {event.reasoning && (
            <div><p className="text-xs text-muted-foreground">{t('timeline.reasoning')}</p><p className="text-xs bg-muted rounded p-2">{event.reasoning}</p></div>
          )}
          {event.input != null && (
            <div><p className="text-xs text-muted-foreground">{t('timeline.input')}</p><pre className="text-xs bg-muted rounded p-2 overflow-auto max-h-40">{JSON.stringify(event.input, null, 2)}</pre></div>
          )}
          {event.output != null && (
            <div><p className="text-xs text-muted-foreground">{t('timeline.output')}</p><pre className="text-xs bg-muted rounded p-2 overflow-auto max-h-40">{JSON.stringify(event.output, null, 2)}</pre></div>
          )}
        </div>
      )}
    </div>
  );
}
