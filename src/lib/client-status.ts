import type { ClientStatus } from '@prisma/client';

/**
 * Single source of truth for how client statuses are labeled and colored
 * across the coach console. Add a new status here and every screen that
 * shows status (list, detail, filters) picks it up automatically.
 */
export const CLIENT_STATUSES: ClientStatus[] = [
  'lead',
  'payment_pending',
  'paid',
  'agreement_pending',
  'onboarding',
  'active',
  'paused',
  'ending_soon',
  'completed',
  'cancelled',
];

export const STATUS_LABELS: Record<ClientStatus, string> = {
  lead: 'Lead',
  payment_pending: 'Payment Pending',
  paid: 'Paid',
  agreement_pending: 'Agreement Pending',
  onboarding: 'Onboarding',
  active: 'Active',
  paused: 'Paused',
  ending_soon: 'Ending Soon',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export type StatusBadgeVariant = 'default' | 'accent' | 'success' | 'destructive' | 'outline';

export function statusBadgeVariant(status: ClientStatus): StatusBadgeVariant {
  switch (status) {
    case 'active':
      return 'success';
    case 'lead':
    case 'payment_pending':
    case 'agreement_pending':
    case 'onboarding':
      return 'accent';
    case 'cancelled':
      return 'destructive';
    case 'paused':
    case 'ending_soon':
      return 'outline';
    case 'paid':
      // Was sharing the neutral badge with 'completed', so a client who had
      // just paid looked identical to one whose engagement had ended.
      return 'success';
    case 'completed':
    default:
      return 'default';
  }
}

/**
 * What the client is waiting on, in their own words.
 *
 * Every status before `onboarding` means somebody who has signed up but
 * cannot use the product yet, and until now they were shown a blank screen
 * or bounced to a login page with no explanation of why. This is what the
 * holding screen says instead.
 */
export const STATUS_WAITING: Partial<Record<ClientStatus, { title: string; body: string }>> = {
  lead: {
    title: "You're on the list",
    body: 'Your coach has been told you signed up and will be in touch with your plan and a payment link. Filling in your intake now means your first week is ready the moment you start.',
  },
  payment_pending: {
    title: 'Payment link sent',
    body: 'Your coach has sent you a payment link. Everything opens up the moment it goes through — message them below if it never arrived.',
  },
  paid: {
    title: 'Payment received',
    body: 'Your coaching agreement is on its way. Once you have signed it, the app opens up.',
  },
  agreement_pending: {
    // No promise of an email. There is no email in this product, and telling
    // somebody who has already paid to go and check one is how they end up
    // stranded with their money spent. The agreement is linked on /welcome.
    title: 'One signature to go',
    body: 'Your payment went through. Read and sign your agreement below and the app opens up.',
  },
  cancelled: {
    title: 'Coaching ended',
    body: 'Your coaching has been cancelled. Message your coach if that is not right.',
  },
};
