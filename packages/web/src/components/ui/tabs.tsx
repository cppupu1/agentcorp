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
    <div className={cn('inline-flex gap-1.5 rounded-full bg-muted/60 p-1.5', className)}>
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
        'px-5 py-2.5 text-[14px] font-medium rounded-full md-transition',
        active ? 'bg-background text-foreground shadow-[var(--shadow-sm)]' : 'text-muted-foreground hover:text-foreground hover:bg-muted/40',
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
