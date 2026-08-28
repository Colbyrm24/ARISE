import { cn } from '@/lib/utils';
import { dayIn, todayIn, zoneOf } from '@/lib/day';
import { VoicePlayer } from '@/components/messages/voice-player';
import { ThreadScroll } from '@/components/messages/thread-scroll';

type ThreadMessage = {
  id: string;
  senderId: string;
  body: string | null;
  createdAt: Date;
  attachments?: { id: string; type: string; storagePath: string }[];
};

/*
  This renders on the server, so "today" has to be named rather than assumed.

  `setHours(0,0,0,0)` here was the server's midnight — UTC on Vercel — so from
  early evening onward every message sent that day was stamped with a date
  instead of "Today", and yesterday's ran a day out. Both people in a thread
  see it in their own zone, which is the point: the label should agree with
  the phone in the reader's hand.
*/
function dayLabel(d: Date, tz: string | null | undefined) {
  const diff = Math.round((todayIn(tz).getTime() - dayIn(d, tz).getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  // zoneOf, not `tz ?? undefined` — an omitted prop would otherwise fall back
  // to New York in the diff above and to the server's zone here.
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: zoneOf({ timezone: tz }),
  });
}

/** 4:07 PM, on the reader's clock for the same reason the day label is. */
function clockLabel(d: Date, tz: string | null | undefined) {
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: zoneOf({ timezone: tz }),
  });
}

/**
 * Read-only thread. Grouped by day so a long history stays scannable
 * without turning into a wall of timestamps.
 */
export function MessageThread({
  messages,
  meId,
  tz,
  audioUrls,
  otherInitials,
}: {
  messages: ThreadMessage[];
  meId: string;
  /** The reader's zone — whoever is looking at the thread, not its subject. */
  tz?: string | null;
  /**
   * storagePath → signed URL, signed in one batch by the page. The bucket is
   * private, so an unsigned path plays nothing; a missing entry falls back to
   * saying so rather than rendering a dead player.
   */
  audioUrls?: Map<string, string>;
  /** Initials for the other person's bubbles, so a run of them has a face. */
  otherInitials?: string;
}) {
  if (messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 py-16 text-center">
        <p className="text-sm">No messages yet.</p>
        <p className="max-w-[26ch] text-sm text-muted-foreground">
          Ask a question, send a photo of a meal, or say how the session went.
        </p>
      </div>
    );
  }

  let lastDay = '';
  let lastSender = '';

  /*
    Two different problems, two different fixes.

    `mt-auto` is for a SHORT thread: laid out from the top, a two-message
    conversation sat under the header with half a screen of nothing between
    it and the composer, which reads as broken rather than as quiet. The auto
    margin eats that space so the messages grow up out of the box you type
    in, the way every messaging app people already use behaves.

    It does nothing once the history is taller than the scrollport — there is
    no free space left to absorb — and then the container simply opens at the
    top. That is what ThreadScroll at the bottom is for.
  */
  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <div className="mt-auto flex flex-col gap-1 pb-4">
        {messages.map((m, idx) => {
          const mine = m.senderId === meId;
          const label = dayLabel(m.createdAt, tz);
          const showDay = label !== lastDay;
          if (showDay) lastSender = '';
          lastDay = label;

          // Only the first bubble of a run carries the avatar and the gap, so
          // three messages in a row read as one turn rather than three.
          const startsRun = lastSender !== m.senderId;
          lastSender = m.senderId;

          /*
            And only the LAST bubble of a run carries the clock.

            Stamping every message undoes the grouping it ships beside: three
            replies inside a minute rendered as 4:07 PM three times, adding
            more height than the shared avatar saved. One time under the end
            of a turn says the same thing.
          */
          const next = messages[idx + 1];
          const endsRun =
            !next ||
            next.senderId !== m.senderId ||
            dayLabel(next.createdAt, tz) !== label;

          const voice = (m.attachments ?? []).filter((a) => a.type === 'voice');

          return (
            <div key={m.id} className="flex flex-col">
              {showDay && (
                <div className="flex items-center gap-3 py-4">
                  <span className="h-px flex-1 bg-border/60" />
                  <span className="readout text-[10px] uppercase tracking-wider text-muted-foreground">
                    {label}
                  </span>
                  <span className="h-px flex-1 bg-border/60" />
                </div>
              )}

              <div
                className={cn(
                  'flex items-end gap-2',
                  startsRun && !showDay && 'mt-3',
                  mine ? 'justify-end' : 'justify-start'
                )}
              >
                {/* A 24px slot on every incoming row, filled only on the first
                    of a run, so the bubbles below stay in one column. */}
                {!mine && (
                  <span
                    aria-hidden
                    className={cn(
                      'readout mb-4 flex h-6 w-6 shrink-0 items-center justify-center border text-[9px] uppercase',
                      startsRun
                        ? 'border-accent/40 bg-accent/10 text-accent'
                        : 'border-transparent text-transparent'
                    )}
                  >
                    {startsRun ? (otherInitials ?? '') : ''}
                  </span>
                )}

                <div className={cn('flex max-w-[80%] flex-col', mine ? 'items-end' : 'items-start')}>
                  {/* .bubble opts out of the app-wide 2px radius; see globals.css. */}
                  <div
                    className={cn(
                      'bubble whitespace-pre-wrap break-words px-4 py-2 text-sm',
                      mine ? 'bubble-mine bg-primary text-primary-foreground' : 'bubble-theirs'
                    )}
                  >
                    {voice.length > 0 ? (
                      <div className="flex flex-col gap-1.5 py-0.5">
                        {voice.map((a) => {
                          const src = audioUrls?.get(a.storagePath);
                          return src ? (
                            <VoicePlayer key={a.id} src={src} />
                          ) : (
                            <span key={a.id} className="opacity-70">
                              Voice message unavailable
                            </span>
                          );
                        })}
                      </div>
                    ) : m.body ? (
                      m.body
                    ) : (
                      /* A message with no body is an attachment. It used to render
                         as an empty bubble — a photo from the coach looked like a
                         glitch. The preview on Today already said "Sent an
                         attachment"; the thread itself did not. */
                      <span className="opacity-70">Sent an attachment</span>
                    )}
                  </div>

                  {/* Under the bubble rather than inside it: the time is the
                      least important thing on the row and should not push the
                      words around. */}
                  {endsRun && (
                    <span className="readout mt-1 px-1 text-[10px] text-muted-foreground tabular-nums">
                      {clockLabel(m.createdAt, tz)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <ThreadScroll count={messages.length} />
      </div>
    </div>
  );
}
