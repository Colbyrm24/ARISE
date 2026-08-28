'use client';

import { useEffect, useRef } from 'react';

/*
  Open at the newest message.

  `mt-auto` on the list gets a SHORT thread to sit above the composer, which
  is what it was added for. It does nothing once the history is taller than
  the scrollport: there is no free space left for the auto margin to absorb,
  so the container opens at scrollTop 0 — the top — and a client with three
  months of messages lands in May and has to scroll to find what their coach
  said this morning. Worse, sending a message re-renders the page and puts
  them back in May with no sign it went.

  One line of JavaScript, and only for the case CSS cannot reach. `count` in
  the deps means it runs again when a message is added, so a send scrolls to
  the message that was just sent.
*/
export function ThreadScroll({ count }: { count: number }) {
  const anchor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 'auto', not 'smooth': arriving at a screen already scrolled is normal;
    // watching it scroll itself on every visit is not.
    anchor.current?.scrollIntoView({ block: 'end' });
  }, [count]);

  return <div ref={anchor} aria-hidden />;
}
