import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { tasksApi, type TaskMessage } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Sheet, SheetHeader, SheetContent } from '@/components/ui/sheet';
import MarkdownContent from '@/components/MarkdownContent';
import { useToast } from '@/components/ui/toast';
import { useI18n } from '@/i18n';
import { useIMEComposing } from '@/hooks/useIMEComposing';
import { useChatDrawer } from '@/contexts/ChatDrawerContext';
import SlashCommandMenu from '@/components/SlashCommandMenu';
import { Loader2, Send, ExternalLink } from 'lucide-react';

export default function ChatDrawer() {
  const { open, taskId, taskTitle, closeChat } = useChatDrawer();
  const [messages, setMessages] = useState<TaskMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [streamText, setStreamText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const { toast } = useToast();
  const { t } = useI18n();
  const navigate = useNavigate();
  const { onCompositionStart, onCompositionEnd, isComposing } = useIMEComposing();

  const handleSlashCommand = useCallback((cmdId: string) => {
    if (!cmdId || !taskId) { setInput(''); return; }
    setInput('');
    if (cmdId === 'retry') {
      tasksApi.retry(taskId).then(() => toast(t('slashCmd.retryOk'), 'success')).catch(() => toast(t('slashCmd.retryFail'), 'error'));
    } else if (cmdId === 'pause') {
      tasksApi.pause(taskId).then(() => toast(t('slashCmd.pauseOk'), 'success')).catch(() => toast(t('slashCmd.pauseFail'), 'error'));
    } else if (cmdId === 'export') {
      navigate(`/tasks/${taskId}`);
      closeChat();
    } else if (cmdId === 'status') {
      navigate(`/tasks/${taskId}`);
      closeChat();
    }
  }, [taskId, toast, t, navigate, closeChat]);

  // Load messages when taskId changes
  useEffect(() => {
    if (!taskId) return;
    setMessages([]);
    setInput('');
    setStreamText('');
    tasksApi.messages(taskId, 'chat').then(res => setMessages(res.data)).catch(() => {});
  }, [taskId]);

  // Abort on unmount
  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamText]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || sending || !taskId) return;
    const msg = input.trim();
    setInput('');
    setSending(true);
    setStreamText('');

    const tempUserMsg: TaskMessage = {
      id: `temp-${Date.now()}`,
      taskId,
      role: 'user',
      senderId: null,
      content: msg,
      messageType: 'chat',
      metadata: null,
      createdAt: new Date().toISOString(),
    };
    setMessages(prev => [...prev, tempUserMsg]);

    try {
      abortRef.current = new AbortController();
      const res = await fetch(`/api/tasks/${taskId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error?.message || res.statusText);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';
      let eventType = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7);
          } else if (line.startsWith('data: ') && eventType) {
            try {
              const data = JSON.parse(line.slice(6));
              if (eventType === 'delta' && data.text) {
                fullText += data.text;
                setStreamText(fullText);
              } else if (eventType === 'error') {
                toast(data.message || t('taskDetail.chatError'), 'error');
              }
            } catch {}
          } else if (line === '') {
            eventType = '';
          }
        }
      }

      if (fullText) {
        const assistantMsg: TaskMessage = {
          id: `assistant-${Date.now()}`,
          taskId,
          role: 'assistant',
          senderId: null,
          content: fullText,
          messageType: 'chat',
          metadata: null,
          createdAt: new Date().toISOString(),
        };
        setMessages(prev => [...prev, assistantMsg]);
      }
      setStreamText('');
    } catch (err: unknown) {
      if ((err as Error).name !== 'AbortError') {
        toast(err instanceof Error ? err.message : t('taskDetail.sendFailed'), 'error');
      }
    } finally {
      setSending(false);
      abortRef.current = null;
    }
  }, [input, sending, taskId, toast, t]);

  if (!taskId) return null;

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) closeChat(); }}>
      <SheetHeader onClose={closeChat}>
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="text-sm font-medium truncate">{taskTitle || t('chatDrawer.title')}</h3>
          <button
            onClick={() => { navigate(`/tasks/${taskId}`); closeChat(); }}
            className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground shrink-0"
            title={t('chatDrawer.goToTask')}
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
        </div>
      </SheetHeader>
      <SheetContent className="flex flex-col">
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.filter(m => m.content).map(msg => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-lg px-4 py-2 text-sm ${
                msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'
              }`}>
                {msg.role === 'user' ? msg.content : <MarkdownContent taskId={taskId} content={msg.content} className="text-sm" />}
              </div>
            </div>
          ))}
          {streamText && (
            <div className="flex justify-start">
              <div className="max-w-[85%] rounded-lg px-4 py-2 text-sm bg-muted">
                <MarkdownContent taskId={taskId} content={streamText} className="text-sm" />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
        <div className="border-t border-border/40 p-3 flex gap-2 shrink-0 relative">
          <SlashCommandMenu input={input} onSelect={handleSlashCommand} anchorRef={textareaRef} />
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={t('taskDetail.chatPlaceholder')}
            rows={2}
            className="flex-1 resize-none"
            onKeyDown={e => { if (input.startsWith('/')) return; if (e.key === 'Enter' && !e.shiftKey && !isComposing(e)) { e.preventDefault(); handleSend(); } }}
            onCompositionStart={onCompositionStart}
            onCompositionEnd={onCompositionEnd}
          />
          <Button onClick={handleSend} disabled={sending || !input.trim()} className="self-end">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
