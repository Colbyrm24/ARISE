'use server';

import { randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireCoach } from '@/lib/auth';
import { parsePrice, parseCount } from '@/lib/billing';

/*
  Starting a funnel from the coach's side.

  Until now the first step belonged to the client: they had to find /signup
  on their own before a payment link could exist, so the coach could not
  begin anything. He'd tell somebody to go and sign up, wait, then go and
  make a link, then send that too — two asks and a wait, at the exact moment
  a person is most likely to drift off.

  Now it's one link. He writes the terms once here, texts the link, and the
  account, the payment and the agreement all run off it without him again.
*/

/** Unguessable, short enough to paste into a text message. */
function inviteToken() {
  return randomBytes(12).toString('base64url');
}

export async function createClientInvite(formData: FormData) {
  const coach = await requireCoach();

  const planId = formData.get('planId') as string | null;
  const agreementTemplateId = formData.get('agreementTemplateId') as string | null;
  const startDateRaw = formData.get('startDate') as string | null;
  const name = ((formData.get('name') as string | null) ?? '').trim();

  /*
    An invite for somebody who is already paying him.

    He is moving a book of clients off Trainerize, and those people have live
    payment plans running elsewhere. Sending them through the checkout would
    either charge them twice or, when they refused, leave them stuck at
    payment_pending looking at an app they cannot open. This flag makes the
    account and the coach attachment and nothing financial.
  */
  const skipPayment = formData.get('skipPayment') === 'on';

  if (!planId || !startDateRaw) return;
  // Only the paying route needs something to sign.
  if (!skipPayment && !agreementTemplateId) return;

  const startDate = new Date(startDateRaw);
  if (Number.isNaN(startDate.getTime())) return;

  // The plan and template have to be real before a link goes out — an invite
  // pointing at a deleted plan would take somebody all the way to a broken
  // checkout.
  const [plan, template] = await Promise.all([
    prisma.plan.findUnique({ where: { id: planId } }),
    agreementTemplateId
      ? prisma.agreementTemplate.findUnique({ where: { id: agreementTemplateId } })
      : Promise.resolve(null),
  ]);
  if (!plan) return;
  if (!skipPayment && !template) return;

  await prisma.clientInvite.create({
    data: {
      token: inviteToken(),
      coachId: coach.id,
      planId,
      // Dropped entirely on a skip-payment invite: there is no checkout to
      // attach an agreement to, and storing one would imply a document the
      // client is never shown.
      agreementTemplateId: skipPayment ? null : agreementTemplateId,
      skipPayment,
      name: name || null,
      // Same three levers as a payment link, because these are the ones that
      // actually differ per person — the price he agreed, how many payments,
      // and how long the term runs.
      priceOverride: parsePrice(formData.get('priceOverride') as string | null),
      numberOfPaymentsOverride: parseCount(
        formData.get('numberOfPaymentsOverride') as string | null
      ),
      termMonthsOverride: parseCount(formData.get('termMonthsOverride') as string | null),
      startDate,
    },
  });

  revalidatePath('/coach/clients');
}

/**
 * Withdraw an invite that hasn't been used.
 *
 * Soft-deleted rather than removed: an invite is the record of terms he
 * offered somebody, and that is worth keeping even when the deal doesn't
 * happen. A used invite is left alone — deleting it would orphan the story
 * of how a real client arrived.
 */
export async function revokeClientInvite(formData: FormData) {
  const coach = await requireCoach();
  const id = formData.get('inviteId') as string | null;
  if (!id) return;

  const invite = await prisma.clientInvite.findFirst({
    where: { id, coachId: coach.id, usedAt: null, deletedAt: null },
  });
  if (!invite) return;

  await prisma.clientInvite.update({ where: { id }, data: { deletedAt: new Date() } });
  revalidatePath('/coach/clients');
}
