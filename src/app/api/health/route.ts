import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { clientIdForToken, parseHealthPayload } from '@/lib/health-token';

/*
  POST /api/health

  Where a client's phone posts their steps and bodyweight, so those stop
  arriving as text messages. Authenticated by a bearer token that can do
  exactly this and nothing else — see lib/health-token.ts.

  Shaped for what iOS Shortcuts and Health Auto Export can actually send: a
  flat JSON body, one reading, no nesting.

      POST https://<host>/api/health
      Authorization: Bearer <token>
      { "date": "2026-08-21", "steps": 11240, "weight": 181.4 }

  Both fields are optional; at least one has to parse or the request is a
  no-op and says so.
*/

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function bearer(request: NextRequest) {
  const header = request.headers.get('authorization') ?? '';
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (m) return m[1].trim();
  // Shortcuts makes custom headers fiddly, so a query token is accepted too.
  // It's the same narrow capability either way, and a token nobody can paste
  // is a feature nobody uses.
  return request.nextUrl.searchParams.get('token')?.trim() ?? '';
}

export async function POST(request: NextRequest) {
  const token = bearer(request);
  if (!token) {
    return NextResponse.json({ ok: false, error: 'Missing token.' }, { status: 401 });
  }

  const clientId = await clientIdForToken(token);
  if (!clientId) {
    return NextResponse.json({ ok: false, error: 'Bad token.' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Body must be JSON.' }, { status: 400 });
  }

  const reading = parseHealthPayload(body);
  if (!reading) {
    return NextResponse.json(
      { ok: false, error: 'Nothing usable in that. Send steps and/or weight.' },
      { status: 400 }
    );
  }

  const written: string[] = [];

  if (reading.steps !== undefined) {
    await prisma.stepLog.upsert({
      where: { clientId_date: { clientId, date: reading.date } },
      create: { clientId, date: reading.date, steps: reading.steps, source: 'apple_health' },
      update: { steps: reading.steps, source: 'apple_health' },
    });
    written.push('steps');
  }

  if (reading.weight !== undefined) {
    // One weight per day, same as the client's own logging screen enforces.
    const existing = await prisma.weightLog.findFirst({
      where: { clientId, date: reading.date },
    });
    if (existing) {
      await prisma.weightLog.update({ where: { id: existing.id }, data: { weight: reading.weight } });
    } else {
      await prisma.weightLog.create({
        data: { clientId, date: reading.date, weight: reading.weight },
      });
    }
    written.push('weight');
  }

  // Fire and forget: knowing the token still works is useful to the coach, but
  // not worth failing a write over.
  prisma.healthToken
    .update({ where: { clientId }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  return NextResponse.json({ ok: true, written, date: reading.date.toISOString().slice(0, 10) });
}

/** So somebody pasting the URL into a browser gets a sentence, not a 405. */
export async function GET() {
  return NextResponse.json(
    { ok: false, error: 'POST your steps and weight here with your token.' },
    { status: 405 }
  );
}
