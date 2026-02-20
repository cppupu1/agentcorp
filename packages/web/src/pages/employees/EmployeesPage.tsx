import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { employeesApi, type Employee } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import ImportEmployeeDialog from './ImportEmployeeDialog';
import { Plus, Pencil, Trash2, Copy, MessageSquare, Search, Loader2, LayoutGrid, List, Download, Upload, CheckSquare, Square } from 'lucide-react';

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'card' | 'list'>('card');
  const [deleteTarget, setDeleteTarget] = useState<Employee | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showImport, setShowImport] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  const load = useCallback(async () => {
    try {
      const [empRes, tagRes] = await Promise.all([
        employeesApi.list({ tag: selectedTag ?? undefined, search: debouncedSearch || undefined }),
        employeesApi.tags(),
      ]);
      setEmployees(empRes.data);
      setTags(tagRes.data);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : '加载失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast, selectedTag, debouncedSearch]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await employeesApi.delete(deleteTarget.id);
      toast('员工已删除', 'success');
      setDeleteTarget(null);
      load();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : '删除失败', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const handleCopy = async (emp: Employee) => {
    try {
      await employeesApi.copy(emp.id);
      toast('员工已复制', 'success');
      load();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : '复制失败', 'error');
    }
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleExport = async () => {
    if (selected.size === 0) return;
    try {
      const res = await employeesApi.export(Array.from(selected));
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `employees-export-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast(`已导出 ${res.data.length} 个员工`, 'success');
      setSelectMode(false);
      setSelected(new Set());
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : '导出失败', 'error');
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold">员工管理</h2>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowImport(true)}>
            <Upload className="h-4 w-4" /> 导入
          </Button>
          <Button variant="outline" onClick={() => { setSelectMode(!selectMode); setSelected(new Set()); }}>
            {selectMode ? <Square className="h-4 w-4" /> : <CheckSquare className="h-4 w-4" />}
            {selectMode ? '取消选择' : '多选'}
          </Button>
          {selectMode && selected.size > 0 && (
            <Button variant="outline" onClick={handleExport}>
              <Download className="h-4 w-4" /> 导出 ({selected.size})
            </Button>
          )}
          <Button data-testid="create-employee-btn" onClick={() => navigate('/employees/new')}>
            <Plus className="h-4 w-4" /> 添加员工
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-4 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="搜索员工..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-1">
          <Button variant={viewMode === 'card' ? 'secondary' : 'ghost'} size="icon" onClick={() => setViewMode('card')}>
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button variant={viewMode === 'list' ? 'secondary' : 'ghost'} size="icon" onClick={() => setViewMode('list')}>
            <List className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {tags.length > 0 && (
        <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
          <Badge
            variant={selectedTag === null ? 'default' : 'outline'}
            className="cursor-pointer shrink-0"
            onClick={() => setSelectedTag(null)}
          >全部</Badge>
          {tags.map(tag => (
            <Badge
              key={tag}
              variant={selectedTag === tag ? 'default' : 'outline'}
              className="cursor-pointer shrink-0"
              onClick={() => setSelectedTag(tag === selectedTag ? null : tag)}
            >{tag}</Badge>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : employees.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">暂无员工</div>
      ) : viewMode === 'card' ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {employees.map(emp => (
            <EmployeeCard key={emp.id} emp={emp} selectMode={selectMode} selected={selected.has(emp.id)} onToggle={() => toggleSelect(emp.id)} onEdit={() => navigate(`/employees/${emp.id}/edit`)} onCopy={() => handleCopy(emp)} onDelete={() => setDeleteTarget(emp)} onChat={() => navigate(`/employees/${emp.id}/chat`)} />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {employees.map(emp => (
            <EmployeeListItem key={emp.id} emp={emp} selectMode={selectMode} selected={selected.has(emp.id)} onToggle={() => toggleSelect(emp.id)} onEdit={() => navigate(`/employees/${emp.id}/edit`)} onCopy={() => handleCopy(emp)} onDelete={() => setDeleteTarget(emp)} onChat={() => navigate(`/employees/${emp.id}/chat`)} />
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={() => setDeleteTarget(null)}
        title="删除员工"
        description={`确定要删除员工「${deleteTarget?.name}」吗？`}
        onConfirm={handleDelete}
        loading={deleting}
      />

      <ImportEmployeeDialog
        open={showImport}
        onClose={() => setShowImport(false)}
        onSuccess={load}
      />
    </div>
  );
}

function EmployeeCard({ emp, selectMode, selected, onToggle, onEdit, onCopy, onDelete, onChat }: {
  emp: Employee; selectMode: boolean; selected: boolean; onToggle: () => void; onEdit: () => void; onCopy: () => void; onDelete: () => void; onChat: () => void;
}) {
  return (
    <div data-testid={`employee-item-${emp.id}`} className={`border rounded-lg p-4 space-y-3 ${selected ? 'border-primary bg-primary/5' : ''}`} onClick={selectMode ? onToggle : undefined}>
      <div className="flex items-start gap-3">
        {selectMode && (
          <input type="checkbox" checked={selected} onChange={onToggle} className="mt-1" onClick={e => e.stopPropagation()} />
        )}
        <span className="text-2xl">{emp.avatar || '👤'}</span>
        <div className="flex-1 min-w-0">
          <div className="font-medium">{emp.name}</div>
          <div className="text-xs text-muted-foreground">{emp.modelName} · {emp.toolCount} 个工具</div>
        </div>
      </div>
      {emp.description && <p className="text-sm text-muted-foreground line-clamp-2">{emp.description}</p>}
      {emp.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {emp.tags.map(tag => <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>)}
        </div>
      )}
      <div className="flex gap-1 pt-1 border-t">
        <Button variant="ghost" size="sm" onClick={onEdit}><Pencil className="h-3 w-3 mr-1" /> 编辑</Button>
        <Button variant="ghost" size="sm" onClick={onCopy}><Copy className="h-3 w-3 mr-1" /> 复制</Button>
        <Button variant="ghost" size="sm" onClick={onChat}><MessageSquare className="h-3 w-3 mr-1" /> 对话</Button>
        <Button variant="ghost" size="sm" onClick={onDelete} className="ml-auto"><Trash2 className="h-3 w-3 text-destructive" /></Button>
      </div>
    </div>
  );
}

function EmployeeListItem({ emp, selectMode, selected, onToggle, onEdit, onCopy, onDelete, onChat }: {
  emp: Employee; selectMode: boolean; selected: boolean; onToggle: () => void; onEdit: () => void; onCopy: () => void; onDelete: () => void; onChat: () => void;
}) {
  return (
    <div data-testid={`employee-item-${emp.id}`} className={`flex items-center gap-4 border rounded-md px-4 py-3 ${selected ? 'border-primary bg-primary/5' : ''}`} onClick={selectMode ? onToggle : undefined}>
      {selectMode && (
        <input type="checkbox" checked={selected} onChange={onToggle} onClick={e => e.stopPropagation()} />
      )}
      <span className="text-xl">{emp.avatar || '👤'}</span>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm">{emp.name}</div>
        <div className="text-xs text-muted-foreground">{emp.modelName} · {emp.toolCount} 个工具</div>
      </div>
      <div className="flex flex-wrap gap-1">
        {emp.tags.map(tag => <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>)}
      </div>
      <div className="flex gap-1 shrink-0">
        <Button variant="ghost" size="icon" onClick={onEdit}><Pencil className="h-4 w-4" /></Button>
        <Button variant="ghost" size="icon" onClick={onCopy}><Copy className="h-4 w-4" /></Button>
        <Button variant="ghost" size="icon" onClick={onChat}><MessageSquare className="h-4 w-4" /></Button>
        <Button variant="ghost" size="icon" onClick={onDelete}><Trash2 className="h-4 w-4 text-destructive" /></Button>
      </div>
    </div>
  );
}
