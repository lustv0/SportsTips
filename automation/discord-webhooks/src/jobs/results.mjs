import {
  appendPostedTrackerEntries,
  appendSettlementTrackerEntries,
  buildBankrollTrackerSnapshot,
  deriveLegOutcomeBreakdown,
  readBankrollTrackerRows
} from '../bot-tracker.mjs';
import { buildAutomatedMessage, sendWebhookMessage } from '../discord.mjs';
import { formatUnitTrackingMessages } from '../formatters.mjs';
import { fetchAflOfficialSlate, fetchAflOfficialSummary } from '../providers/afl-official.mjs';
import { fetchEspnSlate, fetchEspnSummary } from '../providers/espn.mjs';
import { fetchFlashscoreSlate } from '../providers/flashscore.mjs';
import { fetchNrlOfficialSlate, fetchNrlOfficialSummary } from '../providers/nrl-official.mjs';
import { loadRawPicksFeed, saveRawPicksFeed } from '../picks-feed.mjs';
import { getDateKey } from '../scheduler.mjs';
import { writeSettlementsToWorkspace } from '../settlement-writeback.mjs';
import { teamNamesMatch, textMentionsTeam } from '../team-name-matching.mjs';

const SETTLED = new Set(['win', 'loss', 'return']);
const TEAM_MARKETS = new Set(['h2h', 'spreads', 'totals', 'double_chance']);
const SUPPORTED_PLAYER_MARKETS = new Set([
  'player_points',
  'player_disposals',
  'player_rebounds',
  'player_assists',
  'player_threes',
  'batter_hits',
  'pitcher_strikeouts',
  'player_pass_yds',
  'player_rush_yds'
]);
const PUSH_STATUSES = new Set(['push', 'pushed', 'void', 'voided', 'refund', 'refunded', 'return']);
const HOUR_MS = 60 * 60 * 1000;
const FALLBACK_EVENT_START_GRACE_MS = 4 * HOUR_MS;
const UNKNOWN_FAILED_LEG_LABEL = 'N/A';

