import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  type Node,
  type Edge,
  Position,
  Handle,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from '@dagrejs/dagre';
import { visualizationApi, type DAGData } from '@/api/client';
import { useI18n } from '@/i18n';
import { Loader2 } from 'lucide-react';

const STATUS_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  pending: { bg: 'var(--muted)', border: 'var(--border)', text: 'var(--muted-foreground)' },
  executing: { bg: 'color-mix(in oklch, var(--primary) 12%, transparent)', border: 'var(--primary)', text: 'var(--primary)' },
  running: { bg: 'color-mix(in oklch, var(--primary) 12%, transparent)', border: 'var(--primary)', text: 'var(--primary)' },
  completed: { bg: 'color-mix(in oklch, var(--success) 12%, transparent)', border: 'var(--success)', text: 'var(--success)' },
  failed: { bg: 'color-mix(in oklch, var(--destructive) 12%, transparent)', border: 'var(--destructive)', text: 'var(--destructive)' },
};

const STATUS_LABEL_KEYS: Record<string, string> = {
  pending: 'dag.statusPending',
  executing: 'dag.statusExecuting',
  running: 'dag.statusExecuting',
  completed: 'dag.statusCompleted',
  failed: 'dag.statusFailed',
};

const NODE_WIDTH = 260;
const NODE_HEIGHT = 100;

function getLayoutedElements(nodes: Node[], edges: Edge[]) {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB', nodesep: 60, ranksep: 90 });

  nodes.forEach((node) => {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  });
  edges.forEach((edge) => {
    g.setEdge(edge.source, edge.target);
  });

  dagre.layout(g);

  const layoutedNodes = nodes.map((node) => {
    const pos = g.node(node.id);
    return {
      ...node,
      position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 },
    };
  });

  return { nodes: layoutedNodes, edges };
}

function SubtaskNode({ data }: { data: { title: string; status: string; assigneeName: string } }) {
  const { t } = useI18n();
  const colors = STATUS_COLORS[data.status] || STATUS_COLORS.pending;
  return (
    <div
      className="shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] md-transition"
      style={{
        background: colors.bg,
        border: `1px solid color-mix(in oklch, ${colors.border} 30%, transparent)`,
        borderRadius: 24,
        padding: '12px 16px',
        width: NODE_WIDTH,
        minHeight: NODE_HEIGHT,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: 'transparent', border: 'none' }} />
      <div className="font-heading" style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', color: 'var(--foreground)', lineHeight: 1.3 }}>
        {data.title}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }}>
        <span
          style={{
            fontSize: 11,
            color: colors.text,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            padding: '2px 8px',
            borderRadius: 12,
            background: `color-mix(in oklch, ${colors.border} 15%, transparent)`,
          }}
        >
          {STATUS_LABEL_KEYS[data.status] ? t(STATUS_LABEL_KEYS[data.status]) : data.status}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--background)', padding: '2px 8px 2px 2px', borderRadius: 16, border: `1px solid ${colors.border}` }}>
          <div style={{ width: 20, height: 20, borderRadius: '50%', background: `color-mix(in oklch, ${colors.border} 20%, transparent)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: colors.text }}>
            {data.assigneeName.charAt(0).toUpperCase()}
          </div>
          <span style={{ fontSize: 11, color: 'var(--foreground)', fontWeight: 600 }}>{data.assigneeName}</span>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} style={{ background: 'transparent', border: 'none' }} />
    </div>
  );
}

const nodeTypes = { subtask: SubtaskNode };

export default function TaskDAG({ taskId }: { taskId: string }) {
  const { t } = useI18n();
  const [dagData, setDagData] = useState<DAGData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    visualizationApi.getDAG(taskId)
      .then(res => { setDagData(res.data); setError(null); })
      .catch(err => setError(err instanceof Error ? err.message : t('common.loadFailed')))
      .finally(() => setLoading(false));
  }, [taskId]);

  const { layoutedNodes, layoutedEdges } = useMemo(() => {
    if (!dagData) return { layoutedNodes: [], layoutedEdges: [] };

    const flowNodes: Node[] = dagData.nodes.map((n) => ({
      id: n.id,
      type: 'subtask',
      position: { x: 0, y: 0 },
      data: { title: n.title, status: n.status, assigneeName: n.assigneeName },
    }));

    const flowEdges: Edge[] = dagData.edges.map((e, i) => ({
      id: `e-${i}`,
      source: e.source,
      target: e.target,
      animated: true,
      style: { stroke: 'var(--muted-foreground)', strokeWidth: 2, opacity: 0.5 },
    }));

    const { nodes, edges } = getLayoutedElements(flowNodes, flowEdges);
    return { layoutedNodes: nodes, layoutedEdges: edges };
  }, [dagData]);

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  if (error) {
    return <div className="text-center py-8 text-sm text-muted-foreground">{error}</div>;
  }

  if (!dagData || dagData.nodes.length === 0) {
    return <div className="text-center py-8 text-sm text-muted-foreground">{t('dag.noSubtasks')}</div>;
  }

  const { stats } = dagData;

  return (
    <div className="space-y-4">
      <div className="flex gap-4 text-[13px] font-medium px-2 uppercase tracking-wide">
        <span className="text-foreground/80">{t('dag.total', { count: stats.total })}</span>
        <span className="text-success">{t('dag.completed', { count: stats.completed })}</span>
        <span className="text-primary">{t('dag.executing', { count: stats.executing })}</span>
        {stats.failed > 0 && <span className="text-destructive">{t('dag.failed', { count: stats.failed })}</span>}
        <span className="text-muted-foreground">{t('dag.pending', { count: stats.pending })}</span>
      </div>
      <div style={{ height: 500 }} className="border border-border/40 bg-muted/20 rounded-3xl overflow-hidden shadow-inner">
        <ReactFlow
          nodes={layoutedNodes}
          edges={layoutedEdges}
          nodeTypes={nodeTypes}
          fitView
          proOptions={{ hideAttribution: true }}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
        >
          <Background />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </div>
  );
}
