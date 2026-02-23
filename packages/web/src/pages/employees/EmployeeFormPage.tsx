import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router';
import { employeesApi, modelsApi, toolsApi, knowledgeApi, type Model, type Tool, type EmployeeInput, type KnowledgeBase } from '@/api/client';
import { useI18n } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { ArrowLeft, Loader2, X, Plus } from 'lucide-react';

export default function EmployeeFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useI18n();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [models, setModels] = useState<Model[]>([]);
  const [allTools, setAllTools] = useState<Tool[]>([]);

  // Form state
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState('');
  const [description, setDescription] = useState('');
  const [modelId, setModelId] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [selectedToolIds, setSelectedToolIds] = useState<string[]>([]);
  const [allKbs, setAllKbs] = useState<KnowledgeBase[]>([]);
  const [assignedKbs, setAssignedKbs] = useState<Array<{ id: string; name: string; description: string | null }>>([]);

  useEffect(() => {
    async function init() {
      try {
        const [modelsRes, toolsRes, kbsRes] = await Promise.all([modelsApi.list(), toolsApi.list(), knowledgeApi.list()]);
        setModels(modelsRes.data);
        setAllTools(toolsRes.data);
        setAllKbs(kbsRes.data);

        if (isEdit) {
          const empRes = await employeesApi.get(id);
          const emp = empRes.data;
          setName(emp.name);
          setAvatar(emp.avatar || '');
          setDescription(emp.description || '');
          setModelId(emp.modelId || '');
          setSystemPrompt(emp.systemPrompt);
          setTags(emp.tags);
          setSelectedToolIds(emp.tools.map(tool => tool.id));
          // Load assigned knowledge bases
          const kbRes = await knowledgeApi.getEmployeeKBs(id);
          setAssignedKbs(kbRes.data);
        }
      } catch (err: unknown) {
        toast(err instanceof Error ? err.message : t('common.loadFailed'), 'error');
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [id, isEdit, toast]);

  const addTag = () => {
    const tag = tagInput.trim();
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag]);
    }
    setTagInput('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const input: EmployeeInput = {
      name, modelId, systemPrompt,
      avatar: avatar || undefined,
      description: description || undefined,
      tags: tags.length > 0 ? tags : undefined,
      toolIds: selectedToolIds,
    };
    try {
      if (isEdit) {
        await employeesApi.update(id, input);
        toast(t('employees.updated'), 'success');
      } else {
        await employeesApi.create(input);
        toast(t('employees.created'), 'success');
      }
      navigate('/employees');
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : t('common.saveFailed'), 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <Button variant="ghost" className="mb-4" onClick={() => navigate('/employees')}>
        <ArrowLeft className="h-4 w-4 mr-1" /> {t('common.back')}
      </Button>
      <h2 className="text-2xl font-bold tracking-tight mb-6">{isEdit ? t('employees.editEmployee') : t('employees.addEmployee')}</h2>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic info */}
        <section className="space-y-4">
          <h3 className="text-sm font-medium text-muted-foreground">{t('employees.basicInfo')}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-[80px_1fr] gap-4">
            <div className="space-y-2">
              <Label>{t('employees.avatar')}</Label>
              <Input data-testid="employee-avatar-input" value={avatar} onChange={e => setAvatar(e.target.value)} placeholder="🧑‍💼" className="text-center text-xl" />
            </div>
            <div className="space-y-2">
              <Label>{t('employees.name')} <span className="text-destructive">*</span></Label>
              <Input data-testid="employee-name-input" value={name} onChange={e => setName(e.target.value)} placeholder={t('employees.namePlaceholder')} required />
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t('employees.desc')}</Label>
            <Input data-testid="employee-description-input" value={description} onChange={e => setDescription(e.target.value)} placeholder={t('employees.descPlaceholder')} />
          </div>
        </section>

        {/* Model */}
        <section className="space-y-4">
          <h3 className="text-sm font-medium text-muted-foreground">{t('employees.brain')} <span className="text-destructive">*</span></h3>
          <Select data-testid="employee-modelId-input" value={modelId} onChange={e => setModelId(e.target.value)} required>
            <option value="">{t('employees.selectModel')}</option>
            {models.map(m => <option key={m.id} value={m.id}>{m.name} ({m.modelId})</option>)}
          </Select>
        </section>

        {/* Tools */}
        <section className="space-y-4">
          <h3 className="text-sm font-medium text-muted-foreground">{t('employees.toolAssign')}</h3>
          <div className="rounded-xl bg-muted/30 p-3 max-h-48 overflow-y-auto space-y-1">
            {allTools.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('employees.noTools')}</p>
            ) : allTools.map(tool => (
              <label key={tool.id} className="flex items-center gap-2 py-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedToolIds.includes(tool.id)}
                  onChange={e => {
                    if (e.target.checked) setSelectedToolIds([...selectedToolIds, tool.id]);
                    else setSelectedToolIds(selectedToolIds.filter(id => id !== tool.id));
                  }}
                  className="rounded"
                />
                <span className="text-sm">{tool.name}</span>
                {tool.groupName && <Badge variant="secondary" className="text-xs">{tool.groupName}</Badge>}
              </label>
            ))}
          </div>
        </section>

        {/* System prompt */}
        <section className="space-y-4">
          <h3 className="text-sm font-medium text-muted-foreground">{t('employees.systemPrompt')} <span className="text-destructive">*</span></h3>
          <Textarea
            data-testid="employee-systemPrompt-input"
            value={systemPrompt}
            onChange={e => setSystemPrompt(e.target.value)}
            placeholder={t('employees.systemPromptPlaceholder')}
            rows={8}
            required
          />
        </section>

        {/* Tags */}
        <section className="space-y-4">
          <h3 className="text-sm font-medium text-muted-foreground">{t('employees.tags')}</h3>
          <div className="flex flex-wrap gap-2 mb-2">
            {tags.map(tag => (
              <Badge key={tag} variant="secondary" className="gap-1">
                {tag}
                <button type="button" onClick={() => setTags(tags.filter(x => x !== tag))} className="cursor-pointer"><X className="h-3 w-3" /></button>
              </Badge>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); addTag(); } }}
              placeholder={t('employees.tagPlaceholder')}
            />
            <Button type="button" variant="outline" onClick={addTag}>{t('common.add')}</Button>
          </div>
        </section>

        {/* Knowledge Bases (only in edit mode) */}
        {isEdit && (
          <section className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground">{t('employees.knowledgeBases')}</h3>
            {assignedKbs.length > 0 && (
              <div className="space-y-2">
                {assignedKbs.map(kb => (
                  <div key={kb.id} className="flex items-center gap-3 rounded-xl bg-muted/30 px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">{kb.name}</div>
                      {kb.description && <div className="text-xs text-muted-foreground truncate">{kb.description}</div>}
                    </div>
                    <Button
                      type="button" variant="ghost" size="sm"
                      onClick={async () => {
                        try {
                          await knowledgeApi.removeFromEmployee(id, kb.id);
                          setAssignedKbs(assignedKbs.filter(k => k.id !== kb.id));
                          toast(t('employees.kbRemoved'), 'success');
                        } catch (err: unknown) {
                          toast(err instanceof Error ? err.message : t('common.operationFailed'), 'error');
                        }
                      }}
                    >
                      <X className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            {allKbs.filter(kb => !assignedKbs.find(a => a.id === kb.id)).length > 0 && (
              <div className="flex gap-2">
                <Select
                  id="kb-select"
                  defaultValue=""
                  onChange={async (e) => {
                    const kbId = e.target.value;
                    if (!kbId) return;
                    try {
                      await knowledgeApi.assignToEmployee(id, kbId);
                      const kb = allKbs.find(k => k.id === kbId);
                      if (kb) setAssignedKbs([...assignedKbs, { id: kb.id, name: kb.name, description: kb.description }]);
                      toast(t('employees.kbAssigned'), 'success');
                      e.target.value = '';
                    } catch (err: unknown) {
                      toast(err instanceof Error ? err.message : t('common.operationFailed'), 'error');
                    }
                  }}
                >
                  <option value="">{t('employees.selectKb')}</option>
                  {allKbs.filter(kb => !assignedKbs.find(a => a.id === kb.id)).map(kb => (
                    <option key={kb.id} value={kb.id}>{kb.name}</option>
                  ))}
                </Select>
              </div>
            )}
            {allKbs.length === 0 && assignedKbs.length === 0 && (
              <p className="text-sm text-muted-foreground">{t('employees.noKbs')}</p>
            )}
          </section>
        )}

        <div className="flex gap-2 pt-4 border-t">
          <Button type="button" variant="outline" onClick={() => navigate('/employees')}>{t('common.cancel')}</Button>
          <Button type="submit" disabled={saving}>{saving ? t('common.saving') : t('common.save')}</Button>
        </div>
      </form>
    </div>
  );
}
