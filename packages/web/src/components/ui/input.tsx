import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'flex h-12 w-full rounded-2xl border border-transparent bg-muted/80 px-4 py-2 text-[15px] transition-all duration-200 ease-out placeholder:text-muted-foreground/70 hover:bg-muted focus-visible:outline-none focus-visible:bg-background focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';
