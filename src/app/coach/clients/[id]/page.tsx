import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Pin, FileText, Dumbbell, Apple } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CopyLinkButton } from '@/components/copy-link-button';
import { ClientProgressCard } from '@/components/progress/client-progress-card';
import { IntakeCard } from '@/components/onboarding/intake-card';
import { cn } from '@/lib/utils';
import { CLIENT_STATUSES, STATUS_LABELS, statusBadgeVariant } from '@/lib/client-status';
import { PROVIDER_LABELS } from '@/lib/plans';
import { updateClientStatus, addCoachNote, toggleCoachNotePin } from './actions';
import { createPaymentLink, markPaymentLinkPaid } from './payment-actions';
import { assignProgram, unassignProgram } from './program-actions';
import { setNutritionTarget } from './nutrition-actions';

const selectClass =
  'flex h-11 w-full rounded-xl border border-input bg-secondary/40 px-4 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

function initials(name: string | null | undefined, email: string) {
  if (name) {
    const parts = name.trim().split(/\s+/);
    const first = parts[0]?.[0] ?? '';
    const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : '';
    return (first + last).toUpperCase();
  }
  return email[0]?.toUpperCase() ?? '?';
}

export default async function ClientDetailPage({ params }: { params: { id: string } }) {
  const client = await prisma.client.findUnique({
    where: { userId: params.id },
    include: {
      user: { include: { profile: true } },
      coachNotes: { orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }] },
      agreements: { orderBy: { createdAt: 'desc' }, take: 1 },
      paymentLinks: { orderBy: { createdAt: 'desc' }, take: 1 },
      clientPrograms: {
        where: { active: true },
        take: 1,
        include: { template: { include: { _count: { select: { workouts: true } } } } },
      },
      workoutLogs: {
        orderBy: { startedAt: 'desc' },
        take: 5,
        include: { workout: true },
      },
      nutritionTargets: { orderBy: { effectiveDate: 'desc' }, take: 1 },
    },
  });

  if (!client) notFound();

  const [plans, templates, programTemplates] = await Promise.all([
    prisma.plan.findMany({ where: { active: true }, orderBy: { createdAt: 'desc' } }),
    prisma.agreementTemplate.findMany({ orderBy: { isDefault: 'desc' } }),
    prisma.workoutTemplate.findMany({ orderBy: { name: 'asc' } }),
  ]);

  const name = client.user.profile?.fullName ?? null;
  const latestAgreement = client.agreements[0] ?? null;
  const latestLink = client.paymentLinks[0] ?? null;
  const activeProgram = client.clientPrograms[0] ?? null;
  const currentTarget = client.nutritionTargets[0] ?? null;

  return (
    <div className="flex flex-col gap-8">
      <Link
        href="/coach/clients"
        className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft size={15} />
        Clients
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Avatar className="h-14 w-14">
            <AvatarFallback className="text-base">{initials(name, client.user.email)}</AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-xl font-semibold">{name ?? client.user.email}</h1>
            <p className="text-sm text-muted-foreground">{client.user.email}</p>
          </div>
        </div>
        <Badge variant={statusBadgeVariant(client.status)}>{STATUS_LABELS[client.status]}</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {CLIENT_STATUSES.map((status) => {
              const isCurrent = status === client.status;
              return (
                <form key={status} action={updateClientStatus}>
                  <input type="hidden" name="clientId" value={client.userId} />
                  <input type="hidden" name="status" value={status} />
                  <button
                    type="submit"
                    disabled={isCurrent}
                    className={cn(
                      'rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-inset transition-all',
                      isCurrent
                        ? 'cursor-default bg-accent text-accent-foreground ring-accent'
                        : 'bg-secondary/50 text-muted-foreground ring-border hover:bg-secondary hover:text-foreground hover:ring-accent/30'
                    )}
                  >
                    {STATUS_LABELS[status]}
                  </button>
                </form>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Coach Notes</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <form action={addCoachNote} className="flex flex-col gap-3">
            <input type="hidden" name="clientId" value={client.userId} />
            <textarea
              name="body"
              required
              rows={3}
              placeholder="Add a note about this client…"
              className="w-full resize-none rounded-xl border border-border bg-secondary/30 p-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <Button type="submit" size="sm" className="self-end">
              Add Note
            </Button>
          </form>

          {client.coachNotes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No notes yet.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {client.coachNotes.map((note) => (
                <li
                  key={note.id}
                  className={cn(
                    'rounded-xl border p-4',
                    note.pinned ? 'border-accent/30 bg-accent/5' : 'border-border bg-secondary/20'
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm leading-relaxed">{note.body}</p>
                    <form action={toggleCoachNotePin}>
                      <input type="hidden" name="noteId" value={note.id} />
                      <input type="hidden" name="clientId" value={client.userId} />
                      <input type="hidden" name="pinned" value={String(note.pinned)} />
                      <button
                        type="submit"
                        title={note.pinned ? 'Unpin note' : 'Pin note'}
                        className={cn(
                          'shrink-0 transition-colors',
                          note.pinned ? 'text-accent' : 'text-muted-foreground hover:text-accent'
                        )}
                      >
                        <Pin size={15} fill={note.pinned ? 'currentColor' : 'none'} />
                      </button>
                    </form>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {note.createdAt.toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payment & Agreement</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {latestAgreement ? (
            <Link
              href={`/agreement/${latestAgreement.id}`}
              className="flex items-center justify-between gap-3 rounded-xl border border-border bg-secondary/20 px-4 py-3 transition-colors hover:bg-secondary/40"
            >
              <div className="flex items-center gap-3">
                <FileText size={18} className="text-accent" />
                <div>
                  <p className="text-sm font-medium">
                    {latestAgreement.status === 'signed' ? 'Signed Agreement' : 'Agreement Awaiting Signature'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    ${Number(latestAgreement.price).toLocaleString('en-US', { minimumFractionDigits: 2 })} ·{' '}
                    {latestAgreement.termMonths} mo
                  </p>
                </div>
              </div>
              <Badge variant={latestAgreement.status === 'signed' ? 'success' : 'accent'}>
                {latestAgreement.status === 'signed' ? 'Signed' : 'Pending'}
              </Badge>
            </Link>
          ) : latestLink && latestLink.status === 'pending' ? (
            <div className="flex flex-col gap-3 rounded-xl border border-border bg-secondary/20 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium">Payment link sent</p>
                <Badge variant="outline">{PROVIDER_LABELS[latestLink.provider]} · pending</Badge>
              </div>
              <div className="flex items-center gap-2">
                <Input readOnly value={latestLink.checkoutUrl} className="flex-1 text-xs" />
                <CopyLinkButton url={latestLink.checkoutUrl} />
              </div>
              {latestLink.provider === 'fanbasis' && (
                <form action={markPaymentLinkPaid}>
                  <input type="hidden" name="paymentLinkId" value={latestLink.id} />
                  <input type="hidden" name="clientId" value={client.userId} />
                  <Button type="submit" size="sm" variant="secondary">
                    Mark as Paid
                  </Button>
                </form>
              )}
            </div>
          ) : plans.length === 0 || templates.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Set up at least one{' '}
              <Link href="/coach/payments" className="text-accent hover:underline">
                coaching plan and agreement template
              </Link>{' '}
              before sending a payment link.
            </p>
          ) : (
            <form action={createPaymentLink} className="flex flex-col gap-3">
              <input type="hidden" name="clientId" value={client.userId} />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <select name="planId" className={selectClass} required defaultValue="">
                  <option value="" disabled>
                    Choose a plan…
                  </option>
                  {plans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name} — ${Number(plan.price).toLocaleString('en-US')}
                    </option>
                  ))}
                </select>
                <select name="agreementTemplateId" className={selectClass} required defaultValue={templates.find((t) => t.isDefault)?.id ?? ''}>
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
                <select name="provider" className={selectClass} required defaultValue="stripe">
                  <option value="stripe">Stripe</option>
                  <option value="fanbasis">FanBasis</option>
                </select>
                <Input name="startDate" type="date" required />
                <Input name="priceOverride" type="number" step="0.01" min="0" placeholder="Override price ($, optional)" />
                <Input name="termMonthsOverride" type="number" min="1" placeholder="Override duration (months, optional)" />
                <Input
                  name="manualCheckoutUrl"
                  placeholder="FanBasis checkout link (FanBasis only)"
                  className="sm:col-span-2"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Stripe links are generated automatically. For FanBasis, paste the checkout link you
                created in FanBasis&apos;s own dashboard — see the note on the Payments settings page
                for why.
              </p>
              <Button type="submit" size="sm" className="w-fit">
                Generate Payment Link
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Training</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {activeProgram ? (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Dumbbell size={16} className="text-accent" />
                    <p className="text-sm font-medium">{activeProgram.template.name}</p>
                  </div>
                  <form action={unassignProgram}>
                    <input type="hidden" name="clientProgramId" value={activeProgram.id} />
                    <input type="hidden" name="clientId" value={client.userId} />
                    <button type="submit" className="text-xs text-muted-foreground hover:text-destructive">
                      Unassign
                    </button>
                  </form>
                </div>
                <p className="text-xs text-muted-foreground">
                  {activeProgram.template._count.workouts} day
                  {activeProgram.template._count.workouts === 1 ? '' : 's'} ·{' '}
                  <Link href={`/coach/programs/${activeProgram.templateId}`} className="text-accent hover:underline">
                    View / edit program
                  </Link>
                </p>
              </div>
            ) : programTemplates.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No programs built yet —{' '}
                <Link href="/coach/programs" className="text-accent hover:underline">
                  create one
                </Link>{' '}
                to assign here.
              </p>
            ) : (
              <form action={assignProgram} className="flex flex-col gap-3">
                <input type="hidden" name="clientId" value={client.userId} />
                <select name="templateId" className={selectClass} required defaultValue="">
                  <option value="" disabled>
                    Assign a program…
                  </option>
                  {programTemplates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <Button type="submit" size="sm" className="w-fit">
                  Assign
                </Button>
              </form>
            )}

            {client.workoutLogs.length > 0 && (
              <div className="flex flex-col gap-2 border-t border-border pt-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Recent Activity
                </p>
                <ul className="flex flex-col gap-1.5">
                  {client.workoutLogs.map((log) => (
                    <li key={log.id} className="flex items-center justify-between text-xs">
                      <span>{log.workout.name}</span>
                      <span className="text-muted-foreground">
                        {log.startedAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        {log.completedAt ? ' · completed' : ' · in progress'}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
<CardHeader>
  <CardTitle>Nutrition</CardTitle>
</CardHeader>
<CardContent className="flex flex-col gap-4">
  {currentTarget && (
    <div className="flex items-center gap-2 rounded-xl border border-border bg-secondary/20 px-4 py-3">
      <Apple size={16} className="text-accent" />
      <div className="text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{currentTarget.calories} cal</span> ·{' '}
        {Number(currentTarget.protein)}g protein · {Number(currentTarget.carbs)}g carbs ·{' '}
        {Number(currentTarget.fat)}g fat
      </div>
    </div>
  )}
  <form action={setNutritionTarget} className="flex flex-col gap-2">
    <input type="hidden" name="clientId" value={client.userId} />
    <div className="grid grid-cols-2 gap-2">
      <Input name="calories" type="number" min="0" placeholder="Calories" required defaultValue={currentTarget?.calories ?? undefined} />
      <Input name="protein" type="number" step="0.1" min="0" placeholder="Protein (g)" required defaultValue={currentTarget ? Number(currentTarget.protein) : undefined} />
      <Input name="carbs" type="number" step="0.1" min="0" placeholder="Carbs (g)" required defaultValue={currentTarget ? Number(currentTarget.carbs) : undefined} />
      <Input name="fat" type="number" step="0.1" min="0" placeholder="Fat (g)" required defaultValue={currentTarget ? Number(currentTarget.fat) : undefined} />
    </div>
    <Button type="submit" size="sm" variant="secondary" className="w-fit">
      {currentTarget ? 'Update Target' : 'Set Target'}
    </Button>
  </form>
</CardContent>
</Card>
        <ClientProgressCard clientId={client.userId} />
        <IntakeCard clientId={client.userId} />
      </div>
    </div>
  );
}
