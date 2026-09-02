import Anthropic from '@anthropic-ai/sdk';

/*
  Bounded, because the platform bounds us whether we ask it to or not.

  The SDK's defaults are a TEN MINUTE timeout and 2 retries. A Vercel function
  is killed long before that, so the defaults meant a slow call could never
  fail in a way our own code could see: the function died mid-request, the
  catch in meal-estimate never ran, Anthropic still billed for the call, the
  photo sat orphaned in the bucket with no row pointing at it — so the coach
  never saw it and the client could not delete it — and the client got a bare
  "something went wrong" with the photo still loaded and an obvious button to
  press again. Which uploaded again, and paid again.

  20 seconds, with maxDuration raised to 60 on the pages that call this, leaves
  room for the upload before it and the write after it even if the one retry
  fires, and is comfortably longer than reading one plate takes. One retry
  rather than two: a second attempt covers a blip, a third only spends money
  we have no time left to wait for.
*/
export const AI_TIMEOUT_MS = 20_000;

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  timeout: AI_TIMEOUT_MS,
  maxRetries: 1,
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
