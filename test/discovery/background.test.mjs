import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summaryUrl, buildBackgroundBlocks } from '../../scripts/lib/discovery/background.mjs';

test('derives the REST summary URL from an article URL', () => {
  assert.equal(
    summaryUrl('https://en.wikipedia.org/wiki/2026_Ugandan_protests'),
    'https://en.wikipedia.org/api/rest_v1/page/summary/2026_Ugandan_protests',
  );
});

test('builds heading + paragraph blocks matching the BackgroundBlock shape', () => {
  const blocks = buildBackgroundBlocks(
    'First para.\n\nSecond para.',
    '2026 Ugandan protests',
    'https://en.wikipedia.org/wiki/2026_Ugandan_protests',
  );
  assert.equal(blocks[0].type, 'h');
  assert.equal(blocks[1].type, 'p');
  assert.equal(blocks[1].text, 'First para.');
  assert.equal(blocks[2].text, 'Second para.');
  assert.ok(blocks.every((b) => b.type === 'h' || b.type === 'p'));
});

test('always appends a CC BY-SA attribution naming the article and licence', () => {
  const blocks = buildBackgroundBlocks('Text.', 'Some protests', 'https://en.wikipedia.org/wiki/Some_protests');
  const last = blocks[blocks.length - 1];
  assert.equal(last.type, 'p');
  assert.match(last.text, /CC BY-SA/);
  assert.match(last.text, /Some protests/);
  assert.match(last.text, /https:\/\/en\.wikipedia\.org\/wiki\/Some_protests/);
});

test('returns no blocks for an empty extract, so nothing unattributed is written', () => {
  assert.deepEqual(buildBackgroundBlocks('', 'X', 'https://example.test'), []);
});
