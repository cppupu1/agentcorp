import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { tasksApi, teamsApi, employeesApi, type Team, type Employee } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toast';
import { Loader2 } from 'lucide-react';

export default function TaskCreatePage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [createMode, setCreateMode] = useState<'quick' | 'team'>('quick');
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamId, setTeamId] = useState('');
  const [allEmployees, setAllEmployees] = useState<Employee[]>([]);
  const [pmEmployeeId, setPmEmployeeId] = useState('');
  const [description, setDescription] = useState('');
  const [mode, setMode] = useState('suggest');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    employeesApi.list().then(res => setAllEmployees(res.data)).catch(err => {
      toast(err instanceof Error ? err.message : '加载员工失败', 'error');
    });
    teamsApi.list().then(res => setTeams(res.data)).catch(err => {
      toast(err instanceof Error ? err.message : '加载团队失败', 'error');
    });
  }, [toast]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (createMode === 'quick' && !pmEmployeeId) {
      toast('请选择PM', 'error');
      return;
    }
    if (createMode === 'team' && !teamId) {
      toast('请选择团队', 'error');
      return;
    }
    if (!description.trim()) {
      toast('请输入任务描述', 'error');
      return;
    }
    setSaving(true);
    try {
      const body = createMode === 'quick'
        ? { pmEmployeeId, description: description.trim(), mode }
        : { teamId, description: description.trim(), mode };
      const res = await tasksApi.create(body);
      toast('任务已创建', 'success');
      navigate(`/tasks/${res.data.id}`);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : '创建失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 max-w-2xl">
      <h2 className="text-2xl font-semibold mb-6">创建任务</h2>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-2">
          <Label>创建方式</Label>
          <div className="flex gap-3">
            <label className={`flex-1 border rounded-lg p-3 cursor-pointer transition-colors ${createMode === 'quick' ? 'border-primary bg-primary/5' : ''}`}>
              <input type="radio" name="createMode" value="quick" checked={createMode === 'quick'} onChange={() => setCreateMode('quick')} className="sr-only" />
              <div className="font-medium text-sm mb-1">快速模式</div>
              <div className="text-xs text-muted-foreground">选PM，系统自动组建团队</div>
            </label>
            <label className={`flex-1 border rounded-lg p-3 cursor-pointer transition-colors ${createMode === 'team' ? 'border-primary bg-primary/5' : ''}`}>
              <input type="radio" name="createMode" value="team" checked={createMode === 'team'} onChange={() => setCreateMode('team')} className="sr-only" />
              <div className="font-medium text-sm mb-1">团队模式</div>
              <div className="text-xs text-muted-foreground">选择已有团队</div>
            </label>
          </div>
        </div>
        {createMode === 'quick' ? (
          <div className="space-y-2">
            <Label>选择PM *</Label>
            <select
              className="w-full border rounded-md px-3 py-2 text-sm bg-background"
              value={pmEmployeeId}
              onChange={e => setPmEmployeeId(e.target.value)}
            >
              <option value="">选择PM...</option>
              {allEmployees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
        ) : (
          <div className="space-y-2">
            <Label>选择团队 *</Label>
            <select
              className="w-full border rounded-md px-3 py-2 text-sm bg-background"
              value={teamId}
              onChange={e => setTeamId(e.target.value)}
              data-testid="task-teamId-input"
            >
              <option value="">选择团队...</option>
              {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        )}
        <div className="space-y-2">
          <Label>任务描述 *</Label>
          <Textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="描述你想要完成的任务..."
            rows={6}
            maxLength={5000}
            data-testid="task-description-input"
            required
          />
          <p className="text-xs text-muted-foreground">{description.length}/5000</p>
        </div>
        <div className="space-y-2">
          <Label>执行模式</Label>
          <div className="flex gap-3">
            <label className={`flex-1 border rounded-lg p-3 cursor-pointer transition-colors ${mode === 'suggest' ? 'border-primary bg-primary/5' : ''}`}>
              <input type="radio" name="mode" value="suggest" checked={mode === 'suggest'} onChange={() => setMode('suggest')} className="sr-only" />
              <div className="font-medium text-sm mb-1">建议模式</div>
              <div className="text-xs text-muted-foreground">PM 生成方案后需人工审批每个步骤，仅使用只读工具</div>
            </label>
            <label className={`flex-1 border rounded-lg p-3 cursor-pointer transition-colors ${mode === 'auto' ? 'border-primary bg-primary/5' : ''}`}>
              <input type="radio" name="mode" value="auto" checked={mode === 'auto'} onChange={() => setMode('auto')} className="sr-only" />
              <div className="font-medium text-sm mb-1">自动模式</div>
              <div className="text-xs text-muted-foreground">PM 生成方案后自动审批执行，可使用所有工具</div>
            </label>
          </div>
        </div>
        <div className="flex gap-3 pt-4 border-t">
          <Button type="submit" disabled={saving}>
            {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-1" /> 创建中...</> : '创建任务'}
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate('/tasks')}>取消</Button>
        </div>
      </form>
    </div>
  );
}
