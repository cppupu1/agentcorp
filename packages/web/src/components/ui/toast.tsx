import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface ToastContextValue {
  toast: (message: string, type?: Toast['type']) => void;
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((message: string, type: Toast['type'] = 'info') => {
    const id = nextId++;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-3 pointer-events-none">
        {toasts.map(t => (
          <div
            key={t.id}
            data-testid={t.type === 'error' ? 'error-toast' : undefined}
            className={cn(
              'pointer-events-auto relative overflow-hidden flex items-center gap-3 rounded-full px-6 py-3.5 text-[14px] font-medium shadow-[var(--shadow-lg)] min-w-[320px] max-w-[480px]',
              t.type === 'success' && 'bg-success text-success-foreground',
              t.type === 'error' && 'bg-destructive text-destructive-foreground',
              t.type === 'info' && 'bg-foreground text-background',
            )}
            style={{ animation: 'slideUp 0.3s cubic-bezier(0.2, 0, 0, 1)' }}
          >
            <span className="flex-1" data-testid="error-toast-message">{t.message}</span>
            <button onClick={() => dismiss(t.id)} className="shrink-0 cursor-pointer p-1 rounded-full hover:bg-white/20 md-transition">
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
