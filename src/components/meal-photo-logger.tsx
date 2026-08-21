'use client';

import { useRef, useState } from 'react';
import { Camera, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Count } from '@/components/ui/system-window';
import { logMealFromPhoto, type PhotoLogResult } from '@/app/(client)/nutrition/actions';

/*
  Photograph a plate, get the numbers.

  The conversion below is doing more work than it looks like. An iPhone hands
  over a 3MB HEIC, which the vision API cannot read at all — but Safari can
  decode HEIC natively, so drawing it to a canvas and exporting JPEG turns the
  one format that doesn't work into the one that always does, on the device
  that took the photo. It also drops the upload to a couple of hundred KB,
  which matters when this gets used standing in a restaurant on one bar of
  signal.

  Doing the same server-side would mean shipping libheif and paying for the
  bytes twice. Doing it here costs nothing and fails visibly.
*/

const MAX_EDGE = 1024;
const QUALITY = 0.82;

async function toJpeg(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no canvas');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', QUALITY)
  );
  if (!blob) throw new Error('no blob');
  return new File([blob], 'meal.jpg', { type: 'image/jpeg' });
}

const MEALS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;

const CONFIDENCE_COPY: Record<'high' | 'medium' | 'low', string> = {
  high: 'Portions were clear in the photo.',
  medium: 'The food is clear, the portion is a judgement call.',
  low: 'Part of this was hard to see — worth checking.',
};

export function MealPhotoLogger() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PhotoLogResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setFile(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0];
    if (!picked) return;
    setResult(null);
    try {
      const jpeg = await toJpeg(picked);
      setFile(jpeg);
      if (preview) URL.revokeObjectURL(preview);
      setPreview(URL.createObjectURL(jpeg));
    } catch {
      // A format the browser itself can't decode. Send the original and let
      // the server say something useful rather than failing here in silence.
      setFile(picked);
      if (preview) URL.revokeObjectURL(preview);
      setPreview(URL.createObjectURL(picked));
    }
  }

  async function submit(formData: FormData) {
    if (!file) return;
    setBusy(true);
    setResult(null);
    // The converted file replaces whatever the input holds, so the server
    // always receives the JPEG and never the original HEIC.
    formData.set('photo', file);
    try {
      const res = await logMealFromPhoto(formData);
      setResult(res);
      if (res.ok || res.saved) reset();
    } catch {
      setResult({ ok: false, error: 'Something went wrong. Try again.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form action={submit} className="flex flex-col gap-3">
      {preview ? (
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt="The meal you're about to log"
            className="max-h-64 w-full border border-border object-cover"
          />
          <button
            type="button"
            onClick={reset}
            aria-label="Remove photo"
            className="absolute right-2 top-2 border border-border bg-background/90 p-1.5 text-muted-foreground transition-colors hover:text-foreground"
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex flex-col items-center gap-2 border border-dashed border-border bg-secondary/20 px-4 py-8 text-muted-foreground transition-colors hover:border-accent/50 hover:text-accent"
        >
          <Camera size={22} />
          <span className="readout text-[10px] uppercase tracking-wider">
            Photograph your plate
          </span>
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        name="photo"
        accept="image/*"
        capture="environment"
        onChange={pick}
        className="hidden"
      />

      <input
        name="description"
        maxLength={300}
        placeholder="Anything I can't see? (optional)"
        className="h-10 w-full rounded-none border border-input bg-secondary/40 px-3 text-sm placeholder:text-muted-foreground focus-visible:border-accent/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/50"
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <select
          name="meal"
          defaultValue="lunch"
          aria-label="Meal"
          className="readout h-9 rounded-none border border-input bg-secondary/40 px-2 text-[11px] uppercase tracking-wider focus-visible:border-accent/60 focus-visible:outline-none"
        >
          {MEALS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <Button type="submit" size="sm" disabled={!file || busy}>
          {busy ? 'Reading…' : 'Read it'}
        </Button>
      </div>

      {busy && (
        <p className="readout text-[10px] uppercase tracking-wider text-muted-foreground">
          Reading the plate…
        </p>
      )}

      {result?.ok && (
        <div className="border border-accent/30 bg-accent/[0.05] p-3">
          <p className="text-sm font-medium">{result.name}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <Count value={result.calories} unit=" cal" />
            <Count value={result.protein} unit="g protein" />
            <Count value={result.carbs} unit="g carbs" />
            <Count value={result.fat} unit="g fat" />
          </div>
          {/*
            Said plainly, every time. The number is useful now and it is also
            a guess, and a client who finds that out later trusts the next one
            less — so it says so before they have to ask.
          */}
          <p className="readout mt-2 text-[10px] uppercase leading-relaxed text-muted-foreground">
            Logged as an estimate · {CONFIDENCE_COPY[result.confidence]} Your coach will confirm it.
          </p>
        </div>
      )}

      {result && !result.ok && (
        <p className="text-xs text-destructive">
          {result.error}
          {result.saved && (
            <span className="text-muted-foreground">
              {' '}
              The photo saved, so add the numbers by hand or leave it for your coach.
            </span>
          )}
        </p>
      )}
    </form>
  );
}
