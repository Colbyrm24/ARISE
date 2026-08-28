import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BACKGROUNDS, type BackgroundId } from '@/lib/backgrounds';
import { setBackground } from '@/app/(client)/profile/background-actions';

/*
  Five rooms, same app.

  Each swatch shows the two colours that actually decide how a theme feels —
  the ground it sits on and the light landing on it — rather than a name in a
  dropdown. Picking one is a form post per swatch, so this works with no
  JavaScript and the page comes back already wearing it.
*/
export function BackgroundPicker({ current }: { current: BackgroundId }) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-sm font-medium">Background</p>
        <p className="readout mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
          Changes everywhere, right away
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {BACKGROUNDS.map((bg) => {
          const active = bg.id === current;
          return (
            <form key={bg.id} action={setBackground}>
              <input type="hidden" name="background" value={bg.id} />
              <button
                type="submit"
                aria-label={`Use the ${bg.name} background`}
                aria-pressed={active}
                className={cn(
                  'flex w-[4.75rem] flex-col items-center gap-1.5 border p-2 transition-colors',
                  'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/60',
                  active ? 'border-accent/70' : 'border-border/70 hover:border-accent/40'
                )}
              >
                {/* The swatch is the theme in miniature: its ground, with its
                    accent as the light on it. */}
                <span
                  aria-hidden
                  className="relative flex h-9 w-full items-center justify-center border border-white/10"
                  style={{ background: bg.swatch.ground }}
                >
                  <span
                    className="h-1.5 w-8 rounded-full"
                    style={{
                      background: bg.swatch.accent,
                      boxShadow: `0 0 10px ${bg.swatch.accent}`,
                    }}
                  />
                  {active && (
                    <Check
                      size={14}
                      className="absolute right-1 top-1"
                      style={{ color: bg.swatch.accent }}
                    />
                  )}
                </span>
                <span
                  className={cn(
                    'readout text-[9px] uppercase tracking-wider',
                    active ? 'text-accent' : 'text-muted-foreground'
                  )}
                >
                  {bg.name}
                </span>
              </button>
            </form>
          );
        })}
      </div>
    </div>
  );
}
