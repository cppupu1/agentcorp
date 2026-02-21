import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router';
import { chatApi, employeesApi } from '@/api/client';
import type { ChatSession, ChatMessage, EmployeeDetail } from '@/api/client';
import { useI18n } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

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

export default function EmployeeChatPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useI18n();
  const [employee, setEmployee] = useState<EmployeeDetail | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState<StreamingMessage | null>(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const activeSessionRef = useRef<string | null>(null);

  // Cleanup abort controller on unmount
  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  // Load employee
  useEffect(() => {
    if (!id) return;
    employeesApi.get(id).then(r => setEmployee((r as any).data ?? r));
  }, [id]);

  // Load sessions
  const loadSessions = useCallback(async () => {
    if (!id) return;
    const data = await chatApi.listSessions(id);
    setSessions(Array.isArray(data) ? data : (data as any).data ?? []);
  }, [id]);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  // Load messages when session changes
  useEffect(() => {
    if (!id || !activeSessionId) { setMessages([]); return; }
    chatApi.getMessages(id, activeSessionId).then(data => {
      setMessages(Array.isArray(data) ? data : (data as any).data ?? []);
    });
  }, [id, activeSessionId]);

  // Smart auto-scroll: only if near bottom
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
    if (!id) return;
    await chatApi.deleteSession(id, sessionId);
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
    if (!id || !input.trim() || sending) return;

    let sessionId = activeSessionId;
    if (!sessionId) {
      sessionId = crypto.randomUUID();
      activeSessionRef.current = sessionId;
      setActiveSessionId(sessionId);
    }

    const userMsg = input.trim();
    setInput('');
    setSending(true);

    // Optimistic user message
    const tempUserMsg: ChatMessage = {
      id: crypto.randomUUID(),
      employeeId: id,
      sessionId,
      role: 'user',
      content: userMsg,
      toolCalls: null,
      createdAt: new Date().toISOString(),
    };
    setMessages(prev => [...prev, tempUserMsg]);

    // Start streaming
    const streamState: StreamingMessage = { role: 'assistant', text: '', toolCalls: [], done: false };
    setStreaming({ ...streamState, toolCalls: [] });

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(`/api/employees/${id}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, message: userMsg }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`);
      }

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
              // Deep copy to trigger React re-render
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
      streamState.text += `\n\n[${t('chat.error', { message: err instanceof Error ? err.message : String(err) })}]`;
      streamState.done = true;
      setStreaming({ ...streamState, toolCalls: streamState.toolCalls.map(tc => ({ ...tc })) });
    } finally {
      if (!controller.signal.aborted) {
        setSending(false);
        // Only reload if this session is still the active one
        if (id && sessionId && activeSessionRef.current === sessionId) {
          const data = await chatApi.getMessages(id, sessionId);
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
        const tc = msg.toolCalls.find(t => t.id === data.toolCallId);
        if (tc) { tc.result = data.result; tc.isError = data.isError; }
        break;
      }
      case 'error':
        msg.text += `\n\n[${t('chat.error', { message: data.message })}]`;
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
      <div className="w-60 border-r border-border flex flex-col bg-muted/30">
        <div className="p-3 border-b border-border flex items-center justify-between">
          <Link to="/employees" className="text-sm text-muted-foreground hover:text-foreground">
            &larr; {t('chat.back')}
          </Link>
          <Button size="sm" onClick={createNewSession}>{t('chat.newChat')}</Button>
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
            <p className="text-sm text-muted-foreground text-center py-4">{t('chat.noSessions')}</p>
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="px-4 py-3 border-b border-border">
          <h2 className="text-lg font-semibold">{employee?.name ?? t('common.loading')}</h2>
          {employee?.description && (
            <p className="text-sm text-muted-foreground">{employee.description}</p>
          )}
        </div>

        {/* Messages */}
        <div ref={chatContainerRef} className="flex-1 overflow-auto p-4 space-y-4">
          {!activeSessionId && (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              {t('chat.selectOrCreate')}
            </div>
          )}
          {messages.filter(m => m.content).map(m => (
            <MessageBubble key={m.id} message={m} />
          ))}
          {streaming && <StreamingBubble msg={streaming} />}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        {activeSessionId && (
          <div className="p-4 border-t border-border">
            <div className="flex gap-2">
              <Input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t('chat.inputPlaceholder')}
                disabled={sending}
                className="flex-1"
              />
              <Button onClick={sendMessage} disabled={sending || !input.trim()}>
                {sending ? t('chat.sending') : t('chat.send')}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
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
        <div className="whitespace-pre-wrap text-sm">{message.content}</div>
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
          <div className="whitespace-pre-wrap text-sm">{msg.text}</div>
        ) : (
          <div className="text-sm text-muted-foreground">{t('chat.thinking')}</div>
        )}
        {msg.toolCalls.length > 0 && <ToolCallsDisplay toolCalls={msg.toolCalls} />}
        {!msg.done && <span className="inline-block w-2 h-4 bg-foreground/50 animate-pulse ml-1" />}
      </div>
    </div>
  );
}

const MAX_DISPLAY_LEN = 5000;

function truncateDisplay(value: unknown): string {
  const str = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  return str.length > MAX_DISPLAY_LEN ? str.slice(0, MAX_DISPLAY_LEN) + '\n... [truncated]' : str;
}

function ToolCallsDisplay({ toolCalls }: { toolCalls: ToolCallEntry[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const { t } = useI18n();

  const toggle = (tcId: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(tcId) ? next.delete(tcId) : next.add(tcId);
      return next;
    });
  };

  return (
    <div className="mt-2 space-y-1">
      {toolCalls.map(tc => (
        <div key={tc.id} className="border border-border rounded text-xs">
          <button
            className="w-full px-2 py-1 flex items-center gap-2 hover:bg-accent/50 text-left"
            onClick={() => toggle(tc.id)}
          >
            <span className={tc.result !== undefined ? (tc.isError ? 'text-destructive' : 'text-green-600') : 'text-yellow-600'}>
              {tc.result !== undefined ? (tc.isError ? '✗' : '✓') : '⟳'}
            </span>
            <span className="font-mono">{tc.toolName}</span>
            <span className="ml-auto text-muted-foreground">{expanded.has(tc.id) ? '▾' : '▸'}</span>
          </button>
          {expanded.has(tc.id) && (
            <div className="px-2 py-1 border-t border-border bg-muted/50 space-y-1">
              <div>
                <span className="text-muted-foreground">{t('chat.params')}</span>
                <pre className="inline whitespace-pre-wrap">{truncateDisplay(tc.args)}</pre>
              </div>
              {tc.result !== undefined && (
                <div>
                  <span className="text-muted-foreground">{t('chat.result')}</span>
                  <pre className="inline whitespace-pre-wrap">{truncateDisplay(tc.result)}</pre>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
