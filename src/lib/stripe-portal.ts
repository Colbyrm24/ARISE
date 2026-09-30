import { stripe } from '@/lib/stripe';

/*
  The billing portal, with the cancel button taken out.

  Opening a portal session with no `configuration` uses whatever the Stripe
  dashboard's default happens to be — and Stripe's default has "Cancel
  subscriptions" switched on. So the button labelled "Update payment method"
  in ARISE was one page away from a client ending a fixed-term coaching plan
  themselves, on a term they had signed for, with nobody told.

  That is not a thing you want depending on a toggle in a dashboard, because a
  toggle can be flipped back by anybody with access, by a Stripe default
  changing, or by a second Stripe account that was never configured. So the
  configuration is declared here, in code, next to the reason for it.

  What a client CAN do in the portal: update the card, and read their own
  invoices. Both are things you want them able to do without asking — a
  declining card that only the coach can see is how a client gets dropped for
  non-payment while believing they are paid up.

  What they CANNOT do: cancel, pause, switch plan, or change the price. Ending
  coaching is a conversation with the coach, and then the coach cancels it in
  Stripe. This only removes the self-serve path; it cannot stop somebody
  cancelling their card at their bank or disputing a charge, and it is not a
  substitute for the coaching agreement being clear about the term.
*/

/**
 * Marks the configuration as ours, so it can be found again rather than
 * created on every cold start. The version suffix is the upgrade path: change
 * the features below and bump this, and the next request builds a new one
 * instead of silently reusing the old settings forever.
 */
const PORTAL_MARKER = 'arise-portal-v1';

/**
 * Remembered for the life of the serverless instance.
 *
 * Not a correctness device — a cold start just costs one extra list call —
 * but a warm lambda serving a burst of profile visits should not ask Stripe
 * to enumerate configurations each time.
 */
let cachedId: string | null = null;

/**
 * Returns the id of ARISE's locked-down portal configuration, creating it the
 * first time.
 *
 * `siteUrl` supplies the privacy and terms links Stripe shows in the portal
 * footer — and which Stripe requires before a portal configuration can be used
 * in live mode at all. They are passed in rather than read here because
 * getSiteUrl() reads request headers, which only exist inside a request.
 */
export async function arisePortalConfigurationId(siteUrl: string): Promise<string> {
  if (cachedId) return cachedId;

  const existing = await stripe.billingPortal.configurations.list({ limit: 100 });
  const mine = existing.data.find(
    (c) => c.active && c.metadata?.arise_portal === PORTAL_MARKER
  );
  if (mine) {
    cachedId = mine.id;
    return mine.id;
  }

  const created = await stripe.billingPortal.configurations.create({
    business_profile: {
      privacy_policy_url: `${siteUrl}/privacy`,
      terms_of_service_url: `${siteUrl}/terms`,
    },
    features: {
      // The two things this portal exists for.
      payment_method_update: { enabled: true },
      invoice_history: { enabled: true },

      /*
        Deliberately off. Each one is a way for a signed client to end or
        rewrite a term they agreed to, without the coach being part of it.
      */
      subscription_cancel: { enabled: false },
      /*
        The empty list and null products are required by Stripe's type even
        with the feature off — it wants to know what WOULD be allowed. Nothing
        is, which is the point.
      */
      subscription_update: { enabled: false, default_allowed_updates: [], products: null },

      /*
        Their own billing contact details only. Not a way to change anything
        about what they are being charged.
      */
      customer_update: {
        enabled: true,
        allowed_updates: ['email', 'address', 'phone'],
      },
    },
    metadata: { arise_portal: PORTAL_MARKER },
  });

  cachedId = created.id;
  return created.id;
}

/** Test seam — clears the warm-instance cache. */
export function resetPortalConfigurationCache() {
  cachedId = null;
}
