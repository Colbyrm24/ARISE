import { NextResponse } from 'next/server';
import { runAutoMessages } from '@/lib/auto-message';

export const dynamic = 'force-dynamic';

/*
  The daily run.

  Sends all three automatic messages — the morning check-in, the nudge to
  anyone who has gone quiet, and the rest-day line — with the one-per-client
  rule applied across all of them.

  Scheduled in vercel.json for 13:00 UTC, which is 9am Eastern: early enough
  to set the tone for the day, late enough that it isn't waking anybody up.

  Vercel signs its own cron requests with CRON_SECRET when that variable is
  set. We accept either that or an explicit `?key=` for running it by hand,
  and refuse everything else — this endpoint sends real messages to real
  people and should not be pullable by anyone who finds the URL.

  If CRON_SECRET is unset the route refuses outright rather than running
  open. An unprotected endpoint that messages every client is worse than one
  that hasn't been switched on yet.
*/
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: 'CRON_SECRET is not set, so this endpoint is disabled.' },
      { status: 503 }
    );
  }

  const url = new URL(request.url);
  const auth = request.headers.get('authorization');
  const authorised = auth === `Bearer ${secret}` || url.searchParams.get('key') === secret;
  if (!authorised) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const result = await runAutoMessages();
  return NextResponse.json({ ok: true, ...result });
}
