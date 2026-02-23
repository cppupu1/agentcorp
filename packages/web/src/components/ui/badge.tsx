import { cn } from '@/lib/utils';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning';
}

const variants: Record<string, string> = {
  default: 'bg-primary/10 text-primary ring-1 ring-primary/20',
  secondary: 'bg-secondary/40 text-secondary-foreground ring-1 ring-border/50',
  destructive: 'bg-destructive/10 text-destructive ring-1 ring-destructive/20',
  outline: 'border border-border/80 text-muted-foreground',
  success: 'bg-success/10 text-success ring-1 ring-success/20',
  warning: 'bg-warning/10 text-warning-foreground ring-1 ring-warning/20',
};

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] uppercase tracking-wider font-semibold',
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
