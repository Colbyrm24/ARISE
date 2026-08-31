import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { clientIdForToken, parseHealthPayload } from '@/lib/health-token';

/*
  POST /api/health

  Where a client's phone posts their steps and bodyweight, so those stop
  arriving as text messages. Authenticated by a bearer token that can do
  exactly this and nothing else — see lib/health-token.ts.

  It also carries the day's eating, which is how MyFitnessPal data gets here.
  MFP has no self-serve API — that needs a signed partner agreement — but it
  writes meal totals into Apple Health, and Apple Health is already the thing
  posting to this endpoint. So the MyFitnessPal integration is this field.

  Shaped for what iOS Shortcuts and Health Auto Export can actually send: a
  flat JSON body, one reading, no nesting.

      POST https://<host>/api/health
      Authorization: Bearer <token>
      { "date": "2026-08-21", "steps": 11240, "weight": 181.4,
        "calories": 2140, "protein": 186, "carbs": 210, "fat": 62 }

  Every field is optional; at least one has to parse or the request is a
  no-op and says so. Nutrition additionally takes an optional "meal"
  (breakfast | lunch | dinner | snack) for an export that can split by meal —
  without it the numbers are the whole day, which is what MyFitnessPal's
  Apple Health totals actually are.
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

  // The client's own zone decides which day an undated post belongs to. The
  // token already resolved who they are, so this is one cheap lookup.
  const who = await prisma.user.findUnique({
    where: { id: clientId },
    select: { profile: { select: { timezone: true } } },
  });
  const reading = parseHealthPayload(body, who?.profile?.timezone);
  if (!reading) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'Nothing usable in that. Send steps, weight, or a calorie total ' +
          '(calories are required for nutrition — protein, carbs and fat are optional).',
      },
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

  if (reading.nutrition !== undefined) {
    const n = reading.nutrition;

    /*
      One synced row per day per meal, replaced rather than added to.

      An export re-posts the same day all day long as more food is logged, so
      the second post has to overwrite the first. There is no unique index to
      upsert against — nutrition_logs is deliberately many-rows-per-day for
      everything a client types in — so the row is found and updated the same
      way the weight branch above does it.

      The narrow race (two posts landing together, both finding nothing, both
      inserting) leaves a visible duplicate rather than a wrong total, and the
      next post overwrites the older of the two. That is worth accepting to
      avoid a migration; a partial unique index on (client_id, date, meal)
      where source = 'apple_health' would close it if it ever bites.
    */
    const existing = await prisma.nutritionLog.findFirst({
      where: { clientId, date: reading.date, source: 'apple_health', meal: n.meal },
      orderBy: { createdAt: 'asc' },
    });

    const numbers = {
      calories: n.calories,
      protein: n.protein,
      carbs: n.carbs,
      fat: n.fat,
      // Named for where it came from, because the client did not type it and
      // should be able to tell at a glance which rows they own.
      name: 'Apple Health',
      source: 'apple_health',
    };

    if (existing) {
      await prisma.nutritionLog.update({ where: { id: existing.id }, data: numbers });
    } else {
      await prisma.nutritionLog.create({
        data: { clientId, date: reading.date, meal: n.meal, ...numbers },
      });
    }
    written.push('nutrition');
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
