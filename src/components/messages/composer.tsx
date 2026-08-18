import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/**
 * Plain form post so sending works even before any JS loads — important
 * on a phone mid-workout with a bad connection.
 */
export function Composer({
  action,
  placeholder = 'Message…',
  hidden,
}: {
  action: (formData: FormData) => Promise<void>;
  placeholder?: string;
  hidden?: Record<string, string>;
}) {
  return (
    <form action={action} className="sticky bottom-20 flex gap-2 bg-background/80 py-2 backdrop-blur">
      {hidden &&
        Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <Input name="body" placeholder={placeholder} autoComplete="off" required className="flex-1" />
      <Button type="submit">Send</Button>
    </form>
  );
}
