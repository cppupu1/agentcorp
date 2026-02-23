import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router';
import { hrAssistantApi } from '@/api/client';
import type { ChatSession, HrChatMessage } from '@/api/client';
import { Button } from '@/components/ui/button';
import MarkdownContent from '@/components/MarkdownContent';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/i18n';

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
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<HrChatMessage[]>([]);
  const [streaming, setStreaming] = useState<StreamingMessage | null>(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const activeSessionRef = useRef<string | null>(null);

  useEffect(() => {
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
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
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

        <div ref={chatContainerRef} className="flex-1 overflow-auto p-4 space-y-4">
          {!activeSessionId && (
            <div className="flex items-center justify-center h-full text-muted-foreground">
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
          <div className="p-4 border-t border-border/50">
            <div className="flex gap-2">
              <Input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t('hr.inputPlaceholder')}
                disabled={sending}
                className="flex-1"
              />
              <Button onClick={sendMessage} disabled={sending || !input.trim()}>
                {sending ? t('hr.sending') : t('hr.send')}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: HrChatMessage }) {
  const isUser = message.role === 'user';
  let toolCalls: ToolCallEntry[] = [];
  try {
    toolCalls = message.toolCalls ? JSON.parse(message.toolCalls) : [];
  } catch {
    toolCalls = [];
  }

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[75%] rounded-lg px-4 py-2 ${
        isUser ? 'bg-primary text-primary-foreground' : 'bg-muted'
      }`}>
        {isUser ? (
          <div className="whitespace-pre-wrap text-sm">{message.content}</div>
        ) : (
          <MarkdownContent content={message.content} className="text-sm" />
        )}
        {toolCalls.length > 0 && <ToolCallsDisplay toolCalls={toolCalls} />}
      </div>
    </div>
  );
}

function StreamingBubble({ msg }: { msg: StreamingMessage }) {
  const { t } = useI18n();
  return (
    <div className="flex justify-start">
      <div className="max-w-[75%] rounded-lg px-4 py-2 bg-muted">
        {msg.text ? (
          <MarkdownContent content={msg.text} className="text-sm" />
        ) : (
          <div className="text-sm text-muted-foreground">{t('hr.thinking')}</div>
        )}
        {msg.toolCalls.length > 0 && <ToolCallsDisplay toolCalls={msg.toolCalls} />}
        {!msg.done && <span className="inline-block w-2 h-4 bg-foreground/50 animate-pulse ml-1" />}
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
    <div className="mt-2 space-y-1">
      {toolCalls.map(tc => {
        const empId = getCreatedEmployeeId(tc);
        return (
          <div key={tc.id} className="border border-border rounded text-xs">
            <button
              className="w-full px-2 py-1 flex items-center gap-2 hover:bg-accent/50 text-left"
              onClick={() => toggle(tc.id)}
            >
              <span className={tc.result !== undefined ? (tc.isError ? 'text-destructive' : 'text-success') : 'text-warning'}>
                {tc.result !== undefined ? (tc.isError ? '✗' : '✓') : '⟳'}
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
