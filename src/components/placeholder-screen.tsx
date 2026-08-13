import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

/**
 * Used for routes that exist (real navigation, real auth-gated page) but
 * whose actual feature build happens in a later phase. Never used to fake
 * data — just an honest "this is coming, here's when."
 */
export function PlaceholderScreen({
  title,
  phase,
  description,
}: {
  title: string;
  phase: string;
  description: string;
}) {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold">{title}</h1>
      </header>
      <Card>
        <CardContent className="flex flex-col gap-3 pt-6">
          <Badge variant="accent" className="w-fit">
            {phase}
          </Badge>
          <p className="text-sm text-muted-foreground">{description}</p>
        </CardContent>
      </Card>
    </div>
  );
}
