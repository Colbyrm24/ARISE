import { cn } from '@/lib/utils';

type ThreadMessage = {
  id: string;
  senderId: string;
  body: string | null;
  createdAt: Date;
};

function dayLabel(d: Date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const that = new Date(d);
  that.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - that.getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * Read-only thread. Grouped by day so a long history stays scannable
 * without turning into a wall of timestamps.
 */
export function MessageThread({
  messages,
  meId,
}: {
  messages: ThreadMessage[];
  meId: string;
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
        const label = dayLabel(m.createdAt);
        const showDay = label !== lastDay;
        lastDay = label;

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
                {m.body ? (
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
