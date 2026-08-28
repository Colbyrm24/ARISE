import { cn } from '@/lib/utils';
import { dayIn, todayIn, zoneOf } from '@/lib/day';
import { VoicePlayer } from '@/components/messages/voice-player';

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

/**
 * Read-only thread. Grouped by day so a long history stays scannable
 * without turning into a wall of timestamps.
 */
export function MessageThread({
  messages,
  meId,
  tz,
  audioUrls,
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
}) {
  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center py-16">
        <p className="text-sm text-muted-foreground">No messages yet — say hey.</p>
      </div>
    );
  }

  let lastDay = '';

  return (
    <div className="flex flex-1 flex-col gap-2 overflow-y-auto pb-4">
      {messages.map((m) => {
        const mine = m.senderId === meId;
        const label = dayLabel(m.createdAt, tz);
        const showDay = label !== lastDay;
        lastDay = label;

        const voice = (m.attachments ?? []).filter((a) => a.type === 'voice');

        return (
          <div key={m.id} className="flex flex-col">
            {showDay && (
              <p className="py-3 text-center text-xs text-muted-foreground">{label}</p>
            )}
            <div className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
              <div
                className={cn(
                  'max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-4 py-2 text-sm',
                  mine
                    ? 'rounded-br-md bg-primary text-primary-foreground'
                    : 'rounded-bl-md bg-secondary text-foreground'
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
            </div>
          </div>
        );
      })}
    </div>
  );
}
