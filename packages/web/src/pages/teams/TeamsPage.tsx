import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { teamsApi, type Team } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { Plus, Pencil, Trash2, Copy, Search, Loader2, Users } from 'lucide-react';

export default function TeamsPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [deleteTarget, setDeleteTarget] = useState<Team | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [copyingId, setCopyingId] = useState<string | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  const load = useCallback(async () => {
    try {
      const res = await teamsApi.list();
      setTeams(res.data);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : '加载失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const filtered = debouncedSearch
    ? teams.filter(t => t.name.toLowerCase().includes(debouncedSearch.toLowerCase()))
    : teams;

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await teamsApi.delete(deleteTarget.id);
      toast('团队已删除', 'success');
      setDeleteTarget(null);
      load();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : '删除失败', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const handleCopy = async (team: Team) => {
    if (copyingId) return;
    setCopyingId(team.id);
    try {
      await teamsApi.copy(team.id);
      toast('团队已复制', 'success');
      load();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : '复制失败', 'error');
    } finally {
      setCopyingId(null);
    }
  };

  const modeLabels: Record<string, string> = {
    free: '自由协作',
    pipeline: '流水线',
    debate: '辩论',
    vote: '投票',
    master_slave: '主从',
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold">团队管理</h2>
        <Button onClick={() => navigate('/teams/new')} data-testid="create-team-btn">
          <Plus className="h-4 w-4" /> 创建团队
        </Button>
      </div>

      <div className="relative max-w-sm mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="搜索团队..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">暂无团队</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(team => (
            <div key={team.id} data-testid={`team-item-${team.id}`} className="border rounded-lg p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-medium">{team.name}</div>
                  {team.description && <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{team.description}</p>}
                </div>
                <Badge variant="secondary" className="text-xs shrink-0 ml-2">
                  {modeLabels[team.collaborationMode] || team.collaborationMode}
                </Badge>
              </div>

              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="text-lg">{team.pmAvatar || '👤'}</span>
                <span>PM: {team.pmName || '未指定'}</span>
              </div>

              {team.scenario && <Badge variant="outline" className="text-xs">{team.scenario}</Badge>}

              <div className="flex gap-4 text-xs text-muted-foreground">
                <span><Users className="inline h-3 w-3 mr-1" />{team.memberCount} 成员</span>
                <span>{team.toolCount} 工具</span>
                <span>{team.taskCount} 任务</span>
              </div>

              <div className="flex gap-1 pt-1 border-t">
                <Button variant="ghost" size="sm" onClick={() => navigate(`/teams/${team.id}/edit`)}>
                  <Pencil className="h-3 w-3 mr-1" /> 编辑
                </Button>
                <Button variant="ghost" size="sm" onClick={() => handleCopy(team)} disabled={copyingId === team.id}>
                  {copyingId === team.id ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Copy className="h-3 w-3 mr-1" />} 复制
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(team)} className="ml-auto">
                  <Trash2 className="h-3 w-3 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={() => setDeleteTarget(null)}
        title="删除团队"
        description={`确定要删除团队「${deleteTarget?.name}」吗？`}
        onConfirm={handleDelete}
        loading={deleting}
      />
    </div>
  );
}
