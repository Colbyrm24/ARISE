import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/*
  Buttons are set uppercase and tracked out — they read as system commands
  rather than sentences, which is the whole point of the interface voice.
  The primary variant glows rather than casts a shadow: light is the accent
  here, so the button looks lit from within instead of raised off the page.
*/
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-none text-xs font-bold uppercase tracking-[0.14em] transition-all duration-200 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 disabled:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
  {
    variants: {
      variant: {
        primary:
          'bg-accent text-accent-foreground shadow-[0_0_20px_-2px_hsl(var(--accent)/0.85),0_0_52px_2px_hsl(var(--system)/0.55)] hover:bg-accent/90 hover:shadow-[0_0_26px_0px_hsl(var(--accent)/1),0_0_75px_8px_hsl(var(--system)/0.75)] active:bg-accent/80',
        secondary:
          'border border-border bg-secondary text-secondary-foreground hover:border-accent/40 hover:bg-secondary/70',
        outline:
          'border border-border bg-transparent text-foreground hover:border-accent/50 hover:bg-accent/[0.06] hover:text-accent',
        ghost: 'bg-transparent text-muted-foreground hover:bg-accent/[0.06] hover:text-accent',
        destructive:
          'bg-destructive text-destructive-foreground shadow-[0_0_18px_-2px_hsl(var(--destructive)/0.5)] hover:bg-destructive/90',
        link: 'tracking-normal normal-case text-accent underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-9 px-4',
        default: 'h-11 px-6',
        lg: 'h-13 px-8 text-sm',
        icon: 'h-11 w-11',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
