'use client';

import { useState } from 'react';
import { Smile } from 'lucide-react';

/*
  A short list, not a keyboard.

  Every phone already has an emoji keyboard, so a full picker with search and
  categories would be re-solving a solved problem and shipping a large
  dependency to do it. What is actually missing is one tap for the handful
  that get used in coaching messages all day — the ones Colby's real threads
  are full of.

  Ordered by how often they actually turn up, so the first row covers most of
  it without opening anything.
*/
const EMOJI = [
  '💪', '🔥', '🤟', '👊', '🫡', '😤', '👏', '🙌',
  '✅', '📈', '🥩', '🍳', '🥗', '💧', '😂', '😅',
  '🤝', '🧠', '⏱️', '🏋️', '🚶', '😴', '❤️', '🎯',
];

export function EmojiPicker({ targetName = 'body' }: { targetName?: string }) {
  const [open, setOpen] = useState(false);

  /*
    Inserted at the caret rather than appended, and focus goes back to the
    field afterwards, so picking two in a row works and the message doesn't
    lose its cursor mid-sentence.

    The input is found by name within the same form. Reaching for the DOM is
    the small price of keeping the composer a plain uncontrolled form that
    still posts without JavaScript.
  */
  function insert(emoji: string, e: React.MouseEvent<HTMLButtonElement>) {
    const form = e.currentTarget.closest('form');
    const field = form?.elements.namedItem(targetName) as HTMLInputElement | null;
    if (!field) return;

    const start = field.selectionStart ?? field.value.length;
    const end = field.selectionEnd ?? field.value.length;
    field.value = field.value.slice(0, start) + emoji + field.value.slice(end);

    const caret = start + emoji.length;
    field.focus();
    field.setSelectionRange(caret, caret);
    // React-controlled consumers, if any, need to hear about it.
    field.dispatchEvent(new Event('input', { bubbles: true }));
  }

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Add an emoji"
        aria-expanded={open}
        className="flex h-11 w-11 items-center justify-center border border-input bg-secondary/40 text-muted-foreground transition-colors hover:text-accent"
      >
        <Smile size={18} />
      </button>

      {open && (
        <>
          {/* Tap anywhere else to dismiss, without a global listener. */}
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div className="absolute bottom-full right-0 z-50 mb-2 grid w-64 grid-cols-8 gap-1 border border-border bg-card p-2 shadow-lg shadow-black/40">
            {EMOJI.map((e) => (
              <button
                key={e}
                type="button"
                onClick={(ev) => {
                  insert(e, ev);
                  setOpen(false);
                }}
                className="flex h-7 w-7 items-center justify-center text-lg transition-transform hover:scale-125"
              >
                {e}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
