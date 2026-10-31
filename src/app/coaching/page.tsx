import Link from 'next/link';
import type { Metadata } from 'next';
import { Play } from 'lucide-react';
import { LANDING, type ClientResult } from '@/lib/landing-content';
import { landingVideo, resultsView } from '@/lib/landing';
import { normalizeSource } from '@/lib/application-fields';
import { LandingVideo } from '@/components/landing/landing-video';
import { ApplyLink, PhotoSlot, Silhouette, SystemLabel } from '@/components/landing/parts';

/*
  The 1-on-1 coaching page — where an Instagram or YouTube bio link lands.

  Public: the middleware only guards /coach/ and the client app's sections.
  Every word and link on it comes from lib/landing-content.ts, and nothing
  here touches the database, so it renders fast and renders anywhere.

  The visual language is the app's own "system window": a notification that
  opened in front of you, stat readouts, a quest log. It's the UI vocabulary
  of leveling-up stories, not anyone's characters or artwork.
*/

export const metadata: Metadata = {
  title: LANDING.pageTitle,
  description: LANDING.pageDescription,
  openGraph: { title: LANDING.pageTitle, description: LANDING.pageDescription },
};

const wrap = 'mx-auto w-full max-w-6xl px-5 sm:px-8';

export default function CoachingPage({ searchParams }: { searchParams?: { ref?: string } }) {
  // ?ref=ig on the bio link rides through to the application, so the coach
  // can see which platform his applicants come from.
  const ref = normalizeSource(searchParams?.ref);
  const applyHref = ref ? `/coaching/apply?ref=${ref}` : '/coaching/apply';
  const video = landingVideo(LANDING.videoUrl);
  const results = resultsView(LANDING);
  const { headline } = LANDING;

  return (
    <div className="relative min-h-screen">
      <div aria-hidden className="viewport-frame" />

      <header className={`${wrap} relative z-10 flex h-16 items-center justify-between`}>
        <span className="display-wide font-black text-sm text-foreground sm:text-base">{LANDING.coachName}</span>
        <ApplyLink href={applyHref} label={LANDING.applyLabel} size="sm" />
      </header>

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden pb-16 pt-6 sm:pb-24 sm:pt-12">
        <div aria-hidden className="landing-grid pointer-events-none absolute inset-0" />
        <div className={`${wrap} relative flex flex-col items-center text-center`}>
          <div className="landing-rise flex items-center gap-2">
            <span className="h-1.5 w-1.5 bg-accent shadow-[0_0_10px_2px_hsl(var(--accent)/0.9)]" aria-hidden />
            <p className="readout text-[11px] uppercase text-accent glow-soft">
              System notice: a new quest is available
              <span aria-hidden className="landing-caret ml-1">_</span>
            </p>
          </div>
          <span aria-hidden className="landing-scan mt-5 block h-px w-full max-w-md bg-[linear-gradient(90deg,transparent,hsl(var(--accent)),hsl(var(--foreground)),hsl(var(--accent)),transparent)] shadow-[0_0_14px_1px_hsl(var(--accent)/0.8)]" />

          <h1
            className="landing-rise landing-headline mt-7 max-w-5xl text-balance text-[1.85rem] uppercase leading-[1.02] sm:text-5xl lg:text-[3.6rem]"
            style={{ ['--d' as string]: '120ms' }}
          >
            {headline.before}
            <span className="text-accent glow-soft">{headline.highlight}</span>
            {headline.after}
          </h1>

          <p
            className="landing-rise mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg"
            style={{ ['--d' as string]: '220ms' }}
          >
            {LANDING.subheadline}
          </p>

          <div className="landing-rise mt-10 w-full max-w-4xl" style={{ ['--d' as string]: '320ms' }}>
            <div className="surface-sheen lit-edge relative border border-border p-1.5 sm:p-2">
              <Corners />
              {video.kind === 'none' ? (
                <VideoPlaceholder />
              ) : (
                <LandingVideo video={video} poster={LANDING.videoPoster} />
              )}
            </div>
          </div>

          <div className="mt-10 flex w-full flex-col items-center gap-3">
            <ApplyLink href={applyHref} label={LANDING.applyLabel} className="w-full sm:w-auto" />
            <p className="readout text-[11px] uppercase text-muted-foreground">{LANDING.applyNote}</p>
          </div>
        </div>
      </section>

      {/* ── Results ──────────────────────────────────────────────────── */}
      {results.mode !== 'hidden' && (
        <section id="results" className="border-t border-border/60 py-16 sm:py-24">
          <div className={wrap}>
            <SystemLabel>Status: leveled up</SystemLabel>
            <h2 className="display-wide font-black mt-3 text-3xl sm:text-5xl">Results</h2>
            {results.mode === 'placeholder' && (
              <p className="mt-3 max-w-xl text-sm text-muted-foreground">
                Example slots. Real client results go here once they&apos;re in.
              </p>
            )}
            <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {results.mode === 'real'
                ? results.items.map((r, i) => <ResultCard key={`${r.name}-${i}`} result={r} />)
                : Array.from({ length: results.slots }, (_, i) => <ResultCard key={i} />)}
            </div>
          </div>
        </section>
      )}

      {/* ── Who it's for ─────────────────────────────────────────────── */}
      <section className="border-t border-border/60 py-16 sm:py-24">
        <div className={wrap}>
          <SystemLabel>Eligibility check</SystemLabel>
          <h2 className="display-wide font-black mt-3 text-3xl sm:text-5xl">Is this you?</h2>
          <div className="mt-10 grid gap-5 md:grid-cols-2">
            <div className="surface-sheen lit-edge relative border border-border p-6 sm:p-8">
              <Corners />
              <p className="readout text-xs uppercase text-success">[ Eligible ]</p>
              <h3 className="mt-2 text-xl font-semibold">This is for you if</h3>
              <ul className="mt-5 flex flex-col gap-4">
                {LANDING.forYou.map((line) => (
                  <li key={line} className="flex gap-3 text-[15px] leading-relaxed">
                    <span aria-hidden className="mt-[7px] h-2.5 w-2.5 shrink-0 border border-success bg-success/20 shadow-[0_0_10px_hsl(var(--success)/0.6)]" />
                    {line}
                  </li>
                ))}
              </ul>
            </div>
            <div className="relative border border-border bg-card/40 p-6 sm:p-8">
              <p className="readout text-xs uppercase text-muted-foreground">[ Not eligible ]</p>
              <h3 className="mt-2 text-xl font-semibold text-foreground/90">This isn&apos;t for you if</h3>
              <ul className="mt-5 flex flex-col gap-4">
                {LANDING.notForYou.map((line) => (
                  <li key={line} className="flex gap-3 text-[15px] leading-relaxed text-muted-foreground">
                    <span aria-hidden className="mt-[7px] h-2.5 w-2.5 shrink-0 border border-muted-foreground/50" />
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────────── */}
      <section className="border-t border-border/60 py-16 sm:py-24">
        <div className={wrap}>
          <SystemLabel>Quest log</SystemLabel>
          <h2 className="display-wide font-black mt-3 text-3xl sm:text-5xl">How coaching works</h2>
          <ol className="relative mt-10 grid gap-0 md:grid-cols-4 md:gap-5">
            {LANDING.steps.map((step, i) => (
              <li key={step.title} className="relative flex gap-5 pb-8 md:flex-col md:gap-4 md:pb-0">
                {/* The rail joining the stages: vertical on a phone, across on desktop. */}
                {i < LANDING.steps.length - 1 && (
                  <span
                    aria-hidden
                    className="absolute left-[19px] top-10 h-[calc(100%-2.5rem)] w-px bg-gradient-to-b from-accent/60 to-border md:left-10 md:top-[19px] md:h-px md:w-[calc(100%-1.25rem)] md:bg-gradient-to-r"
                  />
                )}
                <span className="readout relative z-10 flex h-10 w-10 shrink-0 items-center justify-center border border-accent/60 bg-background text-sm text-accent shadow-[0_0_18px_-2px_hsl(var(--accent)/0.7)] glow-soft">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div className="pt-1.5 md:pt-0">
                  <h3 className="text-lg font-semibold">{step.title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── About ────────────────────────────────────────────────────── */}
      <section className="border-t border-border/60 py-16 sm:py-24">
        <div className={`${wrap} grid items-center gap-10 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-14`}>
          <div className="relative mx-auto w-full max-w-[300px] md:max-w-none">
            <PhotoSlot
              src={LANDING.about.photo}
              alt={LANDING.coachName}
              placeholder="Photo of Colby goes here"
              className="aspect-[4/5] w-full"
            />
            <div className="readout absolute -bottom-3 left-4 border border-accent/50 bg-background px-3 py-1.5 text-[10px] uppercase text-accent shadow-[0_0_20px_-4px_hsl(var(--accent)/0.8)]">
              Coach · {LANDING.coachName}
            </div>
          </div>
          <div>
            <SystemLabel>Your coach</SystemLabel>
            <h2 className="display-wide font-black mt-3 text-3xl sm:text-5xl">{LANDING.about.heading}</h2>
            <div className="mt-6 flex max-w-[60ch] flex-col gap-4 text-base leading-relaxed text-muted-foreground">
              {LANDING.about.paragraphs.map((p) => (
                <p key={p}>{p}</p>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────────── */}
      <section className="border-t border-border/60 py-16 sm:py-24">
        <div className={wrap}>
          <div className="max-w-3xl">
            <SystemLabel>Questions</SystemLabel>
            <h2 className="display-wide font-black mt-3 text-3xl sm:text-5xl">Before you apply</h2>
            <div className="mt-10 border-t border-border">
              {LANDING.faq.map((f) => (
                <details key={f.question} className="landing-faq group border-b border-border">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-left text-base font-semibold transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    {f.question}
                    <span aria-hidden className="relative h-3 w-3 shrink-0">
                      <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-accent" />
                      <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-accent transition-transform duration-200 group-open:scale-y-0" />
                    </span>
                  </summary>
                  <p className="max-w-[62ch] pb-6 text-[15px] leading-relaxed text-muted-foreground">{f.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Final call ───────────────────────────────────────────────── */}
      <section className="border-t border-border/60 py-16 sm:py-24">
        <div className={wrap}>
          <div className="surface-sheen lit-edge relative mx-auto max-w-3xl border border-border px-6 py-12 text-center sm:px-12 sm:py-16">
            <Corners />
            <SystemLabel>Quest available</SystemLabel>
            <h2 className="display-wide font-black mt-4 text-balance text-3xl leading-[1.05] sm:text-5xl">{LANDING.finalHeadline}</h2>
            <p className="mx-auto mt-5 max-w-md text-base leading-relaxed text-muted-foreground">{LANDING.finalBody}</p>
            <ApplyLink href={applyHref} label={LANDING.applyLabel} className="mt-9 w-full sm:w-auto" />
          </div>
        </div>
      </section>

      <footer className="border-t border-border/60 py-10">
        <div className={`${wrap} flex flex-col gap-6`}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="readout text-[10px] uppercase text-muted-foreground">
              © {new Date().getFullYear()} {LANDING.coachName}
            </p>
            <nav className="flex gap-6">
              <Link href="/privacy" className="readout text-[10px] uppercase text-muted-foreground transition-colors hover:text-accent">
                Privacy
              </Link>
              <Link href="/terms" className="readout text-[10px] uppercase text-muted-foreground transition-colors hover:text-accent">
                Terms
              </Link>
              <a href={`mailto:${LANDING.contactEmail}`} className="readout text-[10px] uppercase text-muted-foreground transition-colors hover:text-accent">
                Contact
              </a>
            </nav>
          </div>
          <p className="max-w-3xl text-xs leading-relaxed text-muted-foreground/80">
            Results shown are specific to those clients and are not typical or guaranteed. Individual
            results depend on starting point, consistency, effort, genetics and other factors. Nothing
            on this page is medical advice; check with your doctor before starting a new training or
            nutrition program.
          </p>
        </div>
      </footer>
    </div>
  );
}

/** The 1px corner ticks of a system window, for frames that aren't a SystemWindow. */
function Corners() {
  const base = 'glow-ink pointer-events-none absolute z-10 h-2 w-2 border-accent';
  return (
    <span aria-hidden className="contents">
      <span className={`${base} left-1.5 top-1.5 border-l border-t`} />
      <span className={`${base} right-1.5 top-1.5 border-r border-t`} />
      <span className={`${base} bottom-1.5 left-1.5 border-b border-l`} />
      <span className={`${base} bottom-1.5 right-1.5 border-b border-r`} />
    </span>
  );
}

function VideoPlaceholder() {
  return (
    <div className="relative flex aspect-video w-full flex-col items-center justify-center gap-4 overflow-hidden bg-[radial-gradient(ellipse_at_center,hsl(var(--system)/0.18),transparent_70%)]">
      <div aria-hidden className="landing-grid absolute inset-0 opacity-60" />
      <span className="relative flex h-14 w-14 items-center justify-center border border-accent/60 bg-background/70 shadow-[0_0_30px_-4px_hsl(var(--accent)/0.9)] sm:h-16 sm:w-16">
        <Play size={22} className="glow-ink translate-x-0.5 text-accent" />
      </span>
      <div className="relative px-6">
        <p className="display font-black text-base sm:text-xl">Your video goes here</p>
        <p className="readout mt-2 text-[10px] uppercase text-muted-foreground">
          YouTube, Vimeo or .mp4 · set videoUrl in landing-content.ts
        </p>
      </div>
    </div>
  );
}

/** One transformation. With no result passed, a clearly-labelled example slot. */
function ResultCard({ result }: { result?: ClientResult }) {
  const example = !result;
  return (
    <article className="surface-sheen lit-edge relative border border-border p-3">
      {example && (
        <span className="readout absolute right-3 top-3 z-20 border border-accent/50 bg-background/90 px-2 py-1 text-[10px] uppercase text-accent">
          Example
        </span>
      )}
      <div className="grid grid-cols-2 gap-1.5">
        {(['before', 'after'] as const).map((side) => (
          <div key={side} className="relative">
            {example ? (
              <div className="flex aspect-[3/4] items-end justify-center border border-border bg-secondary/40">
                <Silhouette className={side === 'after' ? 'w-4/5 text-accent/[0.16]' : 'w-3/4 text-foreground/[0.08]'} />
              </div>
            ) : (
              <PhotoSlot
                src={side === 'before' ? result.beforePhoto : result.afterPhoto}
                alt={`${result.name} ${side}`}
                placeholder={`${side} photo`}
                className="aspect-[3/4]"
              />
            )}
            <span className="readout absolute bottom-1.5 left-1.5 bg-background/85 px-1.5 py-0.5 text-[9px] uppercase text-muted-foreground">
              {side}
            </span>
          </div>
        ))}
      </div>
      <div className="px-2 pb-3 pt-5">
        <p className={`display-wide font-black text-2xl leading-none ${example ? 'text-foreground/30' : 'text-accent glow-soft'}`}>
          {example ? 'Result line' : result.result}
        </p>
        <p className={`mt-3 font-semibold ${example ? 'text-foreground/40' : ''}`}>
          {example ? 'First name' : result.name}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {example ? 'Age, job, life situation' : result.about}
        </p>
        {!example && result.timeframe && (
          <p className="readout mt-3 text-[10px] uppercase text-muted-foreground">[{result.timeframe}]</p>
        )}
      </div>
    </article>
  );
}
