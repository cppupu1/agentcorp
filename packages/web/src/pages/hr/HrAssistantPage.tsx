import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router';
import { hrAssistantApi } from '@/api/client';
import type { ChatSession, HrChatMessage } from '@/api/client';
import { Button } from '@/components/ui/button';
import MarkdownContent from '@/components/MarkdownContent';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/i18n';
import { useIMEComposing } from '@/hooks/useIMEComposing';
import { Loader2 } from 'lucide-react';

interface ToolCallEntry {
  id: string;
  toolName: string;
  args: unknown;
  result?: unknown;
  isError?: boolean;
}

interface StreamingMessage {
  role: 'assistant';
  text: string;
  toolCalls: ToolCallEntry[];
  done: boolean;
}

export default function HrAssistantPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { onCompositionStart, onCompositionEnd, isComposing } = useIMEComposing();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<HrChatMessage[]>([]);
  const [streaming, setStreaming] = useState<StreamingMessage | null>(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const activeSessionRef = useRef<string | null>(null);

  useEffect(() => {
    hrAssistantApi.status().then(res => setConfigured(res.data.configured)).catch(() => setConfigured(false));
    return () => { abortRef.current?.abort(); };
  }, []);

  const loadSessions = useCallback(async () => {
    const data = await hrAssistantApi.listSessions();
    setSessions(Array.isArray(data) ? data : (data as any).data ?? []);
  }, []);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  useEffect(() => {
    if (!activeSessionId) { setMessages([]); return; }
    hrAssistantApi.getMessages(activeSessionId).then(data => {
      setMessages(Array.isArray(data) ? data : (data as any).data ?? []);
    });
  }, [activeSessionId]);

  useEffect(() => {
    const container = chatContainerRef.current;
    if (!container) return;
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
    if (isNearBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, streaming]);

  const switchSession = (newId: string) => {
    abortRef.current?.abort();
    activeSessionRef.current = newId;
    setActiveSessionId(newId);
    setStreaming(null);
    setSending(false);
  };

  const createNewSession = () => {
    abortRef.current?.abort();
    const sessionId = crypto.randomUUID();
    activeSessionRef.current = sessionId;
    setActiveSessionId(sessionId);
    setMessages([]);
    setStreaming(null);
    setSending(false);
  };

  const deleteSession = async (sessionId: string) => {
    await hrAssistantApi.deleteSession(sessionId);
    if (activeSessionId === sessionId) {
      abortRef.current?.abort();
      activeSessionRef.current = null;
      setActiveSessionId(null);
      setMessages([]);
      setStreaming(null);
      setSending(false);
    }
    loadSessions();
  };

  const sendMessage = async () => {
    if (!input.trim() || sending) return;

    let sessionId = activeSessionId;
    if (!sessionId) {
      sessionId = crypto.randomUUID();
      activeSessionRef.current = sessionId;
      setActiveSessionId(sessionId);
    }

    const userMsg = input.trim();
    setInput('');
    setSending(true);

    const tempUserMsg: HrChatMessage = {
      id: crypto.randomUUID(),
      sessionId,
      role: 'user',
      content: userMsg,
      toolCalls: null,
      createdAt: new Date().toISOString(),
    };
    setMessages(prev => [...prev, tempUserMsg]);

    const streamState: StreamingMessage = { role: 'assistant', text: '', toolCalls: [], done: false };
    setStreaming({ ...streamState, toolCalls: [] });

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch('/api/hr-assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, message: userMsg }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        let currentEvent = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7);
          } else if (line.startsWith('data: ') && currentEvent) {
            try {
              const data = JSON.parse(line.slice(6));
              handleSSEEvent(currentEvent, data, streamState);
              setStreaming({
                ...streamState,
                toolCalls: streamState.toolCalls.map(tc => ({ ...tc })),
              });
            } catch { /* ignore parse errors */ }
            currentEvent = '';
          }
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      streamState.text += `\n\n[Error: ${err instanceof Error ? err.message : String(err)}]`;
      streamState.done = true;
      setStreaming({ ...streamState, toolCalls: streamState.toolCalls.map(tc => ({ ...tc })) });
    } finally {
      if (!controller.signal.aborted) {
        setSending(false);
        if (sessionId && activeSessionRef.current === sessionId) {
          const data = await hrAssistantApi.getMessages(sessionId);
          setMessages(Array.isArray(data) ? data : (data as any).data ?? []);
        }
        setStreaming(null);
        loadSessions();
      }
    }
  };

  const handleSSEEvent = (event: string, data: any, msg: StreamingMessage) => {
    switch (event) {
      case 'delta':
        msg.text += data.text || '';
        break;
      case 'tool_call':
        msg.toolCalls.push({ id: data.toolCallId, toolName: data.toolName, args: data.args });
        break;
      case 'tool_result': {
        const tc = msg.toolCalls.find(entry => entry.id === data.toolCallId);
        if (tc) { tc.result = data.result; tc.isError = data.isError; }
        break;
      }
      case 'error':
        msg.text += `\n\n[Error: ${data.message}]`;
        break;
      case 'done':
        msg.done = true;
        break;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !isComposing(e)) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex h-full">
      {/* Session Sidebar */}
      <div className="w-60 border-r border-border/50 hidden md:flex flex-col bg-muted/30">
        <div className="p-3 border-b border-border/50 flex items-center justify-between">
          <span className="text-sm font-semibold text-primary">{t('hr.title')}</span>
          <Button size="sm" onClick={createNewSession}>{t('hr.newChat')}</Button>
        </div>
        <div className="flex-1 overflow-auto p-2 space-y-1">
          {sessions.map(s => (
            <div
              key={s.id}
              className={`group flex items-center justify-between px-3 py-2 rounded-md text-sm cursor-pointer transition-colors ${
                activeSessionId === s.id ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
              }`}
              onClick={() => switchSession(s.id)}
            >
              <span className="truncate flex-1">{s.title}</span>
              <button
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive ml-2"
                onClick={(e) => { e.stopPropagation(); deleteSession(s.id); }}
              >
                &times;
              </button>
            </div>
          ))}
          {sessions.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">{t('hr.noSessions')}</p>
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col">
        <div className="px-4 py-3 border-b border-border/50 bg-primary/5">
          <h2 className="text-lg font-semibold">{t('hr.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('hr.selectOrCreate')}</p>
        </div>

        {configured === false && (
          <div className="mx-4 mt-4 p-4 rounded-xl bg-warning/10 border border-warning/30 flex items-center justify-between gap-3">
            <p className="text-sm text-warning-foreground">{t('hr.notConfigured')}</p>
            <Button size="sm" variant="outline" onClick={() => navigate('/settings')}>
              {t('hr.goSettings')}
            </Button>
          </div>
        )}

        <div ref={chatContainerRef} className="flex-1 overflow-auto p-4 md:p-8 space-y-2">
          {!activeSessionId && configured !== false && (
            <div className="flex items-center justify-center h-full text-muted-foreground/50 text-[15px] font-medium">
              {t('hr.selectOrCreate')}
            </div>
          )}
          {messages.filter(m => m.content).map(m => (
            <MessageBubble key={m.id} message={m} />
          ))}
          {streaming && <StreamingBubble msg={streaming} />}
          <div ref={messagesEndRef} />
        </div>

        {activeSessionId && (
          <div className="p-4 md:p-6 bg-background shrink-0">
            <div className="max-w-4xl mx-auto relative flex items-end gap-2 bg-muted/40 p-2 rounded-[28px] border border-border/40 focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary/50 transition-all md-transition shadow-[var(--shadow-sm)]">
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                onCompositionStart={onCompositionStart}
                onCompositionEnd={onCompositionEnd}
                placeholder={t('hr.inputPlaceholder')}
                disabled={sending}
                rows={1}
                className="flex-1 max-h-32 min-h-[44px] bg-transparent border-0 px-4 py-3 text-[15px] resize-none focus:outline-none placeholder:text-muted-foreground/70"
                style={{ height: 'auto' }}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement;
                  target.style.height = 'auto';
                  target.style.height = `${Math.min(target.scrollHeight, 128)}px`;
                }}
              />
              <Button size="icon" className="h-11 w-11 rounded-full shrink-0 mb-0.5 mr-0.5" onClick={sendMessage} disabled={sending || !input.trim()}>
                {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const HIDDEN_TOOLS = new Set(['list_models', 'list_tools']);

function MessageBubble({ message }: { message: HrChatMessage }) {
  const isUser = message.role === 'user';
  let toolCalls: ToolCallEntry[] = [];
  try {
    toolCalls = (message.toolCalls ? JSON.parse(message.toolCalls) : []).filter((tc: ToolCallEntry) => !HIDDEN_TOOLS.has(tc.toolName));
  } catch {
    toolCalls = [];
  }

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} w-full mb-6 group`}>
      <div className={`max-w-[85%] md:max-w-[75%] px-5 py-4 shadow-[var(--shadow-sm)] md-transition ${
        isUser 
          ? 'bg-primary text-primary-foreground rounded-[24px] rounded-tr-[4px]' 
          : 'bg-card text-foreground border border-border/40 rounded-[24px] rounded-tl-[4px]'
      }`}>
        {isUser ? (
          <div className="whitespace-pre-wrap text-[15px] leading-relaxed">{message.content}</div>
        ) : (
          <MarkdownContent content={message.content} className="text-[15px] leading-relaxed" />
        )}
        {toolCalls.length > 0 && <ToolCallsDisplay toolCalls={toolCalls} />}
      </div>
    </div>
  );
}

function StreamingBubble({ msg }: { msg: StreamingMessage }) {
  const { t } = useI18n();
  return (
    <div className="flex justify-start w-full mb-6">
      <div className="max-w-[85%] md:max-w-[75%] px-5 py-4 shadow-[var(--shadow-sm)] md-transition bg-card text-foreground border border-border/40 rounded-[24px] rounded-tl-[4px]">
        {msg.text ? (
          <MarkdownContent content={msg.text} className="text-[15px] leading-relaxed" />
        ) : (
          <div className="text-[15px] text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin opacity-50" /> {t('hr.thinking')}
          </div>
        )}
        {msg.toolCalls.filter(tc => !HIDDEN_TOOLS.has(tc.toolName)).length > 0 && <ToolCallsDisplay toolCalls={msg.toolCalls.filter(tc => !HIDDEN_TOOLS.has(tc.toolName))} />}
        {!msg.done && <span className="inline-block w-2 h-4 bg-foreground/40 animate-pulse ml-1 rounded-sm align-middle" />}
      </div>
    </div>
  );
}

function ToolCallsDisplay({ toolCalls }: { toolCalls: ToolCallEntry[] }) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (tcId: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(tcId) ? next.delete(tcId) : next.add(tcId);
      return next;
    });
  };

  const truncate = (value: unknown): string => {
    const str = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    return str.length > 5000 ? str.slice(0, 5000) + '\n... [truncated]' : str;
  };

  // Check if a tool call is a successful create_employee
  const getCreatedEmployeeId = (tc: ToolCallEntry): string | null => {
    if (tc.toolName !== 'create_employee' || tc.isError || !tc.result) return null;
    try {
      const r = typeof tc.result === 'string' ? JSON.parse(tc.result) : tc.result;
      return r?.success ? r.employeeId : null;
    } catch { return null; }
  };

  return (
    <div className="mt-4 space-y-2">
      {toolCalls.map(tc => {
        const empId = getCreatedEmployeeId(tc);
        return (
          <div key={tc.id} className="border border-border/60 rounded-xl text-[13px] bg-muted/20 overflow-hidden md-transition">
            <button
              className="w-full px-3 py-2.5 flex items-center gap-2.5 hover:bg-muted/50 text-left transition-colors font-mono font-medium text-muted-foreground/90"
              onClick={() => toggle(tc.id)}
            >
              <span className={tc.result !== undefined ? (tc.isError ? 'text-destructive' : 'text-success') : 'text-warning'}>
                {tc.result !== undefined ? (tc.isError ? '✗' : '✓') : <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              </span>
              <span className="font-mono">{tc.toolName}</span>
              {empId && (
                <Link
                  to={`/employees/${empId}/chat`}
                  className="text-primary hover:underline ml-1"
                  onClick={e => e.stopPropagation()}
                >
                  {t('employees.chat')}
                </Link>
              )}
              <span className="ml-auto text-muted-foreground">{expanded.has(tc.id) ? '▾' : '▸'}</span>
            </button>
            {expanded.has(tc.id) && (
              <div className="px-2 py-1 border-t border-border bg-muted/50 space-y-1">
                <div>
                  <span className="text-muted-foreground">{t('chat.params')}</span>
                  <pre className="inline whitespace-pre-wrap">{truncate(tc.args)}</pre>
                </div>
                {tc.result !== undefined && (
                  <div>
                    <span className="text-muted-foreground">{t('chat.result')}</span>
                    <pre className="inline whitespace-pre-wrap">{truncate(tc.result)}</pre>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
