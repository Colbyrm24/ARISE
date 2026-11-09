import { Footprints } from 'lucide-react';
import { cn } from '@/lib/utils';
import { stepsLabel } from '@/lib/steps';

/**
 * The green steps line on every calendar day. Not draggable and not a
 * session — it is on every day, so it reads as part of the day rather than
 * something scheduled into it.
 */
export function StepsChip({ target, met, className }: { target?: number | null; met?: boolean; className?: string }) {
  return (
    <span
      title={met ? 'Steps hit' : stepsLabel(target)}
      className={cn('chip chip-steps flex items-center gap-1 px-1 py-0.5 text-[9px] leading-tight sm:px-2 sm:py-1 sm:text-xs', className)}
    >
      <Footprints size={11} className="hidden shrink-0 sm:block" />
      <span className="truncate">{met ? 'Steps ✓' : stepsLabel(target)}</span>
    </span>
  );
}
