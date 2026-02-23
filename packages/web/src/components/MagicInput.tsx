import { useState } from 'react';
import { useNavigate } from 'react-router';
import { aiApi } from '@/api/client';
import { useToast } from '@/components/ui/toast';
import { useI18n } from '@/i18n';
import { Sparkles, Loader2 } from 'lucide-react';

export function MagicInput({ type }: { type: 'task' | 'team' }) {
  const [text, setText] = useState('');
  const [parsing, setParsing] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useI18n();

  const handleSubmit = async () => {
    if (!text.trim() || parsing) return;
    setParsing(true);
    try {
      const res = await aiApi.parseIntent(text.trim(), type);
      const state = { magicPrefill: res.data };
      navigate(type === 'task' ? '/tasks/new' : '/teams/new', { state });
    } catch {
      toast(t('magic.parseFailed'), 'error');
    } finally {
      setParsing(false);
    }
  };

  return (
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
  );
}
