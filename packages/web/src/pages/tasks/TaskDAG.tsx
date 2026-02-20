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
import { Loader2 } from 'lucide-react';

const STATUS_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  pending: { bg: '#f3f4f6', border: '#9ca3af', text: '#6b7280' },
  executing: { bg: '#dbeafe', border: '#3b82f6', text: '#1d4ed8' },
  running: { bg: '#dbeafe', border: '#3b82f6', text: '#1d4ed8' },
  completed: { bg: '#dcfce7', border: '#22c55e', text: '#15803d' },
  failed: { bg: '#fee2e2', border: '#ef4444', text: '#b91c1c' },
};

const STATUS_LABELS: Record<string, string> = {
  pending: '待执行',
  executing: '执行中',
  running: '执行中',
  completed: '已完成',
  failed: '失败',
};

const NODE_WIDTH = 200;
const NODE_HEIGHT = 70;

function getLayoutedElements(nodes: Node[], edges: Edge[]) {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB', nodesep: 50, ranksep: 80 });

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
  const colors = STATUS_COLORS[data.status] || STATUS_COLORS.pending;
  return (
    <div
      style={{
        background: colors.bg,
        border: `2px solid ${colors.border}`,
        borderRadius: 8,
        padding: '8px 12px',
        width: NODE_WIDTH,
        minHeight: NODE_HEIGHT,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: colors.border }} />
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {data.title}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span
          style={{
            fontSize: 11,
            color: colors.text,
            fontWeight: 500,
            padding: '1px 6px',
            borderRadius: 4,
            background: `${colors.border}20`,
          }}
        >
          {STATUS_LABELS[data.status] || data.status}
        </span>
        <span style={{ fontSize: 11, color: '#6b7280' }}>{data.assigneeName}</span>
      </div>
      <Handle type="source" position={Position.Bottom} style={{ background: colors.border }} />
    </div>
  );
}

const nodeTypes = { subtask: SubtaskNode };

export default function TaskDAG({ taskId }: { taskId: string }) {
  const [dagData, setDagData] = useState<DAGData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    visualizationApi.getDAG(taskId)
      .then(res => { setDagData(res.data); setError(null); })
      .catch(err => setError(err instanceof Error ? err.message : '加载失败'))
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
      style: { stroke: '#94a3b8', strokeWidth: 2 },
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
    return <div className="text-center py-8 text-sm text-muted-foreground">暂无子任务数据</div>;
  }

  const { stats } = dagData;

  return (
    <div className="space-y-3">
      <div className="flex gap-4 text-sm">
        <span>总计: {stats.total}</span>
        <span style={{ color: '#22c55e' }}>完成: {stats.completed}</span>
        <span style={{ color: '#3b82f6' }}>执行中: {stats.executing}</span>
        {stats.failed > 0 && <span style={{ color: '#ef4444' }}>失败: {stats.failed}</span>}
        <span style={{ color: '#9ca3af' }}>待执行: {stats.pending}</span>
      </div>
      <div style={{ height: 500 }} className="border rounded-lg">
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
