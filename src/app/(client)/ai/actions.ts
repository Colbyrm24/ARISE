'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireClient } from '@/lib/auth';
import { anthropic } from '@/lib/ai';

function todayDateOnly() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

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
      where: { clientId: user.id, date: todayDateOnly() },
    }),
    prisma.aiMessage.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'asc' },
      take: 20,
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
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 500,
      system: systemPrompt,
      messages: history.map((m) => ({
        role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
        content: m.content,
      })),
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
