'use client';

import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';

/*
  A player that admits when it cannot play.

  A bare <audio> fails silently in two ordinary situations, and both look
  identical to the listener: a dead control that does nothing when tapped.

  One is expiry. The URL is signed at render time and good for an hour, so a
  thread left open on a laptop overnight has nothing but stale links by
  morning.

  The other is the container. Recording is best-effort mp4, but a browser
  that can only produce WebM/Opus — Chrome on Android, mostly — sends
  something Safari cannot decode. There is no transcode step, so the honest
  answer is to say so and offer the file, which the phone's own player will
  usually open.
*/
export function VoicePlayer({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <span className="flex flex-col gap-1 py-0.5 text-xs opacity-90">
        <span className="flex items-center gap-1.5">
          <AlertTriangle size={12} />
          Can&apos;t play this one here
        </span>
        <a href={src} target="_blank" rel="noopener noreferrer" className="underline">
          Open the recording
        </a>
        <span className="opacity-70">
          If that link has expired, reload the thread and try again.
        </span>
      </span>
    );
  }

  return (
    <audio
      src={src}
      controls
      preload="metadata"
      onError={() => setFailed(true)}
      className="h-9 w-[15rem] max-w-full"
    />
  );
}
