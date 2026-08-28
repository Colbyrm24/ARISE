'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { Mic, Square, Trash2, Send, Loader2 } from 'lucide-react';
import type { VoiceNoteResult } from '@/lib/voice-notes';

/*
  Tap to record, tap to stop, then send or bin it.

  Not press-and-hold. Hold-to-talk is what the native apps do, but on a web
  page a pointer that leaves the button — a scroll, a notification, a thumb
  sliding a few pixels — fires pointercancel and silently kills the take.
  Losing a recording you already spoke is much worse than one extra tap, and
  this gets used mid-set with one hand.

  The review step is deliberate too. A voice note cannot be unsent and cannot
  be skimmed by the person who gets it, so hearing it back before it goes is
  worth the extra beat.
*/

/*
  mp4 first, deliberately.

  Safari cannot decode WebM. Chrome records WebM/Opus by default. Left in the
  obvious order that means an Android client's note is silent on the coach's
  iPhone — half of every mixed-device thread, failing with no visible reason.
  Asking for mp4 first gets AAC out of Safari and out of any Chrome that
  supports it, and mp4 plays everywhere. WebM stays as the fallback for the
  browsers that can only do that, and the player offers a download when a
  container will not decode.
*/
const MIME_CANDIDATES = [
  'audio/mp4',
  'audio/mp4;codecs=mp4a.40.2',
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
];

/** True only where a recording can actually be made. */
function canRecord(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof MediaRecorder !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia)
  );
}

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  for (const type of MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  // Undefined lets the browser choose; the server reads the blob's own type.
  return undefined;
}

/*
  Three minutes, stopped by the recorder itself.

  Not a style choice: a server action on Vercel rejects a body over about
  4.5MB before any application code runs, so a longer take is not a long
  message, it is a lost one. Stopping at the cap keeps what was said instead
  of discovering the limit after the fact.
*/
const MAX_SECONDS = 180;

function clock(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function VoiceRecorder({
  action,
  hidden,
}: {
  /** Server action taking `audio` plus whatever `hidden` carries. */
  action: (formData: FormData) => Promise<VoiceNoteResult>;
  hidden?: Record<string, string>;
}) {
  const [supported, setSupported] = useState(false);
  const [state, setState] = useState<'idle' | 'recording' | 'review' | 'denied'>('idle');
  const [seconds, setSeconds] = useState(0);
  const [clip, setClip] = useState<{ blob: Blob; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  // Cleanup on unmount reads these, not state — an effect with an empty
  // dependency list closes over the state as it was at mount, which is to say
  // over no clip and no recorder, and therefore cleans up nothing.
  const clipUrlRef = useRef<string | null>(null);

  /*
    Feature detection runs after mount rather than during render: the server
    has no MediaRecorder, so deciding this during render would produce markup
    the client immediately contradicts.
  */
  useEffect(() => setSupported(canRecord()), []);

  /*
    The microphone stays on for exactly as long as it is recording. Leaving
    the track live keeps the browser's recording indicator lit, which reads
    as the app listening to you when it is not.
  */
  const releaseMic = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      // Stop the recorder before the stream, or it is left in `recording`
      // state on tracks that no longer exist.
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        recorderRef.current.stop();
      }
      recorderRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (clipUrlRef.current) URL.revokeObjectURL(clipUrlRef.current);
    };
  }, []);

  const stop = useCallback(() => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    recorderRef.current = null;
  }, []);

  // The clock, and the hard stop that keeps a take inside what can be posted.
  useEffect(() => {
    if (state !== 'recording') return;
    const id = setInterval(() => {
      setSeconds((s) => {
        const next = s + 1;
        if (next >= MAX_SECONDS) stop();
        return next;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [state, stop]);

  async function start() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        // recorder.mimeType, not the candidate — the browser may have
        // substituted its own, and the extension is derived from this.
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        releaseMic();
        if (blob.size === 0) {
          setError('That came through empty.');
          setState('idle');
          return;
        }
        const url = URL.createObjectURL(blob);
        clipUrlRef.current = url;
        setClip({ blob, url });
        setState('review');
      };

      recorder.start();
      recorderRef.current = recorder;
      setSeconds(0);
      setState('recording');
    } catch {
      // Denied, or no microphone. Either way there is nothing to retry into.
      releaseMic();
      setState('denied');
    }
  }

  function discard() {
    if (clipUrlRef.current) URL.revokeObjectURL(clipUrlRef.current);
    clipUrlRef.current = null;
    setClip(null);
    setSeconds(0);
    setError(null);
    setState('idle');
  }

  /*
    A failed send keeps the recording.

    Discarding unconditionally is how a take gets destroyed by a dropped
    connection while the app says nothing — the sender has already spoken and
    would never know it did not arrive. The clip stays in review with the
    reason shown, so Send can simply be pressed again.
  */
  function send() {
    if (!clip) return;
    const fd = new FormData();
    for (const [k, v] of Object.entries(hidden ?? {})) fd.append(k, v);
    fd.append('audio', clip.blob, 'voice-note');

    setError(null);
    startTransition(async () => {
      try {
        const result = await action(fd);
        if (result?.error) {
          setError(result.error);
          return;
        }
        discard();
      } catch {
        // A rejected POST — offline, or a body the platform refused.
        setError('That did not send. Check your signal and try again.');
      }
    });
  }

  // Nothing to offer on a browser that cannot record. Rendering the button
  // anyway would prompt for the microphone and then report the resulting
  // throw as "mic blocked", which is a lie about what went wrong.
  if (!supported) return null;

  if (state === 'denied') {
    return (
      <p className="readout self-center px-2 text-[10px] uppercase text-muted-foreground">
        Mic blocked
      </p>
    );
  }

  if (state === 'review' && clip) {
    /*
      Covers the whole composer row rather than squeezing in beside the text
      field: while you are deciding whether to send a take, typing a message
      is not the thing you are doing.
    */
    return (
      <div className="absolute inset-0 z-10 flex items-center gap-2 border border-input bg-background px-2">
        <audio src={clip.url} controls className="h-8 min-w-0 flex-1" />
        {error && (
          <span className="readout shrink-0 text-[10px] uppercase text-destructive">{error}</span>
        )}
        <button
          type="button"
          onClick={discard}
          disabled={pending}
          aria-label="Discard recording"
          className="shrink-0 p-1.5 text-muted-foreground transition-colors hover:text-destructive disabled:opacity-40"
        >
          <Trash2 size={16} />
        </button>
        <button
          type="button"
          onClick={send}
          disabled={pending}
          aria-label="Send voice message"
          className="shrink-0 p-1.5 text-accent transition-colors hover:text-accent/80 disabled:opacity-40"
        >
          {pending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        </button>
      </div>
    );
  }

  if (state === 'recording') {
    return (
      <button
        type="button"
        onClick={stop}
        aria-label="Stop recording"
        className="flex h-11 shrink-0 items-center gap-2 border border-destructive/50 bg-destructive/10 px-3 text-destructive"
      >
        <Square size={14} className="fill-current" />
        <span className="readout text-[11px] tabular-nums">{clock(seconds)}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={start}
      aria-label="Record a voice message"
      title={error ?? undefined}
      className="flex h-11 w-11 shrink-0 items-center justify-center border border-input bg-secondary/40 text-muted-foreground transition-colors hover:text-accent"
    >
      <Mic size={18} />
    </button>
  );
}
