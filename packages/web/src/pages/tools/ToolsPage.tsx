import { useState, useEffect, useCallback } from 'react';
import { toolsApi, type Tool, type ToolInput } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { Plus, Pencil, Trash2, Zap, Loader2, Search, ChevronDown, ChevronRight, X } from 'lucide-react';

const statusBadge: Record<string, { variant: 'secondary' | 'success' | 'destructive'; label: string }> = {
  untested: { variant: 'secondary', label: '未测试' },
  available: { variant: 'success', label: '可用' },
  unavailable: { variant: 'destructive', label: '不可用' },
};

export default function ToolsPage() {
  const [tools, setTools] = useState<Tool[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Tool | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Tool | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  const load = useCallback(async () => {
    try {
      const res = await toolsApi.list();
      setTools(res.data);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : '加载失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  // Group tools
  const filtered = tools.filter(t =>
    !search || t.name.toLowerCase().includes(search.toLowerCase()) || t.description.toLowerCase().includes(search.toLowerCase())
  );
  const grouped = new Map<string, Tool[]>();
  for (const t of filtered) {
    const g = t.groupName || '未分组';
    if (!grouped.has(g)) grouped.set(g, []);
    grouped.get(g)!.push(t);
  }

  const toggleGroup = (g: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      next.has(g) ? next.delete(g) : next.add(g);
      return next;
    });
  };

  const handleSave = async (input: ToolInput) => {
    setSaving(true);
    try {
      if (editing) {
        await toolsApi.update(editing.id, input);
        toast('工具已更新', 'success');
      } else {
        await toolsApi.create(input);
        toast('工具已创建', 'success');
      }
      setFormOpen(false);
      setEditing(null);
      load();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : '保存失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await toolsApi.delete(deleteTarget.id);
      toast('工具已删除', 'success');
      setDeleteTarget(null);
      load();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : '删除失败', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const handleTest = async (tool: Tool) => {
    setTestingId(tool.id);
    try {
      const res = await toolsApi.test(tool.id);
      const msg = res.success
        ? `${res.message}${res.tools ? ': ' + res.tools.map(t => t.name).join(', ') : ''}`
        : res.message;
      toast(msg, res.success ? 'success' : 'error');
      load();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : '测试失败', 'error');
    } finally {
      setTestingId(null);
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold">工具管理</h2>
        <Button data-testid="create-tool-btn" onClick={() => { setEditing(null); setFormOpen(true); }}>
          <Plus className="h-4 w-4" /> 添加工具
        </Button>
      </div>

      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="搜索工具..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">暂无工具</div>
      ) : (
        <div className="space-y-4">
          {Array.from(grouped.entries()).map(([group, items]) => (
            <div key={group} className="border rounded-lg">
              <button
                className="flex items-center gap-2 w-full px-4 py-3 text-sm font-medium hover:bg-muted/50 cursor-pointer"
                onClick={() => toggleGroup(group)}
              >
                {collapsedGroups.has(group) ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                {group}
                <Badge variant="secondary" className="ml-auto">{items.length}</Badge>
              </button>
              {!collapsedGroups.has(group) && (
                <div className="px-4 pb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map(t => {
                    const s = statusBadge[t.status] || statusBadge.untested;
                    return (
                      <div key={t.id} data-testid={`tool-item-${t.id}`} className="border rounded-md p-4 space-y-2">
                        <div className="flex items-start justify-between">
                          <div className="font-medium text-sm">{t.name}</div>
                          <Badge variant={s.variant} data-testid={`tool-status-${t.id}`}>{s.label}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2">{t.description}</p>
                        <div className="flex items-center gap-1.5">
                          {t.transportType === 'sse' && <Badge variant="secondary" className="text-[10px] px-1 py-0">SSE</Badge>}
                          <span className="text-xs text-muted-foreground font-mono truncate">{t.command}</span>
                        </div>
                        <div className="flex gap-1 pt-1">
                          <Button variant="ghost" size="sm" onClick={() => { setEditing(t); setFormOpen(true); }}>
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="sm" data-testid="test-tool-btn" disabled={testingId === t.id} onClick={() => handleTest(t)}>
                            {testingId === t.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(t)}>
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <ToolFormDialog
        open={formOpen}
        onOpenChange={(v) => { setFormOpen(v); if (!v) setEditing(null); }}
        editing={editing}
        onSave={handleSave}
        saving={saving}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={() => setDeleteTarget(null)}
        title="删除工具"
        description={`确定要删除工具「${deleteTarget?.name}」吗？`}
        onConfirm={handleDelete}
        loading={deleting}
      />
    </div>
  );
}

function ToolFormDialog({
  open, onOpenChange, editing, onSave, saving,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: Tool | null;
  onSave: (input: ToolInput) => void;
  saving: boolean;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [transportType, setTransportType] = useState('stdio');
  const [command, setCommand] = useState('');
  const [args, setArgs] = useState<string[]>([]);
  const [envVars, setEnvVars] = useState<Array<{ key: string; value: string }>>([]);
  const [groupName, setGroupName] = useState('');
  const [accessLevel, setAccessLevel] = useState('read');

  useEffect(() => {
    if (open) {
      setName(editing?.name ?? '');
      setDescription(editing?.description ?? '');
      setTransportType(editing?.transportType ?? 'stdio');
      setCommand(editing?.command ?? '');
      setArgs(editing?.args ?? []);
      setEnvVars([]);
      setGroupName(editing?.groupName ?? '');
      setAccessLevel(editing?.accessLevel ?? 'read');
    }
  }, [open, editing]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const envObj: Record<string, string> = {};
    for (const { key, value } of envVars) {
      if (key.trim()) envObj[key.trim()] = value;
    }
    onSave({
      name, description, transportType, command,
      args: args.filter(Boolean),
      envVars: Object.keys(envObj).length > 0 ? envObj : undefined,
      groupName: groupName || undefined,
      accessLevel,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>{editing ? '编辑工具' : '添加工具'}</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label>名称</Label>
          <Input data-testid="tool-name-input" value={name} onChange={e => setName(e.target.value)} placeholder="如：文件系统" required />
        </div>
        <div className="space-y-2">
          <Label>描述</Label>
          <Textarea data-testid="tool-description-input" value={description} onChange={e => setDescription(e.target.value)} placeholder="此描述会被 LLM 读取，请清晰描述工具能力" rows={3} required />
        </div>
        <div className="space-y-2">
          <Label>传输类型</Label>
          <select
            className="w-full border rounded-md px-3 py-2 text-sm bg-background"
            value={transportType}
            onChange={e => setTransportType(e.target.value)}
          >
            <option value="stdio">Stdio — 本地 npm 包启动</option>
            <option value="sse">SSE — 远程 MCP 服务</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label>{transportType === 'sse' ? 'SSE 地址' : '启动命令'}</Label>
          <Input data-testid="tool-command-input" value={command} onChange={e => setCommand(e.target.value)} placeholder={transportType === 'sse' ? 'https://mcp.example.com/sse' : '@modelcontextprotocol/server-filesystem'} required />
        </div>
        {transportType === 'stdio' && (
          <div className="space-y-2">
            <Label>启动参数</Label>
            {args.map((arg, i) => (
              <div key={i} className="flex gap-2">
                <Input value={arg} onChange={e => { const a = [...args]; a[i] = e.target.value; setArgs(a); }} placeholder={`参数 ${i + 1}`} />
                <Button type="button" variant="ghost" size="icon" onClick={() => setArgs(args.filter((_, j) => j !== i))}><X className="h-4 w-4" /></Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => setArgs([...args, ''])}>+ 添加参数</Button>
          </div>
        )}
        <div className="space-y-2">
          <Label>{transportType === 'sse' ? '请求头' : '环境变量'}</Label>
          {envVars.map((ev, i) => (
            <div key={i} className="flex gap-2">
              <Input value={ev.key} onChange={e => { const v = [...envVars]; v[i] = { ...v[i], key: e.target.value }; setEnvVars(v); }} placeholder={transportType === 'sse' ? 'Header Name' : 'KEY'} className="w-1/3" />
              <Input value={ev.value} onChange={e => { const v = [...envVars]; v[i] = { ...v[i], value: e.target.value }; setEnvVars(v); }} placeholder={transportType === 'sse' ? 'Header Value' : 'VALUE'} type="password" />
              <Button type="button" variant="ghost" size="icon" onClick={() => setEnvVars(envVars.filter((_, j) => j !== i))}><X className="h-4 w-4" /></Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => setEnvVars([...envVars, { key: '', value: '' }])}>+ 添加{transportType === 'sse' ? '请求头' : '环境变量'}</Button>
        </div>
        <div className="space-y-2">
          <Label>分组</Label>
          <Input data-testid="tool-groupName-input" value={groupName} onChange={e => setGroupName(e.target.value)} placeholder="如：文件操作" />
        </div>
        <div className="space-y-2">
          <Label>访问级别</Label>
          <select
            className="w-full border rounded-md px-3 py-2 text-sm bg-background"
            value={accessLevel}
            onChange={e => setAccessLevel(e.target.value)}
          >
            <option value="read">只读 (read) — 建议模式可用</option>
            <option value="write">读写 (write) — 仅自动模式可用</option>
            <option value="admin">管理 (admin) — 仅自动模式可用</option>
          </select>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button type="submit" disabled={saving}>{saving ? '保存中...' : '保存'}</Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
