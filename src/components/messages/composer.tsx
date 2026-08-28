import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmojiPicker } from '@/components/messages/emoji-picker';
import { VoiceRecorder } from '@/components/messages/voice-recorder';
import type { VoiceNoteResult } from '@/lib/voice-notes';

/**
 * Plain form post so sending works even before any JS loads — important
 * on a phone mid-workout with a bad connection.
 */
export function Composer({
  action,
  voiceAction,
  placeholder = 'Message…',
  hidden,
  extra,
  className,
}: {
  action: (formData: FormData) => Promise<void>;
  /**
   * Optional — a voice note goes through its own action because it posts a
   * blob the recorder built in the browser, not a field of this form. Where
   * it is omitted the mic simply does not appear.
   */
  voiceAction?: (formData: FormData) => Promise<VoiceNoteResult>;
  placeholder?: string;
  hidden?: Record<string, string>;
  /**
   * An extra control in the row — the coach's draft button lives here. It sits
   * inside the form on purpose so it can reach the body field, which keeps
   * this component a plain server component that still posts without JS.
   */
  extra?: ReactNode;
  /** Overrides the sticky footer positioning, which only suits a full thread. */
  className?: string;
}) {
  return (
    <form
      action={action}
      className={cn(
        className ?? 'sticky bottom-20 bg-background/80 py-2 backdrop-blur',
        // relative: the recorder's review bar covers this row while a take is
        // waiting to be sent.
        'relative flex gap-2'
      )}
    >
      {hidden &&
        Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <Input name="body" placeholder={placeholder} autoComplete="off" required className="flex-1" />
      <EmojiPicker targetName="body" />
      {extra}
      {voiceAction && <VoiceRecorder action={voiceAction} hidden={hidden} />}
      <Button type="submit">Send</Button>
    </form>
  );
}
