import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { systemApi } from '@/api/client';

interface SystemStatusContextType {
  status: 'normal' | 'frozen' | 'loading';
  refresh: () => Promise<void>;
}

const SystemStatusContext = createContext<SystemStatusContextType>({
  status: 'loading',
  refresh: async () => {},
});

export function SystemStatusProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<'normal' | 'frozen' | 'loading'>('loading');

  const refresh = useCallback(async () => {
    try {
      const res = await systemApi.getStatus();
      setStatus(res.data.status as 'normal' | 'frozen');
    } catch {
      setStatus('normal'); // Default to normal on error
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 10000); // Poll every 10s
    return () => clearInterval(interval);
  }, [refresh]);

  return (
    <SystemStatusContext.Provider value={{ status, refresh }}>
      {children}
    </SystemStatusContext.Provider>
  );
}

export function useSystemStatus() {
  return useContext(SystemStatusContext);
}
