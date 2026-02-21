import { useState, useEffect, useMemo } from 'react';
import { observabilityApi, type TimelineEvent } from '@/api/client';
import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/i18n';
import { Loader2, ChevronDown, ChevronRight } from 'lucide-react';

export default function ToolTracePanel({ taskId }: { taskId: string }) {
  const { t } = useI18n();
  const [traces, setTraces] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    observabilityApi.getToolTrace(taskId)
      .then(res => setTraces(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [taskId]);

  const toolNames = useMemo(() => {
    const names = new Set(traces.map(tr => tr.toolName || ''));
    return Array.from(names).filter(Boolean).sort();
  }, [traces]);

  const filtered = filter
    ? traces.filter(tr => tr.toolName === filter)
    : traces;

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  if (traces.length === 0) {
    return <p className="text-sm text-muted-foreground py-4">{t('toolTrace.noRecords')}</p>;
  }

  return (
    <div className="space-y-3">
      {toolNames.length > 1 && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{t('toolTrace.filter')}</span>
          <select
            className="border rounded px-2 py-1 text-sm bg-background"
            value={filter}
            onChange={e => setFilter(e.target.value)}
          >
            <option value="">{t('common.all')}</option>
            {toolNames.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      )}
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-3 py-2 font-medium w-8"></th>
              <th className="text-left px-3 py-2 font-medium">{t('toolTrace.time')}</th>
              <th className="text-left px-3 py-2 font-medium">{t('toolTrace.tool')}</th>
              <th className="text-left px-3 py-2 font-medium">{t('toolTrace.duration')}</th>
              <th className="text-left px-3 py-2 font-medium">{t('toolTrace.status')}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(tr => (
              <TraceRow
                key={tr.id}
                trace={tr}
                expanded={expandedId === tr.id}
                onToggle={() => setExpandedId(expandedId === tr.id ? null : tr.id)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TraceRow({ trace, expanded, onToggle }: {
  trace: TimelineEvent;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { t } = useI18n();
  const time = new Date(trace.createdAt).toLocaleTimeString();
  return (
    <>
      <tr className="border-t cursor-pointer hover:bg-muted/30" onClick={onToggle}>
        <td className="px-3 py-2">
          {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        </td>
        <td className="px-3 py-2 text-muted-foreground">{time}</td>
        <td className="px-3 py-2 font-medium">{trace.toolName}</td>
        <td className="px-3 py-2 text-muted-foreground">
          {trace.durationMs != null ? `${trace.durationMs}ms` : '-'}
        </td>
        <td className="px-3 py-2">
          <Badge variant={trace.isError ? 'destructive' : 'default'} className="text-xs">
            {trace.isError ? t('toolTrace.error') : t('toolTrace.success')}
          </Badge>
        </td>
      </tr>
      {expanded && (
        <tr className="border-t bg-muted/20">
          <td colSpan={5} className="px-3 py-2">
            <div className="space-y-2">
              {trace.input != null && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">{t('timeline.input')}</p>
                  <pre className="text-xs bg-muted rounded p-2 overflow-auto max-h-32">{JSON.stringify(trace.input, null, 2)}</pre>
                </div>
              )}
              {trace.output != null && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">{t('timeline.output')}</p>
                  <pre className="text-xs bg-muted rounded p-2 overflow-auto max-h-32">{JSON.stringify(trace.output, null, 2)}</pre>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
