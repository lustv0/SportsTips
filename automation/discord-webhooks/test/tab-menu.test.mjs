import test from 'node:test';
import assert from 'node:assert/strict';

import { classifyTabMarket, mergeTabMenu, getTabCanonicalMarkets } from '../src/providers/tab.mjs';
import { __testables } from '../src/ai-pick-generator.mjs';

const { getCandidateTabMarketKey, isCandidateOnTab, getComboTabAvailability } = __testables;

test('classifyTabMarket maps TAB market names to canonical keys', () => {
  assert.equal(classifyTabMarket('nrl', { name: 'NRL Hd to Hd', betOption: 'Head To Head' }), 'h2h');
  assert.equal(classifyTabMarket('nrl', { name: 'NRL Line -5.5', betOption: 'Line' }), 'spreads');
  assert.equal(classifyTabMarket('nrl', { name: 'NRL Total Points Over/Under 50.5' }), 'totals');
  assert.equal(classifyTabMarket('nrl', { name: '1st Half Line' }), 'first_half_spreads');
  assert.equal(classifyTabMarket('nrl', { name: '1st Half Total Points Over/Under' }), 'first_half_totals');
  assert.equal(classifyTabMarket('nrl', { name: 'Anytime Try Scorer' }), 'try_scorer');
  assert.equal(classifyTabMarket('afl', { name: '15+ Disposals' }), 'player_disposals');
  assert.equal(classifyTabMarket('afl', { name: 'Anytime Goal Scorer' }), 'player_goals');
  assert.equal(classifyTabMarket('mlb', { name: 'Get 1+ Hits' }), 'batter_hits');
  assert.equal(classifyTabMarket('mlb', { name: 'Pitcher Strikeouts' }), 'pitcher_strikeouts');
  assert.equal(classifyTabMarket('nrl', { name: 'Exact Winning Margin' }), null);
});

test('mergeTabMenu unions market lists and keeps prior ok menus on failed captures', () => {
  const previous = {
    sports: {
      mlb: { status: 'ok', canonicalMarkets: ['h2h', 'spreads', 'totals'], rawMarketTypes: ['Head To Head', 'Line'] },
      nrl: { status: 'ok', canonicalMarkets: ['h2h', 'spreads'], rawMarketTypes: ['Head To Head'] }
    }
  };
  const captured = {
    capturedAt: '2026-06-14T00:00:00.000Z',
    jurisdiction: 'NSW',
    sports: {
      // Fewer markets this run — should UNION with prior, not replace.
      mlb: { status: 'ok', canonicalMarkets: ['batter_hits', 'h2h'], rawMarketTypes: ['Get 1+ Hits'] },
      // Failed this run — prior ok menu must be kept.
      nrl: { status: 'no_matches' }
    }
  };

  const merged = mergeTabMenu(previous, captured);
  assert.deepEqual(merged.sports.mlb.canonicalMarkets, ['batter_hits', 'h2h', 'spreads', 'totals']);
  assert.equal(merged.sports.nrl.status, 'ok');
  assert.deepEqual(merged.sports.nrl.canonicalMarkets, ['h2h', 'spreads']);
});

test('getTabCanonicalMarkets returns null for unknown/uncaptured sports', () => {
  const menu = { sports: { nrl: { status: 'ok', canonicalMarkets: ['h2h'] }, afl: { status: 'no_matches' } } };
  assert.deepEqual(getTabCanonicalMarkets(menu, 'nrl'), ['h2h']);
  assert.equal(getTabCanonicalMarkets(menu, 'afl'), null);
  assert.equal(getTabCanonicalMarkets(menu, 'mlb'), null);
});

test('getCandidateTabMarketKey classifies bot candidates to TAB keys', () => {
  assert.equal(getCandidateTabMarketKey({ market: 'h2h', family: 'side' }), 'h2h');
  assert.equal(getCandidateTabMarketKey({ market: 'spreads', family: 'side', point: 5.5, label: 'Eels +5.5' }), 'spreads');
  assert.equal(getCandidateTabMarketKey({ market: 'totals', family: 'total', label: 'Under 52.5' }), 'totals');
  assert.equal(getCandidateTabMarketKey({ market: 'first_half_totals', family: 'total', label: '1st Half Under 26.5' }), 'first_half_totals');
  assert.equal(getCandidateTabMarketKey({ market: 'player points', family: 'prop', label: 'Player 6+ Points' }), 'player points');
});

test('isCandidateOnTab and getComboTabAvailability reflect the TAB menu', () => {
  const tabMarkets = ['h2h', 'spreads', 'totals', 'player points'];
  const onTabLeg = { market: 'totals', family: 'total', label: 'Under 52.5' };
  const offTabLeg = { market: 'player_disposals', family: 'prop', label: '20+ Disposals' };

  assert.equal(isCandidateOnTab(onTabLeg, tabMarkets), true);
  assert.equal(isCandidateOnTab(offTabLeg, tabMarkets), false);
  // Unknown menu => null (caller treats as "don't penalise").
  assert.equal(isCandidateOnTab(onTabLeg, null), null);

  assert.equal(getComboTabAvailability([onTabLeg, { market: 'h2h', family: 'side' }], tabMarkets), 'all');
  assert.equal(getComboTabAvailability([onTabLeg, offTabLeg], tabMarkets), 'partial');
  assert.equal(getComboTabAvailability([offTabLeg], tabMarkets), 'none');
  assert.equal(getComboTabAvailability([onTabLeg], null), 'unknown');
});
