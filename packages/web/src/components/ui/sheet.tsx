import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';

interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  side?: 'right' | 'left';
}

export function Sheet({ open, onOpenChange, children, side = 'right' }: SheetProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onOpenChange]);

  if (!open) return null;

  const slideClass = side === 'right'
    ? 'right-0 animate-slide-in-right'
    : 'left-0 animate-slide-in-left';

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50"
      onClick={(e) => { if (e.target === overlayRef.current) onOpenChange(false); }}
    >
      <div className="fixed inset-0 bg-black/30 backdrop-blur-[2px]" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        className={cn(
          'fixed top-0 bottom-0 z-50 w-full max-w-md flex flex-col bg-background border-l border-border/40 shadow-[var(--shadow-xl)]',
          slideClass,
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function SheetHeader({ className, children, onClose, ...props }: React.HTMLAttributes<HTMLDivElement> & { onClose?: () => void }) {
  return (
    <div className={cn('flex items-center justify-between px-4 py-3 border-b border-border/40 shrink-0', className)} {...props}>
      <div className="flex-1 min-w-0">{children}</div>
      {onClose && (
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

export function SheetContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex-1 overflow-hidden', className)} {...props} />;
}
