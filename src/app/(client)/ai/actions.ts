'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireClient } from '@/lib/auth';
import { todayFor } from '@/lib/day';
import { anthropic, AI_MODEL } from '@/lib/ai';


export async function sendAiMessage(formData: FormData) {
  const user = await requireClient();
  const content = (formData.get('message') as string | null)?.trim();
  if (!content) return;

  let conversation = await prisma.aiConversation.findFirst({
    where: { userId: user.id, roleContext: 'client' },
    orderBy: { startedAt: 'desc' },
  });

  if (!conversation) {
    conversation = await prisma.aiConversation.create({
      data: { userId: user.id, roleContext: 'client' },
    });
  }

  await prisma.aiMessage.create({
    data: { conversationId: conversation.id, role: 'user', content },
  });

  const [nutritionTarget, clientProgram, recentWorkoutLogs, todayNutritionLogs, history] = await Promise.all([
    prisma.nutritionTarget.findFirst({
      where: { clientId: user.id },
      orderBy: { effectiveDate: 'desc' },
    }),
    prisma.clientProgram.findFirst({
      where: { clientId: user.id, active: true },
      include: { template: true },
      orderBy: { assignedAt: 'desc' },
    }),
    prisma.workoutLog.findMany({
      where: { clientId: user.id },
      orderBy: { startedAt: 'desc' },
      take: 5,
      include: { workout: true },
    }),
    prisma.nutritionLog.findMany({
      where: { clientId: user.id, date: todayFor(user) },
    }),
    prisma.aiMessage.findMany({
      where: { conversationId: conversation.id },
      // Newest first, then reversed below. Ascending + take:20 fetched the
      // OLDEST twenty — so past the twentieth message the model was
      // permanently answering the client's first few questions and never saw
      // the one they had just typed.
      orderBy: { createdAt: 'desc' },
      // 21, not 20 — see the trim below.
      take: 21,
    }),
  ]);

  const firstName = user.profile?.fullName?.split(' ')[0] || 'there';

  const todayCalories = todayNutritionLogs.reduce((sum, l) => sum + l.calories, 0);
  const todayProtein = todayNutritionLogs.reduce((sum, l) => sum + Number(l.protein), 0);

  const contextLines = [
    `Client name: ${firstName}`,
    nutritionTarget
      ? `Nutrition target: ${nutritionTarget.calories} cal, ${Number(nutritionTarget.protein)}g protein, ${Number(nutritionTarget.carbs)}g carbs, ${Number(nutritionTarget.fat)}g fat.`
      : `No nutrition target set yet.`,
    `Logged so far today: ${todayCalories} cal, ${Math.round(todayProtein)}g protein.`,
    clientProgram
      ? `Active program: "${clientProgram.template.name}".`
      : `No active workout program assigned.`,
    recentWorkoutLogs.length
      ? `Recent workouts: ${recentWorkoutLogs.map((w) => `${w.workout.name} on ${w.startedAt.toDateString()}`).join('; ')}.`
      : `No workout history logged yet.`,
  ];

  const systemPrompt = `You are the AI Coach inside ARISE, a fitness and nutrition coaching app. You're chatting with ${firstName}, a client. Be warm, encouraging, and concise — a few sentences at a time, not an essay. Use the client's real data below to personalize your answers. Never invent data you don't have; if something isn't in the context, say you don't have that info and suggest they check with their coach.

Client context:
${contextLines.join('\n')}`;

  let replyText: string;
  /*
    The window has to start on a user turn, or the API rejects the whole call.

    Rows alternate user/assistant, and the client's new message is written
    above BEFORE this fetch — so the conversation always has an ODD number of
    rows here, and taking an even-sized newest-N of an odd alternating list
    always starts on an `assistant` row. From the client's eleventh message
    onward every call 400'd. The catch below swallowed it, replied "I'm having
    trouble connecting right now", and then wrote THAT as an assistant row —
    preserving the parity, so it never recovered. AI Coach was dead for good
    after ten exchanges, with nothing but a console.error to show for it.

    Fetching 21 makes the common case land on a user turn, and the trim makes
    it true regardless — of parity, of a failed write, of any stray row.
  */
  const turns = [...history]
    .reverse()
    .map((m) => ({
      role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
      content: m.content,
    }));
  while (turns.length > 0 && turns[0].role === 'assistant') turns.shift();

  try {
    const response = await anthropic.messages.create({
      model: AI_MODEL,
      max_tokens: 500,
      system: systemPrompt,
      // Reversed back into reading order — the query takes the newest, the
      // model needs them oldest-first.
      messages: turns,
    });
    const textBlock = response.content.find((block) => block.type === 'text');
    replyText =
      textBlock && textBlock.type === 'text'
        ? textBlock.text
        : "Sorry, I couldn't come up with a response — try again in a moment.";
  } catch (error) {
    console.error('AI Coach error:', error);
    replyText = "I'm having trouble connecting right now. Try again in a moment.";
  }

  await prisma.aiMessage.create({
    data: { conversationId: conversation.id, role: 'assistant', content: replyText },
  });

  revalidatePath('/ai');
}
