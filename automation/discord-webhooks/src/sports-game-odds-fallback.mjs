import { fetchSportsGameOddsUsage } from './providers/sports-game-odds.mjs';

function toNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function isFresh(isoString, ttlMinutes) {
  if (!isoString) {
    return false;
  }

  const timestamp = new Date(isoString).getTime();
  return Number.isFinite(timestamp) && Date.now() - timestamp <= ttlMinutes * 60_000;
}

export function getSportsGameOddsProviderState(state) {
  state.providers ??= {};
  state.providers.sportsGameOdds ??= {};
  return state.providers.sportsGameOdds;
}

export function getSportsGameOddsLeagueId(config, sportKey) {
  return config.sports.find((sport) => sport.key === sportKey || sport.marketKey === sportKey)?.sportsGameOddsLeagueId || '';
}

export function recordSportsGameOddsUsage(state, result = {}) {
  const providerState = getSportsGameOddsProviderState(state);
  const monthlyObjectsMax = toNumber(result.monthlyObjectsMax);
  const monthlyObjectsUsed = toNumber(result.monthlyObjectsUsed);
  const monthlyObjectsRemaining = toNumber(result.monthlyObjectsRemaining);
  const objectCost = toNumber(result.objectCost);

  if (monthlyObjectsMax !== null) {
    providerState.monthlyObjectsMax = monthlyObjectsMax;
  }

  if (monthlyObjectsUsed !== null) {
    providerState.monthlyObjectsUsed = monthlyObjectsUsed;
  }

  if (monthlyObjectsRemaining !== null) {
    providerState.monthlyObjectsRemaining = monthlyObjectsRemaining;
  } else if (objectCost !== null && providerState.monthlyObjectsRemaining !== undefined) {
    providerState.monthlyObjectsRemaining = Math.max(0, Number(providerState.monthlyObjectsRemaining || 0) - objectCost);
  }

  if (objectCost !== null) {
    providerState.lastObjectCost = objectCost;

    if (providerState.monthlyObjectsUsed !== undefined && monthlyObjectsUsed === null) {
      providerState.monthlyObjectsUsed = Number(providerState.monthlyObjectsUsed || 0) + objectCost;
    }
  }

  providerState.lastStatus = result.status || providerState.lastStatus || null;
  providerState.lastCheckedAt = new Date().toISOString();

  if (result.status === 'ok' && monthlyObjectsRemaining !== null) {
    providerState.lastUsageAt = providerState.lastCheckedAt;
  }

  if (result.error) {
    providerState.lastUsageError = String(result.error);
  }

  return providerState;
}

export async function canUseSportsGameOdds(context, purpose) {
  const { config, state } = context;

  if (!config.sportsGameOdds?.enabled || !config.sportsGameOdds?.apiKey) {
    return false;
  }

  if (purpose === 'picks' && !config.sportsGameOdds.useForPicksWhenSnapshotMissing) {
    return false;
  }

  if (purpose === 'slates' && !config.sportsGameOdds.useForSlatesWhenScrapeMissing) {
    return false;
  }

  const providerState = getSportsGameOddsProviderState(state);

  if (!isFresh(providerState.lastUsageAt, config.sportsGameOdds.usageTtlMinutes)) {
    try {
      const usage = await fetchSportsGameOddsUsage(config.sportsGameOdds);
      recordSportsGameOddsUsage(state, usage);
    } catch (error) {
      recordSportsGameOddsUsage(state, {
        status: 'usage_error',
        error: error.message
      });
    }
  }

  const remaining = toNumber(providerState.monthlyObjectsRemaining);

  if (remaining !== null && remaining <= Number(config.sportsGameOdds.reserveObjects || 0)) {
    return false;
  }

  return true;
}