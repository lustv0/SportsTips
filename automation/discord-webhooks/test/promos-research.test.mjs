import test from 'node:test';
import assert from 'node:assert';
import {
  fetchRecentForm,
  fetchInjuryInfo,
  fetchPlayerStats,
  fetchHeadToHead,
  calculateResearchConfidence,
  getResearchSummary,
  clearCache
} from '../src/promos-research.mjs';

test('Promos Research Module', async (t) => {
  await t.test('fetchRecentForm returns array for AFL team', async () => {
    const result = await fetchRecentForm('afl', 'Carlton');
    assert(Array.isArray(result));
    assert(result.length > 0);
  });

  await t.test('fetchRecentForm returns array for NRL team', async () => {
    const result = await fetchRecentForm('nrl', 'Melbourne');
    assert(Array.isArray(result));
    assert(result.length > 0);
  });

  await t.test('fetchRecentForm returns array for Tennis player', async () => {
    const result = await fetchRecentForm('tennis', 'Novak Djokovic');
    assert(Array.isArray(result));
    assert(result.length > 0);
  });

  await t.test('fetchRecentForm returns array for Soccer team', async () => {
    const result = await fetchRecentForm('soccer', 'Liverpool');
    assert(Array.isArray(result));
    assert(result.length > 0);
  });

  await t.test('fetchInjuryInfo returns array for AFL team', async () => {
    const result = await fetchInjuryInfo('afl', 'Carlton');
    assert(Array.isArray(result));
  });

  await t.test('fetchPlayerStats returns object with stat info', async () => {
    const result = await fetchPlayerStats('afl', 'Sam Walsh', 'disposals');
    assert(result && typeof result === 'object');
    assert(result.player === 'Sam Walsh');
    assert(Number.isFinite(result.average));
  });

  await t.test('fetchHeadToHead returns array', async () => {
    const result = await fetchHeadToHead('afl', 'Carlton', 'Geelong');
    assert(Array.isArray(result));
  });

  await t.test('calculateResearchConfidence returns 0-100 score', async () => {
    const score = await calculateResearchConfidence('afl', 'Carlton', []);
    assert(Number.isFinite(score));
    assert(score >= 0 && score <= 100);
  });

  await t.test('getResearchSummary returns object with overall score', async () => {
    const legs = [
      { player: 'Sam Walsh', odds: 1.50, market: 'disposals' },
      { player: 'Clayton Oliver', odds: 1.60, market: 'disposals' }
    ];
    const summary = await getResearchSummary('afl', legs);
    assert(summary && typeof summary === 'object');
    assert(Number.isFinite(summary.overallScore));
    assert(Array.isArray(summary.details));
    assert(summary.details.length === legs.length);
  });

  await t.test('clearCache completes without error', async () => {
    await clearCache();
    // Test passes if no error thrown
  });
});
