import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { templatesApi, modelsApi, type TemplateSummary, type Model } from '@/api/client';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { Loader2, ArrowRight, Users } from 'lucide-react';
import HealthDashboard from './HealthDashboard';

export default function HomePage() {
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([templatesApi.list(), modelsApi.list()])
      .then(([tplRes, modelRes]) => {
        setTemplates(tplRes.data);
        setModels(modelRes.data.filter(m => m.status === 'available'));
        if (modelRes.data.filter(m => m.status === 'available').length > 0) {
          setSelectedModel(modelRes.data.filter(m => m.status === 'available')[0].id);
        }
      })
      .catch(err => toast(err instanceof Error ? err.message : '加载失败', 'error'))
      .finally(() => setLoading(false));
  }, [toast]);

  const handleApply = async (templateId: string) => {
    if (!selectedModel) {
      toast('请先选择一个可用的模型', 'error');
      return;
    }
    setApplying(templateId);
    try {
      const res = await templatesApi.apply(templateId, selectedModel);
      toast('团队创建成功', 'success');
      navigate(`/teams/${res.data.teamId}/edit`);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : '应用模板失败', 'error');
    } finally {
      setApplying(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <HealthDashboard />

      <div className="mb-8">
        <h2 className="text-2xl font-semibold mb-2">快速开始</h2>
        <p className="text-muted-foreground">
          选择一个场景模板，快速创建团队并开始工作
        </p>
      </div>

      {models.length === 0 && (
        <div className="mb-6 p-4 rounded-lg border border-yellow-200 bg-yellow-50 text-yellow-800 text-sm">
          暂无可用模型，请先
          <a href="/models" className="underline font-medium mx-1">添加并测试模型</a>
          后再使用模板。
        </div>
      )}

      {models.length > 0 && (
        <div className="mb-6">
          <label className="block text-sm font-medium mb-2">选择模型</label>
          <select
            className="w-full max-w-xs border rounded-md px-3 py-2 text-sm bg-background"
            value={selectedModel}
            onChange={e => setSelectedModel(e.target.value)}
          >
            {models.map(m => (
              <option key={m.id} value={m.id}>{m.name} ({m.modelId})</option>
            ))}
          </select>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {templates.map(tpl => (
          <div key={tpl.id} className="border rounded-lg p-5 space-y-3 hover:border-primary/50 transition-colors">
            <div className="flex items-center gap-3">
              <span className="text-3xl">{tpl.icon}</span>
              <div>
                <h3 className="font-semibold">{tpl.name}</h3>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Users className="h-3 w-3" />
                  <span>{tpl.employeeCount} 名成员</span>
                </div>
              </div>
            </div>
            <p className="text-sm text-muted-foreground line-clamp-3">{tpl.description}</p>
            <Button
              className="w-full"
              disabled={!selectedModel || applying !== null}
              onClick={() => handleApply(tpl.id)}
            >
              {applying === tpl.id ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <ArrowRight className="h-4 w-4 mr-1" />
              )}
              使用此模板
            </Button>
          </div>
        ))}
      </div>

      <div className="mt-8 pt-6 border-t">
        <h3 className="text-lg font-medium mb-3">或者手动创建</h3>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => navigate('/employees/new')}>添加员工</Button>
          <Button variant="outline" onClick={() => navigate('/teams/new')}>创建团队</Button>
          <Button variant="outline" onClick={() => navigate('/tasks/new')}>创建任务</Button>
        </div>
      </div>
    </div>
  );
}
