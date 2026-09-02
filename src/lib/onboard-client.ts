import { prisma } from '@/lib/prisma';

/*
  Connecting a new account to a coach.

  Nothing in the app ever created a CoachClientRelationship row. Seven places
  read one; zero wrote one. The effect was that every client who signed up was
  permanently un-coached: the inbox was empty on both sides, "you'll be able to
  message your coach once you're assigned one" never stopped being true, the
  coach was never notified about a check-in or a progress photo, and booking
  found nobody to book with.

  This is a single-coach practice, so the honest fix is to attach every new
  client to the coach account rather than build an assignment UI nobody would
  use. If a second coach is ever added, the pick below becomes a real decision
  and this is the one function that has to change.
*/

/** The practice's coach. Oldest account wins, so it's stable as staff change. */
export async function primaryCoach() {
  return prisma.user.findFirst({
    where: { role: { in: ['coach', 'admin'] } },
    orderBy: { createdAt: 'asc' },
    include: { profile: true },
  });
}

/**
 * Attaches a client to the practice's coach.
 *
 * Idempotent, and safe to call on every sign-in rather than only at signup —
 * which matters because every client who signed up before this existed is
 * currently orphaned, and this is what repairs them without a migration.
 *
 * Never throws: a client who can't be attached should still get into the app.
 */
export async function ensureCoachAssigned(clientId: string) {
  try {
    const coach = await primaryCoach();
    if (!coach || coach.id === clientId) return null;

    await prisma.coachClientRelationship.upsert({
      where: { coachId_clientId: { coachId: coach.id, clientId } },
      create: { coachId: coach.id, clientId, status: 'active' },
      update: { status: 'active' },
    });

    // Client.coachId is the column the console's segments read. Keeping both
    // in step means neither side has to know which one is authoritative.
    await prisma.client.updateMany({
      where: { userId: clientId, coachId: null },
      data: { coachId: coach.id },
    });

    return coach.id;
  } catch {
    return null;
  }
}

/**
 * Attaches a client to a NAMED coach — the one whose invite they used.
 *
 * ensureCoachAssigned picks the practice's primary coach, which is right for
 * somebody who arrived off a bare signup with nothing pointing at anyone. An
 * invite is different: it says exactly whose client this is, and that is the
 * answer to use.
 *
 * This existed nowhere, and the gap was expensive. The join route set
 * Client.coachId directly and never wrote a CoachClientRelationship row —
 * while the repair in requireClient only fires when coachId is NULL, so it
 * could never notice. Everything downstream reads the relationship: the
 * coach's notifications for a payment, a signature and a finished intake all
 * resolved to no coach and were dropped, his inbox 404'd on the client, and
 * the client's own messages screen told them they had no coach yet. A person
 * could pay, sign and be fully active with the coach hearing nothing after
 * the initial signup ping.
 *
 * Never throws: failing to attach must not cost somebody the account they
 * just made.
 */
export async function attachClientToCoach(clientId: string, coachId: string) {
  try {
    if (!coachId || coachId === clientId) return null;

    await prisma.coachClientRelationship.upsert({
      where: { coachId_clientId: { coachId, clientId } },
      create: { coachId, clientId, status: 'active' },
      update: { status: 'active' },
    });

    // Both columns kept in step, same as ensureCoachAssigned, so no reader
    // has to know which one is authoritative.
    await prisma.client.updateMany({
      where: { userId: clientId },
      data: { coachId },
    });

    return coachId;
  } catch {
    return null;
  }
}
