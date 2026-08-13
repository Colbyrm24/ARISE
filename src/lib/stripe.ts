import Stripe from 'stripe';

// Server-only. STRIPE_SECRET_KEY is never sent to the browser — every call
// that touches this client runs in a Server Action or Route Handler.
// Set it in Vercel → Settings → Environment Variables, marked "Sensitive".
if (!process.env.STRIPE_SECRET_KEY) {
  // Thrown only when something actually tries to use Stripe, so the rest of
  // the app keeps working before the key is configured.
  console.warn('STRIPE_SECRET_KEY is not set — Stripe checkout links will fail until it is.');
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', {
  apiVersion: '2024-06-20',
  typescript: true,
});
