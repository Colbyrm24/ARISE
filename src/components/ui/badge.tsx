import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/*
  Badges are status, and status is something the system reports about
  itself — so they're set in the mono face, uppercase and tracked, like a
  readout tag rather than a label someone wrote.
*/
const badgeVariants = cva(
  'inline-flex items-center rounded-none px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] ring-1 ring-inset',
  {
    variants: {
      variant: {
        default: 'bg-secondary text-muted-foreground ring-border',
        accent: 'bg-accent/[0.08] text-accent ring-accent/30',
        success: 'bg-success/[0.08] text-success ring-success/30',
        destructive: 'bg-destructive/[0.08] text-destructive ring-destructive/35',
        outline: 'border border-border text-muted-foreground ring-0',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
