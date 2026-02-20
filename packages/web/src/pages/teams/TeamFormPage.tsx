import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router';
import { teamsApi, employeesApi, toolsApi, policiesApi, type Employee, type Tool, type TeamDetail, type PolicyPackage, type TeamPolicy } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { Loader2, X, Plus } from 'lucide-react';

const COLLAB_MODES = [
  { value: 'free', label: '自由协作', enabled: true, description: 'PM自由调度子任务，灵活分配' },
  { value: 'pipeline', label: '流水线', enabled: true, description: '子任务将按顺序执行，前一个的输出作为后一个的输入' },
  { value: 'debate', label: '辩论', enabled: true, description: '所有成员并行分析，交叉审查后由PM综合' },
  { value: 'vote', label: '投票', enabled: true, description: '所有成员独立判断，多数票决定结果' },
  { value: 'master_slave', label: '主从', enabled: true, description: '主节点规划，从节点并行执行，主节点汇总' },
];

export default function TeamFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const navigate = useNavigate();
  const { toast } = useToast();

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [allEmployees, setAllEmployees] = useState<Employee[]>([]);
  const [allTools, setAllTools] = useState<Tool[]>([]);
  const [allPolicies, setAllPolicies] = useState<PolicyPackage[]>([]);
  const [teamPolicies, setTeamPolicies] = useState<TeamPolicy[]>([]);

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [scenario, setScenario] = useState('');
  const [pmEmployeeId, setPmEmployeeId] = useState('');
  const [collaborationMode, setCollaborationMode] = useState('free');
  const [members, setMembers] = useState<Array<{ employeeId: string; role: string }>>([]);
  const [selectedToolIds, setSelectedToolIds] = useState<Set<string>>(new Set());

  // Load reference data
  useEffect(() => {
    Promise.all([
      employeesApi.list(),
      toolsApi.list(),
      policiesApi.list(),
    ]).then(([empRes, toolRes, polRes]) => {
      setAllEmployees(empRes.data);
      setAllTools(toolRes.data);
      setAllPolicies(polRes.data);
    }).catch(err => {
      toast(err instanceof Error ? err.message : '加载参考数据失败', 'error');
    });
  }, [toast]);

  // Load existing team for edit
  useEffect(() => {
    if (!id) return;
    teamsApi.get(id).then(res => {
      const t = res.data;
      setName(t.name);
      setDescription(t.description || '');
      setScenario(t.scenario || '');
      setPmEmployeeId(t.pmEmployeeId || '');
      setCollaborationMode(t.collaborationMode || 'free');
      setMembers(t.members.map(m => ({ employeeId: m.id, role: m.role || 'member' })));
      setSelectedToolIds(new Set(t.tools.map(tool => tool.id)));
      // Load team policies
      policiesApi.getTeamPolicies(id).then(res => setTeamPolicies(res.data)).catch(() => {});
      setLoading(false);
    }).catch(err => {
      toast(err instanceof Error ? err.message : '加载失败', 'error');
      navigate('/teams');
    });
  }, [id, navigate, toast]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !pmEmployeeId) {
      toast('请填写团队名称并选择PM', 'error');
      return;
    }
    setSaving(true);
    try {
      const body = {
        name: name.trim(),
        description: description.trim() || undefined,
        scenario: scenario.trim() || undefined,
        pmEmployeeId,
        collaborationMode,
        memberIds: members,
        toolIds: Array.from(selectedToolIds),
      };
      if (isEdit) {
        await teamsApi.update(id!, body);
        toast('团队已更新', 'success');
      } else {
        await teamsApi.create(body);
        toast('团队已创建', 'success');
      }
      navigate('/teams');
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : '保存失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  const addMember = (employeeId: string) => {
    if (members.some(m => m.employeeId === employeeId)) return;
    setMembers(prev => [...prev, { employeeId, role: 'member' }]);
  };

  const removeMember = (employeeId: string) => {
    setMembers(prev => prev.filter(m => m.employeeId !== employeeId));
  };

  const toggleTool = (toolId: string) => {
    setSelectedToolIds(prev => {
      const next = new Set(prev);
      next.has(toolId) ? next.delete(toolId) : next.add(toolId);
      return next;
    });
  };

  // Available employees for member selection (exclude PM and already added)
  const memberCandidates = allEmployees.filter(
    e => e.id !== pmEmployeeId && !members.some(m => m.employeeId === e.id)
  );

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  // Group tools by groupName
  const toolGroups = new Map<string, Tool[]>();
  for (const t of allTools) {
    const group = t.groupName || '未分组';
    if (!toolGroups.has(group)) toolGroups.set(group, []);
    toolGroups.get(group)!.push(t);
  }

  return (
    <div className="p-6 max-w-3xl">
      <h2 className="text-2xl font-semibold mb-6">{isEdit ? '编辑团队' : '创建团队'}</h2>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Basic Info */}
        <section className="space-y-4">
          <h3 className="text-lg font-medium border-b pb-2">基本信息</h3>
          <div className="space-y-2">
            <Label htmlFor="name">团队名称 *</Label>
            <Input id="name" value={name} onChange={e => setName(e.target.value)} placeholder="如：数据分析团队" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="desc">描述</Label>
            <Textarea id="desc" value={description} onChange={e => setDescription(e.target.value)} placeholder="团队职责描述..." rows={3} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="scenario">场景标签</Label>
            <Input id="scenario" value={scenario} onChange={e => setScenario(e.target.value)} placeholder="如：数据分析、客服、研发" />
          </div>
        </section>

        {/* PM Selection */}
        <section className="space-y-4">
          <h3 className="text-lg font-medium border-b pb-2">项目经理 (PM) *</h3>
          <select
            className="w-full border rounded-md px-3 py-2 text-sm bg-background"
            value={pmEmployeeId}
            onChange={e => {
              const newPmId = e.target.value;
              setPmEmployeeId(newPmId);
              // Remove new PM from members list if they were added as a member
              if (newPmId) {
                setMembers(prev => prev.filter(m => m.employeeId !== newPmId));
              }
            }}
            required
          >
            <option value="">选择PM...</option>
            {allEmployees.map(emp => (
              <option key={emp.id} value={emp.id}>{emp.avatar || '👤'} {emp.name} ({emp.modelName})</option>
            ))}
          </select>
        </section>

        {/* Members */}
        <section className="space-y-4">
          <h3 className="text-lg font-medium border-b pb-2">团队成员</h3>
          {members.length > 0 && (
            <div className="space-y-2">
              {members.map(m => {
                const emp = allEmployees.find(e => e.id === m.employeeId);
                return (
                  <div key={m.employeeId} className="flex items-center gap-3 border rounded-md px-3 py-2">
                    <span>{emp?.avatar || '👤'}</span>
                    <span className="flex-1 text-sm">{emp?.name || m.employeeId}</span>
                    <select
                      className="border rounded px-2 py-1 text-xs bg-background"
                      value={m.role}
                      onChange={e => setMembers(prev => prev.map(x => x.employeeId === m.employeeId ? { ...x, role: e.target.value } : x))}
                    >
                      <option value="member">成员</option>
                      <option value="observer">观察者</option>
                    </select>
                    <button type="button" onClick={() => removeMember(m.employeeId)} className="text-muted-foreground hover:text-destructive">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          {memberCandidates.length > 0 && (
            <select
              className="w-full border rounded-md px-3 py-2 text-sm bg-background"
              value=""
              onChange={e => { if (e.target.value) addMember(e.target.value); }}
            >
              <option value="">添加成员...</option>
              {memberCandidates.map(emp => (
                <option key={emp.id} value={emp.id}>{emp.avatar || '👤'} {emp.name}</option>
              ))}
            </select>
          )}
        </section>

        {/* Tools */}
        <section className="space-y-4">
          <h3 className="text-lg font-medium border-b pb-2">工具授权</h3>
          {Array.from(toolGroups).map(([group, groupTools]) => (
            <div key={group}>
              <div className="text-sm font-medium text-muted-foreground mb-2">{group}</div>
              <div className="flex flex-wrap gap-2">
                {groupTools.map(t => (
                  <Badge
                    key={t.id}
                    variant={selectedToolIds.has(t.id) ? 'default' : 'outline'}
                    className="cursor-pointer"
                    onClick={() => toggleTool(t.id)}
                  >
                    {t.name}
                  </Badge>
                ))}
              </div>
            </div>
          ))}
          {allTools.length === 0 && <p className="text-sm text-muted-foreground">暂无可用工具</p>}
        </section>

        {/* Policy Packages */}
        {isEdit && id && (
          <section className="space-y-4">
            <h3 className="text-lg font-medium border-b pb-2">策略包</h3>
            {teamPolicies.length > 0 && (
              <div className="space-y-2">
                {teamPolicies.map(tp => (
                  <div key={tp.packageId} className="flex items-center gap-3 border rounded-md px-3 py-2">
                    <span className="flex-1 text-sm">
                      {tp.packageName}
                      {tp.version != null && <span className="text-xs text-muted-foreground ml-1">v{tp.version}</span>}
                      {tp.isBuiltin ? <Badge variant="secondary" className="ml-2">内置</Badge> : null}
                    </span>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await policiesApi.removeFromTeam(id, tp.packageId);
                          setTeamPolicies(prev => prev.filter(p => p.packageId !== tp.packageId));
                          toast('策略包已移除', 'success');
                        } catch (err: unknown) {
                          toast(err instanceof Error ? err.message : '移除失败', 'error');
                        }
                      }}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {allPolicies.filter(p => !teamPolicies.some(tp => tp.packageId === p.id)).length > 0 && (
              <select
                className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                value=""
                onChange={async (e) => {
                  const pkgId = e.target.value;
                  if (!pkgId) return;
                  try {
                    const res = await policiesApi.assignToTeam(id, pkgId);
                    setTeamPolicies(res.data);
                    toast('策略包已添加', 'success');
                  } catch (err: unknown) {
                    toast(err instanceof Error ? err.message : '添加失败', 'error');
                  }
                }}
              >
                <option value="">添加策略包...</option>
                {allPolicies
                  .filter(p => !teamPolicies.some(tp => tp.packageId === p.id))
                  .map(p => (
                    <option key={p.id} value={p.id}>{p.name}{p.isBuiltin ? ' (内置)' : ''}</option>
                  ))}
              </select>
            )}
            {!isEdit && <p className="text-sm text-muted-foreground">保存团队后可配置策略包</p>}
          </section>
        )}

        {/* Collaboration Mode */}
        <section className="space-y-4">
          <h3 className="text-lg font-medium border-b pb-2">协作模式</h3>
          <div className="flex flex-wrap gap-3">
            {COLLAB_MODES.map(mode => (
              <label
                key={mode.value}
                className={`flex items-center gap-2 border rounded-md px-4 py-2 text-sm cursor-pointer transition-colors ${
                  collaborationMode === mode.value ? 'border-primary bg-primary/5' : ''
                } ${!mode.enabled ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <input
                  type="radio"
                  name="collabMode"
                  value={mode.value}
                  checked={collaborationMode === mode.value}
                  onChange={e => setCollaborationMode(e.target.value)}
                  disabled={!mode.enabled}
                  className="accent-primary"
                />
                {mode.label}
              </label>
            ))}
          </div>
          {(() => {
            const selected = COLLAB_MODES.find(m => m.value === collaborationMode);
            return selected?.description ? (
              <p className="text-sm text-muted-foreground mt-2">{selected.description}</p>
            ) : null;
          })()}
        </section>

        {/* Actions */}
        <div className="flex gap-3 pt-4 border-t">
          <Button type="submit" disabled={saving}>
            {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-1" /> 保存中...</> : isEdit ? '保存' : '创建'}
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate('/teams')}>取消</Button>
        </div>
      </form>
    </div>
  );
}
