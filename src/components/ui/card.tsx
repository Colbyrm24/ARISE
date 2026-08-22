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
        'surface-sheen rounded-none border border-border bg-card text-card-foreground transition-all duration-200',
        interactive &&
          'hover:border-accent/55 hover:shadow-[inset_0_0_70px_hsl(var(--system)/0.24),0_0_0_1px_hsl(var(--accent)/0.2),0_0_42px_-6px_hsl(var(--accent)/0.45),0_22px_72px_-24px_hsl(var(--system)/0.9)]',
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
    /* Card titles are the system naming a region, so they take the mono
       voice. This one line is what makes every existing card in the app
       read as part of the new language without touching the pages. */
    <h3
      ref={ref}
      className={cn(
        'font-mono text-[11px] font-normal uppercase tracking-[0.2em] text-muted-foreground',
        className
      )}
      {...props}
    />
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
