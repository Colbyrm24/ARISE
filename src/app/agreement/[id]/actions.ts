'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { renderAgreementTemplate, formatAgreementDate } from '@/lib/agreement';
import { promoteIfIntakeComplete } from '@/lib/intake';
import { notifyCoach } from '@/lib/notifications';

/**
 * The moment a client actually signs. Only the client who owns the
 * agreement can call this — re-checked here even though the page already
 * gates access, because a Server Action is a public endpoint the moment it
 * exists, regardless of what UI happens to call it.
 */
export async function signAgreement(formData: FormData) {
  const user = await getCurrentUser();
  const agreementId = formData.get('agreementId') as string | null;
  const signedName = (formData.get('signedName') as string | null)?.trim();
  if (!user || !agreementId || !signedName) return;

  const agreement = await prisma.agreement.findUnique({ where: { id: agreementId } });
  if (!agreement || agreement.clientId !== user.id || agreement.status === 'signed') return;

  const now = new Date();
  const finalText = renderAgreementTemplate(agreement.renderedText, {
    signed_date: formatAgreementDate(now),
  });

  const headerList = headers();

  await prisma.$transaction([
    prisma.agreement.update({
      where: { id: agreementId },
      data: { renderedText: finalText, status: 'signed' },
    }),
    prisma.agreementSignature.create({
      data: {
        agreementId,
        signedName,
        signedAt: now,
        ipAddress: headerList.get('x-forwarded-for') ?? undefined,
        userAgent: headerList.get('user-agent') ?? undefined,
      },
    }),
    /*
      updateMany with a status filter, because this used to be an
      unconditional write.

      A client on month six who pays a renewal and signs the second agreement
      was knocked all the way back to `onboarding` — still let into the app,
      but dropped out of every "active clients" view and handed an intake they
      finished half a year ago. Only somebody who has not been let in yet is
      moved forward to onboarding.
    */
    prisma.client.updateMany({
      where: {
        userId: user.id,
        status: { in: ['lead', 'payment_pending', 'paid', 'agreement_pending'] },
      },
      data: { status: 'onboarding' },
    }),
  ]);

  /*
    They may have filled the intake while their payment was still pending —
    /welcome invites exactly that. If so, signing is the last of the two
    things and this is what makes them active; otherwise it does nothing and
    the intake's own save handles it.
  */
  if (await promoteIfIntakeComplete(user.id)) {
    await notifyCoach(user.id, 'check_in', `${signedName} finished their intake and is now active.`);
  }

  await notifyCoach(user.id, 'check_in', `${signedName} signed their agreement.`);

  revalidatePath(`/agreement/${agreementId}`);
  revalidatePath(`/coach/clients/${user.id}`);
  revalidatePath('/today');

  // Straight into the intake rather than back to a page whose only remaining
  // advice was "use your browser's print option". Signing is the moment the
  // product opens up; leaving somebody on a receipt was the end of the funnel.
  redirect('/onboarding?welcome=1');
}
