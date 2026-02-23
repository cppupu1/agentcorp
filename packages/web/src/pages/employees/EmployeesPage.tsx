import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { employeesApi, type Employee } from '@/api/client';
import { useI18n } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import ImportEmployeeDialog from './ImportEmployeeDialog';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Plus, Pencil, Trash2, Copy, MessageSquare, Search, Loader2, LayoutGrid, List, Download, Upload, CheckSquare, Square, Users } from 'lucide-react';

type GrowthStat = { employeeId: string; overallScore: number | null; taskCount: number };

function getLevel(score: number | null): string | null {
  if (score == null) return null;
  if (score >= 90) return 'expert';
  if (score >= 70) return 'senior';
  if (score >= 50) return 'intermediate';
  return 'junior';
}

const LEVEL_VARIANT: Record<string, 'default' | 'secondary' | 'outline'> = {
  expert: 'default', senior: 'default', intermediate: 'secondary', junior: 'outline',
};

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [growthMap, setGrowthMap] = useState<Record<string, GrowthStat>>({});
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
  const { t } = useI18n();

  const load = useCallback(async () => {
    try {
      const [empRes, tagRes, growthRes] = await Promise.all([
        employeesApi.list({ tag: selectedTag ?? undefined, search: debouncedSearch || undefined }),
        employeesApi.tags(),
        employeesApi.growthStats(),
      ]);
      setEmployees(empRes.data);
      setTags(tagRes.data);
      const map: Record<string, GrowthStat> = {};
      for (const s of growthRes.data) map[s.employeeId] = s;
      setGrowthMap(map);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : t('common.loadFailed'), 'error');
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
      toast(t('employees.deleted'), 'success');
      setDeleteTarget(null);
      load();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : t('common.deleteFailed'), 'error');
    } finally {
      setDeleting(false);
    }
  };

  const handleCopy = async (emp: Employee) => {
    try {
      await employeesApi.copy(emp.id);
      toast(t('employees.copied'), 'success');
      load();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : t('common.copyFailed'), 'error');
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
      toast(t('employees.exported', { count: res.data.length }), 'success');
      setSelectMode(false);
      setSelected(new Set());
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : t('common.exportFailed'), 'error');
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8 pb-4 border-b border-border/40">
        <h2 className="text-3xl font-heading font-medium tracking-tight text-foreground/90">{t('employees.title')}</h2>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowImport(true)}>
            <Upload className="h-4 w-4" /> {t('common.import')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => { setSelectMode(!selectMode); setSelected(new Set()); }}>
            {selectMode ? <Square className="h-4 w-4" /> : <CheckSquare className="h-4 w-4" />}
            {selectMode ? t('employees.cancelSelect') : t('employees.multiSelect')}
          </Button>
          {selectMode && selected.size > 0 && (
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="h-4 w-4" /> {t('common.export')} ({selected.size})
            </Button>
          )}
          <Button data-testid="create-employee-btn" onClick={() => navigate('/employees/new')}>
            <Plus className="h-4 w-4" /> {t('employees.add')}
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-4 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder={t('employees.search')} value={search} onChange={e => setSearch(e.target.value)} />
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
          >{t('common.all')}</Badge>
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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-44 rounded-xl" />)}</div>
      ) : employees.length === 0 ? (
        <EmptyState icon={<Users className="h-10 w-10" />} title={t('employees.empty')} description={t('employees.emptyDesc')} action={<Button onClick={() => navigate('/employees/new')}><Plus className="h-4 w-4" /> {t('employees.add')}</Button>} />
      ) : viewMode === 'card' ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {employees.map(emp => (
            <EmployeeCard key={emp.id} emp={emp} growth={growthMap[emp.id]} selectMode={selectMode} selected={selected.has(emp.id)} onToggle={() => toggleSelect(emp.id)} onEdit={() => navigate(`/employees/${emp.id}/edit`)} onCopy={() => handleCopy(emp)} onDelete={() => setDeleteTarget(emp)} onChat={() => navigate(`/employees/${emp.id}/chat`)} />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {employees.map(emp => (
            <EmployeeListItem key={emp.id} emp={emp} growth={growthMap[emp.id]} selectMode={selectMode} selected={selected.has(emp.id)} onToggle={() => toggleSelect(emp.id)} onEdit={() => navigate(`/employees/${emp.id}/edit`)} onCopy={() => handleCopy(emp)} onDelete={() => setDeleteTarget(emp)} onChat={() => navigate(`/employees/${emp.id}/chat`)} />
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={() => setDeleteTarget(null)}
        title={t('employees.deleteEmployee')}
        description={t('employees.deleteConfirm', { name: deleteTarget?.name ?? '' })}
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

function EmployeeCard({ emp, growth, selectMode, selected, onToggle, onEdit, onCopy, onDelete, onChat }: {
  emp: Employee; growth?: GrowthStat; selectMode: boolean; selected: boolean; onToggle: () => void; onEdit: () => void; onCopy: () => void; onDelete: () => void; onChat: () => void;
}) {
  const { t } = useI18n();
  const level = getLevel(growth?.overallScore ?? null);
  return (
    <div data-testid={`employee-item-${emp.id}`} className={`bg-card rounded-3xl p-6 border border-border/40 space-y-3 shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5 transition-all ${selected ? 'ring-2 ring-primary/30' : ''}`} onClick={selectMode ? onToggle : undefined} {...(selectMode ? { role: 'button', tabIndex: 0, onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') onToggle(); } } : {})}>
      <div className="flex items-start gap-3">
        {selectMode && (
          <input type="checkbox" checked={selected} onChange={onToggle} className="mt-1" onClick={e => e.stopPropagation()} />
        )}
        <span className="text-2xl">{emp.avatar || '👤'}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium">{emp.name}</span>
            {level && <Badge variant={LEVEL_VARIANT[level]} className="text-xs">{t(`employees.level_${level}`)}</Badge>}
          </div>
          <div className="text-xs text-muted-foreground">{emp.modelName} · {emp.toolCount} {t('common.tools')}{growth?.taskCount ? ` · ${t('employees.taskCount').replace('{count}', String(growth.taskCount))}` : ''}</div>
        </div>
      </div>
      {emp.description && <p className="text-sm text-muted-foreground line-clamp-2">{emp.description}</p>}
      {emp.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {emp.tags.map(tag => <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>)}
        </div>
      )}
      <div className="flex gap-1 pt-1 border-t">
        <Button variant="ghost" size="sm" onClick={e => { e.stopPropagation(); onEdit(); }}><Pencil className="h-3 w-3 mr-1" /> {t('common.edit')}</Button>
        <Button variant="ghost" size="sm" onClick={e => { e.stopPropagation(); onCopy(); }}><Copy className="h-3 w-3 mr-1" /> {t('common.copy')}</Button>
        <Button variant="ghost" size="sm" onClick={e => { e.stopPropagation(); onChat(); }}><MessageSquare className="h-3 w-3 mr-1" /> {t('employees.chat')}</Button>
        <Button variant="ghost" size="sm" onClick={e => { e.stopPropagation(); onDelete(); }} className="ml-auto"><Trash2 className="h-3 w-3 text-destructive" /></Button>
      </div>
    </div>
  );
}

function EmployeeListItem({ emp, growth, selectMode, selected, onToggle, onEdit, onCopy, onDelete, onChat }: {
  emp: Employee; growth?: GrowthStat; selectMode: boolean; selected: boolean; onToggle: () => void; onEdit: () => void; onCopy: () => void; onDelete: () => void; onChat: () => void;
}) {
  const { t } = useI18n();
  const level = getLevel(growth?.overallScore ?? null);
  return (
    <div data-testid={`employee-item-${emp.id}`} className={`flex items-center gap-4 bg-card rounded-2xl px-4 py-3 shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5 transition-all ${selected ? 'ring-2 ring-primary/30' : ''}`} onClick={selectMode ? onToggle : undefined} {...(selectMode ? { role: 'button', tabIndex: 0, onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') onToggle(); } } : {})}>
      {selectMode && (
        <input type="checkbox" checked={selected} onChange={onToggle} onClick={e => e.stopPropagation()} />
      )}
      <span className="text-xl">{emp.avatar || '👤'}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">{emp.name}</span>
          {level && <Badge variant={LEVEL_VARIANT[level]} className="text-xs">{t(`employees.level_${level}`)}</Badge>}
        </div>
        <div className="text-xs text-muted-foreground">{emp.modelName} · {emp.toolCount} {t('common.tools')}</div>
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
