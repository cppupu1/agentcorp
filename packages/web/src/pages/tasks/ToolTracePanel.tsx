import { useState, useEffect, useMemo } from 'react';
import { observabilityApi, type TimelineEvent } from '@/api/client';
import { Badge } from '@/components/ui/badge';
import { Loader2, ChevronDown, ChevronRight } from 'lucide-react';

export default function ToolTracePanel({ taskId }: { taskId: string }) {
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
    const names = new Set(traces.map(t => t.toolName || ''));
    return Array.from(names).filter(Boolean).sort();
  }, [traces]);

  const filtered = filter
    ? traces.filter(t => t.toolName === filter)
    : traces;

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  if (traces.length === 0) {
    return <p className="text-sm text-muted-foreground py-4">暂无工具调用记录</p>;
  }

  return (
    <div className="space-y-3">
      {toolNames.length > 1 && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">筛选:</span>
          <select
            className="border rounded px-2 py-1 text-sm bg-background"
            value={filter}
            onChange={e => setFilter(e.target.value)}
          >
            <option value="">全部</option>
            {toolNames.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      )}
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-3 py-2 font-medium w-8"></th>
              <th className="text-left px-3 py-2 font-medium">时间</th>
              <th className="text-left px-3 py-2 font-medium">工具</th>
              <th className="text-left px-3 py-2 font-medium">耗时</th>
              <th className="text-left px-3 py-2 font-medium">状态</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(t => (
              <TraceRow
                key={t.id}
                trace={t}
                expanded={expandedId === t.id}
                onToggle={() => setExpandedId(expandedId === t.id ? null : t.id)}
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
            {trace.isError ? '错误' : '成功'}
          </Badge>
        </td>
      </tr>
      {expanded && (
        <tr className="border-t bg-muted/20">
          <td colSpan={5} className="px-3 py-2">
            <div className="space-y-2">
              {trace.input != null && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">输入</p>
                  <pre className="text-xs bg-muted rounded p-2 overflow-auto max-h-32">{JSON.stringify(trace.input, null, 2)}</pre>
                </div>
              )}
              {trace.output != null && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">输出</p>
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
