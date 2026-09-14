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

  /*
    stripe-node defaults to an 80-second request timeout and zero network
    retries. Both are wrong here, and wrong in a way that hides itself.

    A serverless function on this plan gets 60 seconds at most, so a Stripe
    call that hangs outlives the function that made it: the process is killed
    before the SDK ever gives up, the surrounding catch never runs, and every
    "if Stripe fails, tell the coach" path in this codebase is unreachable on
    the one failure mode that actually happens. The client sees a dead page,
    the coach is told nothing, and the logs show no error because nothing got
    as far as throwing one.

    8 seconds leaves room to handle the failure inside the budget, and one
    retry covers the single dropped connection most of them are. Same
    reasoning as lib/ai.ts, which fixed this trap for Anthropic.
  */
  timeout: 8000,
  maxNetworkRetries: 1,
});
