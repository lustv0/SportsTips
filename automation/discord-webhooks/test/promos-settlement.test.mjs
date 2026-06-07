import test from 'node:test';
import assert from 'node:assert';
import {
  matchLegToResult,
  calculateSlipOutcome,
  LEG_OUTCOME,
  SETTLEMENT_STATUS
} from '../src/promos-settlement.mjs';

test('Promos Settlement Module', async (t) => {
  await t.test('matchLegToResult matches correct leg', () => {
    const leg = {
      player: 'Sam Walsh',
      market: 'disposals',
      odds: 1.50
    };

    const result = {
      player: 'Sam Walsh',
      market: 'disposals',
      odds: 1.50,
      outcome: 'win',
      source: 'ESPN'
    };

    const matches = matchLegToResult(leg, result);
    assert.equal(matches, true);
  });

  await t.test('matchLegToResult is case-insensitive', () => {
    const leg = {
      player: 'SAM WALSH',
      market: 'DISPOSALS',
      odds: 1.50
    };

    const result = {
      player: 'sam walsh',
      market: 'disposals',
      odds: 1.50
    };

    const matches = matchLegToResult(leg, result);
    assert.equal(matches, true);
  });

  await t.test('matchLegToResult allows small odds differences', () => {
    const leg = {
      player: 'Player A',
      market: 'market-1',
      odds: 1.50
    };

    const result = {
      player: 'Player A',
      market: 'market-1',
      odds: 1.5001
    };

    const matches = matchLegToResult(leg, result);
    assert.equal(matches, true);
  });

  await t.test('matchLegToResult rejects mismatched player', () => {
    const leg = {
      player: 'Player A',
      market: 'market-1',
      odds: 1.50
    };

    const result = {
      player: 'Player B',
      market: 'market-1',
      odds: 1.50
    };

    const matches = matchLegToResult(leg, result);
    assert.equal(matches, false);
  });

  await t.test('calculateSlipOutcome returns win for all wins', () => {
    const legs = [
      { outcome: LEG_OUTCOME.WIN },
      { outcome: LEG_OUTCOME.WIN },
      { outcome: LEG_OUTCOME.WIN }
    ];

    const outcome = calculateSlipOutcome(legs);
    assert.equal(outcome, LEG_OUTCOME.WIN);
  });

  await t.test('calculateSlipOutcome returns loss if any leg loses', () => {
    const legs = [
      { outcome: LEG_OUTCOME.WIN },
      { outcome: LEG_OUTCOME.LOSS },
      { outcome: LEG_OUTCOME.WIN }
    ];

    const outcome = calculateSlipOutcome(legs);
    assert.equal(outcome, LEG_OUTCOME.LOSS);
  });

  await t.test('calculateSlipOutcome returns pending if unresolved leg exists', () => {
    const legs = [
      { outcome: LEG_OUTCOME.WIN },
      { outcome: LEG_OUTCOME.UNRESOLVED },
      { outcome: LEG_OUTCOME.WIN }
    ];

    const outcome = calculateSlipOutcome(legs);
    assert.equal(outcome, LEG_OUTCOME.PENDING);
  });

  await t.test('calculateSlipOutcome handles void legs', () => {
    const legs = [
      { outcome: LEG_OUTCOME.WIN },
      { outcome: LEG_OUTCOME.VOID },
      { outcome: LEG_OUTCOME.WIN }
    ];

    const outcome = calculateSlipOutcome(legs);
    assert.equal(outcome, LEG_OUTCOME.VOID);
  });

  await t.test('calculateSlipOutcome returns pending for single unresolved', () => {
    const legs = [
      { outcome: LEG_OUTCOME.UNRESOLVED }
    ];

    const outcome = calculateSlipOutcome(legs);
    assert.equal(outcome, LEG_OUTCOME.PENDING);
  });

  await t.test('LEG_OUTCOME constants are defined', () => {
    assert(LEG_OUTCOME.WIN);
    assert(LEG_OUTCOME.LOSS);
    assert(LEG_OUTCOME.VOID);
    assert(LEG_OUTCOME.PENDING);
    assert(LEG_OUTCOME.UNRESOLVED);
  });

  await t.test('SETTLEMENT_STATUS constants are defined', () => {
    assert(SETTLEMENT_STATUS.PENDING);
    assert(SETTLEMENT_STATUS.PARTIAL);
    assert(SETTLEMENT_STATUS.SETTLED);
    assert(SETTLEMENT_STATUS.UNRESOLVED);
    assert(SETTLEMENT_STATUS.REFUNDED);
  });
});
