import Link from 'next/link';
import { cn } from '@/lib/utils';
import { safeImage } from '@/lib/landing';

/*
  Small server-only pieces of the /coaching page. No client JS in here.
*/

/** The small line above a section heading. Plain, one per section. */
export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn('text-xs font-semibold uppercase tracking-[0.2em] text-cta', className)}>{children}</p>
  );
}

/** The one call to action, everywhere it appears. Orange, so it's the first thing the eye finds. */
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
        'btn-cta group inline-flex items-center justify-center gap-2.5 rounded-[999px] font-bold',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        size === 'lg' ? 'h-14 px-9 text-base' : 'h-9 px-4 text-sm',
        className
      )}
    >
      {label}
      {size === 'lg' && (
        <span aria-hidden className="transition-transform duration-150 group-hover:translate-x-1">
          →
        </span>
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
    <div className={cn('relative overflow-hidden rounded-[14px] bg-secondary/50', className)}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- links can be any host; next/image would need each one whitelisted
        <img src={url} alt={alt} loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-end">
          <Silhouette className="w-3/5 text-foreground/[0.07]" />
          <span className="absolute inset-x-0 top-[18%] px-3 text-center text-xs text-muted-foreground">
            {placeholder}
          </span>
        </div>
      )}
    </div>
  );
}
