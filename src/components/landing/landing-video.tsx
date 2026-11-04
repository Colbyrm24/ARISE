'use client';

import { useRef, useState } from 'react';
import { Volume2 } from 'lucide-react';
import type { LandingVideo as Video } from '@/lib/landing';

/*
  The sales video: autoplays muted (the only way a browser allows autoplay),
  with one tap to bring the sound in and restart from the top, so nobody
  hears it from the middle of a sentence.

  The overlay covers the whole frame until that tap, so the first touch on a
  phone always unmutes rather than landing on a YouTube control. YouTube and
  Vimeo are driven with postMessage through their embed APIs — no player
  script is loaded for this.
*/

function command(frame: HTMLIFrameElement | null, message: object) {
  frame?.contentWindow?.postMessage(JSON.stringify(message), '*');
}

export function LandingVideo({ video, poster }: { video: Exclude<Video, { kind: 'none' }>; poster?: string }) {
  const [muted, setMuted] = useState(true);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  function unmute() {
    if (video.kind === 'file') {
      const v = videoRef.current;
      if (v) {
        v.muted = false;
        v.currentTime = 0;
        void v.play().catch(() => null);
      }
    } else if (video.kind === 'youtube') {
      command(frameRef.current, { event: 'command', func: 'unMute', args: [] });
      command(frameRef.current, { event: 'command', func: 'setVolume', args: [100] });
      command(frameRef.current, { event: 'command', func: 'seekTo', args: [0, true] });
      command(frameRef.current, { event: 'command', func: 'playVideo', args: [] });
    } else {
      command(frameRef.current, { method: 'setMuted', value: false });
      command(frameRef.current, { method: 'setVolume', value: 1 });
      command(frameRef.current, { method: 'setCurrentTime', value: 0 });
      command(frameRef.current, { method: 'play' });
    }
    setMuted(false);
  }

  return (
    <div className="relative aspect-video w-full bg-black">
      {video.kind === 'file' ? (
        <video
          ref={videoRef}
          src={video.src}
          poster={poster || undefined}
          className="h-full w-full object-cover"
          autoPlay
          muted
          loop
          playsInline
          controls={!muted}
          preload="metadata"
        />
      ) : (
        <iframe
          ref={frameRef}
          src={video.src}
          title="Coaching video"
          className="h-full w-full"
          allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
          allowFullScreen
        />
      )}

      {muted && (
        <button
          type="button"
          onClick={unmute}
          className="group absolute inset-0 flex items-center justify-center bg-background/20 focus-visible:outline-none"
          aria-label="Unmute video"
        >
          <span className="flex items-center gap-3 border border-accent/60 bg-background/80 px-5 py-3 shadow-[0_0_30px_-4px_hsl(var(--accent)/0.8)] backdrop-blur-sm transition-colors group-hover:bg-background/90 group-focus-visible:ring-2 group-focus-visible:ring-foreground">
            <Volume2 size={18} className="glow-ink text-accent" />
            <span className="readout text-xs uppercase text-foreground">Tap to unmute</span>
          </span>
        </button>
      )}
    </div>
  );
}
