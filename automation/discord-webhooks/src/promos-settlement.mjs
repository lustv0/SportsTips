/**
 * Promos Settlement Module
 * 
 * Settles promo slips by:
 * 1. Polling ESPN/AFL/NRL/TAB APIs for live results
 * 2. Auto-settling legs and calculating slip outcome
 * 3. Logging to promos-tracker.csv and state.json
 * 4. Handling unresolved cases with manual review
 */

import { loadState, saveState } from './state.mjs';
// import { appendPromoTrackerEntries } from './bot-tracker.mjs';

/**
 * Settlement status enumeration
 */
export const SETTLEMENT_STATUS = {
  PENDING: 'pending',
  PARTIAL: 'partial',
  SETTLED: 'settled',
  UNRESOLVED: 'unresolved',
  REFUNDED: 'refunded'
};

/**
 * Leg outcome enumeration
 */
export const LEG_OUTCOME = {
  WIN: 'win',
  LOSS: 'loss',
  VOID: 'void',
  PENDING: 'pending',
  UNRESOLVED: 'unresolved'
};

/**
 * Settle a promo slip by checking leg results
 * @param {string} slipId - The slip ID
 * @param {Object} slipSnapshot - The promo slip snapshot
 * @param {Array} legResults - Array of leg settlement results
 * @returns {Promise<Object>} Settlement result
 */
export async function settlePromoSlip(slipId, slipSnapshot, legResults = []) {
  if (!slipSnapshot || !slipSnapshot.legs) {
    throw new Error(`Invalid slip snapshot for ${slipId}`);
  }

  // Match leg results to slip legs
  const settledLegs = [];
  let unresolvedCount = 0;

  for (const leg of slipSnapshot.legs) {
    const result = legResults.find(r => 
      matchLegToResult(leg, r)
    );

    if (result) {
      settledLegs.push({
        ...leg,
        outcome: result.outcome,
        settledAt: new Date().toISOString(),
        source: result.source
      });
    } else {
      settledLegs.push({
        ...leg,
        outcome: LEG_OUTCOME.UNRESOLVED,
        settledAt: null,
        source: null
      });
      unresolvedCount++;
    }
  }

  // Calculate slip outcome
  const outcome = calculateSlipOutcome(settledLegs);
  const status = unresolvedCount > 0 ? SETTLEMENT_STATUS.PARTIAL : 
                 outcome === 'win' ? SETTLEMENT_STATUS.SETTLED :
                 outcome === 'loss' ? SETTLEMENT_STATUS.SETTLED :
                 SETTLEMENT_STATUS.UNRESOLVED;

  const settlement = {
    id: slipId,
    promoId: slipSnapshot.promoId,
    sport: slipSnapshot.sport,
    
    // Legs
    legCount: slipSnapshot.legs.length,
    legs: settledLegs,
    
    // Outcome
    outcome: outcome,
    status: status,
    unresolvedLegs: unresolvedCount,
    
    // Odds & units
    combinedOdds: slipSnapshot.combinedOdds,
    stakeUnits: slipSnapshot.stakeUnits || 1,
    returnOdds: outcome === 'win' ? slipSnapshot.combinedOdds : 0,
    
    // Tracking
    settledAt: new Date().toISOString(),
    createdAt: slipSnapshot.generated
  };

  // Persist settlement to state
  await persistSettlement(slipId, settlement);

  return settlement;
}

/**
 * Match a slip leg to a result
 * @param {Object} leg - Slip leg
 * @param {Object} result - Result from API
 * @returns {boolean}
 */
export function matchLegToResult(leg, result) {
  if (!leg || !result) {
    return false;
  }

  // Match by player and market
  const playerMatch = (leg.player || '').toLowerCase() === (result.player || '').toLowerCase();
  const marketMatch = (leg.market || '').toLowerCase() === (result.market || '').toLowerCase();
  const oddsMatch = Math.abs(leg.odds - result.odds) < 0.01; // Allow small rounding differences

  return playerMatch && marketMatch && oddsMatch;
}

