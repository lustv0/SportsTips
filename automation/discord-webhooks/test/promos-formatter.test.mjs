import test from 'node:test';
import assert from 'node:assert';
import {
  buildPromoEmbedMessage,
  buildSettlementEmbedMessage,
  buildDailyPromoReport,
  buildGeneratedSection,
  buildSettlementSection,
  buildStatsSection,
  getColorForConfidence,
  formatSlipStatus
} from '../src/promos-formatter.mjs';

test('Promos Formatter Module', async (t) => {
  await t.test('buildPromoEmbedMessage creates valid embed', () => {
    const slip = {
      sport: 'afl',
      promoId: 'afl-promo-1',
      type: 'same-game-multi',
      combinedOdds: 2.5,
      overallConfidence: 78,
      confidenceTier: 'high',
      generated: new Date().toISOString(),
      meetsMinimumOdds: true,
      withinTargetOdds: true,
      legs: [
        { player: 'Sam Walsh', market: 'disposals', odds: 1.5 },
        { player: 'Clayton Oliver', market: 'disposals', odds: 1.67 }
      ]
    };

    const embed = buildPromoEmbedMessage(slip);
    assert(embed.title);
    assert(embed.fields);
    assert(embed.color);
    assert.equal(embed.fields.length, 4);
  });

  await t.test('buildPromoEmbedMessage throws on invalid slip', () => {
    assert.throws(() => {
      buildPromoEmbedMessage(null);
    });
  });

  await t.test('buildSettlementEmbedMessage creates valid embed', () => {
    const settlement = {
      sport: 'afl',
      promoId: 'afl-promo-1',
      outcome: 'win',
      status: 'settled',
      combinedOdds: 2.5,
      stakeUnits: 1,
      settledAt: new Date().toISOString(),
      unresolvedLegs: 0,
      legCount: 2,
      legs: [
        { player: 'Sam Walsh', market: 'disposals', outcome: 'win' },
        { player: 'Clayton Oliver', market: 'disposals', outcome: 'win' }
      ]
    };

    const embed = buildSettlementEmbedMessage(settlement);
    assert(embed.title);
    assert(embed.description);
    assert(embed.fields);
    assert(embed.color === 0x00AA00); // Green for win
  });

  await t.test('buildSettlementEmbedMessage uses correct color for loss', () => {
    const settlement = {
      sport: 'afl',
      outcome: 'loss',
      status: 'settled',
      combinedOdds: 2.5,
      stakeUnits: 1,
      settledAt: new Date().toISOString(),
      unresolvedLegs: 0,
      legCount: 1,
      legs: [{ player: 'P1', market: 'm1', outcome: 'loss' }]
    };

    const embed = buildSettlementEmbedMessage(settlement);
    assert.equal(embed.color, 0xAA0000); // Red for loss
  });

  await t.test('buildDailyPromoReport includes sections', () => {
    const slips = [
      {
        sport: 'afl',
        promoId: 'afl-promo-1',
        combinedOdds: 2.5,
        overallConfidence: 78,
        legs: [
          { player: 'Player A', odds: 1.5 },
          { player: 'Player B', odds: 1.67 }
        ]
      }
    ];

    const settlements = [
      {
        sport: 'afl',
        promoId: 'afl-promo-1',
        outcome: 'win',
        combinedOdds: 2.5,
        stakeUnits: 1
      }
    ];

    const report = buildDailyPromoReport(slips, settlements);
    assert(report.includes('Generated Promos'));
    assert(report.includes('Settlements'));
    assert(report.includes('Statistics'));
  });

  await t.test('buildGeneratedSection formats slips correctly', () => {
    const slips = [
      {
        sport: 'afl',
        promoId: 'afl-promo-1',
        combinedOdds: 2.5,
        overallConfidence: 78,
        legs: [
          { player: 'Player A', odds: 1.5 },
          { player: 'Player B', odds: 1.67 }
        ]
      }
    ];

    const section = buildGeneratedSection(slips);
    assert(section.includes('afl-promo-1'));
    assert(section.includes('2.50x'));
    assert(section.includes('78%'));
  });

  await t.test('buildGeneratedSection handles empty slips', () => {
    const section = buildGeneratedSection([]);
    assert(section.includes('No promos generated'));
  });

  await t.test('buildSettlementSection calculates win/loss count', () => {
    const settlements = [
      { outcome: 'win', promoId: 'p1', combinedOdds: 2.5 },
      { outcome: 'win', promoId: 'p2', combinedOdds: 2.0 },
      { outcome: 'loss', promoId: 'p3', combinedOdds: 1.5 },
      { outcome: 'pending', promoId: 'p4', combinedOdds: 1.8 }
    ];

    const section = buildSettlementSection(settlements);
    assert(section.includes('**Wins:** 2'));
    assert(section.includes('**Losses:** 1'));
    assert(section.includes('**Pending:** 1'));
  });

  await t.test('buildStatsSection calculates ROI correctly', () => {
    const settlements = [
      { outcome: 'win', stakeUnits: 1, combinedOdds: 2.0 },
      { outcome: 'loss', stakeUnits: 1, combinedOdds: 2.0 }
    ];

    const section = buildStatsSection([], settlements);
    assert(section.includes('Win Rate'));
    assert(section.includes('Total Stake'));
    assert(section.includes('ROI'));
  });

  await t.test('getColorForConfidence returns correct colors', () => {
    assert.equal(getColorForConfidence(90), 0x00DD00); // Green
    assert.equal(getColorForConfidence(78), 0x00AA00); // Dark green
    assert.equal(getColorForConfidence(70), 0xAAAA00); // Yellow
    assert.equal(getColorForConfidence(50), 0xAA5500); // Orange
  });

  await t.test('formatSlipStatus checks odds range', () => {
    const belowMin = {
      meetsMinimumOdds: false,
      withinTargetOdds: false
    };
    const status1 = formatSlipStatus(belowMin);
    assert(status1.includes('Below Minimum'));

    const aboveMax = {
      meetsMinimumOdds: true,
      withinTargetOdds: false
    };
    const status2 = formatSlipStatus(aboveMax);
    assert(status2.includes('Above Target'));

    const ok = {
      meetsMinimumOdds: true,
      withinTargetOdds: true
    };
    const status3 = formatSlipStatus(ok);
    assert(status3.includes('Within Range'));
  });
});
