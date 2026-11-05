/*
  The /coaching page's decisions: which video player, whether the results
  section shows, and which paths are public.
*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { landingVideo, resultsView, safeImage, testimonialsView, PLACEHOLDER_SLOTS } from '@/lib/landing';
import { isCoachPath } from '@/lib/public-paths';
import type { ClientResult } from '@/lib/landing-content';

test('YouTube links of every shape embed muted and autoplaying, with the JS API on', () => {
  for (const url of [
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtu.be/dQw4w9WgXcQ',
    'https://www.youtube.com/shorts/dQw4w9WgXcQ',
  ]) {
    const v = landingVideo(url);
    assert.equal(v.kind, 'youtube', url);
    if (v.kind !== 'youtube') continue;
    assert.equal(v.id, 'dQw4w9WgXcQ');
    const src = new URL(v.src);
    assert.equal(src.searchParams.get('mute'), '1');
    assert.equal(src.searchParams.get('autoplay'), '1');
    assert.equal(src.searchParams.get('enablejsapi'), '1');
    assert.equal(src.searchParams.get('playsinline'), '1');
  }
});

test('Vimeo embeds muted', () => {
  const v = landingVideo('https://vimeo.com/123456789');
  assert.equal(v.kind, 'vimeo');
  if (v.kind === 'vimeo') {
    assert.match(v.src, /^https:\/\/player\.vimeo\.com\/video\/123456789\?/);
    assert.equal(new URL(v.src).searchParams.get('muted'), '1');
  }
});

test('a direct .mp4 plays as a file', () => {
  assert.deepEqual(landingVideo('https://cdn.example.com/sales.mp4'), {
    kind: 'file',
    src: 'https://cdn.example.com/sales.mp4',
  });
});

test('empty, unknown or unsafe links fall back to the placeholder', () => {
  assert.equal(landingVideo('').kind, 'none');
  assert.equal(landingVideo('https://example.com/about').kind, 'none');
  assert.equal(landingVideo('javascript:alert(1)').kind, 'none');
});

const real: ClientResult = {
  result: 'Lost 30 lbs',
  name: 'A',
  about: '40, engineer',
  beforePhoto: '',
  afterPhoto: '',
};

test('real results always win over placeholders', () => {
  const v = resultsView({ results: [real], showResultPlaceholders: true });
  assert.equal(v.mode, 'real');
});

test('with no results the section is example slots or hidden, never invented people', () => {
  assert.deepEqual(resultsView({ results: [], showResultPlaceholders: true }), {
    mode: 'placeholder',
    slots: PLACEHOLDER_SLOTS,
  });
  assert.deepEqual(resultsView({ results: [], showResultPlaceholders: false }), { mode: 'hidden' });
});

test('a half-filled result entry is dropped rather than shown', () => {
  const v = resultsView({ results: [{ ...real, name: ' ' }], showResultPlaceholders: false });
  assert.equal(v.mode, 'hidden');
});

test('only http(s) and /public paths reach an img src', () => {
  assert.equal(safeImage('/colby.jpg'), '/colby.jpg');
  assert.equal(safeImage('https://x.co/a.jpg'), 'https://x.co/a.jpg');
  assert.equal(safeImage('//evil.com/a.jpg'), null);
  assert.equal(safeImage('javascript:alert(1)'), null);
  assert.equal(safeImage(''), null);
});

test('the public coaching page is not mistaken for the coach console', () => {
  assert.equal(isCoachPath('/coaching'), false);
  assert.equal(isCoachPath('/coaching/apply'), false);
  assert.equal(isCoachPath('/coach'), true);
  assert.equal(isCoachPath('/coach/applications'), true);
});

test('testimonials: real ones win, half-empty ones drop, else example slots or nothing', () => {
  const real = { quote: 'Still have a beer every Friday.', name: 'Mike', about: '41, two kids' };
  const blank = { quote: '  ', name: 'Nobody', about: '' };
  assert.deepEqual(testimonialsView({ testimonials: [real, blank], showResultPlaceholders: true }), {
    mode: 'real',
    items: [real],
  });
  assert.equal(testimonialsView({ testimonials: [blank], showResultPlaceholders: true }).mode, 'placeholder');
  assert.equal(testimonialsView({ testimonials: [], showResultPlaceholders: false }).mode, 'hidden');
});

test('the Calendly link carries name and email, and only ever points at Calendly', async () => {
  const { calendlyLink } = await import('@/lib/landing');
  const plain = new URL(calendlyLink('https://calendly.com/colbymullins24/new-meeting', 'Mike', 'mike@x.com'));
  assert.equal(plain.searchParams.get('name'), 'Mike');
  assert.equal(plain.searchParams.get('email'), 'mike@x.com');
  assert.equal(plain.searchParams.get('embed_type'), null);
  const embed = new URL(calendlyLink('https://calendly.com/colbymullins24/new-meeting', 'Mike', '', { embed: true }));
  assert.equal(embed.searchParams.get('embed_type'), 'Inline');
  assert.equal(embed.searchParams.get('email'), null);
  assert.equal(calendlyLink('https://evil.com/x', 'a', 'b'), '');
  assert.equal(calendlyLink('not a url', 'a', 'b'), '');
});
