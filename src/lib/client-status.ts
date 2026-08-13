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
  'contract_pending',
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
  contract_pending: 'Contract Pending',
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
    case 'contract_pending':
    case 'onboarding':
      return 'accent';
    case 'cancelled':
      return 'destructive';
    case 'paused':
    case 'ending_soon':
      return 'outline';
    case 'paid':
    case 'completed':
    default:
      return 'default';
  }
}
