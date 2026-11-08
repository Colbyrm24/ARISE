'use client';

import { useState } from 'react';
import { Play } from 'lucide-react';

/*
  The demo, right where the exercise is.

  A thumbnail with a big play button until it's tapped, then the video plays
  in place. Loading YouTube's player for every movement on the page would
  make a six-exercise workout download six video players before anyone has
  touched one; this loads nothing but a picture until it's wanted.

  youtube-nocookie keeps YouTube from setting tracking cookies until the
  client actually plays something.
*/
export function ExerciseDemo({ youtubeId, name }: { youtubeId: string; name: string }) {
  const [playing, setPlaying] = useState(false);

  if (playing) {
    return (
      <div className="aspect-video w-full overflow-hidden rounded-xl border border-accent/40 bg-black">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1&rel=0&modestbranding=1&playsinline=1`}
          title={`${name} demo`}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          className="h-full w-full"
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setPlaying(true)}
      aria-label={`Play ${name} demo`}
      className="group relative block aspect-video w-full overflow-hidden rounded-xl border border-accent/40 bg-black"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`}
        alt=""
        loading="lazy"
        className="h-full w-full object-cover opacity-80 transition-opacity group-hover:opacity-100"
      />
      <span className="absolute inset-0 flex items-center justify-center">
        <span className="flex items-center gap-2 rounded-full bg-accent px-5 py-3 text-base font-bold text-accent-foreground shadow-lg">
          <Play size={18} fill="currentColor" /> Watch how
        </span>
      </span>
    </button>
  );
}
