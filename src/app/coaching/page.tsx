import Link from 'next/link';
import type { Metadata } from 'next';
import { Check, Play, Quote, X } from 'lucide-react';
import { LANDING, type ClientResult, type Testimonial } from '@/lib/landing-content';
import { landingVideo, resultsView, testimonialsView } from '@/lib/landing';
import { normalizeSource } from '@/lib/application-fields';
import { LandingVideo } from '@/components/landing/landing-video';
import { ApplyLink, Eyebrow, PhotoSlot, Silhouette } from '@/components/landing/parts';

/*
  The 1-on-1 coaching page — where an Instagram or YouTube bio link lands.

  Public: the middleware only guards /coach/ and the client app's sections.
  Every word and link on it comes from lib/landing-content.ts, and nothing
  here touches the database, so it renders fast and renders anywhere.

  Clean layout, the app's own blue light and glow, soft cards, and
  one orange for every button that leads to the application. Nothing else on
  the page is orange, so the eye always knows where to go.
*/

export const metadata: Metadata = {
  title: LANDING.pageTitle,
  description: LANDING.pageDescription,
  openGraph: { title: LANDING.pageTitle, description: LANDING.pageDescription },
};

const wrap = 'mx-auto w-full max-w-6xl px-5 sm:px-8';
const section = 'py-20 sm:py-28';
const h2 = 'mt-3 text-balance text-3xl font-extrabold tracking-tight sm:text-[2.75rem] sm:leading-[1.1]';
const card = 'surface-sheen lit-edge relative rounded-[20px] border border-border';

