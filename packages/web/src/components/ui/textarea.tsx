import { forwardRef, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'flex min-h-[100px] w-full rounded-2xl border border-transparent bg-muted/80 px-4 py-3 text-[15px] transition-all duration-200 ease-out placeholder:text-muted-foreground/70 hover:bg-muted focus-visible:outline-none focus-visible:bg-background focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50 resize-y',
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = 'Textarea';
