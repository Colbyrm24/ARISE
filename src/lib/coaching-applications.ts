import { prisma } from '@/lib/prisma';
import { notify } from '@/lib/notifications';
import { primaryCoach } from '@/lib/onboard-client';
import { MONTHLY_INCOME, isCallReady, labelFor } from '@/lib/application-fields';
import { isBot, isRecentDuplicate, type ApplicationInput } from '@/lib/application-schema';

/*
  Applications for 1-on-1 coaching, from the server's side.

  Imported only by the API route and the coach console — never by the public
  pages themselves, which have to render without a database.
*/

/**
 * Who gets told about a new application.
 *
 * The person who owns the live Follow My Split offer first: that is a coach
 * who has explicitly put a public page out under their own name, which is the
 * closest thing the data has to "the coach behind the public funnel". With no
 * offer (or before one exists), the practice's primary coach — the earliest
 * coach or admin account, the same fallback every other coach notification
 * uses. Colby is both today; the order only matters if a second coach is ever
 * added, and then the public page should still ring the person it belongs to.
 */
export async function applicationCoachId(): Promise<string | null> {
  try {
    const offer = await prisma.programOffer.findFirst({
      where: { active: true, coach: { role: { in: ['coach', 'admin'] } } },
      orderBy: { createdAt: 'asc' },
      select: { coachId: true },
    });
    if (offer?.coachId) return offer.coachId;
    return (await primaryCoach())?.id ?? null;
  } catch {
    return null;
  }
}

export type SaveResult = { saved: boolean; reason?: 'bot' | 'duplicate' };

/**
 * Writes one application and tells the coach.
 *
 * A bot (honeypot filled) or a resubmission from the same email inside the
 * duplicate window is answered exactly like a success — the bot learns
 * nothing to adapt to, and the person who double-tapped sees the same
 * confirmation either way — but writes nothing and pings no one.
 */
export async function saveApplication(input: ApplicationInput, now = new Date()): Promise<SaveResult> {
  if (isBot(input)) return { saved: false, reason: 'bot' };

  const last = await prisma.coachingApplication.findFirst({
    where: { email: input.email },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });
  if (isRecentDuplicate(last?.createdAt, now)) return { saved: false, reason: 'duplicate' };

  await prisma.coachingApplication.create({
    data: {
      firstName: input.firstName,
      email: input.email,
      phone: input.phone,
      ageRange: input.ageRange,
      goal: input.goal,
      monthlyIncome: input.monthlyIncome,
      investReady: input.investReady,
      source: input.source,
    },
  });

  // A side effect of a saved application, never a reason to fail one.
  const coachId = await applicationCoachId();
  if (coachId) {
    const income = labelFor(MONTHLY_INCOME, input.monthlyIncome);
    const fit = isCallReady(input) ? 'Fit, sent to your calendar' : 'Not booking-ready';
    await notify(
      coachId,
      'application',
      `${input.firstName} applied for coaching. Income: ${income}/mo. Invest: ${input.investReady === 'yes' ? 'yes' : 'not now'}. ${fit}.`
    ).catch(() => null);
  }

  return { saved: true };
}

/** For the console badge: applications nobody has acted on yet. */
export async function countNewApplications() {
  return prisma.coachingApplication.count({ where: { status: 'new' } });
}
