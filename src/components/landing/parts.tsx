import Link from 'next/link';
import { cn } from '@/lib/utils';
import { safeImage } from '@/lib/landing';

/*
  Small server-only pieces of the /coaching page. No client JS in here.
*/

/**
 * The system's voice: a bracketed mono line above a section heading. One per
 * section, never more — it's the anime "status window" cue, and stacking
 * them turns a cue into wallpaper.
 */
export function SystemLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn('readout text-[11px] uppercase text-accent glow-soft', className)}>
      <span aria-hidden className="text-accent/60">[</span>
      {children}
      <span aria-hidden className="text-accent/60">]</span>
    </p>
  );
}

/** The one call to action, everywhere it appears. */
export function ApplyLink({
  href,
  label,
  className,
  size = 'lg',
}: {
  href: string;
  label: string;
  className?: string;
  size?: 'lg' | 'sm';
}) {
  return (
    <Link
      href={href}
      className={cn(
        'group relative inline-flex items-center justify-center gap-3 bg-accent font-bold uppercase text-accent-foreground transition-all duration-200',
        'shadow-[0_0_22px_-2px_hsl(var(--accent)/0.9),0_0_60px_4px_hsl(var(--system)/0.55)] hover:shadow-[0_0_30px_0px_hsl(var(--accent)/1),0_0_90px_10px_hsl(var(--system)/0.75)] active:scale-[0.98]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        size === 'lg' ? 'h-14 px-10 text-sm tracking-[0.18em]' : 'h-9 px-4 text-[11px] tracking-[0.16em]',
        className
      )}
    >
      {label}
      {size === 'lg' && (
        <span
          aria-hidden
          className="h-2 w-2 rotate-45 border-r-2 border-t-2 border-accent-foreground transition-transform duration-200 group-hover:translate-x-1"
        />
      )}
    </Link>
  );
}

/**
 * A neutral figure for empty photo slots. Deliberately featureless: it says
 * "a person goes here", not "this is a person".
 */
export function Silhouette({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 150" aria-hidden className={className} fill="currentColor">
      <circle cx="60" cy="42" r="20" />
      <path d="M18 150c0-34 16-62 42-62s42 28 42 62z" />
    </svg>
  );
}

/** A photo, or a labelled placeholder frame when there's no usable link yet. */
export function PhotoSlot({
  src,
  alt,
  placeholder,
  className,
}: {
  src: string;
  alt: string;
  placeholder: string;
  className?: string;
}) {
  const url = safeImage(src);
  return (
    <div className={cn('relative overflow-hidden border border-border bg-secondary/40', className)}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- links can be any host; next/image would need each one whitelisted
        <img src={url} alt={alt} loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-end bg-[linear-gradient(180deg,hsl(var(--system)/0.12),transparent_70%)]">
          <Silhouette className="w-3/5 text-foreground/[0.09]" />
          <span className="readout absolute inset-x-0 top-[18%] px-3 text-center text-[10px] uppercase text-muted-foreground">
            {placeholder}
          </span>
        </div>
      )}
    </div>
  );
}
