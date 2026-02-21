import { useState, useEffect } from 'react';
import { evidenceApi, type EvidenceItem, type EvidenceChainSummary } from '@/api/client';
import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/i18n';
import { Loader2, ChevronDown, ChevronRight } from 'lucide-react';

const TYPE_KEYS: Record<string, { key: string; color: string }> = {
  input: { key: 'evidence.typeInput', color: 'bg-blue-100 text-blue-800' },
  output: { key: 'evidence.typeOutput', color: 'bg-green-100 text-green-800' },
  decision: { key: 'evidence.typeDecision', color: 'bg-purple-100 text-purple-800' },
  tool_call: { key: 'evidence.typeToolCall', color: 'bg-orange-100 text-orange-800' },
  review: { key: 'evidence.typeReview', color: 'bg-yellow-100 text-yellow-800' },
  approval: { key: 'evidence.typeApproval', color: 'bg-emerald-100 text-emerald-800' },
};

const SOURCE_KEYS: Record<string, string> = {
  pm: 'evidence.sourcePm',
  employee: 'evidence.sourceEmployee',
  system: 'evidence.sourceSystem',
  observer: 'evidence.sourceObserver',
};

function TypeBadge({ type }: { type: string }) {
  const { t } = useI18n();
  const config = TYPE_KEYS[type] || { key: '', color: 'bg-gray-100 text-gray-800' };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${config.color}`}>{config.key ? t(config.key) : type}</span>;
}

function JsonViewer({ data }: { data: unknown }) {
  const { t } = useI18n();
  if (data === null || data === undefined) return <span className="text-muted-foreground text-xs">{t('evidence.noContent')}</span>;
  const str = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  return (
    <pre className="text-xs bg-muted/50 rounded p-2 overflow-x-auto max-h-48 whitespace-pre-wrap break-all">
      {str}
    </pre>
  );
}

function EvidenceItemRow({ item }: { item: EvidenceItem }) {
  const { t, locale } = useI18n();
  const [expanded, setExpanded] = useState(false);
  let parsedContent: unknown = null;
  try { parsedContent = JSON.parse(item.content); } catch { parsedContent = item.content; }

  return (
    <div className="relative pl-6 pb-4">
      <div className="absolute left-2 top-2 w-0.5 h-full bg-border" />
      <div className="absolute left-0.5 top-2 w-3 h-3 rounded-full border-2 border-primary bg-background" />
      <div className="border rounded-lg p-3">
        <div className="flex items-center gap-2 flex-wrap">
          <TypeBadge type={item.type} />
          <span className="text-sm font-medium flex-1">{item.title}</span>
          {item.source && (
            <Badge variant="outline" className="text-xs">{SOURCE_KEYS[item.source] ? t(SOURCE_KEYS[item.source]) : item.source}</Badge>
          )}
          <span className="text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US')}</span>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-muted-foreground hover:text-foreground"
            aria-label={expanded ? t('evidence.collapse') : t('evidence.expand')}
          >
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        </div>
        {expanded && (
          <div className="mt-2">
            <JsonViewer data={parsedContent} />
          </div>
        )}
      </div>
    </div>
  );
}

export default function EvidencePanel({ taskId }: { taskId: string }) {
  const { t } = useI18n();
  const [items, setItems] = useState<EvidenceItem[]>([]);
  const [summary, setSummary] = useState<EvidenceChainSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    Promise.all([
      evidenceApi.getEvidence(taskId),
      evidenceApi.getSummary(taskId),
    ]).then(([evidenceRes, summaryRes]) => {
      setItems(evidenceRes.data);
      setSummary(summaryRes.data);
    }).catch((err) => {
      setError(err instanceof Error ? err.message : t('evidence.loadFailed'));
    }).finally(() => setLoading(false));
  }, [taskId]);

  if (loading) {
    return <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  if (error) {
    return <p className="text-sm text-destructive py-4">{error}</p>;
  }

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground py-4">{t('evidence.noData')}</p>;
  }

  return (
    <div className="space-y-4">
      {summary && (
        <div className="flex flex-wrap gap-3 p-3 bg-muted/30 rounded-lg">
          <span className="text-sm font-medium">{t('evidence.total', { count: summary.totalItems })}</span>
          {Object.entries(summary.byType).map(([type, count]) => (
            <span key={type} className="text-xs text-muted-foreground">
              <TypeBadge type={type} /> {count}
            </span>
          ))}
        </div>
      )}
      <div>
        {items.map(item => (
          <EvidenceItemRow key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}
