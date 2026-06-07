/**
 * Promos Generator Module
 * 
 * Generates promo slips by:
 * 1. Loading active promos for today
 * 2. Fetching sport-specific events
 * 3. Using AI ranker to select candidate legs
 * 4. Applying research validation
 * 5. Combining legs to target odds range
 * 6. Building and storing snapshot in state
 */

import { randomUUID } from 'node:crypto';
import { loadPromoConfig, getActivePromos, validatePromoSlip } from './promos-config.mjs';
import { getResearchSummary, calculateResearchConfidence } from './promos-research.mjs';
import { loadState, saveState } from './state.mjs';

export const CONFIDENCE_THRESHOLD_MIN = 65; // Min 65% confidence
export const CONFIDENCE_THRESHOLD_PREFERRED = 75; // Prefer 75%+
const SLIP_ID_PREFIX = 'promo';

/**
 * Generate a promo slip for a specific promo
 * @param {string} promoId - The promo config ID
 * @param {Object} candidates - Pre-fetched candidate legs from AI ranker
 * @returns {Promise<Object>} Generated promo slip
 */
export async function generatePromoSlip(promoId, candidates = []) {
  const promo = await loadPromoConfig()
    .then(config => config.promos.find(p => p.id === promoId));

  if (!promo) {
    throw new Error(`Promo not found: ${promoId}`);
  }

  // Filter candidates by sport
  const sportCandidates = candidates.filter(c => 
    c.sport && c.sport.toLowerCase() === promo.sport.toLowerCase()
  );

  if (sportCandidates.length < promo.legCount) {
    throw new Error(
      `Insufficient candidates for ${promo.id}: ` +
      `need ${promo.legCount}, got ${sportCandidates.length}`
    );
  }

  // Select legs targeting the odds range
  const selectedLegs = selectLegsForOddsRange(
    sportCandidates,
    promo.legCount,
    promo.minOdds,
    promo.maxOdds
  );

  // Apply research validation
  const researchSummary = await getResearchSummary(promo.sport, selectedLegs);
  const overallConfidence = researchSummary.overallScore;

  if (overallConfidence < CONFIDENCE_THRESHOLD_MIN) {
    throw new Error(
      `Research confidence too low for ${promo.id}: ` +
      `${overallConfidence.toFixed(1)}% < ${CONFIDENCE_THRESHOLD_MIN}%`
    );
  }

  // Validate slip against promo rules
  const validation = validatePromoSlip(promo, selectedLegs);
  if (!validation.valid) {
    throw new Error(
      `Slip validation failed for ${promo.id}: ` +
      validation.errors.join('; ')
    );
  }

  // Build the slip object
  const slipId = buildSlipId(promoId);
  const slip = buildPromoSlip(
    slipId,
    promo,
    selectedLegs,
    overallConfidence,
    validation.combinedOdds
  );

  // Persist snapshot to state
  await persistPromoSnapshot(slip);

  return slip;
}

/**
 * Generate all daily promos
 * @param {Date} date - Date to generate promos for (default: today)
 * @param {Array} candidates - Pre-fetched candidates from AI ranker
 * @returns {Promise<Array>} Array of generated slips
 */
export async function generateDailyPromos(date = new Date(), candidates = []) {
  const activePromos = await getActivePromos(date);
  const slips = [];
  const errors = [];

  for (const promo of activePromos) {
    try {
      const slip = await generatePromoSlip(promo.id, candidates);
      slips.push(slip);
    } catch (err) {
      errors.push({
        promoId: promo.id,
        error: err.message
      });
    }
  }

  return { slips, errors };
}

/**
 * Select legs targeting a specific odds range
 * Greedy algorithm: pick highest-confidence legs within target range
 * @param {Array} candidates - Candidate legs with odds and confidence
 * @param {number} count - Number of legs needed
 * @param {number} minOdds - Minimum combined odds
 * @param {number} maxOdds - Maximum combined odds
 * @returns {Array} Selected legs
 */
