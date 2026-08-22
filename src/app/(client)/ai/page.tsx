import { Sparkles } from 'lucide-react';
import { requireEntitledClient } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { sendAiMessage } from './actions';

export default async function AiPage() {
  const user = await requireEntitledClient();

  const conversation = await prisma.aiConversation.findFirst({
    where: { userId: user.id, roleContext: 'client' },
    orderBy: { startedAt: 'desc' },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  });

  const messages = conversation?.messages ?? [];

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center gap-2">
        <Sparkles size={20} className="text-accent" />
        <h1 className="text-2xl font-semibold">AI Coach</h1>
      </header>

      <div className="flex flex-col gap-3">
        {messages.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">
                Ask about your macros, your program, or how today&apos;s workout is going — I can see your real numbers and give you a straight answer.
              </p>
            </CardContent>
          </Card>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={
                m.role === 'user'
                  ? 'ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-accent px-4 py-2.5 text-sm text-accent-foreground'
                  : 'mr-auto max-w-[85%] rounded-2xl rounded-bl-sm border border-border bg-secondary/40 px-4 py-2.5 text-sm'
              }
            >
              {m.content}
            </div>
          ))
        )}
      </div>

      <form action={sendAiMessage} className="flex gap-2">
        <Input name="message" placeholder="Ask your AI Coach..." required autoComplete="off" />
        <Button type="submit" variant="primary" size="default">
          Send
        </Button>
      </form>
    </div>
  );
}
