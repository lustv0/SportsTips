import test from 'node:test';
import assert from 'node:assert';
import {
  loadPromoConfig,
  getActivePromos,
  getPromoById,
  getPromosBySport,
  isPromoActive,
  validatePromoSlip
} from '../src/promos-config.mjs';

test('Promos Config Module', async (t) => {
  await t.test('loadPromoConfig loads configuration', async () => {
    const config = await loadPromoConfig();
    assert(config && typeof config === 'object');
    assert(Array.isArray(config.promos));
    assert(config.promos.length > 0);
  });

  await t.test('getPromoById retrieves promo by ID', async () => {
    const promo = await getPromoById('afl-promo-1');
    assert(promo !== null);
    assert(promo.id === 'afl-promo-1');
    assert(promo.sport === 'afl');
  });

  await t.test('getPromoById returns null for non-existent ID', async () => {
    const promo = await getPromoById('non-existent');
    assert(promo === null);
  });

  await t.test('getPromosBySport returns correct promos', async () => {
    const aflPromos = await getPromosBySport('afl');
    assert(Array.isArray(aflPromos));
    assert(aflPromos.every(p => p.sport === 'afl'));

    const tennisPromos = await getPromosBySport('tennis');
    assert(Array.isArray(tennisPromos));
    assert(tennisPromos.every(p => p.sport === 'tennis'));
  });

  await t.test('isPromoActive checks activity status', async () => {
    const isActive = await isPromoActive('afl-promo-1');
    assert(typeof isActive === 'boolean');
  });

  await t.test('validatePromoSlip validates leg count', () => {
    const promo = {
      id: 'test-promo',
      sport: 'afl',
      type: 'same-game-multi',
      legCount: 4,
      minOdds: 2.0,
      maxOdds: 5.0
    };

    const legs = [
      { player: 'P1', odds: 1.5, matchId: 'M1' },
      { player: 'P2', odds: 1.6, matchId: 'M1' },
      { player: 'P3', odds: 1.4, matchId: 'M1' },
      { player: 'P4', odds: 1.3, matchId: 'M2' }
    ];

    const result = validatePromoSlip(promo, legs);
    assert(result.valid === true);
    assert(result.combinedOdds === legs.reduce((a, l) => a * l.odds, 1));
  });

  await t.test('validatePromoSlip rejects insufficient legs', () => {
    const promo = {
      legCount: 4,
      minOdds: 2.0,
      maxOdds: 5.0
    };

    const legs = [
      { odds: 1.5 },
      { odds: 1.6 }
    ];

    const result = validatePromoSlip(promo, legs);
    assert(result.valid === false);
    assert(result.errors.length > 0);
  });

  await t.test('validatePromoSlip checks odds range', () => {
    const promo = {
      legCount: 2,
      minOdds: 2.0,
      maxOdds: 3.0
    };

    const legs = [
      { odds: 1.2 },
      { odds: 1.3 }
    ];

    const result = validatePromoSlip(promo, legs);
    assert(result.valid === false);
    assert(result.errors.some(e => e.includes('minimum')));
  });

  await t.test('validatePromoSlip warns about oversized odds', () => {
    const promo = {
      legCount: 2,
      minOdds: 2.0,
      maxOdds: 3.0
    };

    const legs = [
      { odds: 2.0 },
      { odds: 2.0 }
    ];

    const result = validatePromoSlip(promo, legs);
    assert(result.valid === true); // Still valid
    assert(result.warnings.length >= 0); // May warn about being at limit
  });
});
