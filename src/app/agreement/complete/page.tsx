import { redirect } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { finalizeStripeSession } from '@/lib/payment-finalize';

/**
 * Where Stripe Checkout redirects right after a successful payment. The
 * webhook usually beats the browser here, but this calls the same
 * idempotent finalize logic as a fallback in case it hasn't yet (or the
 * webhook endpoint isn't configured in Stripe's dashboard) — either way,
 * the client lands straight on their agreement with no visible gap.
 */
export default async function AgreementCompletePage({
  searchParams,
}: {
  searchParams: { session_id?: string };
}) {
  const sessionId = searchParams.session_id;
  let agreementId: string | null = null;

  if (sessionId) {
    /*
      This is the screen a client sees in the seconds after paying, so it is
      the worst possible place to throw. A transient Stripe timeout, or this
      racing the webhook and both trying to write the same payment row, used
      to crash the page — leaving somebody who had just handed over money
      looking at an error.

      Failing quietly is right here because nothing is lost by it: the
      webhook does the same work, finalize is idempotent, and the fallback
      copy below already says to refresh. The client's money and agreement
      are safe either way.

      The catch has to wrap only this call. `redirect()` works by throwing,
      so redirecting inside the try would be swallowed as a failure.
    */
    try {
      const agreement = await finalizeStripeSession(sessionId);
      agreementId = agreement?.id ?? null;
    } catch (err) {
      console.error('Could not finalize checkout on the success page', {
        sessionId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (agreementId) {
    redirect(`/agreement/${agreementId}`);
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="max-w-sm">
        <CardContent className="flex flex-col items-center gap-3 pt-6 text-center">
          <p className="text-sm font-medium">Finalizing your payment…</p>
          <p className="text-sm text-muted-foreground">
            This usually takes a few seconds. Refresh this page if it doesn&apos;t move on
            automatically.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
