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

  if (sessionId) {
    const agreement = await finalizeStripeSession(sessionId);
    if (agreement) {
      redirect(`/agreement/${agreement.id}`);
    }
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
