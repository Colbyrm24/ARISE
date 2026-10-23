import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { todayIn } from '@/lib/day';

/*
  One look at an offer page, counted once per browser per day.

  This is the bottom half of the only number that says whether $16.99 is the
  right price: of the people who looked, how many paid. The visitor id is a
  random string the page keeps in the browser — nothing about the person.
*/
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const offerId = typeof body.offerId === 'string' ? body.offerId : '';
  const visitor = typeof body.visitor === 'string' ? body.visitor : '';
  if (!offerId || !/^[a-z0-9-]{8,64}$/i.test(visitor)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  try {
    await prisma.offerVisit.createMany({
      data: [{ offerId, visitor, day: todayIn(null) }],
      skipDuplicates: true,
    });
  } catch {
    // A bad offer id or a database hiccup is not the visitor's problem.
  }
  return NextResponse.json({ ok: true });
}
