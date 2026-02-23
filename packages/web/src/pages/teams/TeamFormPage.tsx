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
import { useI18n } from '@/i18n';

const COLLAB_MODES = [
  { value: 'free', labelKey: 'teamForm.collabFree', enabled: true, descKey: 'teamForm.collabFreeDesc' },
  { value: 'pipeline', labelKey: 'teamForm.collabPipeline', enabled: true, descKey: 'teamForm.collabPipelineDesc' },
  { value: 'debate', labelKey: 'teamForm.collabDebate', enabled: true, descKey: 'teamForm.collabDebateDesc' },
  { value: 'vote', labelKey: 'teamForm.collabVoting', enabled: true, descKey: 'teamForm.collabVotingDesc' },
  { value: 'master_slave', labelKey: 'teamForm.collabMasterSlave', enabled: true, descKey: 'teamForm.collabMasterSlaveDesc' },
] as const;

export default function TeamFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useI18n();

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
      toast(err instanceof Error ? err.message : t('teamForm.loadFailed'), 'error');
    });
  }, [toast]);

  // Load existing team for edit
  useEffect(() => {
    if (!id) return;
    teamsApi.get(id).then(res => {
      const td = res.data;
      setName(td.name);
      setDescription(td.description || '');
      setScenario(td.scenario || '');
      setPmEmployeeId(td.pmEmployeeId || '');
      setCollaborationMode(td.collaborationMode || 'free');
      setMembers(td.members.map(m => ({ employeeId: m.id, role: m.role || 'member' })));
      setSelectedToolIds(new Set(td.tools.map(tool => tool.id)));
      // Load team policies
      policiesApi.getTeamPolicies(id).then(res => setTeamPolicies(res.data)).catch(() => {});
      setLoading(false);
    }).catch(err => {
      toast(err instanceof Error ? err.message : t('common.loadFailed'), 'error');
      navigate('/teams');
    });
  }, [id, navigate, toast, t]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !pmEmployeeId) {
      toast(t('teamForm.nameRequired'), 'error');
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
        toast(t('teamForm.updated'), 'success');
      } else {
        await teamsApi.create(body);
        toast(t('teamForm.created'), 'success');
      }
      navigate('/teams');
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : t('common.saveFailed'), 'error');
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
  for (const tl of allTools) {
    const group = tl.groupName || t('tools.ungrouped');
    if (!toolGroups.has(group)) toolGroups.set(group, []);
    toolGroups.get(group)!.push(tl);
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h2 className="text-2xl font-bold tracking-tight mb-6">{isEdit ? t('teamForm.editTeam') : t('teamForm.createTeam')}</h2>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Basic Info */}
        <section className="space-y-4">
          <h3 className="text-lg font-medium border-b pb-2">{t('teamForm.basicInfo')}</h3>
          <div className="space-y-2">
            <Label htmlFor="name">{t('teamForm.name')} *</Label>
            <Input id="name" value={name} onChange={e => setName(e.target.value)} placeholder={t('teamForm.namePlaceholder')} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="desc">{t('teamForm.desc')}</Label>
            <Textarea id="desc" value={description} onChange={e => setDescription(e.target.value)} placeholder={t('teamForm.descPlaceholder')} rows={3} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="scenario">{t('teamForm.scenario')}</Label>
            <Input id="scenario" value={scenario} onChange={e => setScenario(e.target.value)} placeholder={t('teamForm.scenarioPlaceholder')} />
          </div>
        </section>

        {/* PM Selection */}
        <section className="space-y-4">
          <h3 className="text-lg font-medium border-b pb-2">{t('teamForm.pm')} *</h3>
          <select
            className="w-full h-10 rounded-xl border-0 bg-muted px-3 py-1 text-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
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
            <option value="">{t('teamForm.selectPm')}</option>
            {allEmployees.map(emp => (
              <option key={emp.id} value={emp.id}>{emp.avatar || '👤'} {emp.name} ({emp.modelName})</option>
            ))}
          </select>
        </section>

        {/* Members */}
        <section className="space-y-4">
          <h3 className="text-lg font-medium border-b pb-2">{t('teamForm.members')}</h3>
          {members.length > 0 && (
            <div className="space-y-2">
              {members.map(m => {
                const emp = allEmployees.find(e => e.id === m.employeeId);
                return (
                  <div key={m.employeeId} className="flex items-center gap-3 rounded-xl bg-muted/30 px-3 py-2">
                    <span>{emp?.avatar || '👤'}</span>
                    <span className="flex-1 text-sm">{emp?.name || m.employeeId}</span>
                    <select
                      className="h-7 rounded-lg border-0 bg-muted px-2 py-0.5 text-xs transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                      value={m.role}
                      onChange={e => setMembers(prev => prev.map(x => x.employeeId === m.employeeId ? { ...x, role: e.target.value } : x))}
                    >
                      <option value="member">{t('teamForm.roleMember')}</option>
                      <option value="observer">{t('teamForm.roleObserver')}</option>
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
              className="w-full h-10 rounded-xl border-0 bg-muted px-3 py-1 text-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              value=""
              onChange={e => { if (e.target.value) addMember(e.target.value); }}
            >
              <option value="">{t('teamForm.addMember')}</option>
              {memberCandidates.map(emp => (
                <option key={emp.id} value={emp.id}>{emp.avatar || '👤'} {emp.name}</option>
              ))}
            </select>
          )}
        </section>

        {/* Tools */}
        <section className="space-y-4">
          <h3 className="text-lg font-medium border-b pb-2">{t('teamForm.toolAuth')}</h3>
          {Array.from(toolGroups).map(([group, groupTools]) => (
            <div key={group}>
              <div className="text-sm font-medium text-muted-foreground mb-2">{group}</div>
              <div className="flex flex-wrap gap-2">
                {groupTools.map(tl => (
                  <Badge
                    key={tl.id}
                    variant={selectedToolIds.has(tl.id) ? 'default' : 'outline'}
                    className="cursor-pointer"
                    onClick={() => toggleTool(tl.id)}
                  >
                    {tl.name}
                  </Badge>
                ))}
              </div>
            </div>
          ))}
          {allTools.length === 0 && <p className="text-sm text-muted-foreground">{t('teamForm.noTools')}</p>}
        </section>

        {/* Policy Packages */}
        {isEdit && id && (
          <section className="space-y-4">
            <h3 className="text-lg font-medium border-b pb-2">{t('teamForm.policies')}</h3>
            {teamPolicies.length > 0 && (
              <div className="space-y-2">
                {teamPolicies.map(tp => (
                  <div key={tp.packageId} className="flex items-center gap-3 rounded-xl bg-muted/30 px-3 py-2">
                    <span className="flex-1 text-sm">
                      {tp.packageName}
                      {tp.version != null && <span className="text-xs text-muted-foreground ml-1">v{tp.version}</span>}
                      {tp.isBuiltin ? <Badge variant="secondary" className="ml-2">{t('policies.builtin')}</Badge> : null}
                    </span>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await policiesApi.removeFromTeam(id, tp.packageId);
                          setTeamPolicies(prev => prev.filter(p => p.packageId !== tp.packageId));
                          toast(t('teamForm.policyRemoved'), 'success');
                        } catch (err: unknown) {
                          toast(err instanceof Error ? err.message : t('common.operationFailed'), 'error');
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
                className="w-full h-10 rounded-xl border-0 bg-muted px-3 py-1 text-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                value=""
                onChange={async (e) => {
                  const pkgId = e.target.value;
                  if (!pkgId) return;
                  try {
                    const res = await policiesApi.assignToTeam(id, pkgId);
                    setTeamPolicies(res.data);
                    toast(t('teamForm.policyAdded'), 'success');
                  } catch (err: unknown) {
                    toast(err instanceof Error ? err.message : t('common.operationFailed'), 'error');
                  }
                }}
              >
                <option value="">{t('teamForm.addPolicy')}</option>
                {allPolicies
                  .filter(p => !teamPolicies.some(tp => tp.packageId === p.id))
                  .map(p => (
                    <option key={p.id} value={p.id}>{p.name}{p.isBuiltin ? ` (${t('policies.builtin')})` : ''}</option>
                  ))}
              </select>
            )}
            {!isEdit && <p className="text-sm text-muted-foreground">{t('teamForm.policyHint')}</p>}
          </section>
        )}

        {/* Collaboration Mode */}
        <section className="space-y-4">
          <h3 className="text-lg font-medium border-b pb-2">{t('teamForm.collabMode')}</h3>
          <div className="flex flex-wrap gap-3">
            {COLLAB_MODES.map(mode => (
              <label
                key={mode.value}
                className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm cursor-pointer transition-colors ${
                  collaborationMode === mode.value ? 'bg-primary/10 ring-2 ring-primary/30' : 'bg-muted/30'
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
                {t(mode.labelKey)}
              </label>
            ))}
          </div>
          {(() => {
            const selected = COLLAB_MODES.find(m => m.value === collaborationMode);
            return selected?.descKey ? (
              <p className="text-sm text-muted-foreground mt-2">{t(selected.descKey)}</p>
            ) : null;
          })()}
        </section>

        {/* Actions */}
        <div className="flex gap-3 pt-4 border-t">
          <Button type="submit" disabled={saving}>
            {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-1" /> {t('common.saving')}</> : isEdit ? t('common.save') : t('common.create')}
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate('/teams')}>{t('common.cancel')}</Button>
        </div>
      </form>
    </div>
  );
}
