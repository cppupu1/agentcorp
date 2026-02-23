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
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Pencil, Trash2, Zap, Loader2, Search, ChevronDown, ChevronRight, X } from 'lucide-react';
import { useI18n } from '@/i18n';

const statusVariant: Record<string, 'secondary' | 'success' | 'destructive'> = {
  untested: 'secondary',
  available: 'success',
  unavailable: 'destructive',
};
const statusLabelKey: Record<string, string> = {
  untested: 'tools.statusUntested',
  available: 'tools.statusAvailable',
  unavailable: 'tools.statusUnavailable',
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
  const { t } = useI18n();

  const load = useCallback(async () => {
    try {
      const res = await toolsApi.list();
      setTools(res.data);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : t('common.loadFailed'), 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  // Group tools
  const filtered = tools.filter(tool =>
    !search || tool.name.toLowerCase().includes(search.toLowerCase()) || tool.description.toLowerCase().includes(search.toLowerCase())
  );
  const grouped = new Map<string, Tool[]>();
  for (const tool of filtered) {
    const g = tool.groupName || t('tools.ungrouped');
    if (!grouped.has(g)) grouped.set(g, []);
    grouped.get(g)!.push(tool);
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
        toast(t('tools.updated'), 'success');
      } else {
        await toolsApi.create(input);
        toast(t('tools.created'), 'success');
      }
      setFormOpen(false);
      setEditing(null);
      load();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : t('common.saveFailed'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await toolsApi.delete(deleteTarget.id);
      toast(t('tools.deleted'), 'success');
      setDeleteTarget(null);
      load();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : t('common.deleteFailed'), 'error');
    } finally {
      setDeleting(false);
    }
  };

  const handleTest = async (tool: Tool) => {
    setTestingId(tool.id);
    try {
      const res = await toolsApi.test(tool.id);
      const msg = res.success
        ? `${res.message}${res.tools ? ': ' + res.tools.map(tt => tt.name).join(', ') : ''}`
        : res.message;
      toast(msg, res.success ? 'success' : 'error');
      load();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : t('common.operationFailed'), 'error');
    } finally {
      setTestingId(null);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold tracking-tight">{t('tools.title')}</h2>
        <Button data-testid="create-tool-btn" onClick={() => { setEditing(null); setFormOpen(true); }}>
          <Plus className="h-4 w-4" /> {t('tools.add')}
        </Button>
      </div>

      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder={t('tools.search')} value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {loading ? (
        <div className="space-y-4">{Array.from({ length: 2 }, (_, i) => <Skeleton key={i} className="h-48 rounded-2xl" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">{t('tools.empty')}</div>
      ) : (
        <div className="space-y-4">
          {Array.from(grouped.entries()).map(([group, items]) => (
            <div key={group} className="bg-card rounded-2xl shadow-[var(--shadow-sm)]">
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
                  {items.map(tool => {
                    const variant = statusVariant[tool.status] || statusVariant.untested;
                    const label = t(statusLabelKey[tool.status] || statusLabelKey.untested);
                    return (
                      <div key={tool.id} data-testid={`tool-item-${tool.id}`} className="rounded-2xl p-5 space-y-2 hover:shadow-[var(--shadow-sm)] transition-all bg-muted/30">
                        <div className="flex items-start justify-between">
                          <div className="font-medium text-sm">{tool.name}</div>
                          <Badge variant={variant} data-testid={`tool-status-${tool.id}`}>{label}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2">{tool.description}</p>
                        <div className="flex items-center gap-1.5">
                          {tool.transportType === 'sse' && <Badge variant="secondary" className="text-[10px] px-1 py-0">SSE</Badge>}
                          <span className="text-xs text-muted-foreground font-mono truncate">{tool.command}</span>
                        </div>
                        <div className="flex gap-1 pt-1">
                          <Button variant="ghost" size="sm" onClick={() => { setEditing(tool); setFormOpen(true); }}>
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="sm" data-testid="test-tool-btn" disabled={testingId === tool.id} onClick={() => handleTest(tool)}>
                            {testingId === tool.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(tool)}>
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
        title={t('tools.deleteTool')}
        description={t('tools.deleteToolConfirm', { name: deleteTarget?.name ?? '' })}
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
  const { t } = useI18n();

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
        <DialogTitle>{editing ? t('tools.editTool') : t('tools.addTool')}</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label>{t('tools.toolName')}</Label>
          <Input data-testid="tool-name-input" value={name} onChange={e => setName(e.target.value)} placeholder={t('tools.namePlaceholder')} required />
        </div>
        <div className="space-y-2">
          <Label>{t('tools.description')}</Label>
          <Textarea data-testid="tool-description-input" value={description} onChange={e => setDescription(e.target.value)} placeholder={t('tools.descPlaceholder')} rows={3} required />
        </div>
        <div className="space-y-2">
          <Label>{t('tools.transportType')}</Label>
          <select
            className="w-full h-10 rounded-xl border-0 bg-muted px-3 py-1 text-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            value={transportType}
            onChange={e => setTransportType(e.target.value)}
          >
            <option value="stdio">{t('tools.stdio')}</option>
            <option value="sse">{t('tools.sse')}</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label>{transportType === 'sse' ? t('tools.sseUrl') : t('tools.command')}</Label>
          <Input data-testid="tool-command-input" value={command} onChange={e => setCommand(e.target.value)} placeholder={transportType === 'sse' ? 'https://mcp.example.com/sse' : '@modelcontextprotocol/server-filesystem'} required />
        </div>
        {transportType === 'stdio' && (
          <div className="space-y-2">
            <Label>{t('tools.args')}</Label>
            {args.map((arg, i) => (
              <div key={i} className="flex gap-2">
                <Input value={arg} onChange={e => { const a = [...args]; a[i] = e.target.value; setArgs(a); }} placeholder={t('tools.argPlaceholder', { n: i + 1 })} />
                <Button type="button" variant="ghost" size="icon" onClick={() => setArgs(args.filter((_, j) => j !== i))}><X className="h-4 w-4" /></Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => setArgs([...args, ''])}>{t('tools.addArg')}</Button>
          </div>
        )}
        <div className="space-y-2">
          <Label>{transportType === 'sse' ? t('tools.headers') : t('tools.envVars')}</Label>
          {envVars.map((ev, i) => (
            <div key={i} className="flex gap-2">
              <Input value={ev.key} onChange={e => { const v = [...envVars]; v[i] = { ...v[i], key: e.target.value }; setEnvVars(v); }} placeholder={transportType === 'sse' ? 'Header Name' : 'KEY'} className="w-1/3" />
              <Input value={ev.value} onChange={e => { const v = [...envVars]; v[i] = { ...v[i], value: e.target.value }; setEnvVars(v); }} placeholder={transportType === 'sse' ? 'Header Value' : 'VALUE'} type="password" />
              <Button type="button" variant="ghost" size="icon" onClick={() => setEnvVars(envVars.filter((_, j) => j !== i))}><X className="h-4 w-4" /></Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => setEnvVars([...envVars, { key: '', value: '' }])}>{transportType === 'sse' ? t('tools.addHeader') : t('tools.addEnv')}</Button>
        </div>
        <div className="space-y-2">
          <Label>{t('tools.group')}</Label>
          <Input data-testid="tool-groupName-input" value={groupName} onChange={e => setGroupName(e.target.value)} placeholder={t('tools.groupPlaceholder')} />
        </div>
        <div className="space-y-2">
          <Label>{t('tools.accessLevel')}</Label>
          <select
            className="w-full h-10 rounded-xl border-0 bg-muted px-3 py-1 text-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            value={accessLevel}
            onChange={e => setAccessLevel(e.target.value)}
          >
            <option value="read">{t('tools.readonly')}</option>
            <option value="write">{t('tools.readwrite')}</option>
            <option value="admin">{t('tools.admin')}</option>
          </select>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
          <Button type="submit" disabled={saving}>{saving ? t('common.saving') : t('common.save')}</Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
