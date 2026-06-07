/**
 * Promos Formatter Module
 * 
 * Formats promo slips and settlements for:
 * 1. Discord embed messages (#promos channel)
 * 2. Daily promo summary reports
 * 3. Settlement confirmation messages
 */

/**
 * Build Discord embed for a promo slip
 * @param {Object} slip - Promo slip object
 * @returns {Object} Discord embed
 */
export function buildPromoEmbedMessage(slip) {
  if (!slip || !slip.legs) {
    throw new Error('Invalid slip for embed formatting');
  }

  const legsList = slip.legs
    .map((leg, idx) => `${idx + 1}. **${leg.player}** — ${leg.market} @ ${leg.odds}x`)
    .join('\n');

  const embed = {
    title: `${slip.sport.toUpperCase()} Promo Slip`,
    description: `**Promo:** ${slip.promoId}\n**Type:** ${slip.type}`,
    color: getColorForConfidence(slip.overallConfidence),
    fields: [
      {
        name: 'Legs',
        value: legsList || 'No legs',
        inline: false
      },
      {
        name: 'Odds',
        value: `${slip.combinedOdds.toFixed(2)}x`,
        inline: true
      },
      {
        name: 'Research Confidence',
        value: `${slip.overallConfidence.toFixed(0)}% — ${slip.confidenceTier}`,
        inline: true
      },
      {
        name: 'Status',
        value: formatSlipStatus(slip),
        inline: true
      }
    ],
    footer: {
      text: `Generated: ${new Date(slip.generated).toLocaleString()}`
    }
  };

  return embed;
}

/**
 * Build Discord embed for a settlement
 * @param {Object} settlement - Settlement result
 * @returns {Object} Discord embed
 */
export function buildSettlementEmbedMessage(settlement) {
  if (!settlement || !settlement.legs) {
    throw new Error('Invalid settlement for embed formatting');
  }

  const legsDisplay = settlement.legs
    .map(leg => {
      const icon = leg.outcome === 'win' ? '✅' : 
                   leg.outcome === 'loss' ? '❌' :
                   leg.outcome === 'void' ? '⭕' : '❓';
      return `${icon} **${leg.player}** — ${leg.market} (${leg.outcome})`;
    })
    .join('\n');

  const outcomeColor = settlement.outcome === 'win' ? 0x00AA00 :
                       settlement.outcome === 'loss' ? 0xAA0000 : 0xAAAA00;

  const embed = {
    title: `${settlement.sport.toUpperCase()} Promo Settled`,
    description: `**Result:** ${settlement.outcome.toUpperCase()}`,
    color: outcomeColor,
    fields: [
      {
        name: 'Legs',
        value: legsDisplay || 'No legs',
        inline: false
      },
      {
        name: 'Outcome',
        value: `${settlement.outcome.toUpperCase()} — ${settlement.status}`,
        inline: true
      },
      {
        name: 'Odds',
        value: `${settlement.combinedOdds.toFixed(2)}x`,
        inline: true
      },
      {
        name: 'Return',
        value: settlement.outcome === 'win' ?
          `${(settlement.stakeUnits * settlement.combinedOdds).toFixed(2)}u` :
          '0u',
        inline: true
      }
    ],
    footer: {
      text: `Settled: ${new Date(settlement.settledAt).toLocaleString()}`
    }
  };

  if (settlement.unresolvedLegs > 0) {
    embed.fields.push({
      name: 'Unresolved Legs',
      value: `${settlement.unresolvedLegs} / ${settlement.legCount}`,
      inline: false
    });
  }

  return embed;
}

/**
 * Build daily promo summary
 * @param {Array} slips - Generated slips for the day
 * @param {Array} settlements - Settled slips from the day
 * @returns {string} Markdown report
 */
export function buildDailyPromoReport(slips = [], settlements = []) {
  const date = new Date().toISOString().split('T')[0];
  const header = `# Promo Report — ${date}\n\n`;

  // Generated section
  const generatedSection = buildGeneratedSection(slips);

  // Settlement section
  const settlementSection = buildSettlementSection(settlements);

  // Stats section
  const statsSection = buildStatsSection(slips, settlements);

  return header + generatedSection + settlementSection + statsSection;
}

/**
 * Build generated slips section
 * @param {Array} slips
 * @returns {string}
 */