export function selectLegsForOddsRange(candidates, count, minOdds, maxOdds) {
  // Sort by confidence descending
  const sorted = [...candidates].sort((a, b) => 
    (b.confidence || 0) - (a.confidence || 0)
  );

  // Greedy selection
  const selected = [];
  let currentOdds = 1;

  for (const candidate of sorted) {
    if (selected.length >= count) {
      break;
    }

    const newOdds = currentOdds * candidate.odds;

    // Accept if within range or helps us hit the range
    if (newOdds <= maxOdds) {
      selected.push(candidate);
      currentOdds = newOdds;
    }
  }

  // Check if we hit the minimum
  if (currentOdds < minOdds && selected.length === count) {
    // Try to swap out lowest-odds leg for higher-odds one
    const attempts = [...selected];
    for (let i = 0; i < attempts.length; i++) {
      const remaining = sorted.filter(c => !attempts.includes(c));
      for (const replacement of remaining) {
        const baseOdds = currentOdds / attempts[i].odds;
        const newOdds = baseOdds * replacement.odds;
        
        if (newOdds >= minOdds && newOdds <= maxOdds) {
          attempts[i] = replacement;
          currentOdds = newOdds;
          return attempts;
        }
      }
    }
  }

  return selected.length === count ? selected : [];
}

/**
 * Build slip ID from promo
 * Format: promo:promoId:UUID
 * @param {string} promoId
 * @returns {string}
 */
export function buildSlipId(promoId) {
  return `${SLIP_ID_PREFIX}:${promoId}:${randomUUID()}`;
}

/**
 * Build promo slip object
 * @param {string} slipId
 * @param {Object} promo - Promo config
 * @param {Array} legs - Selected legs
 * @param {number} confidence - Research confidence score (0-100)
 * @param {number} combinedOdds - Combined odds
 * @returns {Object}
 */
export function buildPromoSlip(slipId, promo, legs, confidence, combinedOdds) {
  return {
    id: slipId,
    promoId: promo.id,
    sport: promo.sport,
    type: promo.type,
    site: promo.site || 'TAB',
    market: promo.market || 'default',
    
    // Slip details
    legCount: legs.length,
    legs: legs.map(leg => ({
      id: leg.id,
      player: leg.player || leg.team,
      market: leg.market,
      odds: leg.odds,
      confidence: leg.confidence || 0
    })),
    
    // Combined outcome
    combinedOdds: combinedOdds,
    overallConfidence: confidence,
    confidenceTier: getConfidenceTier(confidence),
    
    // Validation
    meetsMinimumOdds: combinedOdds >= promo.minOdds,
    withinTargetOdds: combinedOdds >= promo.minOdds && combinedOdds <= promo.maxOdds,
    
    // Metadata
    generated: new Date().toISOString(),
    status: 'draft'
  };
}

/**
 * Get confidence tier
 * @param {number} score - 0-100 score
 * @returns {string}
 */
export function getConfidenceTier(score) {
  if (score >= 85) return 'extreme';
  if (score >= 75) return 'high';
  if (score >= 65) return 'medium';
  return 'low';
}

/**
 * Persist promo slip snapshot to state.json
 * @param {Object} slip
 * @returns {Promise<void>}
 */
async function persistPromoSnapshot(slip) {
  const state = await loadState();

  if (!state.tracking) {
    state.tracking = {};
  }

  if (!state.tracking.promos) {
    state.tracking.promos = {};
  }

  state.tracking.promos[slip.id] = {
    promoSnapshot: slip,
    createdAt: new Date().toISOString(),
    posted: false,
    settled: false
  };

  await saveState(null, state);
}

/**
 * Get generated promo slip by ID
 * @param {string} slipId
 * @returns {Promise<Object|null>}
 */
export async function getPromoSlip(slipId) {
  const state = await loadState();
  return state.tracking?.promos?.[slipId] || null;
}

/**
 * List all generated promo slips
 * @returns {Promise<Array>}
 */
export async function listPromoSlips() {
  const state = await loadState();
  const promoTracking = state.tracking?.promos || {};
  return Object.values(promoTracking);
}

export const __testables = {
  selectLegsForOddsRange,
  buildSlipId,
  buildPromoSlip,
  getConfidenceTier
};
