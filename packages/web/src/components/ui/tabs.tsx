import { createContext, useContext, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface TabsContextValue {
  value: string;
  onChange: (v: string) => void;
}

const TabsContext = createContext<TabsContextValue>({ value: '', onChange: () => {} });

export function Tabs({ value, onChange, children, className }: {
  value: string;
  onChange: (v: string) => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <TabsContext.Provider value={{ value, onChange }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

export function TabsList({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('inline-flex gap-1 rounded-xl bg-muted/50 p-1', className)}>
      {children}
    </div>
  );
}

export function TabsTrigger({ value, children, className }: {
  value: string;
  children: ReactNode;
  className?: string;
}) {
  const ctx = useContext(TabsContext);
  const active = ctx.value === value;
  return (
    <button
      className={cn(
        'px-4 py-2 text-sm font-medium rounded-xl transition-colors',
        active ? 'bg-card text-foreground shadow-[var(--shadow-sm)]' : 'text-muted-foreground hover:text-foreground',
        className,
      )}
      onClick={() => ctx.onChange(value)}
    >
      {children}
    </button>
  );
}

export function TabsContent({ value, children }: { value: string; children: ReactNode }) {
  const ctx = useContext(TabsContext);
  if (ctx.value !== value) return null;
  return <>{children}</>;
}
