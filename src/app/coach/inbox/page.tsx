import Link from 'next/link';
import { requireCoach } from '@/lib/auth';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import {
  getWaitingThreads,
  waitLabel,
  waitLevel,
  type WaitLevel,
  type WaitingThread,
} from '@/lib/waiting';

export const dynamic = 'force-dynamic';

/*
  Red is spent almost nowhere else in the product, and this is a fair place to
  spend it: a client who asked something two days ago and has heard nothing is
  the single most expensive thing on this screen. Everything short of that
  stays quiet, because a screen where every row is urgent has no urgent rows.
*/
const WAIT_TONE: Record<WaitLevel, string> = {
  fresh: 'text-muted-foreground',
  today: 'text-foreground',
  stale: 'text-accent',
  cold: 'text-destructive',
};

function Row({ thread, now }: { thread: WaitingThread; now: Date }) {
  const level = waitLevel(thread.waitingSince, now);
  const label = waitLabel(thread.waitingSince ?? thread.lastAt, now);

  return (
    <li>
      <Link
        href={`/coach/inbox/${thread.clientId}`}
        className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-secondary/40"
      >
        <Avatar>
          {thread.avatarUrl && <AvatarImage src={thread.avatarUrl} alt="" />}
          <AvatarFallback>{thread.initials}</AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className={cn('truncate text-sm', thread.waiting && 'font-semibold')}>
              {thread.name}
            </p>
            {/* Unread is the smaller fact, so it gets a dot rather than a
                number: it means he hasn't looked, which is worth knowing and
                is not the same as owing them an answer. */}
            {thread.unread > 0 && (
              <span aria-label="unread" className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
            )}
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {thread.lastBody ?? 'No messages yet'}
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-0.5">
          <span className={cn('readout text-[11px]', WAIT_TONE[thread.waiting ? level : 'fresh'])}>
            {label}
          </span>
          {/* Only worth saying when they've had to follow themselves up. One
              unanswered message is just the normal state of a waiting thread. */}
          {thread.unanswered > 1 && (
            <span className="readout text-[10px] text-muted-foreground">
              {thread.unanswered} msgs
            </span>
          )}
        </div>
      </Link>
    </li>
  );
}

/**
 * Two lists, because they answer two different questions.
 *
 * The top one is work: these people said something and nobody said anything
 * back. The bottom one is reference: the thread is even, and the coach is
 * looking someone up rather than clearing a queue.
 */
export default async function CoachInboxPage() {
  const coach = await requireCoach();
  const threads = await getWaitingThreads(coach.id);
  const now = new Date();

  const waiting = threads.filter((t) => t.waiting);
  const rest = threads.filter((t) => !t.waiting);

  const cold = waiting.filter((t) => waitLevel(t.waitingSince, now) === 'cold').length;

  return (
    <div>
      <h1 className="display text-2xl">Inbox</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {waiting.length === 0
          ? 'Nobody is waiting on a reply.'
          : `${waiting.length} waiting on a reply`}
        {cold > 0 && <span className="text-destructive"> · {cold} over two days</span>}
      </p>

      {/*
        Both sections are labelled, and they have to be. The duration at the
        end of a row means "waiting this long" up here and "last spoke this
        long ago" below, in identical type — without a header over each list
        the same number is quietly two different facts.
      */}
      {waiting.length > 0 && (
        <>
          <p className="readout mt-8 text-[11px] uppercase tracking-wider text-accent">
            Waiting on you
          </p>
          <Card className="mt-2">
            <CardContent className="p-0">
              <ul className="divide-y divide-border">
                {waiting.map((t) => (
                  <Row key={t.clientId} thread={t} now={now} />
                ))}
              </ul>
            </CardContent>
          </Card>
        </>
      )}

      {rest.length > 0 && (
        <>
          <p className="readout mt-8 text-[11px] uppercase tracking-wider text-muted-foreground">
            {waiting.length > 0 ? 'Answered' : 'All clients'}
          </p>
          <Card className="mt-2">
            <CardContent className="p-0">
              <ul className="divide-y divide-border">
                {rest.map((t) => (
                  <Row key={t.clientId} thread={t} now={now} />
                ))}
              </ul>
            </CardContent>
          </Card>
        </>
      )}

      {threads.length === 0 && (
        <Card className="mt-6">
          <CardContent>
            <p className="text-sm text-muted-foreground">No active clients yet.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
