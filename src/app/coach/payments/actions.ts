'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireCoach } from '@/lib/auth';
import type { BillingType, PaymentFrequency, PaymentProviderType } from '@prisma/client';

/**
 * Server Actions behind the Plans + Agreement Templates settings screen.
 * Every mutation re-checks requireCoach() — the page only rendering for
 * coaches is a convenience, not the real access boundary.
 */

export async function createPlan(formData: FormData) {
  await requireCoach();

  const name = (formData.get('name') as string | null)?.trim();
  const price = formData.get('price') as string | null;
  const billingType = formData.get('billingType') as BillingType | null;
  const paymentFrequency = (formData.get('paymentFrequency') as PaymentFrequency | null) || null;
  const numberOfPaymentsRaw = formData.get('numberOfPayments') as string | null;
  const termMonths = formData.get('termMonths') as string | null;
  const defaultProvider = formData.get('defaultProvider') as PaymentProviderType | null;

  if (!name || !price || !billingType || !termMonths || !defaultProvider) return;

  await prisma.plan.create({
    data: {
      name,
      price,
      billingType,
      paymentFrequency: billingType === 'one_time' ? null : paymentFrequency,
      numberOfPayments:
        billingType === 'payment_plan' && numberOfPaymentsRaw ? Number(numberOfPaymentsRaw) : null,
      termMonths: Number(termMonths),
      defaultProvider,
    },
  });

  revalidatePath('/coach/payments');
}

export async function togglePlanActive(formData: FormData) {
  await requireCoach();

  const planId = formData.get('planId') as string | null;
  const active = formData.get('active') === 'true';
  if (!planId) return;

  await prisma.plan.update({ where: { id: planId }, data: { active: !active } });

  revalidatePath('/coach/payments');
}

export async function createAgreementTemplate(formData: FormData) {
  await requireCoach();

  const name = (formData.get('name') as string | null)?.trim();
  const body = (formData.get('body') as string | null)?.trim();
  if (!name || !body) return;

  await prisma.agreementTemplate.create({ data: { name, body } });

  revalidatePath('/coach/payments');
}

export async function updateAgreementTemplate(formData: FormData) {
  await requireCoach();

  const templateId = formData.get('templateId') as string | null;
  const body = (formData.get('body') as string | null)?.trim();
  if (!templateId || !body) return;

  // Bump the version so any agreement already generated from this template
  // keeps referencing the exact wording it was signed under — editing here
  // only affects agreements created after this point.
  await prisma.agreementTemplate.update({
    where: { id: templateId },
    data: { body, version: { increment: 1 } },
  });

  revalidatePath('/coach/payments');
}

export async function setDefaultAgreementTemplate(formData: FormData) {
  await requireCoach();

  const templateId = formData.get('templateId') as string | null;
  if (!templateId) return;

  await prisma.$transaction([
    prisma.agreementTemplate.updateMany({ data: { isDefault: false }, where: { isDefault: true } }),
    prisma.agreementTemplate.update({ where: { id: templateId }, data: { isDefault: true } }),
  ]);

  revalidatePath('/coach/payments');
}
