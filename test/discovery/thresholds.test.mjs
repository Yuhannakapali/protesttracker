import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseArticles } from '../../scripts/lib/discovery/gdelt.mjs';
import { tokenize, documentFrequency, distinctiveTerms } from '../../scripts/lib/discovery/tokenize.mjs';
import { collapseSyndication, assignToClusters } from '../../scripts/lib/discovery/cluster.mjs';
import { isGraduated } from '../../scripts/lib/discovery/graduate.mjs';

const fixture = JSON.parse(fs.readFileSync(new URL('../fixtures/gdelt-india-7d.json', import.meta.url), 'utf8'));
const articles = parseArticles(fixture);

function pipeline(list) {
  const stories = collapseSyndication(list);
  const tokenLists = stories.map((a) => tokenize(a.title));
  const df = documentFrequency(tokenLists);
  const withTerms = stories.map((a, i) => ({ ...a, terms: distinctiveTerms(tokenLists[i], df, stories.length) }));
  return assignToClusters(withTerms, {});
}

test('the fixture parses into a dense set of articles', () => {
  assert.ok(articles.length > 200, `expected >200 articles, got ${articles.length}`);
});

test('syndication collapse removes duplicate titles carried by several domains', () => {
  const stories = collapseSyndication(articles);
  assert.ok(stories.length < articles.length, 'no syndication was collapsed at all');
  assert.ok(stories.some((s) => s.domains.length > 1), 'expected at least one syndicated story');
});

test('corpus-wide vocabulary does not survive as a distinctive term', () => {
  const stories = collapseSyndication(articles);
  const tokenLists = stories.map((a) => tokenize(a.title));
  const df = documentFrequency(tokenLists);
  const all = stories.flatMap((_, i) => distinctiveTerms(tokenLists[i], df, stories.length));
  assert.ok(!all.includes('protest'));
  assert.ok(!all.includes('police'));
});

test('clustering is neither degenerate nor collapsed', () => {
  const clusters = pipeline(articles);
  const n = Object.keys(clusters).length;
  const stories = collapseSyndication(articles).length;
  assert.ok(n < stories, 'every story became its own cluster — matching too tight');
  const biggest = Math.max(...Object.values(clusters).map((c) => c.articleCount));
  assert.ok(biggest < stories * 0.5, `largest cluster holds ${biggest}/${stories} — matching too loose`);
});

test('real movements clear the outlet, day, and story bars', () => {
  // Measured on this fixture: several clusters graduate, including the
  // Supreme Court / CJP protest coverage and the SFI Secretariat march.
  const graduated = Object.values(pipeline(articles)).filter((c) => isGraduated(c));
  assert.ok(graduated.length >= 3,
    `expected >=3 graduating clusters, got ${graduated.length} — the tier finds nothing`);
  for (const c of graduated) {
    assert.ok(c.domains.length >= 3);
    assert.ok(c.daysSeen.length >= 3);
    assert.ok(c.articleCount >= 3);
  }
});

test('graduated clusters are distinct movements, not one blob', () => {
  const graduated = Object.values(pipeline(articles)).filter((c) => isGraduated(c));
  const ids = new Set(graduated.map((c) => c.id));
  assert.equal(ids.size, graduated.length, 'graduated clusters share ids');
});
