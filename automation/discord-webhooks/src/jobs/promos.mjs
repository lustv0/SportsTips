/**
 * Promos Job - Daemon Integration
 * 
 * Handles scheduled promo generation and settlement:
 * 1. Daily promo slip generation at configured times
 * 2. Continuous settlement checking throughout the day
 * 3. Discord posting of slips and settlements
 * 4. Report generation and logging
 */

import { loadPromoConfig, getActivePromos } from '../promos-config.mjs';
import { generateDailyPromos, generatePromoSlip } from '../promos-generator.mjs';
import { settlePromoSlip, getUnresolvedSettlements, SETTLEMENT_STATUS } from '../promos-settlement.mjs';
import { buildPromoEmbedMessage, buildSettlementEmbedMessage, buildDailyPromoReport } from '../promos-formatter.mjs';
import { sendWebhookMessage } from '../discord.mjs';
import { loadState } from '../state.mjs';

/**
 * Daily promo generation job
 * Called once per day to generate new promo slips
 * @param {Object} config - Daemon configuration
 * @returns {Promise<Object>} Job result
 */
export async function runPromoGenerationJob(config = {}) {
  const startTime = Date.now();
  const result = {
    jobType: 'promo-generation',
    startedAt: new Date().toISOString(),
    slipsGenerated: 0,
    errors: []
  };

  try {
    // Load active promos for today
    const activePromos = await getActivePromos();
    
    if (activePromos.length === 0) {
      result.message = 'No active promos for today';
      result.duration = Date.now() - startTime;
      return result;
    }

    // Generate promos (candidates would come from existing AI ranker)
    // For now, this is a stub that shows the structure
    const candidates = []; // Would be populated by fetchCandidateLegs()

    for (const promo of activePromos) {
      try {
        const slip = await generatePromoSlip(promo.id, candidates);
        result.slipsGenerated++;

        // Format and post to Discord
        if (config.promosWebhookUrl) {
          const embed = buildPromoEmbedMessage(slip);
          await sendWebhookMessage(config.promosWebhookUrl, {
            content: `🎯 **New Promo:** ${promo.id}`,
            embeds: [embed]
          });
        }

        console.log(`[promos-job] Generated promo slip: ${slip.id}`);
      } catch (err) {
        result.errors.push({
          promoId: promo.id,
          error: err.message
        });
        console.error(`[promos-job] Failed to generate promo: ${err.message}`);
      }
    }

    result.message = `Generated ${result.slipsGenerated} promo slips`;
    result.succeeded = true;
  } catch (err) {
    result.error = err.message;
    result.succeeded = false;
    console.error(`[promos-job] Job failed: ${err.message}`);
  }

  result.duration = Date.now() - startTime;
  return result;
}

/**
 * Promo settlement job
 * Called periodically throughout the day to settle results
 * @param {Object} config - Daemon configuration
 * @returns {Promise<Object>} Job result
 */
export async function runPromoSettlementJob(config = {}) {
  const startTime = Date.now();
  const result = {
    jobType: 'promo-settlement',
    startedAt: new Date().toISOString(),
    slipsSettled: 0,
    errors: [],
    unresolved: []
  };

  try {
    // Get all unresolved promos from state
    const state = await loadState();
    const promoTracking = state.tracking?.promos || {};
    
    const unresolved = Object.values(promoTracking)
      .filter(p => p.settlement && p.settlement.status === SETTLEMENT_STATUS.PARTIAL);

    if (unresolved.length === 0) {
      result.message = 'No unsettled promos to process';
      result.duration = Date.now() - startTime;
      return result;
    }

    // Attempt to settle each unresolved promo
    for (const promoData of unresolved) {
      try {
        const settlement = promoData.settlement;
        
        // Fetch live results (stub - would call ESPN/AFL/NRL APIs)
        const legResults = []; // Would be populated by fetchLiveResults()
        
        // Re-settle with updated results
        const updated = await settlePromoSlip(settlement.id, promoData.promoSnapshot, legResults);
        result.slipsSettled++;

        // Post settlement to Discord if complete
        if (updated.status === SETTLEMENT_STATUS.SETTLED && config.promosWebhookUrl) {
          const embed = buildSettlementEmbedMessage(updated);
          await sendWebhookMessage(config.promosWebhookUrl, {
            content: `📊 **Promo Settled:** ${updated.outcome.toUpperCase()}`,
            embeds: [embed]
          });
        }

        console.log(`[promos-job] Settled promo: ${settlement.id}`);
      } catch (err) {
        result.errors.push({
          slipId: promoData.settlement?.id,
          error: err.message
        });
        console.error(`[promos-job] Settlement failed: ${err.message}`);
      }
    }

    // Track remaining unresolved
    const stillUnresolved = await getUnresolvedSettlements();
    result.unresolved = stillUnresolved.length;
    result.message = `Settled ${result.slipsSettled} promos, ${result.unresolved} still unresolved`;
    result.succeeded = true;
  } catch (err) {
    result.error = err.message;
    result.succeeded = false;
    console.error(`[promos-job] Settlement job failed: ${err.message}`);
  }

  result.duration = Date.now() - startTime;
  return result;
}

/**
 * Daily report generation job
 * Called at end of day to generate summary report
 * @param {Object} config - Daemon configuration
 * @returns {Promise<Object>} Job result
 */
export async function runPromoReportJob(config = {}) {
  const startTime = Date.now();
  const result = {
    jobType: 'promo-report',
    startedAt: new Date().toISOString()
  };

  try {
    // Get generated and settled slips for the day
    const state = await loadState();
    const promoTracking = state.tracking?.promos || {};

    const slips = Object.values(promoTracking)
      .filter(p => p.promoSnapshot)
      .map(p => p.promoSnapshot);

    const settlements = Object.values(promoTracking)
      .filter(p => p.settlement)
      .map(p => p.settlement);

    // Build daily report
    const report = buildDailyPromoReport(slips, settlements);

    // Post report to Discord
    if (config.promosWebhookUrl && report) {
      await sendWebhookMessage(config.promosWebhookUrl, {
        content: `📋 **Daily Promo Report**\n\`\`\`\n${report}\n\`\`\``
      });
    }

    result.message = 'Daily report generated and posted';
    result.slipsCount = slips.length;
    result.settlementsCount = settlements.length;
    result.succeeded = true;
  } catch (err) {
    result.error = err.message;
    result.succeeded = false;
    console.error(`[promos-job] Report job failed: ${err.message}`);
  }

  result.duration = Date.now() - startTime;
  return result;
}

export const __testables = {
  runPromoGenerationJob,
  runPromoSettlementJob,
  runPromoReportJob
};
