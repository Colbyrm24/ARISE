import { redirect, notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { coachOwnsClient } from '@/lib/coach-guard';
import { getCurrentUser } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { signAgreement } from './actions';

export default async function AgreementPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) {
    redirect(`/login?next=/agreement/${params.id}`);
  }

  const agreement = await prisma.agreement.findUnique({
    where: { id: params.id },
    include: {
      client: { include: { user: { include: { profile: true } } } },
      signature: true,
    },
  });

  if (!agreement) notFound();

  /*
    Both halves have to be bound to this specific agreement.

    The client half already was. The coach half was a bare role test, so any
    coach account could read any client's signed contract by id — legal name,
    price, payment structure, term, and the signature block with the signed
    name and timestamp. The ids are handed out on the client detail page.
  */
  const isOwningClient = user.role === 'client' && user.id === agreement.clientId;
  const isTheirCoach =
    (user.role === 'coach' || user.role === 'admin') &&
    (await coachOwnsClient(user.id, agreement.clientId));
  if (!isOwningClient && !isTheirCoach) notFound();

  const clientName = agreement.client.user.profile?.fullName ?? agreement.client.user.email;
  const isSigned = agreement.status === 'signed';

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Coaching Agreement</h1>
          <p className="text-sm text-muted-foreground">{clientName}</p>
        </div>
        <Badge variant={isSigned ? 'success' : 'accent'}>
          {isSigned ? 'Signed' : 'Awaiting Signature'}
        </Badge>
      </header>

      <Card>
        <CardContent className="pt-6">
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground">
            {agreement.renderedText}
          </pre>
        </CardContent>
      </Card>

      {isSigned && agreement.signature ? (
        <Card>
          <CardContent className="flex flex-col gap-1 pt-6 text-sm text-muted-foreground">
            <p>
              Signed by <span className="text-foreground">{agreement.signature.signedName}</span>
            </p>
            <p>
              {agreement.signature.signedAt.toLocaleDateString('en-US', {
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })}{' '}
              at{' '}
              {agreement.signature.signedAt.toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
              })}
            </p>
            <p className="mt-2 text-xs">
              To save a copy, use your browser&apos;s print option and choose &quot;Save as PDF.&quot;
            </p>
          </CardContent>
        </Card>
      ) : isOwningClient ? (
        <Card>
          <CardHeader>
            <CardTitle>Sign to Continue</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={signAgreement} className="flex flex-col gap-4">
              <input type="hidden" name="agreementId" value={agreement.id} />
              <div className="flex flex-col gap-2">
                <Label htmlFor="signedName">Type your full legal name to sign</Label>
                <Input
                  id="signedName"
                  name="signedName"
                  required
                  placeholder={clientName}
                  className="font-serif text-lg italic"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                By typing your name above and submitting, you agree this constitutes your
                electronic signature on the agreement shown.
              </p>
              <Button type="submit" className="w-full">
                Sign Agreement
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            Waiting on the client to sign.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
