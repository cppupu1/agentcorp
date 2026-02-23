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
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
        {toasts.map(t => (
          <div
            key={t.id}
            data-testid={t.type === 'error' ? 'error-toast' : undefined}
            className={cn(
              'relative overflow-hidden flex items-center gap-2 rounded-xl px-5 py-4 text-sm shadow-lg min-w-[300px] max-w-[450px]',
              t.type === 'success' && 'bg-success text-success-foreground',
              t.type === 'error' && 'bg-destructive text-white',
              t.type === 'info' && 'bg-foreground text-background',
            )}
            style={{ animation: 'slideInRight 0.3s ease-out' }}
          >
            <span className="flex-1" data-testid="error-toast-message">{t.message}</span>
            <button onClick={() => dismiss(t.id)} className="shrink-0 cursor-pointer">
              <X className="h-4 w-4" />
            </button>
            <div className="absolute bottom-0 left-0 h-0.5 bg-white/30" style={{ animation: 'progressShrink 4s linear forwards' }} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
