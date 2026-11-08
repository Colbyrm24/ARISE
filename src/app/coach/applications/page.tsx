import Link from 'next/link';
import { Mail, Phone, Instagram } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { requireCoach } from '@/lib/auth';
import { SystemWindow, SystemWindowContent } from '@/components/ui/system-window';
import { LocalTime } from '@/components/local-time';
import { ApplicationStatus } from '@/components/coach/application-status';
import {
  AGE_RANGES,
  APPLICATION_STATUSES,
  EXPERIENCE,
  INVEST_READY,
  MONTHLY_INCOME,
  START_WHEN,
  isCallReady,
  formatPhone,
  isApplicationStatus,
  labelFor,
} from '@/lib/application-fields';
import { cn } from '@/lib/utils';

/*
  Everyone who applied from /coaching, newest first.

  Laid out for the moment he reads one: who they are and how to reach them
  across the top, the two free-text answers in full (that's where the fit
  is), and the three qualifying answers as readouts. The status is the only
  thing he edits here; the conversation itself happens in his DMs and texts.
*/

export const dynamic = 'force-dynamic';

export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams?: { status?: string };
}) {
  await requireCoach();
  const filter = isApplicationStatus(searchParams?.status) ? searchParams!.status! : null;

  const [applications, ...counts] = await Promise.all([
    prisma.coachingApplication
      .findMany({
        where: filter ? { status: filter } : {},
        orderBy: { createdAt: 'desc' },
        take: 200,
      })
      .catch(() => null),
    ...APPLICATION_STATUSES.map((s) =>
      prisma.coachingApplication.count({ where: { status: s.value } }).catch(() => 0)
    ),
  ]);
  const countBy = new Map(APPLICATION_STATUSES.map((s, i) => [s.value, counts[i] ?? 0]));
  const total = counts.reduce((a, b) => a + b, 0);

  const tab = (href: string, label: string, n: number, active: boolean) => (
    <Link
      key={href}
      href={href}
      className={cn(
        'readout flex items-center gap-2 border px-3 py-2 text-xs uppercase transition-colors',
        active
          ? 'border-accent/50 bg-accent/10 text-foreground'
          : 'border-border text-muted-foreground hover:border-accent/40 hover:text-foreground'
      )}
    >
      {label}
      <span className={active ? 'text-accent' : ''}>{n}</span>
    </Link>
  );

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold">Applications</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          From your coaching page at{' '}
          <Link href="/coaching" className="text-accent hover:underline">
            /coaching
          </Link>
          . Add <span className="readout text-xs">?ref=ig</span> or{' '}
          <span className="readout text-xs">?ref=yt</span> to the link in each bio to see where people
          come from.
        </p>
      </header>

      <nav className="flex flex-wrap gap-2">
        {tab('/coach/applications', 'All', total, !filter)}
        {APPLICATION_STATUSES.map((s) =>
          tab(`/coach/applications?status=${s.value}`, s.label, countBy.get(s.value) ?? 0, filter === s.value)
        )}
      </nav>

      {applications === null ? (
        <SystemWindow alert title="Applications unavailable">
          <SystemWindowContent className="pt-4 text-sm text-muted-foreground">
            The applications table couldn&apos;t be read. If this is new, run
            prisma/coaching-application-migration.sql in the Supabase SQL editor.
          </SystemWindowContent>
        </SystemWindow>
      ) : applications.length === 0 ? (
        <SystemWindow title={filter ? 'None here' : 'No applications yet'}>
          <SystemWindowContent className="pt-4 text-sm text-muted-foreground">
            {filter
              ? 'Nothing in this status right now.'
              : 'When someone applies from your coaching page, they show up here and you get a notification.'}
          </SystemWindowContent>
        </SystemWindow>
      ) : (
        <ul className="flex flex-col gap-5">
          {applications.map((a) => (
            <li key={a.id}>
              <SystemWindow plain className={a.status === 'new' ? 'border-accent/50' : undefined}>
                <SystemWindowContent className="flex flex-col gap-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-3">
                        <h2 className="text-xl font-semibold">{a.firstName}</h2>
                        {a.status === 'new' && (
                          <span className="readout border border-accent/50 bg-accent/10 px-1.5 py-0.5 text-xs uppercase text-accent">
                            New
                          </span>
                        )}
                      </div>
                      <p className="readout mt-1 text-xs uppercase text-muted-foreground">
                        {labelFor(AGE_RANGES, a.ageRange)} · <LocalTime iso={a.createdAt.toISOString()} withZone={false} />
                        {a.source ? ` · via ${a.source}` : ''}
                      </p>
                    </div>
                    <ApplicationStatus id={a.id} status={a.status} />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Contact href={`mailto:${a.email}`} icon={<Mail size={14} />} label={a.email} />
                    {a.phone && (
                      <>
                        <Contact href={`sms:${a.phone}`} icon={<Phone size={14} />} label={`Text ${formatPhone(a.phone)}`} />
                        <Contact href={`tel:${a.phone}`} icon={<Phone size={14} />} label="Call" />
                      </>
                    )}
                    {a.instagram && (
                      <Contact
                        href={`https://instagram.com/${a.instagram}`}
                        icon={<Instagram size={14} />}
                        label={`@${a.instagram}`}
                        external
                      />
                    )}
                  </div>

                  <div className="grid gap-5 md:grid-cols-2">
                    <Answer label="Wants in the next few months" text={a.goal} />
                    {a.obstacle && <Answer label="Biggest obstacle" text={a.obstacle} />}
                  </div>

                  <dl className="grid gap-3 border-t border-border pt-4 sm:grid-cols-3">
                    {a.experience && <Readout label="Training" value={labelFor(EXPERIENCE, a.experience)} />}
                    {a.monthlyIncome ? (
                      <Readout
                        label="Monthly income"
                        value={labelFor(MONTHLY_INCOME, a.monthlyIncome)}
                        strong={isCallReady(a)}
                      />
                    ) : (
                      <Readout label="Start" value={labelFor(START_WHEN, a.startWhen)} />
                    )}
                    <Readout
                      label="Ready to invest"
                      value={labelFor(INVEST_READY, a.investReady)}
                      strong={a.investReady === 'yes'}
                    />
                  </dl>
                </SystemWindowContent>
              </SystemWindow>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Contact({
  href,
  icon,
  label,
  external,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  external?: boolean;
}) {
  return (
    <a
      href={href}
      {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
      className="flex min-w-0 max-w-full items-center gap-2 border border-border bg-secondary/40 px-3 py-2 text-sm text-foreground transition-colors hover:border-accent/50 hover:text-accent"
    >
      <span className="shrink-0 text-accent">{icon}</span>
      <span className="truncate">{label}</span>
    </a>
  );
}

function Answer({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <p className="readout text-xs uppercase text-muted-foreground">{label}</p>
      <p className="mt-1.5 whitespace-pre-line text-[15px] leading-relaxed">{text}</p>
    </div>
  );
}

function Readout({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <dt className="readout text-xs uppercase text-muted-foreground">{label}</dt>
      <dd className={cn('mt-1 text-sm', strong ? 'text-success' : 'text-foreground')}>{value}</dd>
    </div>
  );
}
