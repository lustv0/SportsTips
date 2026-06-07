import test from 'node:test';
import assert from 'node:assert';
import {
  selectLegsForOddsRange,
  buildSlipId,
  buildPromoSlip,
  getConfidenceTier,
  CONFIDENCE_THRESHOLD_MIN,
  CONFIDENCE_THRESHOLD_PREFERRED
} from '../src/promos-generator.mjs';

test('Promos Generator Module', async (t) => {
  await t.test('selectLegsForOddsRange selects correct leg count', () => {
    const candidates = [
      { id: '1', odds: 1.5, confidence: 80 },
      { id: '2', odds: 1.6, confidence: 75 },
      { id: '3', odds: 1.4, confidence: 70 },
      { id: '4', odds: 1.3, confidence: 65 },
      { id: '5', odds: 1.2, confidence: 60 }
    ];

    const selected = selectLegsForOddsRange(candidates, 3, 2.0, 5.0);
    assert.equal(selected.length, 3);
  });

  await t.test('selectLegsForOddsRange respects odds range', () => {
    const candidates = [
      { id: '1', odds: 2.0, confidence: 80 },
      { id: '2', odds: 2.5, confidence: 75 },
      { id: '3', odds: 1.0, confidence: 70 }
    ];

    const selected = selectLegsForOddsRange(candidates, 2, 2.0, 5.0);
    const combined = selected.reduce((a, l) => a * l.odds, 1);
    assert(combined >= 2.0 && combined <= 5.0, `Combined odds ${combined} out of range`);
  });

  await t.test('selectLegsForOddsRange prioritizes high confidence', () => {
    const candidates = [
      { id: '1', odds: 1.5, confidence: 95 },
      { id: '2', odds: 1.6, confidence: 50 },
      { id: '3', odds: 1.4, confidence: 80 }
    ];

    const selected = selectLegsForOddsRange(candidates, 2, 1.5, 5.0);
    assert(selected.some(l => l.id === '1'), 'Should select high confidence leg');
  });

  await t.test('buildSlipId creates valid ID', () => {
    const id = buildSlipId('test-promo');
    assert(id.startsWith('promo:test-promo:'));
    assert(id.split(':').length === 3);
  });

  await t.test('buildPromoSlip creates valid slip object', () => {
    const promo = {
      id: 'test-promo',
      sport: 'afl',
      type: 'same-game-multi',
      site: 'TAB',
      market: 'player-props',
      minOdds: 2.0,
      maxOdds: 5.0
    };

    const legs = [
      { id: '1', player: 'Player A', market: 'disposals', odds: 1.5, confidence: 80 },
      { id: '2', player: 'Player B', market: 'disposals', odds: 1.4, confidence: 75 }
    ];

    const slip = buildPromoSlip('test-id', promo, legs, 77, 2.1);
    
    assert.equal(slip.id, 'test-id');
    assert.equal(slip.promoId, 'test-promo');
    assert.equal(slip.sport, 'afl');
    assert.equal(slip.legCount, 2);
    assert.equal(slip.combinedOdds, 2.1);
    assert.equal(slip.overallConfidence, 77);
  });

  await t.test('getConfidenceTier classifies correctly', () => {
    assert.equal(getConfidenceTier(90), 'extreme');
    assert.equal(getConfidenceTier(75), 'high');
    assert.equal(getConfidenceTier(70), 'medium');
    assert.equal(getConfidenceTier(50), 'low');
  });

  await t.test('CONFIDENCE_THRESHOLD_MIN is 65', () => {
    assert.equal(CONFIDENCE_THRESHOLD_MIN, 65);
  });

  await t.test('CONFIDENCE_THRESHOLD_PREFERRED is 75', () => {
    assert.equal(CONFIDENCE_THRESHOLD_PREFERRED, 75);
  });

  await t.test('selectLegsForOddsRange returns empty array if insufficient legs', () => {
    const candidates = [
      { id: '1', odds: 10.0, confidence: 80 }
    ];

    const selected = selectLegsForOddsRange(candidates, 3, 2.0, 5.0);
    assert.equal(selected.length, 0);
  });

  await t.test('buildPromoSlip validates odds range correctly', () => {
    const promo = {
      id: 'test-promo',
      sport: 'afl',
      type: 'same-game-multi',
      minOdds: 2.0,
      maxOdds: 5.0
    };

    const legs = [
      { id: '1', odds: 1.5, confidence: 80 },
      { id: '2', odds: 1.6, confidence: 75 }
    ];

    const slip = buildPromoSlip('test-id', promo, legs, 77, 2.4);
    
    assert.equal(slip.meetsMinimumOdds, true);
    assert.equal(slip.withinTargetOdds, true);
  });

  await t.test('buildPromoSlip rejects slip outside odds range', () => {
    const promo = {
      id: 'test-promo',
      sport: 'afl',
      minOdds: 2.0,
      maxOdds: 5.0
    };

    const legs = [
      { id: '1', odds: 1.5, confidence: 80 }
    ];

    // Too low odds
    const slipLow = buildPromoSlip('test-id', promo, legs, 77, 1.5);
    assert.equal(slipLow.meetsMinimumOdds, false);

    // Too high odds
    const slipHigh = buildPromoSlip('test-id', promo, legs, 77, 6.0);
    assert.equal(slipHigh.withinTargetOdds, false);
  });
});
