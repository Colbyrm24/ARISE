import Anthropic from '@anthropic-ai/sdk';

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/*
  One model id for the whole app.

  It was previously written inline in the AI coach action, which meant that
  changing models was a search-and-replace across files and that a photo read
  could silently drift onto a different model than the chat. The env var is
  there so a model can be swapped from the dashboard without a deploy.
*/
export const AI_MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5';

/** False when no key is configured, so callers can degrade instead of erroring. */
export function aiConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}
