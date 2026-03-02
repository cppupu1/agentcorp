import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { aiApi, tasksApi, modelsApi, templatesApi, type Model, type TemplateSummary } from '@/api/client';
import { useToast } from '@/components/ui/toast';
import { useI18n } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Sparkles, Loader2 } from 'lucide-react';

interface ParseResult {
  description: string;
  mode: string;
  templateId?: string | null;
  teamName?: string | null;
}

export function MagicInput({ type }: { type: 'task' | 'team' }) {
  const [text, setText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [preview, setPreview] = useState<ParseResult | null>(null);
  const [models, setModels] = useState<Model[]>([]);
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useI18n();

  useEffect(() => {
    modelsApi.list().then(res => {
      const available = res.data.filter(m => m.status === 'available');
      setModels(available);
      if (available.length > 0) setSelectedModel(available[0].id);
    }).catch(() => {});
    templatesApi.list().then(res => setTemplates(res.data)).catch(() => {});
  }, []);

  const handleSubmit = async () => {
    if (!text.trim() || parsing) return;
    setParsing(true);
    try {
      const res = await aiApi.parseIntent(text.trim(), type);
      const data = res.data as unknown as ParseResult;
      if (type === 'task' && data.templateId) {
        setPreview(data);
      } else {
        navigate(type === 'task' ? '/tasks/new' : '/teams/new', { state: { magicPrefill: data } });
      }
    } catch {
      toast(t('magic.parseFailed'), 'error');
    } finally {
      setParsing(false);
    }
  };

  const handleQuickCreate = async () => {
    if (!preview?.templateId || !selectedModel || creating) return;
    setCreating(true);
    try {
      const res = await tasksApi.quickCreate({
        templateId: preview.templateId,
        modelId: selectedModel,
        description: preview.description,
        mode: preview.mode,
        teamName: preview.teamName || undefined,
      });
      toast(t('magic.quickCreateSuccess'), 'success');
      setPreview(null);
      setText('');
      navigate(`/tasks/${res.data.id}`);
    } catch (err) {
      toast(err instanceof Error ? err.message : t('common.operationFailed'), 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleCustomize = () => {
    if (!preview) return;
    navigate('/tasks/new', { state: { magicPrefill: preview } });
    setPreview(null);
  };

  const matchedTemplate = preview?.templateId
    ? templates.find(tpl => tpl.id === preview.templateId)
    : null;

  return (
    <>
      <div className="relative mb-5">
        <Sparkles className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary/60" />
        <input
          className="w-full h-12 rounded-2xl border border-primary/20 bg-primary/5 pl-10 pr-4 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-all"
          placeholder={t(`magic.placeholder.${type}`)}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); }}
          disabled={parsing}
        />
        {parsing && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-primary" />}
      </div>

      <Dialog open={!!preview} onOpenChange={() => setPreview(null)}>
        <DialogHeader>
          <DialogTitle>{t('magic.previewTitle')}</DialogTitle>
        </DialogHeader>

        {matchedTemplate && (
          <div className="flex items-center gap-3 p-4 rounded-2xl bg-primary/5 border border-primary/10 mb-4">
            <span className="text-2xl">{matchedTemplate.icon}</span>
            <div>
              <p className="text-sm font-medium">
                {t('magic.templateMatch').replace('{name}', matchedTemplate.name)}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {matchedTemplate.employeeCount} {t('common.members')}
              </p>
            </div>
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">{t('magic.taskDesc')}</label>
            <p className="text-sm text-muted-foreground bg-muted/30 rounded-xl p-3">
              {preview?.description}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">{t('magic.selectModel')}</label>
            <select
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={selectedModel}
              onChange={e => setSelectedModel(e.target.value)}
            >
              {models.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCustomize}>
            {t('magic.customize')}
          </Button>
          <Button onClick={handleQuickCreate} disabled={creating || !selectedModel}>
            {creating ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            {creating ? t('magic.creating') : t('magic.approveAndStart')}
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}
