import type { BillingType, PaymentFrequency, PaymentProviderType } from '@prisma/client';

export const BILLING_TYPE_LABELS: Record<BillingType, string> = {
  one_time: 'One-time payment',
  subscription: 'Ongoing subscription',
  payment_plan: 'Fixed payment plan',
};

export const PAYMENT_FREQUENCY_LABELS: Record<PaymentFrequency, string> = {
  one_time: 'one time',
  weekly: 'weekly',
  biweekly: 'every two weeks',
  monthly: 'monthly',
};

export const PROVIDER_LABELS: Record<PaymentProviderType, string> = {
  stripe: 'Stripe',
  fanbasis: 'FanBasis',
};

/**
 * Plain-English description of how a client will be billed — this is what
 * gets dropped into {{payment_structure}} on a rendered agreement, so it
 * needs to read like a sentence, not a database dump.
 */
export function describePaymentStructure({
  price,
  billingType,
  paymentFrequency,
  numberOfPayments,
}: {
  price: number | string;
  billingType: BillingType;
  paymentFrequency: PaymentFrequency | null;
  numberOfPayments: number | null;
}) {
  const amount = `$${Number(price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  if (billingType === 'one_time') {
    return `${amount}, paid in full`;
  }
  if (billingType === 'payment_plan' && numberOfPayments && paymentFrequency) {
    return `${amount} per payment, ${numberOfPayments} payments ${PAYMENT_FREQUENCY_LABELS[paymentFrequency]}`;
  }
  if (billingType === 'subscription' && paymentFrequency) {
    return `${amount} billed ${PAYMENT_FREQUENCY_LABELS[paymentFrequency]}, ongoing`;
  }
  return amount;
}
