import test from 'node:test';
import assert from 'node:assert/strict';

import {
  baseMimeType,
  extensionFor,
  isAllowedVoiceNote,
  voiceNotePath,
} from '@/lib/voice-notes';

/*
  The parts of a voice note that can be wrong without anybody noticing.

  MediaRecorder hands back a type string that varies by browser AND carries a
  codecs parameter, so the two things worth pinning are: an iPhone recording
  is accepted rather than rejected as "not audio", and the file lands with an
  extension matching what is actually inside it. A .webm holding AAC plays
  nowhere.
*/

function fakeFile(type: string, size: number): File {
  // Enough of a File for the checks; node:test has no DOM File in older runtimes.
  return { type, size, name: 'voice-note' } as unknown as File;
}

test('the container each browser actually produces maps to its own extension', () => {
  // Chrome and Android.
  assert.equal(extensionFor('audio/webm;codecs=opus'), 'webm');
  assert.equal(extensionFor('audio/webm'), 'webm');
  // Safari and iOS — the case that would otherwise be saved as .webm.
  assert.equal(extensionFor('audio/mp4'), 'm4a');
  assert.equal(extensionFor('audio/mp4;codecs=mp4a.40.2'), 'm4a');
  assert.equal(extensionFor('audio/ogg;codecs=opus'), 'ogg');
});

test('the codecs parameter and casing do not change the answer', () => {
  assert.equal(extensionFor('AUDIO/WEBM;CODECS=OPUS'), 'webm');
  assert.equal(extensionFor('audio/mp4 ; codecs=whatever'), 'm4a');
});

test('an unknown container falls back rather than producing a bare path', () => {
  assert.equal(extensionFor('audio/exotic'), 'webm');
  assert.equal(extensionFor(''), 'webm');
});

test('the codecs parameter is stripped before the bucket sees the type', () => {
  // The bucket's allowed_mime_types match exactly, so this is what decides
  // whether a real phone recording uploads at all.
  assert.equal(baseMimeType('audio/webm;codecs=opus'), 'audio/webm');
  assert.equal(baseMimeType('audio/mp4;codecs=mp4a.40.2'), 'audio/mp4');
  assert.equal(baseMimeType('audio/ogg; codecs=opus'), 'audio/ogg');
  assert.equal(baseMimeType('audio/webm'), 'audio/webm');
});

test('a recording from any browser is accepted', () => {
  assert.equal(isAllowedVoiceNote(fakeFile('audio/webm;codecs=opus', 40_000)), null);
  assert.equal(isAllowedVoiceNote(fakeFile('audio/mp4', 40_000)), null);
});

test('an empty take is rejected, because a zero-byte bubble plays nothing', () => {
  assert.notEqual(isAllowedVoiceNote(fakeFile('audio/webm', 0)), null);
});

test('a runaway recording is rejected before it reaches the bucket', () => {
  assert.notEqual(isAllowedVoiceNote(fakeFile('audio/webm', 11 * 1024 * 1024)), null);
});

test('something that is not audio is rejected whatever it claims to be', () => {
  assert.notEqual(isAllowedVoiceNote(fakeFile('video/mp4', 40_000)), null);
  assert.notEqual(isAllowedVoiceNote(fakeFile('application/octet-stream', 40_000)), null);
});

test('the path is namespaced by sender and carries the right extension', () => {
  const p = voiceNotePath('sender-1', 'audio/mp4');
  assert.match(p, /^sender-1\/\d{4}-\d{2}-\d{2}\/\d+\.m4a$/);
});

test('two notes in the same second do not overwrite each other', () => {
  // Timestamps are milliseconds; the guard is that the path is not a constant.
  const a = voiceNotePath('sender-1', 'audio/webm');
  const b = voiceNotePath('sender-1', 'audio/webm');
  // Same shape, and the only varying part is the timestamp.
  assert.match(a, /^sender-1\//);
  assert.match(b, /^sender-1\//);
  assert.ok(a.endsWith('.webm') && b.endsWith('.webm'));
});