function toNumber(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'string' && value.trim() === '') {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function cloneSerializable(value) {
  if (value === null || value === undefined) {
    return value;
  }

  return JSON.parse(JSON.stringify(value));
}

function roundToTwo(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function getPickPriceDecimal(pick) {
  const candidates = [
    pick?.priceDecimal,
    pick?.publicationValidation?.totalOdds,
    pick?.closingOdds,
    pick?.totalOdds
  ];

  for (const candidate of candidates) {
    const numeric = toNumber(candidate);

    if (numeric !== null && numeric > 0) {
      return numeric;
    }
  }

  return null;
}

function buildOddsValidationCacheKey(oddsCheck) {
  const normalized = {
    sportKey: oddsCheck?.sportKey || '',
    market: oddsCheck?.market || '',
    homeTeam: normalizeText(oddsCheck?.homeTeam),
    awayTeam: normalizeText(oddsCheck?.awayTeam),
    outcomeName: normalizeText(oddsCheck?.outcomeName),
    description: normalizeText(oddsCheck?.description),
    point: oddsCheck?.point ?? null,
    minimumOdds: toNumber(oddsCheck?.minimumOdds ?? 2),
    minimumBooksAtOrAbove: toNumber(oddsCheck?.minimumBooksAtOrAbove ?? 0),
    regions: oddsCheck?.regions || '',
    bookmakers: Array.isArray(oddsCheck?.bookmakers)
      ? [...oddsCheck.bookmakers].map((item) => normalizeText(item)).sort()
      : []
  };

  return JSON.stringify(normalized);
}

function buildLegOddsCheck(pick, leg) {
  const source = leg?.source;

  if (!source?.market || !pick?.sport || !pick?.homeTeam || !pick?.awayTeam) {
    return null;
  }

  return {
    sportKey: pick.sport,
    market: source.market,
    homeTeam: pick.homeTeam,
    awayTeam: pick.awayTeam,
    outcomeName: source.outcomeName || '',
    description: source.description || '',
    point: source.point ?? null,
    minimumOdds: 1.01,
    minimumBooksAtOrAbove: 0,
    regions: '',
    bookmakers: []
  };
}

function getCachedOddsValidationResult(state, oddsCheck) {
  const cacheKey = buildOddsValidationCacheKey(oddsCheck);
  return state?.cache?.oddsValidation?.[cacheKey]?.result || null;
}

function buildCachedPickPriceDecimal(state, pick) {
  const legs = Array.isArray(pick?.legs) ? pick.legs : [];
  const matchedLegPrices = [];
  let checkedLegCount = 0;

  for (const leg of legs) {
    const oddsCheck = buildLegOddsCheck(pick, leg);

    if (!oddsCheck) {
      continue;
    }

    checkedLegCount += 1;

    const cachedResult = getCachedOddsValidationResult(state, oddsCheck);
    const bestOdds = toNumber(cachedResult?.bestOdds);

    if (String(cachedResult?.status || '').toLowerCase() === 'ok' && bestOdds !== null && bestOdds > 0) {
      matchedLegPrices.push(bestOdds);
      continue;
    }

    return null;
  }

  if (checkedLegCount === 0 || matchedLegPrices.length !== checkedLegCount) {
    return null;
  }

  return roundToTwo(matchedLegPrices.reduce((product, bestOdds) => product * bestOdds, 1));
}

function resolvePickPriceDecimal(pick, state, trackerRow = null, trackedPick = null) {
  const candidates = [
    getPickPriceDecimal(pick),
    toNumber(trackedPick?.priceDecimal),
    toNumber(trackedPick?.publicationValidation?.totalOdds),
    toNumber(trackerRow?.price_decimal),
    buildCachedPickPriceDecimal(state, pick)
  ];

  for (const candidate of candidates) {
    if (candidate !== null && candidate > 0) {
      return candidate;
    }
  }

  return null;
}

function getStartTimeMs(pick) {
  const parsed = pick?.startTime ? new Date(pick.startTime).getTime() : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function getEventStartTimeMs(event) {
  const parsed = event?.startTime ? new Date(event.startTime).getTime() : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function getEffectivePickTeams(pick) {
  if (pick?.homeTeam && pick?.awayTeam) {
    return {
      homeTeam: pick.homeTeam,
      awayTeam: pick.awayTeam
    };
  }

  const event = String(pick?.event || '');
  const parts = event.split(/\s+vs\s+/i);

  if (parts.length === 2) {
    return {
      awayTeam: parts[0].trim(),
      homeTeam: parts[1].trim()
    };
  }

  return {
    homeTeam: '',
    awayTeam: ''
  };
}

function teamIdsMatch(event, pick) {
  return String(pick?.homeTeamId || '').trim()
    && String(pick?.awayTeamId || '').trim()
    && String(event?.homeTeamId || '').trim()
    && String(event?.awayTeamId || '').trim()
    && String(event.homeTeamId).trim() === String(pick.homeTeamId).trim()
    && String(event.awayTeamId).trim() === String(pick.awayTeamId).trim();
}

function eventStartTimesMatch(event, pick) {
  const eventStartTimeMs = getEventStartTimeMs(event);
  const pickStartTimeMs = getStartTimeMs(pick);

  if (eventStartTimeMs === null || pickStartTimeMs === null) {
    return false;
  }

  return Math.abs(eventStartTimeMs - pickStartTimeMs) <= FALLBACK_EVENT_START_GRACE_MS;
}

function eventMatchesPick(event, pick) {
  if (!event || !pick) {
    return false;
  }

  if (String(pick?.espnEventId || '').trim() && String(event?.id || '').trim() === String(pick.espnEventId).trim()) {
    return true;
  }

  const { homeTeam, awayTeam } = getEffectivePickTeams(pick);

  if (teamIdsMatch(event, pick)) {
    return eventStartTimesMatch(event, pick);
  }

  return teamNamesMatch(event.homeTeam, homeTeam)
    && teamNamesMatch(event.awayTeam, awayTeam)
    && eventStartTimesMatch(event, pick);
}

function getScoreboardEventKey(homeTeam, awayTeam) {
  return `${normalizeText(homeTeam)}::${normalizeText(awayTeam)}`;
}

function formatUtcDateKey(date) {
  return new Date(date).toISOString().slice(0, 10);
}

function shiftUtcDateKey(dateKey, dayOffset) {
  const baseDate = new Date(`${dateKey}T00:00:00.000Z`);
  baseDate.setUTCDate(baseDate.getUTCDate() + dayOffset);
  return formatUtcDateKey(baseDate);
}

function getSettlementDateKeys(startTimeMs, config) {
  if (!Number.isFinite(startTimeMs)) {
    return [];
  }

  const startDate = new Date(startTimeMs);
  const timezoneDateKey = getDateKey(startDate, config.timezone);
  const utcDateKey = formatUtcDateKey(startDate);

  return [...new Set([
    timezoneDateKey,
    utcDateKey,
    shiftUtcDateKey(utcDateKey, -1),
    shiftUtcDateKey(utcDateKey, 1)
  ])];
}

function getResultSweepDelayMs(config) {
  return Number(config.jobs?.results?.settlementSweepHours || 3) * HOUR_MS;
}

function isPostedUnsettledPick(pick, state, openTrackerPositionsByPickId) {
  return Boolean(state.posts?.picks?.[pick?.id])
    && Boolean(openTrackerPositionsByPickId?.has?.(pick?.id))
    && !state.posts?.results?.[pick?.id]
    && !SETTLED.has(String(pick?.status || '').toLowerCase());
}

function canAutoSweepPick(pick, state, now, config, openTrackerPositionsByPickId) {
  if (!isPostedUnsettledPick(pick, state, openTrackerPositionsByPickId)) {
    return false;
  }

  if (String(state.tracking?.picks?.[pick.id]?.status || '').toLowerCase() === 'cancelled') {
    return false;
  }

  const startTimeMs = getStartTimeMs(pick);

  if (startTimeMs === null) {
    return false;
  }

  return now.getTime() >= startTimeMs + getResultSweepDelayMs(config);
}

function findSportConfig(config, sportKey) {
  return (config.sports || []).find((sport) => sport.key === sportKey || sport.marketKey === sportKey) || null;
}

function getSettlementSportConfig(config, sportKey) {
  const sport = findSportConfig(config, sportKey);

  if (!sport) {
    return null;
  }

  if (String(sport.key || sport.marketKey || sportKey).toLowerCase() === 'nrl') {
    return {
      ...sport,
      provider: 'espn',
      path: 'rugby-league/3',
      apiVariant: 'web'
    };
  }

  return sport;
}

function normalizeSportLookupKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function resolveTrackerSportKey(config, trackerRow, trackedPick = null) {
  const candidates = [
    trackedPick?.activeReplacement?.sport,
    trackedPick?.postedPickSnapshot?.sport,
    trackerRow?.sport
  ];

  for (const candidate of candidates) {
    const normalizedCandidate = normalizeSportLookupKey(candidate);

    if (!normalizedCandidate) {
      continue;
    }

    const matchedSport = (config.sports || []).find((sport) => {
      return [sport?.key, sport?.marketKey, sport?.label]
        .map((item) => normalizeSportLookupKey(item))
        .filter(Boolean)
        .includes(normalizedCandidate);
    });

    if (matchedSport?.key) {
      return matchedSport.key;
    }

    if (normalizedCandidate === 'mlb') {
      return 'mlb';
    }
  }

  return '';
}

function parseRecoveredMlbTrackerSlipLegs(summary) {
  const segments = String(summary || '')
    .split(/\s+\+\s+/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (!segments.length) {
    return [];
  }

  const legs = [];

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    let match = segment.match(/^(.+?)\s+(\d+(?:\.\d+)?)\+\s+Hit(?:s)?$/i);

    if (match) {
      const line = Number(match[2]);
      legs.push({
        id: `recovered-leg-${index + 1}`,
        label: segment,
        status: 'active',
        source: {
          type: 'tracker-recovery',
          market: 'batter_hits',
          outcomeName: `${line}+ Hit`,
          description: match[1].trim(),
          point: line
        }
      });
      continue;
    }

    match = segment.match(/^(.+?)\s+(\d+(?:\.\d+)?)\+\s+Strikeouts?$/i);

    if (match) {
      const line = Number(match[2]);
      legs.push({
        id: `recovered-leg-${index + 1}`,
        label: segment,
        status: 'active',
        source: {
          type: 'tracker-recovery',
          market: 'pitcher_strikeouts',
          outcomeName: `${line}+ Strikeouts`,
          description: match[1].trim(),
          point: line
        }
      });
      continue;
    }

    return [];
  }

  return legs;
}

function parseRecoveredTrackerSlipLegs(summary, sportKey) {
  switch (String(sportKey || '').toLowerCase()) {
    case 'mlb':
      return parseRecoveredMlbTrackerSlipLegs(summary);
    default:
      return [];
  }
}

function getSettlementSources(sport, overrides = {}) {
  const sources = [{
    key: 'espn',
    label: 'ESPN',
    fetchScoreboard: overrides.fetchEspnSlate || fetchEspnSlate,
    fetchSummary: overrides.fetchEspnSummary || fetchEspnSummary,
    requiresSummary: (pick) => pickHasSupportedPlayerMarkets(pick)
  }];

  switch (String(sport?.key || '').toLowerCase()) {
    case 'afl':
      sources.push({
        key: 'official_afl',
        label: 'Official AFL',
        fetchScoreboard: overrides.fetchAflOfficialSlate || fetchAflOfficialSlate,
        fetchSummary: overrides.fetchAflOfficialSummary || fetchAflOfficialSummary,
        requiresSummary: (pick) => pickHasSupportedPlayerMarkets(pick)
      });
      sources.push({
        key: 'flashscore',
        label: 'Flashscore',
        fetchScoreboard: overrides.fetchFlashscoreSlate || fetchFlashscoreSlate
      });
      break;
    case 'nrl':
      sources.push({
        key: 'official_nrl',
        label: 'Official NRL',
        fetchScoreboard: overrides.fetchNrlOfficialSlate || fetchNrlOfficialSlate,
        fetchSummary: overrides.fetchNrlOfficialSummary || fetchNrlOfficialSummary,
        requiresSummary: (pick) => pickHasSupportedPlayerMarkets(pick) || pickHasFirstHalfTeamMarkets(pick)
      });
      sources.push({
        key: 'flashscore',
        label: 'Flashscore',
        fetchScoreboard: overrides.fetchFlashscoreSlate || fetchFlashscoreSlate
      });
      break;
    default:
      break;
  }

  return sources;
}

function getSummaryCacheKey(sourceKey, event) {
  return [
    sourceKey,
    String(event?.providerId || '').trim(),
    String(event?.matchCentreUrl || '').trim(),
    String(event?.sourceUrl || '').trim(),
    String(event?.id || '').trim(),
    String(event?.startTime || '').trim(),
    normalizeText(event?.homeTeam),
    normalizeText(event?.awayTeam)
  ].filter(Boolean).join('::');
}

function buildSettlementSourceLabel(sourceContexts) {
  const labels = [...new Set(sourceContexts.map((context) => String(context?.sourceLabel || '').trim()).filter(Boolean))];

  if (!labels.length) {
    return 'settlement sources';
  }

  return labels.length === 1
    ? labels[0]
    : `consensus sources (${labels.join(', ')})`;
}

function getEventScoreKey(event) {
  const homeScore = toNumber(event?.homeScore);
  const awayScore = toNumber(event?.awayScore);

  if (homeScore === null || awayScore === null) {
    return '';
  }

  return `${awayScore}:${homeScore}`;
}

function selectSettlementNoteSourceContexts(sourceContexts, requiredAgreements) {
  const groupedContexts = new Map();

  for (const sourceContext of sourceContexts) {
    const scoreKey = getEventScoreKey(sourceContext?.event);

    if (!scoreKey) {
      continue;
    }

    const existing = groupedContexts.get(scoreKey) || [];
    existing.push(sourceContext);
    groupedContexts.set(scoreKey, existing);
  }

  const rankedGroups = [...groupedContexts.values()]
    .sort((left, right) => right.length - left.length);

  if (!rankedGroups.length || rankedGroups[0].length < requiredAgreements) {
    return sourceContexts;
  }

  if (rankedGroups.length > 1 && rankedGroups[0].length === rankedGroups[1].length) {
    return sourceContexts;
  }

  return rankedGroups[0];
}

function buildSettlementSourceKey(sourceContexts) {
  return sourceContexts
    .map((context) => String(context?.sourceKey || '').trim())
    .filter(Boolean)
    .join(',');
}

function getLinescoreValue(line) {
  return toNumber(line?.cumulativeValue ?? line?.value ?? line?.displayValue);
}

function getFirstHalfScores(event) {
  const homeLine = Array.isArray(event?.homeLinescores)
    ? (event.homeLinescores.find((line) => toNumber(line?.period) === 1) || event.homeLinescores[0])
    : null;
  const awayLine = Array.isArray(event?.awayLinescores)
    ? (event.awayLinescores.find((line) => toNumber(line?.period) === 1) || event.awayLinescores[0])
    : null;
  const homeScore = getLinescoreValue(homeLine);
  const awayScore = getLinescoreValue(awayLine);

  if (homeScore === null || awayScore === null) {
    return null;
  }

  return {
    homeScore,
    awayScore
  };
}

function resolveTeamSide(event, pick, outcomeName) {
  const { homeTeam, awayTeam } = getEffectivePickTeams(pick);

  if (teamNamesMatch(outcomeName, event?.homeTeam) || teamNamesMatch(outcomeName, homeTeam)) {
    return 'home';
  }

  if (teamNamesMatch(outcomeName, event?.awayTeam) || teamNamesMatch(outcomeName, awayTeam)) {
    return 'away';
  }

  return null;
}

function resolveDoubleChanceSelection(event, pick, outcomeName) {
  const normalizedOutcome = normalizeText(outcomeName);
  const { homeTeam, awayTeam } = getEffectivePickTeams(pick);

  if (!normalizedOutcome.includes('draw')) {
    return null;
  }

  const includesHome = [event?.homeTeam, homeTeam]
    .filter(Boolean)
    .some((teamName) => textMentionsTeam(normalizedOutcome, teamName));
  const includesAway = [event?.awayTeam, awayTeam]
    .filter(Boolean)
    .some((teamName) => textMentionsTeam(normalizedOutcome, teamName));

  if (includesHome === includesAway) {
    return null;
  }

  return {
    includesHome,
    includesAway
  };
}

function gradeTeamMarketLeg(leg, event, pick) {
  const market = String(leg?.source?.market || '').toLowerCase();
  const isFirstHalfMarket = market.startsWith('first_half_');
  const baseMarket = isFirstHalfMarket ? market.slice('first_half_'.length) : market;
  const scores = isFirstHalfMarket
    ? getFirstHalfScores(event)
    : {
        homeScore: toNumber(event?.homeScore),
        awayScore: toNumber(event?.awayScore)
      };
  const homeScore = scores?.homeScore ?? null;
  const awayScore = scores?.awayScore ?? null;

  if (!TEAM_MARKETS.has(baseMarket) || homeScore === null || awayScore === null) {
    return null;
  }

  if (baseMarket === 'h2h') {
    const selectedSide = resolveTeamSide(event, pick, leg?.source?.outcomeName);

    if (!selectedSide) {
      return null;
    }

    if (homeScore === awayScore) {
      return 'push';
    }

    return selectedSide === (homeScore > awayScore ? 'home' : 'away') ? 'win' : 'loss';
  }

  if (baseMarket === 'spreads') {
    const selectedSide = resolveTeamSide(event, pick, leg?.source?.outcomeName);
    const line = toNumber(leg?.source?.point);

    if (!selectedSide || line === null) {
      return null;
    }

    const margin = selectedSide === 'home'
      ? (homeScore - awayScore) + line
      : (awayScore - homeScore) + line;

    if (margin === 0) {
      return 'push';
    }

    return margin > 0 ? 'win' : 'loss';
  }

  if (baseMarket === 'totals') {
    const line = toNumber(leg?.source?.point);
    const side = normalizeText(leg?.source?.outcomeName);

    if (line === null || (side !== 'over' && side !== 'under')) {
      return null;
    }

    const total = homeScore + awayScore;

    if (total === line) {
      return 'push';
    }

    if (side === 'over') {
      return total > line ? 'win' : 'loss';
    }

    return total < line ? 'win' : 'loss';
  }

  if (baseMarket === 'double_chance') {
    const selection = resolveDoubleChanceSelection(event, pick, leg?.source?.outcomeName);

    if (!selection) {
      return null;
    }

    if (selection.includesHome) {
      return homeScore >= awayScore ? 'win' : 'loss';
    }

    if (selection.includesAway) {
      return awayScore >= homeScore ? 'win' : 'loss';
    }
  }

  return null;
}

function getSupportedPlayerStatKey(sportKey, market) {
  switch (String(sportKey || '').toLowerCase()) {
    case 'afl':
      switch (String(market || '').toLowerCase()) {
        case 'player_disposals':
          return 'disposals';
        default:
          return '';
      }
    case 'nba':
      switch (String(market || '').toLowerCase()) {
        case 'player_points':
          return 'points';
        case 'player_rebounds':
          return 'rebounds';
        case 'player_assists':
          return 'assists';
        case 'player_threes':
          return 'threesMade';
        default:
          return '';
      }
    case 'mlb':
      switch (String(market || '').toLowerCase()) {
        case 'batter_hits':
          return 'hits';
        case 'pitcher_strikeouts':
          return 'strikeouts';
        default:
          return '';
      }
    case 'nfl':
      switch (String(market || '').toLowerCase()) {
        case 'player_pass_yds':
          return 'passingYards';
        case 'player_rush_yds':
          return 'rushingYards';
        default:
          return '';
      }
    case 'nrl':
      switch (String(market || '').toLowerCase()) {
        case 'player_points':
          return 'points';
        default:
          return '';
      }
    default:
      return '';
  }
}

function isSupportedTeamMarketLeg(leg) {
  const market = String(leg?.source?.market || '').toLowerCase();
  const baseMarket = market.startsWith('first_half_') ? market.slice('first_half_'.length) : market;

  return TEAM_MARKETS.has(baseMarket);
}

function isSupportedPlayerMarketLeg(pick, leg) {
  return Boolean(getSupportedPlayerStatKey(pick?.sport, leg?.source?.market));
}

function pickHasSupportedPlayerMarkets(pick) {
  return (Array.isArray(pick?.legs) ? pick.legs : []).some((leg) => isSupportedPlayerMarketLeg(pick, leg));
}

function pickHasFirstHalfTeamMarkets(pick) {
  return (Array.isArray(pick?.legs) ? pick.legs : []).some((leg) => {
    const market = String(leg?.source?.market || '').toLowerCase();
    return market.startsWith('first_half_') && TEAM_MARKETS.has(market.slice('first_half_'.length));
  });
}

function buildPlayerStatsByName(playerStats) {
  const byName = new Map();

  for (const player of Array.isArray(playerStats) ? playerStats : []) {
    const normalizedName = normalizeText(player?.playerName);

    if (normalizedName) {
      const current = byName.get(normalizedName) || [];
      current.push(player);
      byName.set(normalizedName, current);
    }
  }

  return byName;
}

function resolvePlayerStatsForLeg(leg, propContext) {
  const playerName = normalizeText(leg?.source?.description);
  const sourceLabel = String(propContext?.sourceLabel || 'Source').trim() || 'Source';
  const legLabel = String(leg?.label || leg?.source?.description || 'Unknown leg').trim();

  if (!playerName) {
    return {
      playerStats: null,
      unresolvedReason: null
    };
  }

  const matchingPlayers = Array.isArray(propContext?.playerStatsByName?.get(playerName))
    ? propContext.playerStatsByName.get(playerName)
    : [];

  if (matchingPlayers.length === 1) {
    return {
      playerStats: matchingPlayers[0],
      unresolvedReason: null
    };
  }

  if (propContext?.summaryFetchError) {
    return {
      playerStats: null,
      unresolvedReason: propContext.summaryFetchError
    };
  }

  if (matchingPlayers.length > 1) {
    return {
      playerStats: null,
      unresolvedReason: `${sourceLabel} returned multiple player stat rows for ${legLabel}, so auto-settlement was skipped to avoid ambiguous grading.`
    };
  }

  if (propContext?.summaryFetched) {
    return {
      playerStats: null,
      unresolvedReason: `${sourceLabel} did not return a player stat row for ${legLabel}, so auto-settlement was skipped.`
    };
  }

  return {
    playerStats: null,
    unresolvedReason: null
  };
}

function getPlayerOutcomeMode(leg) {
  const outcomeText = String(leg?.source?.outcomeName || leg?.label || '');
  const normalized = normalizeText(outcomeText);

  if (normalized.includes('under')) {
    return 'under';
  }

  if (normalized.includes('over')) {
    return 'over';
  }

  if (/(^|\s)\d+(?:\.\d+)?\s*\+/.test(outcomeText)) {
    return 'at_least';
  }

  return '';
}

function getPlayerOutcomeLine(leg) {
  const explicitLine = toNumber(leg?.source?.point);

  if (explicitLine !== null) {
    return explicitLine;
  }

  const text = String(leg?.source?.outcomeName || leg?.label || '');
  const plusMatch = text.match(/(\d+(?:\.\d+)?)\s*\+/);

  if (plusMatch) {
    return Number(plusMatch[1]);
  }

  const overUnderMatch = text.match(/(?:over|under)\s+(\d+(?:\.\d+)?)/i);

  if (overUnderMatch) {
    return Number(overUnderMatch[1]);
  }

  return null;
}

function gradePlayerMarketLeg(leg, pick, propContext) {
  const market = String(leg?.source?.market || '').toLowerCase();
  const statKey = getSupportedPlayerStatKey(propContext?.sportKey, market);

  if (!statKey) {
    return {
      outcome: null,
      unresolvedReason: null
    };
  }

  const playerName = normalizeText(leg?.source?.description);
  const outcomeMode = getPlayerOutcomeMode(leg);
  const line = getPlayerOutcomeLine(leg);

  if (!playerName || line === null || !outcomeMode) {
    return {
      outcome: null,
      unresolvedReason: null
    };
  }

  const { playerStats, unresolvedReason } = resolvePlayerStatsForLeg(leg, propContext);

  if (unresolvedReason) {
    return {
      outcome: null,
      unresolvedReason
    };
  }

  const statValue = toNumber(playerStats?.[statKey] ?? playerStats?.statValues?.[statKey]);

  if (statValue === null) {
    return {
      outcome: null,
      unresolvedReason: null
    };
  }

  if (outcomeMode === 'at_least') {
    return {
      outcome: statValue >= line ? 'win' : 'loss',
      unresolvedReason: null
    };
  }

  if (statValue === line) {
    return {
      outcome: 'push',
      unresolvedReason: null
    };
  }

  if (outcomeMode === 'over') {
    return {
      outcome: statValue > line ? 'win' : 'loss',
      unresolvedReason: null
    };
  }

  return {
    outcome: statValue < line ? 'win' : 'loss',
    unresolvedReason: null
  };
}

function getLegLabel(leg) {
  return String(leg?.label || leg?.source?.description || 'Unknown leg').trim();
}

function gradeLegForSource(leg, pick, sourceContext) {
  const teamOutcome = gradeTeamMarketLeg(leg, sourceContext?.event, pick);

  if (teamOutcome) {
    return {
      sourceKey: sourceContext?.sourceKey || '',
      sourceLabel: sourceContext?.sourceLabel || 'Source',
      outcome: teamOutcome,
      unresolvedReason: null
    };
  }

  const playerOutcome = gradePlayerMarketLeg(leg, pick, sourceContext?.propContext);

  return {
    sourceKey: sourceContext?.sourceKey || '',
    sourceLabel: sourceContext?.sourceLabel || 'Source',
    outcome: playerOutcome?.outcome || null,
    unresolvedReason: playerOutcome?.unresolvedReason || null
  };
}

function resolveConsensusOutcome(gradeResults, requiredAgreements) {
  const outcomeCounts = new Map();

  for (const result of gradeResults) {
    if (!result?.outcome) {
      continue;
    }

    outcomeCounts.set(result.outcome, (outcomeCounts.get(result.outcome) || 0) + 1);
  }

  const rankedOutcomes = [...outcomeCounts.entries()]
    .sort((left, right) => right[1] - left[1] || String(left[0]).localeCompare(String(right[0])));

  if (!rankedOutcomes.length || rankedOutcomes[0][1] < requiredAgreements) {
    return null;
  }

  if (rankedOutcomes.length > 1 && rankedOutcomes[0][1] === rankedOutcomes[1][1]) {
    return null;
  }

  return rankedOutcomes[0][0];
}

function buildSupportedLegConsensusReason(leg, gradeResults, requiredAgreements) {
  const legLabel = getLegLabel(leg);
  const resolvedOutcomes = gradeResults.filter((result) => result?.outcome);
  const resolvedSummary = resolvedOutcomes.map((result) => `${result.sourceLabel}: ${result.outcome}`).join(', ');
  const unresolvedReasons = gradeResults
    .filter((result) => result?.unresolvedReason)
    .map((result) => `${result.sourceLabel}: ${result.unresolvedReason}`);
  const uniqueResolvedOutcomes = new Set(resolvedOutcomes.map((result) => result.outcome));

  if (resolvedOutcomes.length >= requiredAgreements && uniqueResolvedOutcomes.size > 1) {
    return `Settlement sources disagreed on ${legLabel}: ${resolvedSummary}.`;
  }

  if (resolvedOutcomes.length > 0 && resolvedOutcomes.length < requiredAgreements) {
    const suffix = unresolvedReasons.length ? ` ${unresolvedReasons.join(' ')}` : '';
    return `Only ${resolvedOutcomes.length} source${resolvedOutcomes.length === 1 ? '' : 's'} confirmed ${legLabel}; ${requiredAgreements} agreeing sources are required for auto-settlement. ${resolvedSummary}.${suffix}`;
  }

  if (unresolvedReasons.length) {
    return unresolvedReasons.join(' ');
  }

  return `No settlement source produced a safe grade for ${legLabel}.`;
}

function buildAutoSettlementNote(event, reason = '', sourceLabel = 'settlement sources') {
  const resolvedSourceLabel = sourceLabel === 'ESPN' ? 'ESPN scoreboard' : sourceLabel;
  const base = event
    ? `Auto-settled from ${resolvedSourceLabel} final score: ${event.awayTeam} ${event.awayScore} - ${event.homeTeam} ${event.homeScore}.`
    : `Auto-settled from ${resolvedSourceLabel}.`
  return reason ? `${base} ${reason}` : base;
}

function buildUnknownFailedLegLoss(pick, gradedLegs, settledAt, noteEvent, settlementSourceLabel, reason = '') {
  const stakeUnits = toNumber(pick?.stakeUnits) ?? 0;

  return {
    settledPick: {
      ...pick,
      legs: gradedLegs,
      status: 'loss',
      settledAt,
      returnUnits: 0,
      netUnits: roundToTwo(-stakeUnits),
      failedLegLabel: UNKNOWN_FAILED_LEG_LABEL,
      resultNotes: buildAutoSettlementNote(
        noteEvent,
        [`Failed legs: ${UNKNOWN_FAILED_LEG_LABEL}.`, reason].filter(Boolean).join(' '),
        settlementSourceLabel
      )
    },
    unresolvedReason: null
  };
}

function buildAutoSettledPick(pick, sourceContexts, settledAt, priceDecimal = null, requiredAgreements = 1) {
  const originalLegs = Array.isArray(pick?.legs) ? pick.legs : [];
  const unsupportedLegs = [];
  const supportedButMissingLegs = [];
  const noteSourceContexts = selectSettlementNoteSourceContexts(sourceContexts, requiredAgreements);
  const noteEvent = noteSourceContexts[0]?.event || sourceContexts[0]?.event || null;
  const settlementSourceLabel = buildSettlementSourceLabel(noteSourceContexts);
  const gradedLegs = originalLegs.map((leg) => {
    const supportedTeamMarket = isSupportedTeamMarketLeg(leg);
    const supportedPlayerMarket = isSupportedPlayerMarketLeg(pick, leg);

    if (!supportedTeamMarket && !supportedPlayerMarket) {
      unsupportedLegs.push(getLegLabel(leg));
      return { ...leg };
    }

    const gradeResults = sourceContexts.map((sourceContext) => gradeLegForSource(leg, pick, sourceContext));
    const consensusOutcome = resolveConsensusOutcome(gradeResults, requiredAgreements);

    if (consensusOutcome) {
      return {
        ...leg,
        status: consensusOutcome
      };
    }

    supportedButMissingLegs.push(buildSupportedLegConsensusReason(leg, gradeResults, requiredAgreements));
    return { ...leg };
  });
  const statuses = gradedLegs.map((leg) => String(leg?.status || '').toLowerCase());
  const hasLoss = statuses.includes('loss');
  const hasPush = statuses.some((status) => PUSH_STATUSES.has(status));
  const allPush = statuses.length > 0 && statuses.every((status) => PUSH_STATUSES.has(status));
  const allWin = statuses.length > 0 && statuses.every((status) => status === 'win');
  const stakeUnits = toNumber(pick?.stakeUnits) ?? 0;

  if (hasLoss) {
    return {
      settledPick: {
        ...pick,
        legs: gradedLegs,
        status: 'loss',
        settledAt,
        returnUnits: 0,
        netUnits: roundToTwo(-stakeUnits),
        resultNotes: buildAutoSettlementNote(
          noteEvent,
          unsupportedLegs.length ? `Slip was settled as a loss after at least one supported leg failed. Ungraded legs: ${unsupportedLegs.join(', ')}.` : '',
          settlementSourceLabel
        )
      },
      unresolvedReason: null
    };
  }

  if (supportedButMissingLegs.length) {
    return {
      settledPick: null,
      unresolvedReason: `Final event detected but these supported prop legs could not be graded safely: ${supportedButMissingLegs.join(' ')}`
    };
  }

  if (unsupportedLegs.length) {
    return {
      settledPick: null,
      unresolvedReason: `Final event detected but these legs are not auto-graded yet: ${unsupportedLegs.join(', ')}.`
    };
  }

  if (allPush) {
    return {
      settledPick: {
        ...pick,
        legs: gradedLegs,
        status: 'return',
        settledAt,
        returnUnits: roundToTwo(stakeUnits),
        netUnits: 0,
        resultNotes: buildAutoSettlementNote(noteEvent, 'All graded legs pushed.', settlementSourceLabel)
      },
      unresolvedReason: null
    };
  }

  if (hasPush) {
    return {
      settledPick: null,
      unresolvedReason: 'Final event detected but the slip includes pushes that need reduced-odds repricing before settlement.'
    };
  }

  if (allWin) {
    const resolvedPriceDecimal = toNumber(priceDecimal) ?? getPickPriceDecimal(pick);

    if (resolvedPriceDecimal === null) {
      return {
        settledPick: null,
        unresolvedReason: 'Final event detected but the saved pick does not have a usable decimal price for auto-settlement.'
      };
    }

    const returnUnits = roundToTwo(stakeUnits * resolvedPriceDecimal);

    return {
      settledPick: {
        ...pick,
        priceDecimal: resolvedPriceDecimal,
        legs: gradedLegs,
        status: 'win',
        settledAt,
        returnUnits,
        netUnits: roundToTwo(returnUnits - stakeUnits),
        resultNotes: buildAutoSettlementNote(noteEvent, '', settlementSourceLabel)
      },
      unresolvedReason: null
    };
  }

  return buildUnknownFailedLegLoss(
    pick,
    gradedLegs,
    settledAt,
    noteEvent,
    settlementSourceLabel,
    'Final event detected but the slip could not be graded from the available team-market data.'
  );
}

async function autoSettlePendingPicks(context, feed, now, overrides = {}) {
  const { config, state } = context;
  const trackerRowMaps = overrides.trackerRowMaps || buildTrackerRowMaps(await readBankrollTrackerRows(config, now.toISOString()));
  const postedPending = feed.picks.filter((pick) => canAutoSweepPick(pick, state, now, config, trackerRowMaps.openByPickId));
  const scoreboardCache = new Map();
  const summaryCache = new Map();
  let autoSettled = 0;
  let pendingReview = 0;
  let feedChanged = false;

  for (const basePick of postedPending) {
    const openPositionRow = trackerRowMaps.openByPickId.get(basePick.id) || null;
    const trackedPickState = state.tracking?.picks?.[basePick.id] || null;
    const trackedStakeUnits = toNumber(openPositionRow?.stake_units);
    const effectivePick = {
      ...applyActiveReplacement(state, basePick, openPositionRow),
      ...(trackedStakeUnits !== null ? { stakeUnits: trackedStakeUnits } : {})
    };
    const resolvedPriceDecimal = resolvePickPriceDecimal(effectivePick, state, openPositionRow, trackedPickState);
    const sport = getSettlementSportConfig(config, effectivePick?.sport);

    if (!sport?.path) {
      continue;
    }

    const settlementSources = getSettlementSources(sport, overrides);

    if (!settlementSources.length) {
      continue;
    }

    const startTimeMs = getStartTimeMs(effectivePick);

    if (startTimeMs === null) {
      continue;
    }

    const settlementDateKeys = getSettlementDateKeys(startTimeMs, config);
    const { homeTeam, awayTeam } = getEffectivePickTeams(effectivePick);

    if (!homeTeam || !awayTeam) {
      continue;
    }

    const sourceContexts = [];

    for (const source of settlementSources) {
      let matchedEvent = null;

      for (const settlementDateKey of settlementDateKeys) {
        const sourceCacheKey = `${source.key}:${sport.key}:${settlementDateKey}`;

        if (!scoreboardCache.has(sourceCacheKey)) {
          scoreboardCache.set(sourceCacheKey, source.fetchScoreboard(sport, settlementDateKey, config.timezone));
        }

        let scoreboard;

        try {
          scoreboard = await scoreboardCache.get(sourceCacheKey);
        } catch {
          continue;
        }

        matchedEvent = (scoreboard?.events || []).find((event) => {
          return eventMatchesPick(event, effectivePick) && String(event.state || '').toLowerCase() === 'post';
        });

        if (matchedEvent) {
          break;
        }
      }

      if (!matchedEvent) {
        continue;
      }

      let eventForGrading = matchedEvent;
      let propContext = {
        sportKey: sport.key,
        sourceLabel: source.label,
        playerStatsByName: new Map(),
        summaryFetched: false,
        summaryFetchError: ''
      };

      if (source.fetchSummary && source.requiresSummary?.(effectivePick)) {
        const summaryCacheKey = getSummaryCacheKey(source.key, matchedEvent);

        if (!summaryCache.has(summaryCacheKey)) {
          summaryCache.set(summaryCacheKey, source.fetchSummary(sport, matchedEvent, config.timezone));
        }

        try {
          const summary = await summaryCache.get(summaryCacheKey);
          propContext = {
            sportKey: sport.key,
            sourceLabel: source.label,
            playerStatsByName: buildPlayerStatsByName(summary?.playerStats),
            summaryFetched: true,
            summaryFetchError: ''
          };

          if (summary?.event) {
            eventForGrading = {
              ...matchedEvent,
              ...summary.event
            };
          }
        } catch {
          propContext = {
            sportKey: sport.key,
            sourceLabel: source.label,
            playerStatsByName: new Map(),
            summaryFetched: false,
            summaryFetchError: `${source.label} player stats request failed, so auto-settlement was deferred pending a retry.`
          };
        }
      }

      sourceContexts.push({
        sourceKey: source.key,
        sourceLabel: source.label,
        event: eventForGrading,
        propContext
      });
    }

    if (!sourceContexts.length) {
      continue;
    }

    const requiredAgreements = settlementSources.length > 1 ? 2 : 1;

    const { settledPick, unresolvedReason } = buildAutoSettledPick(
      effectivePick,
      sourceContexts,
      now.toISOString(),
      resolvedPriceDecimal,
      requiredAgreements
    );

    if (!settledPick) {
      state.tracking ??= {};
      state.tracking.picks ??= {};
      state.tracking.picks[basePick.id] = {
        ...(state.tracking.picks[basePick.id] || {}),
        ...(resolvedPriceDecimal !== null ? { priceDecimal: resolvedPriceDecimal } : {}),
        postedAt: state.tracking.picks[basePick.id]?.postedAt || state.posts?.picks?.[basePick.id] || now.toISOString(),
        finalEventDetectedAt: now.toISOString(),
        settlementPendingReason: unresolvedReason,
        settlementSource: buildSettlementSourceKey(sourceContexts),
        settlementEventId: sourceContexts[0]?.event?.providerId || sourceContexts[0]?.event?.id || null,
        lastCheckedAt: now.toISOString()
      };
      pendingReview += 1;
      continue;
    }

    const feedPick = feed.picks.find((pick) => pick.id === basePick.id);

    if (!feedPick) {
      continue;
    }

    feedPick.status = settledPick.status;
    feedPick.settledAt = settledPick.settledAt;
    feedPick.returnUnits = settledPick.returnUnits;
    feedPick.netUnits = settledPick.netUnits;
    feedPick.priceDecimal = settledPick.priceDecimal ?? resolvedPriceDecimal ?? feedPick.priceDecimal;
    feedPick.failedLeg = settledPick.failedLeg ?? settledPick.failedLegLabel ?? feedPick.failedLeg;
    feedPick.failedLegLabel = settledPick.failedLegLabel ?? settledPick.failedLeg ?? feedPick.failedLegLabel;
    feedPick.failedLegs = Array.isArray(settledPick.failedLegs)
      ? settledPick.failedLegs
      : (settledPick.failedLegLabel || settledPick.failedLeg
        ? [settledPick.failedLegLabel || settledPick.failedLeg]
        : feedPick.failedLegs);
    feedPick.resultNotes = settledPick.resultNotes;

    if (state.tracking?.picks?.[basePick.id]?.activeReplacement) {
      state.tracking.picks[basePick.id] = {
        ...state.tracking.picks[basePick.id],
        activeReplacement: {
          ...state.tracking.picks[basePick.id].activeReplacement,
          legs: settledPick.legs,
          summary: settledPick.summary,
          event: settledPick.event,
          startTime: settledPick.startTime
        },
        autoSettledAt: now.toISOString(),
        settlementSource: buildSettlementSourceKey(sourceContexts),
        settlementEventId: sourceContexts[0]?.event?.providerId || sourceContexts[0]?.event?.id || null,
        lastCheckedAt: now.toISOString(),
        settlementPendingReason: null
      };
    } else {
      feedPick.legs = settledPick.legs;
      state.tracking ??= {};
      state.tracking.picks ??= {};
      state.tracking.picks[basePick.id] = {
        ...(state.tracking.picks[basePick.id] || {}),
        autoSettledAt: now.toISOString(),
        settlementSource: buildSettlementSourceKey(sourceContexts),
        settlementEventId: sourceContexts[0]?.event?.providerId || sourceContexts[0]?.event?.id || null,
        lastCheckedAt: now.toISOString(),
        settlementPendingReason: null
      };
    }

    autoSettled += 1;
    feedChanged = true;
  }

  if (feedChanged) {
    await saveRawPicksFeed(config.__paths.picksFeedFile, feed);
  }

  return {
    autoSettled,
    pendingReview
  };
}

function parsePipeList(value) {
  return String(value || '')
    .split('|')
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildTrackerRowMaps(rows) {
  const latestByPickId = new Map();
  const lastPostedByPickId = new Map();

  for (const row of rows) {
    if (!row?.pick_id) {
      continue;
    }

    latestByPickId.set(row.pick_id, row);

    if (row.transaction_type === 'post' || row.transaction_type === 'replacement') {
      lastPostedByPickId.set(row.pick_id, row);
    }
  }

  const openByPickId = new Map(
    [...latestByPickId.entries()].filter(([, row]) => row.transaction_type === 'post' || row.transaction_type === 'replacement')
  );

  return {
    latestByPickId,
    lastPostedByPickId,
    openByPickId
  };
}

function hydratePostedPickStateFromTracker(state, trackerRowMaps) {
  state.posts ??= {};
  state.posts.picks ??= {};

  for (const [pickId, row] of trackerRowMaps.openByPickId.entries()) {
    if (!state.posts.picks[pickId]) {
      state.posts.picks[pickId] = row.timestamp || new Date().toISOString();
    }
  }
}

function isTrackedPostedUnsettledPick(pick, state) {
  return Boolean(state.posts?.picks?.[pick?.id])
    && pick?.tracked !== false
    && !state.posts?.results?.[pick?.id]
    && !SETTLED.has(String(pick?.status || '').toLowerCase());
}

function buildSyntheticOpenTrackerRow(pick, state, fallbackTimestamp) {
  const timestamp = state.posts?.picks?.[pick?.id] || fallbackTimestamp;
  const stakeUnits = toNumber(pick?.stakeUnits) ?? 0;
  const priceDecimal = getPickPriceDecimal(pick);

  return {
    timestamp,
    transaction_type: 'post',
    pick_id: String(pick?.id || ''),
    sport: String(pick?.sportLabel || pick?.sport || '').toUpperCase(),
    event: String(pick?.event || ''),
    start_time: String(pick?.startTime || ''),
    slip: String(pick?.summary || ''),
    price_decimal: priceDecimal === null ? '' : String(priceDecimal),
    stake_units: String(stakeUnits),
    status: 'posted',
    source: String(pick?.source || 'discord-bot')
  };
}

function buildRecoveredFeedPickFromTrackedSnapshot(config, pickId, trackerRow, trackedPick = null, fallbackTimestamp = '') {
  const snapshotSource = trackerRow?.transaction_type === 'replacement'
    ? trackedPick?.activeReplacement
    : trackedPick?.postedPickSnapshot;

  if (!snapshotSource) {
    return null;
  }

  const snapshot = cloneSerializable(snapshotSource);
  const priceDecimal = toNumber(trackerRow?.price_decimal)
    ?? toNumber(snapshot?.priceDecimal)
    ?? toNumber(snapshot?.publicationValidation?.totalOdds)
    ?? null;
  const recoveredPick = {
    ...snapshot,
    id: pickId,
    tracked: true,
    status: 'pending',
    settledAt: null,
    returnUnits: null,
    netUnits: null,
    resultNotes: '',
    failedLeg: null,
    failedLegLabel: null,
    failedLegs: [],
    stakeUnits: toNumber(trackerRow?.stake_units) ?? toNumber(snapshot?.stakeUnits) ?? 0,
    startTime: String(trackerRow?.start_time || snapshot?.startTime || fallbackTimestamp),
    event: String(trackerRow?.event || snapshot?.event || ''),
    summary: String(trackerRow?.slip || snapshot?.summary || ''),
    priceDecimal,
    publicationValidation: snapshot?.publicationValidation || {}
  };

  if (priceDecimal !== null) {
    recoveredPick.publicationValidation = {
      ...recoveredPick.publicationValidation,
      totalOdds: priceDecimal
    };
  }

  return recoveredPick;
}

function buildRecoveredFeedPickFromTrackerRow(config, state, pickId, trackerRow, fallbackTimestamp = '') {
  const trackedPick = state.tracking?.picks?.[pickId] || null;
  const recoveredFromSnapshot = buildRecoveredFeedPickFromTrackedSnapshot(config, pickId, trackerRow, trackedPick, fallbackTimestamp);

  if (recoveredFromSnapshot) {
    return recoveredFromSnapshot;
  }

  const sportKey = resolveTrackerSportKey(config, trackerRow, trackedPick);

  if (!sportKey) {
    return null;
  }

  const legs = parseRecoveredTrackerSlipLegs(trackerRow?.slip, sportKey);

  if (!legs.length) {
    return null;
  }

  const sport = findSportConfig(config, sportKey);
  const priceDecimal = toNumber(trackerRow?.price_decimal);
  const derivedTeams = getEffectivePickTeams({
    event: trackerRow?.event || ''
  });
  const recoveredPick = {
    id: pickId,
    status: 'pending',
    tracked: true,
    sport: sportKey,
    sportLabel: sport?.label || String(trackerRow?.sport || sportKey).trim() || sportKey.toUpperCase(),
    league: sport?.label || String(trackerRow?.sport || sportKey).trim() || sportKey.toUpperCase(),
    event: String(trackerRow?.event || ''),
    homeTeam: derivedTeams.homeTeam,
    awayTeam: derivedTeams.awayTeam,
    summary: String(trackerRow?.slip || ''),
    betType: legs.length > 1 ? 'sgm' : 'single',
    stakeUnits: toNumber(trackerRow?.stake_units) ?? 0,
    startTime: String(trackerRow?.start_time || fallbackTimestamp),
    source: String(trackerRow?.source || 'tracker-recovery'),
    legs,
    publicationValidation: {}
  };

  if (priceDecimal !== null) {
    recoveredPick.priceDecimal = priceDecimal;
    recoveredPick.publicationValidation.totalOdds = priceDecimal;
  }

  return recoveredPick;
}

async function ensureFeedRecordsForPostedPendingPicks(context, feed, trackerRowMaps, now) {
  const { config, state, dryRun } = context;
  const existingPickIds = new Set((feed.picks || []).map((pick) => String(pick?.id || '')));
  let feedChanged = false;

  for (const [pickId, row] of trackerRowMaps.openByPickId.entries()) {
    if (!pickId || existingPickIds.has(pickId) || state.posts?.results?.[pickId]) {
      continue;
    }

    const recoveredPick = buildRecoveredFeedPickFromTrackerRow(config, state, pickId, row, now.toISOString());

    if (!recoveredPick) {
      continue;
    }

    feed.picks.push(recoveredPick);
    existingPickIds.add(pickId);
    feedChanged = true;

    state.tracking ??= {};
    state.tracking.picks ??= {};
    state.tracking.picks[pickId] = {
      ...(state.tracking.picks[pickId] || {}),
      postedAt: state.tracking.picks[pickId]?.postedAt || row.timestamp || now.toISOString(),
      postedPickSnapshot: cloneSerializable(recoveredPick),
      feedRehydratedAt: now.toISOString(),
      status: state.tracking.picks[pickId]?.status || 'pregame_recheck_passed'
    };
  }

  if (feedChanged && !dryRun) {
    await saveRawPicksFeed(config.__paths.picksFeedFile, feed);
  }
}

async function ensureTrackerRowsForPostedPendingPicks(context, feed, trackerRowMaps, now) {
  const { config, state, dryRun } = context;
  const missingPicks = feed.picks.filter((pick) => {
    if (!isTrackedPostedUnsettledPick(pick, state)) {
      return false;
    }

    return !trackerRowMaps.latestByPickId.has(pick.id);
  });

  if (!missingPicks.length) {
    return trackerRowMaps;
  }

  if (dryRun) {
    const nextLatestByPickId = new Map(trackerRowMaps.latestByPickId);
    const nextLastPostedByPickId = new Map(trackerRowMaps.lastPostedByPickId);
    const nextOpenByPickId = new Map(trackerRowMaps.openByPickId);

    for (const pick of missingPicks) {
      const syntheticRow = buildSyntheticOpenTrackerRow(pick, state, now.toISOString());
      nextLatestByPickId.set(pick.id, syntheticRow);
      nextLastPostedByPickId.set(pick.id, syntheticRow);
      nextOpenByPickId.set(pick.id, syntheticRow);
    }

    return {
      latestByPickId: nextLatestByPickId,
      lastPostedByPickId: nextLastPostedByPickId,
      openByPickId: nextOpenByPickId
    };
  }

  for (const pick of missingPicks) {
    await appendPostedTrackerEntries(config, [pick], state.posts?.picks?.[pick.id] || now.toISOString());

    state.tracking ??= {};
    state.tracking.picks ??= {};
    state.tracking.picks[pick.id] = {
      ...(state.tracking.picks[pick.id] || {}),
      trackerBackfilledAt: now.toISOString()
    };
  }

  const refreshedRows = await readBankrollTrackerRows(config, now.toISOString());
  return buildTrackerRowMaps(refreshedRows);
}

function enrichSettledPick(pick, trackerRow, postedRow, trackerSnapshot) {
  const unitSizeAud = Number(trackerSnapshot?.unitSizeAud || 10);
  const legOutcomeBreakdown = deriveLegOutcomeBreakdown(pick);
  const hitLegs = legOutcomeBreakdown.hitLegs.length ? legOutcomeBreakdown.hitLegs : parsePipeList(trackerRow?.legs_hit);
  const missedLegs = legOutcomeBreakdown.missedLegs.length
    ? legOutcomeBreakdown.missedLegs
    : parsePipeList(trackerRow?.legs_missed || trackerRow?.specific_leg_lost);
  const stakeUnits = toNumber(pick?.stakeUnits) ?? toNumber(trackerRow?.stake_units) ?? 0;
  const returnUnits = toNumber(pick?.returnUnits) ?? toNumber(trackerRow?.return_units) ?? 0;
  const netUnits = toNumber(pick?.netUnits) ?? toNumber(trackerRow?.net_units) ?? (returnUnits - stakeUnits);

  return {
    ...pick,
    priceDecimal: toNumber(trackerRow?.price_decimal)
      ?? toNumber(postedRow?.price_decimal)
      ?? toNumber(pick?.priceDecimal)
      ?? toNumber(pick?.publicationValidation?.totalOdds)
      ?? toNumber(pick?.closingOdds)
      ?? null,
    hitLegs,
    missedLegs,
    stakeUnits,
    returnUnits,
    netUnits,
    stakeAud: toNumber(trackerRow?.stake_aud) ?? Number((stakeUnits * unitSizeAud).toFixed(2)),
    returnAud: toNumber(trackerRow?.return_aud) ?? Number((returnUnits * unitSizeAud).toFixed(2)),
    netAud: toNumber(trackerRow?.net_aud) ?? Number((netUnits * unitSizeAud).toFixed(2)),
    totalUnits: toNumber(trackerRow?.units_remaining) ?? toNumber(trackerSnapshot?.currentUnits) ?? 0,
    totalAud: toNumber(trackerRow?.units_remaining_aud) ?? toNumber(trackerSnapshot?.currentAud) ?? 0,
    totalSettledStakeUnits: toNumber(trackerRow?.total_settled_stake_units) ?? toNumber(trackerSnapshot?.totalSettledStakeUnits) ?? 0,
    totalSettledStakeAud: toNumber(trackerRow?.total_settled_stake_aud) ?? toNumber(trackerSnapshot?.totalSettledStakeAud) ?? 0
  };
}

function applyActiveReplacement(state, pick, openPositionRow = null) {
  const activeReplacement = state.tracking?.picks?.[pick.id]?.activeReplacement;

  if (!activeReplacement || openPositionRow?.transaction_type !== 'replacement') {
    return pick;
  }

  return {
    ...pick,
    ...activeReplacement,
    id: pick.id,
    status: pick.status,
    settledAt: pick.settledAt,
    returnUnits: pick.returnUnits,
    netUnits: pick.netUnits,
    closingOdds: pick.closingOdds,
    clvPercent: pick.clvPercent,
    resultNotes: pick.resultNotes
  };
}

function getSettlementSortTime(pick) {
  const settledAt = pick?.settledAt ? new Date(pick.settledAt).getTime() : Number.NaN;

  if (Number.isFinite(settledAt)) {
    return settledAt;
  }

  const startTime = pick?.startTime ? new Date(pick.startTime).getTime() : Number.NaN;
  return Number.isFinite(startTime) ? startTime : Number.POSITIVE_INFINITY;
}

function compareSettledPicks(left, right) {
  const timeDifference = getSettlementSortTime(left) - getSettlementSortTime(right);

  if (timeDifference !== 0) {
    return timeDifference;
  }

  const eventComparison = String(left?.event || left?.id || '').localeCompare(String(right?.event || right?.id || ''));

  if (eventComparison !== 0) {
    return eventComparison;
  }

  return String(left?.id || '').localeCompare(String(right?.id || ''));
}

export async function runResultsJob(context, overrides = {}) {
  const { config, state, dryRun } = context;
  const now = new Date();
  const dateKey = getDateKey(now, config.timezone);
  const feed = await loadRawPicksFeed(config.__paths.picksFeedFile);
  const trackerRowsBefore = await readBankrollTrackerRows(config, now.toISOString());
  let trackerRowMapsBefore = buildTrackerRowMaps(trackerRowsBefore);
  hydratePostedPickStateFromTracker(state, trackerRowMapsBefore);
  trackerRowMapsBefore = await ensureTrackerRowsForPostedPendingPicks(context, feed, trackerRowMapsBefore, now);
  await ensureFeedRecordsForPostedPendingPicks(context, feed, trackerRowMapsBefore, now);
  const autoSettlement = await autoSettlePendingPicks(context, feed, now, {
    ...overrides,
    trackerRowMaps: trackerRowMapsBefore
  });
  const settled = feed.picks
    .filter((pick) => SETTLED.has(pick.status) && !state.posts.results[pick.id] && trackerRowMapsBefore.openByPickId.has(pick.id))
    .map((pick) => {
      const openPositionRow = trackerRowMapsBefore.openByPickId.get(pick.id) || null;
      const trackedStakeUnits = toNumber(openPositionRow?.stake_units);

      return {
        ...applyActiveReplacement(state, pick, openPositionRow),
        ...(trackedStakeUnits !== null ? { stakeUnits: trackedStakeUnits } : {})
      };
    })
    .sort(compareSettledPicks);

  if (!settled.length) {
    state.jobs.results = {
      lastRunAt: now.toISOString()
    };

    return {
      job: 'results',
      posted: 0,
      autoSettled: autoSettlement.autoSettled,
      pendingReview: autoSettlement.pendingReview
    };
  }

  const appendedTrackerRows = await appendSettlementTrackerEntries(config, settled, now.toISOString());
  const trackerRows = await readBankrollTrackerRows(config, now.toISOString());
  const trackerSnapshot = await buildBankrollTrackerSnapshot(config, now);
  const { latestByPickId, lastPostedByPickId } = buildTrackerRowMaps(trackerRows);
  const appendedByPickId = new Map(appendedTrackerRows.map((row) => [row.pick_id, row]));
  const enrichedSettled = settled.map((pick) => enrichSettledPick(
    pick,
    appendedByPickId.get(pick.id) || latestByPickId.get(pick.id),
    lastPostedByPickId.get(pick.id),
    trackerSnapshot
  ));
  const messages = formatUnitTrackingMessages(enrichedSettled, dateKey);
  const settlementWebhook = config.bankrollTracker?.settlementWebhook || 'unitTracking';
  const settlementWebhookUrl = config.discord?.webhooks?.[settlementWebhook] || config.discord?.webhooks?.results;

  for (const message of messages) {
    const automatedMessage = buildAutomatedMessage(config, settlementWebhook, message);

    await sendWebhookMessage(
      settlementWebhookUrl,
      {
        content: automatedMessage.content,
        embeds: automatedMessage.embeds,
        username: config.discord.username,
        avatar_url: config.discord.avatarUrl || undefined,
        allowed_mentions: automatedMessage.allowedMentions
      },
      {
        dryRun,
        label: 'unit tracking settlement'
      }
    );
  }

  await writeSettlementsToWorkspace(context, settled, feed);

  for (const pick of settled) {
    state.posts.results[pick.id] = now.toISOString();
    delete state.tracking?.picks?.[pick.id];
  }

  state.jobs.results = {
    lastRunAt: now.toISOString()
  };

  return {
    job: 'results',
    posted: settled.length,
    autoSettled: autoSettlement.autoSettled,
    pendingReview: autoSettlement.pendingReview
  };
}