export default function CoachingPage({ searchParams }: { searchParams?: { ref?: string } }) {
  // ?ref=ig on the bio link rides through to the application, so the coach
  // can see which platform his applicants come from.
  const ref = normalizeSource(searchParams?.ref);
  const applyHref = ref ? `/coaching/apply?ref=${ref}` : '/coaching/apply';
  const video = landingVideo(LANDING.videoUrl);
  const results = resultsView(LANDING);
  const stories = testimonialsView(LANDING);
  const { headline } = LANDING;

  return (
    <div className="landing-clean relative min-h-screen pb-24 sm:pb-0">
      <div aria-hidden className="viewport-frame" />
      <header className="sticky top-0 z-30 border-b border-border/40 bg-background/80 backdrop-blur-md">
        <div className={`${wrap} flex h-16 items-center justify-between`}>
          <span className="text-base font-extrabold tracking-tight">{LANDING.coachName}</span>
          <ApplyLink href={applyHref} label={LANDING.applyLabel} size="sm" />
        </div>
      </header>

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden pb-20 pt-14 sm:pb-28 sm:pt-20">
        <div aria-hidden className="landing-grid pointer-events-none absolute inset-0" />
        <div className={`${wrap} relative flex flex-col items-center text-center`}>
          <p className="landing-rise rounded-[999px] border border-accent/40 bg-accent/[0.06] px-4 py-1.5 text-xs font-medium text-accent glow-soft shadow-[0_0_24px_-6px_hsl(var(--accent)/0.6)]">
            Private 1-on-1 coaching for men 28–50
          </p>

          <h1
            className="landing-rise landing-headline mt-7 max-w-4xl text-balance text-[2rem] leading-[1.08] sm:text-5xl lg:text-[3.5rem]"
            style={{ ['--d' as string]: '100ms' }}
          >
            {keepTogether(headline.before)}
            <span className="whitespace-nowrap text-accent glow-soft">{headline.highlight}</span>
            {headline.after}
          </h1>

          <p
            className="landing-rise mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg"
            style={{ ['--d' as string]: '200ms' }}
          >
            {LANDING.subheadline}
          </p>

          <div className="landing-rise mt-12 w-full max-w-4xl" style={{ ['--d' as string]: '300ms' }}>
            <div className="surface-sheen lit-edge relative overflow-hidden rounded-[24px] border border-border p-1.5 shadow-[0_40px_120px_-30px_hsl(var(--system)/0.7)] sm:p-2">
              {video.kind === 'none' ? (
                <VideoPlaceholder />
              ) : (
                <LandingVideo video={video} poster={LANDING.videoPoster} />
              )}
            </div>
          </div>

          <div className="mt-10 flex w-full flex-col items-center gap-3">
            <ApplyLink href={applyHref} label={LANDING.applyLabel} className="w-full sm:w-auto sm:min-w-[260px]" />
            <p className="text-sm text-muted-foreground">{LANDING.applyNote}</p>
          </div>

          {LANDING.proof.length > 0 && (
            <dl className="mt-14 grid w-full max-w-3xl grid-cols-3 gap-4 border-t border-border/40 pt-10">
              {LANDING.proof.map((p) => (
                <div key={p.label} className="flex flex-col items-center gap-1">
                  <dt className="sr-only">{p.label}</dt>
                  <dd className="text-2xl font-extrabold tracking-tight text-accent glow-soft sm:text-3xl">{p.value}</dd>
                  <dd className="text-xs text-muted-foreground sm:text-sm">{p.label}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </section>

      {/* ── Results ──────────────────────────────────────────────────── */}
      {results.mode !== 'hidden' && (
        <section id="results" className={`${section} bg-card/30`}>
          <div className={wrap}>
            <div className="max-w-2xl">
              <Eyebrow>Results</Eyebrow>
              <h2 className={h2}>Men like you, who did it and kept it</h2>
              {results.mode === 'placeholder' && (
                <p className="mt-4 text-sm text-muted-foreground">
                  Example slots. Real client results go here once they&apos;re in.
                </p>
              )}
            </div>
            <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {results.mode === 'real'
                ? results.items.map((r, i) => <ResultCard key={`${r.photo ?? r.name}-${i}`} result={r} />)
                : Array.from({ length: results.slots }, (_, i) => <ResultCard key={i} />)}
            </div>
          </div>
        </section>
      )}

      {/* ── Client stories ───────────────────────────────────────────── */}
      {stories.mode !== 'hidden' && (
        <section className={section}>
          <div className={wrap}>
            <div className="max-w-2xl">
              <Eyebrow>In their words</Eyebrow>
              <h2 className={h2}>Lean, and still living</h2>
            </div>
            <div className="mt-12 grid gap-5 md:grid-cols-3">
              {stories.mode === 'real'
                ? stories.items.map((t, i) => <StoryCard key={`${t.name}-${i}`} story={t} />)
                : Array.from({ length: stories.slots }, (_, i) => <StoryCard key={i} />)}
            </div>
          </div>
        </section>
      )}

      {/* ── Who it's for ─────────────────────────────────────────────── */}
      <section className={`${section} border-t border-border/40`}>
        <div className={wrap}>
          <div className="max-w-2xl">
            <Eyebrow>Who it&apos;s for</Eyebrow>
            <h2 className={h2}>Is this you?</h2>
          </div>
          <div className="mt-12 grid gap-5 md:grid-cols-2">
            <div className={`${card} p-7 sm:p-9`}>
              <h3 className="text-lg font-bold">This is for you if</h3>
              <ul className="mt-6 flex flex-col gap-5">
                {LANDING.forYou.map((line) => (
                  <li key={line} className="flex gap-3.5 text-[15px] leading-relaxed">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-[999px] bg-success/15 text-success shadow-[0_0_12px_hsl(var(--success)/0.5)]">
                      <Check size={14} strokeWidth={3} aria-hidden />
                    </span>
                    {line}
                  </li>
                ))}
              </ul>
            </div>
            <div className="relative rounded-[20px] border border-border bg-card/40 p-7 sm:p-9">
              <h3 className="text-lg font-bold text-foreground/85">This isn&apos;t for you if</h3>
              <ul className="mt-6 flex flex-col gap-5">
                {LANDING.notForYou.map((line) => (
                  <li key={line} className="flex gap-3.5 text-[15px] leading-relaxed text-muted-foreground">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-[999px] bg-foreground/5 text-muted-foreground">
                      <X size={14} strokeWidth={3} aria-hidden />
                    </span>
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────────── */}
      <section className={`${section} bg-card/30`}>
        <div className={wrap}>
          <div className="max-w-2xl">
            <Eyebrow>How it works</Eyebrow>
            <h2 className={h2}>Four steps. Then you never start over again.</h2>
          </div>
          <ol className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {LANDING.steps.map((step, i) => (
              <li key={step.title} className={`${card} p-7`}>
                <span className="flex h-10 w-10 items-center justify-center rounded-[999px] border border-accent/60 bg-background text-sm font-bold text-accent glow-soft shadow-[0_0_18px_-2px_hsl(var(--accent)/0.7)]">
                  {i + 1}
                </span>
                <h3 className="mt-5 text-lg font-bold">{step.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{step.body}</p>
              </li>
            ))}
          </ol>
          <div className="mt-12 flex justify-center">
            <ApplyLink href={applyHref} label={LANDING.applyLabel} className="w-full sm:w-auto sm:min-w-[260px]" />
          </div>
        </div>
      </section>

      {/* ── About ────────────────────────────────────────────────────── */}
      <section className={section}>
        <div className={`${wrap} grid items-center gap-12 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-16`}>
          <PhotoSlot
            src={LANDING.about.photo}
            alt={LANDING.coachName}
            placeholder="Photo of Colby goes here"
            className="mx-auto aspect-[4/5] w-full max-w-[320px] rounded-[24px] md:max-w-none"
          />
          <div>
            <Eyebrow>Your coach</Eyebrow>
            <h2 className={h2}>{LANDING.about.heading}</h2>
            <div className="mt-6 flex max-w-[60ch] flex-col gap-4 text-base leading-relaxed text-muted-foreground sm:text-[17px]">
              {LANDING.about.paragraphs.map((p) => (
                <p key={p}>{p}</p>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────────── */}
      <section className={`${section} border-t border-border/40`}>
        <div className={`${wrap} max-w-3xl`}>
          <Eyebrow>Questions</Eyebrow>
          <h2 className={h2}>Before you apply</h2>
          <div className="mt-10 flex flex-col gap-3">
            {LANDING.faq.map((f) => (
              <details key={f.question} className={`group ${card} px-6`}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-left text-base font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {f.question}
                  <span
                    aria-hidden
                    className="text-xl leading-none text-muted-foreground transition-transform duration-200 group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="max-w-[62ch] pb-6 text-[15px] leading-relaxed text-muted-foreground">{f.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final call ───────────────────────────────────────────────── */}
      <section className="pb-24 sm:pb-32">
        <div className={wrap}>
          <div className="surface-sheen lit-edge relative mx-auto max-w-4xl rounded-[28px] border border-border px-6 py-16 text-center sm:px-14 sm:py-20">
            <h2 className="text-balance text-3xl font-extrabold leading-[1.1] tracking-tight sm:text-5xl">
              {LANDING.finalHeadline}
            </h2>
            <p className="mx-auto mt-5 max-w-md text-base leading-relaxed text-muted-foreground sm:text-lg">
              {LANDING.finalBody}
            </p>
            <ApplyLink href={applyHref} label={LANDING.applyLabel} className="mt-10 w-full sm:w-auto sm:min-w-[260px]" />
          </div>
        </div>
      </section>

      <footer className="border-t border-border/40 py-10">
        <div className={`${wrap} flex flex-col gap-6`}>
          <div className="flex flex-wrap items-center justify-between gap-4 text-sm text-muted-foreground">
            <p>
              © {new Date().getFullYear()} {LANDING.coachName}
            </p>
            <nav className="flex gap-6">
              <Link href="/privacy" className="transition-colors hover:text-foreground">
                Privacy
              </Link>
              <Link href="/terms" className="transition-colors hover:text-foreground">
                Terms
              </Link>
              <a href={`mailto:${LANDING.contactEmail}`} className="transition-colors hover:text-foreground">
                Contact
              </a>
            </nav>
          </div>
          <p className="max-w-3xl text-xs leading-relaxed text-muted-foreground/70">
            Results shown are specific to those clients and are not typical or guaranteed. Individual
            results depend on starting point, consistency, effort, genetics and other factors. Nothing
            on this page is medical advice; check with your doctor before starting a new training or
            nutrition program.
          </p>
        </div>
      </footer>

      {/* On a phone the button is always one thumb away. */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border/40 bg-background/90 p-3 backdrop-blur-md sm:hidden">
        <ApplyLink href={applyHref} label={LANDING.applyLabel} className="w-full" />
      </div>
    </div>
  );
}

/** Keeps a range like "28–50" on one line, so a headline never breaks inside it. */
function keepTogether(text: string) {
  return text.split(/(\d+\s*[–-]\s*\d+)/).map((part, i) =>
    i % 2 ? (
      <span key={i} className="whitespace-nowrap">
        {part}
      </span>
    ) : (
      part
    )
  );
}

function VideoPlaceholder() {
  return (
    <div className="relative flex aspect-video w-full flex-col items-center justify-center gap-4 overflow-hidden rounded-[18px] bg-[radial-gradient(ellipse_at_center,hsl(var(--system)/0.2),transparent_70%)]">
      <div aria-hidden className="landing-grid absolute inset-0 opacity-60" />
      <span className="relative flex h-16 w-16 items-center justify-center rounded-[999px] border border-accent/60 bg-background/70 shadow-[0_0_30px_-4px_hsl(var(--accent)/0.9)]">
        <Play size={24} className="glow-ink translate-x-0.5 text-accent" fill="currentColor" />
      </span>
      <div className="relative px-6">
        <p className="text-lg font-bold sm:text-xl">Video coming soon</p>
        <p className="mt-1 text-sm text-muted-foreground">Apply below in the meantime</p>
      </div>
    </div>
  );
}

/** One transformation. With no result passed, a clearly-labelled example slot. */
function ResultCard({ result }: { result?: ClientResult }) {
  const example = !result;
  return (
    <article className={`${card} relative p-3`}>
      {example && (
        <span className="absolute right-5 top-5 z-20 rounded-[999px] bg-background/85 px-2.5 py-1 text-xs font-medium text-muted-foreground">
          Example
        </span>
      )}
      {result?.photo ? (
        // One side-by-side image, exactly as the client's transformation was saved.
        <div className="relative">
          <PhotoSlot src={result.photo} alt={result.name ? `${result.name} before and after` : 'Client before and after'} placeholder="before and after" className="aspect-square" />
          <span className="absolute bottom-2 left-2 rounded-[999px] bg-background/85 px-2 py-0.5 text-xs font-medium text-foreground">Before</span>
          <span className="absolute bottom-2 right-2 rounded-[999px] bg-accent px-2 py-0.5 text-xs font-bold text-accent-foreground">After</span>
        </div>
      ) : (
      <div className="grid grid-cols-2 gap-2">
        {(['before', 'after'] as const).map((side) => (
          <div key={side} className="relative">
            {example ? (
              <div className="flex aspect-[3/4] items-end justify-center rounded-[14px] bg-secondary/50">
                <Silhouette className={side === 'after' ? 'w-4/5 text-accent/[0.14]' : 'w-3/4 text-foreground/[0.07]'} />
              </div>
            ) : (
              <PhotoSlot
                src={(side === 'before' ? result.beforePhoto : result.afterPhoto) ?? ''}
                alt={`${result.name ?? 'Client'} ${side}`}
                placeholder={`${side} photo`}
                className="aspect-[3/4]"
              />
            )}
            <span className="absolute bottom-2 left-2 rounded-[999px] bg-background/85 px-2 py-0.5 text-xs font-medium capitalize text-muted-foreground">
              {side}
            </span>
          </div>
        ))}
      </div>
      )}
      {(example || result.result || result.name || result.about) && (
      <div className="px-3 pb-4 pt-5">
        <p className={`text-2xl font-extrabold leading-tight tracking-tight ${example ? 'text-foreground/30' : 'text-accent glow-soft'}`}>
          {example ? 'Result line' : result.result}
        </p>
        <p className={`mt-2 font-semibold ${example ? 'text-foreground/40' : ''}`}>{example ? 'First name' : result.name}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">{example ? 'Age, job, life situation' : result.about}</p>
        {!example && result.timeframe && <p className="mt-3 text-xs text-muted-foreground">{result.timeframe}</p>}
      </div>
      )}
    </article>
  );
}

/** A client in their own words. With no story passed, a clearly-labelled example slot. */
function StoryCard({ story }: { story?: Testimonial }) {
  const example = !story;
  const video = story?.videoUrl ? landingVideo(story.videoUrl) : null;
  return (
    <figure className={`${card} flex flex-col p-7`}>
      {video && video.kind !== 'none' ? (
        <div className="-mx-3 -mt-3 mb-6 overflow-hidden rounded-[14px]">
          <LandingVideo video={video} />
        </div>
      ) : (
        <Quote size={22} aria-hidden className="text-accent/70" />
      )}
      <blockquote className={`mt-4 flex-1 text-[17px] leading-relaxed ${example ? 'text-foreground/35' : ''}`}>
        {example ? '“What they said, in their own words.”' : `“${story.quote}”`}
      </blockquote>
      <figcaption className="mt-6 border-t border-border/40 pt-5">
        <p className={`font-semibold ${example ? 'text-foreground/40' : ''}`}>{example ? 'First name' : story.name}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">{example ? 'Age, job, life situation' : story.about}</p>
      </figcaption>
    </figure>
  );
}
