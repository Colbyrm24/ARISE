import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
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

  /*
    Header only. The `?key=` fallback is gone.

    A query string is written into Vercel's request and function logs, into
    browser history, and into any Referer that leaves the page — so the
    secret that fires a message to every client was being copied into three
    places that outlive the request. Vercel Cron sends the Authorization
    header, so nothing legitimate needed the fallback.

    Compared with timingSafeEqual for the same reason the health token is:
    a remote timing oracle across an edge hop is not a practical attack, but
    the correct comparison costs nothing and stops the question being asked.
  */
  const auth = request.headers.get('authorization') ?? '';
  const expected = `Bearer ${secret}`;
  const authorised =
    auth.length === expected.length &&
    timingSafeEqual(Buffer.from(auth), Buffer.from(expected));
  if (!authorised) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const result = await runAutoMessages();
  return NextResponse.json({ ok: true, ...result });
}
