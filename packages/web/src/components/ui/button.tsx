import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

const variants: Record<string, string> = {
  default: 'bg-primary text-primary-foreground shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] md-transition',
  destructive: 'bg-destructive text-destructive-foreground shadow-[var(--shadow-sm)] md-transition',
  outline: 'border border-border/80 text-foreground hover:bg-muted/50 md-transition',
  secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80 md-transition', /* Tonal Button */
  ghost: 'text-foreground hover:bg-muted/50 md-transition', /* Text Button */
  link: 'text-primary underline-offset-4 hover:underline md-transition',
};

const sizes: Record<string, string> = {
  default: 'h-10 px-6 py-2.5',
  sm: 'h-9 px-4 text-[13px]',
  lg: 'h-12 px-8 text-base',
  icon: 'h-10 w-10',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 cursor-pointer state-layer',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = 'Button';
