import { useState, useRef, useEffect, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { evidenceApi, type EvidenceItem } from '@/api/client';
import { Loader2, AlertCircle } from 'lucide-react';
import { useI18n } from '@/i18n';

interface EvidencePopoverProps {
  taskId: string;
  evidenceId: string;
  children: ReactNode;
}

export function EvidencePopover({ taskId, evidenceId, children }: EvidencePopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [item, setItem] = useState<EvidenceItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { t } = useI18n();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(event.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const togglePopover = async () => {
    const nextState = !isOpen;
    setIsOpen(nextState);

    if (nextState && !item && !loading) {
      setLoading(true);
      setError(null);
      try {
        const res = await evidenceApi.getEvidence(taskId);
        const targetItem = res.data.find((e) => e.id === evidenceId || e.id.endsWith(evidenceId));
        if (targetItem) {
          setItem(targetItem);
        } else {
          setError(t('evidence.notFound') || 'Evidence not found');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load evidence');
      } finally {
        setLoading(false);
      }
    }
  };

  let parsedContent: unknown = null;
  if (item) {
    try {
      parsedContent = JSON.parse(item.content);
    } catch {
      parsedContent = item.content;
    }
  }

  return (
    <span className="relative inline-block ml-0.5">
      <button
        ref={triggerRef}
        onClick={togglePopover}
        className={cn(
          "inline-flex items-center justify-center px-1.5 py-0.5 mx-0.5 rounded text-[10px] font-mono font-medium bg-muted/80 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors border border-border/50 align-super cursor-pointer leading-none relative z-10",
          isOpen && "bg-primary/20 border-primary/30 text-primary z-20"
        )}
        title={t('evidence.viewSource') || 'View Source Evidence'}
      >
        {children}
      </button>

      {isOpen && (
        <div
          ref={popoverRef}
          className="absolute z-50 left-1/2 -translate-x-1/2 bottom-[calc(100%+4px)] mb-1 w-72 sm:w-80 p-4 rounded-xl border border-border bg-popover/95 backdrop-blur-xl shadow-lg text-popover-foreground text-sm"
          style={{ animation: 'fadeIn 0.15s ease-out', WebkitFontSmoothing: 'antialiased' }}
        >
          <div className="absolute left-1/2 -bottom-2 -translate-x-1/2 w-4 h-4 bg-popover/95 border-b border-r border-border rotate-45" />
          
          <div className="mb-3 flex items-center justify-between border-b border-border/50 pb-2">
            <span className="font-semibold text-xs tracking-wide uppercase text-muted-foreground">{t('evidence.sourceDetails') || 'Source Details'}</span>
            <button
              onClick={() => setIsOpen(false)}
              className="text-muted-foreground hover:text-foreground transition-colors rounded-full p-1 hover:bg-muted"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
          </div>

          <div className="max-h-60 overflow-y-auto custom-scrollbar relative z-10">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground space-y-2">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-xs">{t('common.loading') || 'Loading...'}</span>
              </div>
            ) : error ? (
              <div className="flex items-center text-destructive py-3 text-xs bg-destructive/10 px-3 rounded-lg border border-destructive/20">
                <AlertCircle className="h-4 w-4 mr-2 shrink-0" />
                <span>{error}</span>
              </div>
            ) : item ? (
              <div className="space-y-4">
                <div>
                  <div className="text-sm font-medium mb-2 leading-tight">{item.title}</div>
                  <div className="text-[11px] bg-muted/40 p-3 rounded-lg border border-border/30 break-all whitespace-pre-wrap font-mono max-h-48 overflow-y-auto custom-scrollbar shadow-inner text-muted-foreground">
                    {typeof parsedContent === 'object' && parsedContent !== null ? JSON.stringify(parsedContent, null, 2) : String(parsedContent)}
                  </div>
                </div>
                <div className="flex justify-between items-center text-[10px] text-muted-foreground pt-1 border-t border-border/30">
                  <span className="capitalize px-1.5 py-0.5 bg-muted/80 rounded border border-border/50 font-medium">{item.type}</span>
                  <span className="font-mono">{new Date(item.createdAt).toLocaleString()}</span>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </span>
  );
}