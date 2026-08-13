import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * The single surface component used across ARISE.
 * Still minimal — one border, no loud shadows — but with a hint of
 * depth: a faint top sheen and a soft ambient shadow so surfaces don't
 * read as completely flat. Pass `interactive` on any Card that sits
 * inside a Link/button so it lifts slightly on hover.
 */
export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, interactive, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'surface-sheen rounded-2xl border border-border bg-card text-card-foreground shadow-[0_1px_0_0_hsl(0_0%_100%/0.03)_inset,0_8px_20px_-12px_rgb(0_0_0/0.5)] transition-all duration-200',
        interactive &&
          'hover:-translate-y-0.5 hover:border-accent/25 hover:shadow-[0_1px_0_0_hsl(0_0%_100%/0.03)_inset,0_16px_30px_-14px_rgb(0_0_0/0.6),0_0_0_1px_hsl(var(--accent)/0.06)]',
        className
      )}
      {...props}
    />
  )
);
Card.displayName = 'Card';

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col gap-1 p-5', className)} {...props} />
  )
);
CardHeader.displayName = 'CardHeader';

const CardTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn('text-sm font-medium text-muted-foreground', className)} {...props} />
  )
);
CardTitle.displayName = 'CardTitle';

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('p-5 pt-0', className)} {...props} />
  )
);
CardContent.displayName = 'CardContent';

export { Card, CardHeader, CardTitle, CardContent };