export function buildGeneratedSection(slips = []) {
  if (slips.length === 0) {
    return '## Generated Promos\n\nNo promos generated today.\n\n';
  }

  const byPromo = {};
  for (const slip of slips) {
    if (!byPromo[slip.promoId]) {
      byPromo[slip.promoId] = [];
    }
    byPromo[slip.promoId].push(slip);
  }

  let section = `## Generated Promos (${slips.length})\n\n`;

  for (const [promoId, promoSlips] of Object.entries(byPromo)) {
    section += `### ${promoId}\n`;
    for (const slip of promoSlips) {
      const legs = slip.legs.map(l => `${l.player} (${l.odds}x)`).join(', ');
      section += `- **${slip.combinedOdds.toFixed(2)}x** | ${legs} | Confidence: ${slip.overallConfidence.toFixed(0)}%\n`;
    }
    section += '\n';
  }

  return section;
}

/**
 * Build settlement section
 * @param {Array} settlements
 * @returns {string}
 */
export function buildSettlementSection(settlements = []) {
  if (settlements.length === 0) {
    return '## Settlements\n\nNo promos settled yet.\n\n';
  }

  const wins = settlements.filter(s => s.outcome === 'win').length;
  const losses = settlements.filter(s => s.outcome === 'loss').length;
  const pending = settlements.filter(s => s.outcome === 'pending').length;

  let section = `## Settlements (${settlements.length})\n\n`;
  section += `- ✅ **Wins:** ${wins}\n`;
  section += `- ❌ **Losses:** ${losses}\n`;
  section += `- ❓ **Pending:** ${pending}\n\n`;

  section += '### Details\n';
  for (const settlement of settlements) {
    const icon = settlement.outcome === 'win' ? '✅' : 
                 settlement.outcome === 'loss' ? '❌' : '❓';
    section += `- ${icon} **${settlement.promoId}** — ${settlement.outcome.toUpperCase()} @ ${settlement.combinedOdds.toFixed(2)}x\n`;
  }
  section += '\n';

  return section;
}

/**
 * Build stats section
 * @param {Array} slips
 * @param {Array} settlements
 * @returns {string}
 */
export function buildStatsSection(slips = [], settlements = []) {
  if (settlements.length === 0) {
    return '## Statistics\n\nNo settlements to analyze.\n';
  }

  const wins = settlements.filter(s => s.outcome === 'win');
  const losses = settlements.filter(s => s.outcome === 'loss');
  const winRate = wins.length / settlements.length * 100;
  const totalStake = settlements.reduce((sum, s) => sum + s.stakeUnits, 0);
  const totalReturn = wins.reduce((sum, s) => sum + s.stakeUnits * s.combinedOdds, 0);
  const roi = totalReturn > 0 ? ((totalReturn - totalStake) / totalStake * 100) : 0;

  let section = '## Statistics\n\n';
  section += `- **Win Rate:** ${winRate.toFixed(1)}% (${wins.length}/${settlements.length})\n`;
  section += `- **Total Stake:** ${totalStake.toFixed(2)}u\n`;
  section += `- **Total Return:** ${totalReturn.toFixed(2)}u\n`;
  section += `- **ROI:** ${roi > 0 ? '+' : ''}${roi.toFixed(1)}%\n`;

  return section;
}

/**
 * Get color for confidence level
 * @param {number} confidence - 0-100 score
 * @returns {number} Decimal color code
 */
export function getColorForConfidence(confidence) {
  if (confidence >= 85) {
    return 0x00DD00; // Green - extreme
  }
  if (confidence >= 75) {
    return 0x00AA00; // Dark green - high
  }
  if (confidence >= 65) {
    return 0xAAAA00; // Yellow - medium
  }
  return 0xAA5500; // Orange - low
}

/**
 * Format slip status
 * @param {Object} slip
 * @returns {string}
 */
export function formatSlipStatus(slip) {
  if (!slip.meetsMinimumOdds) {
    return '⚠️ Below Minimum Odds';
  }
  if (!slip.withinTargetOdds) {
    return '⚠️ Above Target Odds';
  }
  return '✅ Within Range';
}

export const __testables = {
  buildGeneratedSection,
  buildSettlementSection,
  buildStatsSection,
  getColorForConfidence,
  formatSlipStatus
};