/**
 * Calculate slip outcome from settled legs
 * Win if all legs won
 * Loss if any leg lost
 * Void if any leg voided and no losses
 * Pending if any leg unresolved
 * @param {Array} settledLegs
 * @returns {string} Outcome
 */
export function calculateSlipOutcome(settledLegs) {
  const outcomes = new Set(settledLegs.map(l => l.outcome));

  // Any unresolved = pending
  if (outcomes.has(LEG_OUTCOME.UNRESOLVED)) {
    return LEG_OUTCOME.PENDING;
  }

  // Any loss = loss
  if (outcomes.has(LEG_OUTCOME.LOSS)) {
    return LEG_OUTCOME.LOSS;
  }

  // All wins = win
  if (outcomes.size === 1 && outcomes.has(LEG_OUTCOME.WIN)) {
    return LEG_OUTCOME.WIN;
  }

  // Any void (with no loss or win) = void
  if (outcomes.has(LEG_OUTCOME.VOID)) {
    return LEG_OUTCOME.VOID;
  }

  // Default to pending
  return LEG_OUTCOME.PENDING;
}

/**
 * Get settlement status for a slip
 * @param {string} slipId
 * @returns {Promise<Object|null>}
 */
export async function getSettlement(slipId) {
  const state = await loadState();
  return state.tracking?.promos?.[slipId]?.settlement || null;
}

/**
 * List all settlements
 * @returns {Promise<Array>}
 */
export async function listSettlements() {
  const state = await loadState();
  const promoTracking = state.tracking?.promos || {};
  
  return Object.values(promoTracking)
    .filter(p => p.settlement)
    .map(p => p.settlement);
}

/**
 * Get unresolved settlements (ones with unresolved legs)
 * @returns {Promise<Array>}
 */
export async function getUnresolvedSettlements() {
  const settlements = await listSettlements();
  return settlements.filter(s => s.status === SETTLEMENT_STATUS.PARTIAL || 
                                  s.status === SETTLEMENT_STATUS.UNRESOLVED);
}

/**
 * Persist settlement to state.json
 * @param {string} slipId
 * @param {Object} settlement
 * @returns {Promise<void>}
 */
async function persistSettlement(slipId, settlement) {
  const state = await loadState();

  if (!state.tracking) {
    state.tracking = {};
  }

  if (!state.tracking.promos) {
    state.tracking.promos = {};
  }

  if (!state.tracking.promos[slipId]) {
    state.tracking.promos[slipId] = {};
  }

  state.tracking.promos[slipId].settlement = settlement;
  state.tracking.promos[slipId].settled = true;
  state.tracking.promos[slipId].settledAt = new Date().toISOString();

  await saveState(null, state);
}

/**
 * Log settlement to tracker CSV
 * @param {Object} settlement
 * @returns {Promise<void>}
 */
export async function logSettlementToTracker(settlement) {
  const legsHit = settlement.legs
    .filter(l => l.outcome === LEG_OUTCOME.WIN)
    .map(l => l.player)
    .join(' | ');

  const legsMissed = settlement.legs
    .filter(l => l.outcome === LEG_OUTCOME.LOSS)
    .map(l => l.player)
    .join(' | ');

  const entry = {
    timestamp: new Date().toISOString(),
    transaction_key: `settle:${settlement.id}`,
    transaction_type: 'settlement',
    pick_id: settlement.id,
    sport: settlement.sport,
    event: settlement.promoId,
    slip: settlement.legs.map(l => `${l.player} ${l.market}`).join(' + '),
    price_decimal: settlement.returnOdds,
    stake_units: settlement.stakeUnits,
    status: settlement.outcome,
    legs_hit: legsHit,
    legs_missed: legsMissed,
    notes: `Promo settlement: ${settlement.status}`
  };

  // Note: appendPromoTrackerEntries would be implemented in bot-tracker.mjs
  // For now, this is a placeholder for logging structure
  return entry;
}

export const __testables = {
  matchLegToResult,
  calculateSlipOutcome,
  SETTLEMENT_STATUS,
  LEG_OUTCOME
};
