import fs from 'node:fs/promises';

import { analyzeEventWithOpenAi, analyzeEventWithRules, buildAnalysisCandidatePool, buildPickFromAnalysisDecision } from '../ai-pick-generator.mjs';
import { buildDailyTrackerSummary } from '../bot-tracker.mjs';
import { mergeGeneratedPicks, mergeQuoteEntries } from '../pick-generator.mjs';
import { loadRawPicksFeed, saveRawPicksFeed } from '../picks-feed.mjs';
import { fetchEspnSlate } from '../providers/espn.mjs';
import { fetchEspnTeamInjuries } from '../providers/espn-injuries.mjs';
import { fetchRotowireMlbDailyLineups, fetchRotowireMlbNews, findMatchingRotowireMlbGame, getRotowireMlbLineupsPageKey } from '../providers/mlb-rotowire.mjs';
import { extractMlbGameResearch, fetchMlbGameFeed, fetchMlbSchedule } from '../providers/mlb-statsapi.mjs';
import { buildOpenMeteoEventWeatherSnapshot, fetchOpenMeteoForecast, geocodeOpenMeteoLocation } from '../providers/open-meteo.mjs';
import { getDateKey } from '../scheduler.mjs';
import { buildSnapshotEvents, ensureFreshScrapedSnapshot, getSnapshotEventQuotes } from '../web-market-intake.mjs';

const AVAILABLE_INJURY_STATUSES = new Set(['available', 'active', 'probable']);
const ESPN_PREVIOUS_DAY_SCOREBOARD_FALLBACK_SPORTS = new Set(['mlb', 'nba', 'nfl', 'nhl']);
const ESPN_PREVIOUS_DAY_SCOREBOARD_MATCH_WINDOW_MS = 12 * 60 * 60 * 1000;
const OUTDOOR_WEATHER_RESEARCH_SPORTS = new Set(['afl', 'mlb', 'nfl', 'nrl', 'soccer_epl']);
const CLOSED_ROOF_MARKERS = ['closed', 'dome', 'indoors'];
const SEVERE_WEATHER_CODES = new Set([95, 96, 99]);
const WET_WEATHER_CODES = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 85, 86]);
const MLB_BATTER_RESEARCH_MARKETS = new Set(['batter_hits', 'batter_rbis', 'batter_total_bases']);
const MLB_PROP_RESEARCH_MARKETS = new Set([...MLB_BATTER_RESEARCH_MARKETS, 'pitcher_strikeouts']);
const MLB_LINEUP_LOCK_HOURS = 4;
const MLB_SUPPORTING_NEWS_MARKERS = [
  'injury',
  'tightness',
  'soreness',
  'scratched',
  'scratch',
  'not starting',
  'sits',
  'sitting',
  'exits',
  'leaves',
  'illness',
  'rest',
  'returns',
  'return',
  'debut',
  'starts',
  'starting',
  'activated',
  'rehab',
  'trade',
  'traded',
  'optioned',
  'promoted'
];
const RETURN_RISK_NOTE_MARKERS = [
  'restricted',
  'restriction',
  'managed',
  'monitor',
  'minutes restriction',
  'pitch count',
  'snap count',
  'workload',
  'expected to return',
  'targeting return',
  'return tomorrow',
  'game time decision'
];

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizeMarketKey(value) {
  return String(value || '')
    .toLowerCase()
    .trim();
}

function normalizePlayerName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

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

function getUtcDateKey(value) {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toISOString().slice(0, 10);
}

function getHoursUntilStart(startTime) {
  const startMs = Date.parse(startTime);

  if (!Number.isFinite(startMs)) {
    return null;
  }

  return (startMs - Date.now()) / (60 * 60 * 1000);
}

function buildEventContext(config, sport, event) {
  return {
    sportKey: sport.key,
    sportLabel: sport.label,
    marketSportKey: sport.marketKey || sport.key,
    eventId: event.id,
    espnEventId: event.espnEventId || '',
    eventName: event.displayName || `${event.away_team} vs ${event.home_team}`,
    homeTeam: event.home_team,
    homeTeamId: event.homeTeamId || '',
    awayTeam: event.away_team,
    awayTeamId: event.awayTeamId || '',
    startTime: event.commence_time,
    venue: event.venue || null,
    generatorConfig: config.analysis.generator
  };
}

function getScoreboardEventKey(homeTeam, awayTeam) {
  return `${normalizeText(homeTeam)}::${normalizeText(awayTeam)}`;
}

function getScoreboardEventPairKey(teamOne, teamTwo) {
  return [normalizeText(teamOne), normalizeText(teamTwo)]
    .filter(Boolean)
    .sort()
    .join('::');
}

function shouldTryPreviousEspnScoreboardDate(sport) {
  return [sport?.key, sport?.marketKey]
    .map((value) => normalizeText(value))
    .some((value) => ESPN_PREVIOUS_DAY_SCOREBOARD_FALLBACK_SPORTS.has(value));
}

function buildEspnScoreboardDateKeys(config, sport, event) {
  const eventDate = new Date(event?.commence_time || '');

  if (Number.isNaN(eventDate.getTime())) {
    return [];
  }

  const dateKeys = [getDateKey(eventDate, config.timezone)];

  if (shouldTryPreviousEspnScoreboardDate(sport)) {
    const previousDateKey = getDateKey(new Date(eventDate.getTime() - 24 * 60 * 60 * 1000), config.timezone);

    if (previousDateKey && !dateKeys.includes(previousDateKey)) {
      dateKeys.push(previousDateKey);
    }
  }

  return dateKeys;
}

function findMatchingScoreboardEvent(scoreboard, event, options = {}) {
  const targetStartTime = event.commence_time ? new Date(event.commence_time).toISOString() : '';
  const targetStartMs = Date.parse(event.commence_time || '');
  const targetTeams = getScoreboardEventKey(event.home_team, event.away_team);
  const targetTeamPair = getScoreboardEventPairKey(event.home_team, event.away_team);
  const fallbackWindowMs = Number(options.fallbackWindowMs);
  const scoreboardEvents = Array.isArray(scoreboard?.events) ? scoreboard.events : [];
  const matchedEvent = scoreboardEvents.find((scoreboardEvent) => {
    if (!scoreboardEvent) {
      return false;
    }

    const sameTeams = getScoreboardEventKey(scoreboardEvent.homeTeam, scoreboardEvent.awayTeam) === targetTeams;
    const sameTeamPair = getScoreboardEventPairKey(scoreboardEvent.homeTeam, scoreboardEvent.awayTeam) === targetTeamPair;
    const sameStartTime = scoreboardEvent.startTime
      ? new Date(scoreboardEvent.startTime).toISOString() === targetStartTime
      : false;

    return sameTeams || (sameStartTime && sameTeamPair);
  });

  if (matchedEvent || !Number.isFinite(fallbackWindowMs) || !Number.isFinite(targetStartMs)) {
    return matchedEvent || null;
  }

  let bestFallbackMatch = null;

  for (const scoreboardEvent of scoreboardEvents) {
    if (!scoreboardEvent) {
      continue;
    }

    const sameTeamPair = getScoreboardEventPairKey(scoreboardEvent.homeTeam, scoreboardEvent.awayTeam) === targetTeamPair;

    if (!sameTeamPair) {
      continue;
    }

    const scoreboardStartMs = Date.parse(scoreboardEvent.startTime || '');

    if (!Number.isFinite(scoreboardStartMs)) {
      continue;
    }

    const startDelta = Math.abs(scoreboardStartMs - targetStartMs);

    if (startDelta > fallbackWindowMs) {
      continue;
    }

    if (!bestFallbackMatch || startDelta < bestFallbackMatch.startDelta) {
      bestFallbackMatch = {
        scoreboardEvent,
        startDelta
      };
    }
  }

  return bestFallbackMatch?.scoreboardEvent || null;
}

async function enrichEventWithEspnMetadata(config, sport, event, scoreboardCache, overrides = {}) {
  if (!sport?.path || !event?.commence_time) {
    return event;
  }

  const fetchScoreboard = overrides.fetchEspnSlate || fetchEspnSlate;
  const scoreboardDateKeys = buildEspnScoreboardDateKeys(config, sport, event);
  let matchedEvent = null;

  for (const [index, dateKey] of scoreboardDateKeys.entries()) {
    const cacheKey = `${sport.key}:${dateKey}`;

    if (!scoreboardCache.has(cacheKey)) {
      scoreboardCache.set(cacheKey, fetchScoreboard(sport, dateKey));
    }

    let scoreboard;

    try {
      scoreboard = await scoreboardCache.get(cacheKey);
    } catch {
      if (index === 0) {
        return event;
      }

      continue;
    }

    matchedEvent = findMatchingScoreboardEvent(scoreboard, event, {
      fallbackWindowMs: index > 0 ? ESPN_PREVIOUS_DAY_SCOREBOARD_MATCH_WINDOW_MS : null
    });

    if (matchedEvent) {
      break;
    }
  }

  if (!matchedEvent) {
    return event;
  }

  return {
    ...event,
    espnEventId: matchedEvent.id || '',
    homeTeamId: matchedEvent.homeTeamId || '',
    awayTeamId: matchedEvent.awayTeamId || '',
    venue: matchedEvent.venue || null
  };
}

async function loadBankrollContext(config) {
  try {
    const summary = await buildDailyTrackerSummary(config);

    return {
      currentBankroll: summary.currentAud ?? null,
      pendingStakeExposure: summary.openExposureUnits ?? null,
      trackerDateKey: getDateKey(new Date(), config.timezone),
      availableUnits: summary.availableUnits ?? null,
      unitSizeAud: summary.unitSizeAud ?? null
    };
  } catch {
    // Fall through to the legacy markdown summary when the tracker CSV is unavailable.
  }

  try {
    const raw = await fs.readFile(config.__paths.profitTrackerFile, 'utf8');
    const currentBankroll = raw.match(/Current Bankroll:\s*\$([\d.]+)/i);
    const pendingStake = raw.match(/Pending Stake Exposure:\s*([\d.]+)/i);

    return {
      currentBankroll: currentBankroll ? Number(currentBankroll[1]) : null,
      pendingStakeExposure: pendingStake ? Number(pendingStake[1]) : null,
      trackerDateKey: getDateKey(new Date(), config.timezone),
      availableUnits: null,
      unitSizeAud: null
    };
  } catch {
    return {
      currentBankroll: null,
      pendingStakeExposure: null,
      trackerDateKey: getDateKey(new Date(), config.timezone),
      availableUnits: null,
      unitSizeAud: null
    };
  }
}

function getMinimumCandidateLegsForSport(config, sportKey) {
  const configuredMinimum = Number(config.analysis.minCandidateLegsPerEvent || 3);
  const normalizedSportKey = String(sportKey || '').toLowerCase();

  if (normalizedSportKey === 'nrl') {
    return Math.min(configuredMinimum, 3);
  }

  if (normalizedSportKey.startsWith('tennis')) {
    return Math.min(configuredMinimum, 1);
  }

  return (normalizedSportKey === 'afl' || normalizedSportKey.startsWith('soccer'))
    ? Math.min(configuredMinimum, 2)
    : configuredMinimum;
}

function buildManualEventKey(sportKey, pick) {
  const eventName = pick?.event || `${pick?.awayTeam || ''} vs ${pick?.homeTeam || ''}`;
  return `${sportKey}::${normalizeText(eventName)}::${pick?.startTime || ''}`;
}

function buildEventKey(sportKey, eventName, startTime) {
  return `${sportKey}::${normalizeText(eventName)}::${startTime || ''}`;
}

function isAvailableInjuryStatus(status) {
  return AVAILABLE_INJURY_STATUSES.has(normalizeText(status));
}

function hasReturnRiskInjuryNote(note) {
  const normalized = normalizeText(note);
  return Boolean(normalized) && RETURN_RISK_NOTE_MARKERS.some((marker) => normalized.includes(marker));
}

function shouldRejectInjuryEntry(injury) {
  if (!injury) {
    return false;
  }

  if (!isAvailableInjuryStatus(injury.status)) {
    return true;
  }

  return hasReturnRiskInjuryNote(injury.note);
}

function buildEmptyResearchMaps() {
  return {
    injuryByPlayer: new Map(),
    playerTeamByName: new Map(),
    unavailableCountByTeam: new Map()
  };
}

function buildInjuryResearchResult(status, reports = [], reasons = []) {
  const { injuryByPlayer, playerTeamByName, unavailableCountByTeam } = buildEmptyResearchMaps();

  for (const report of reports) {
    const normalizedTeamName = normalizeText(report?.teamName);

    for (const injury of report?.injuries || []) {
      const playerName = normalizeText(injury?.playerName);

      if (!playerName) {
        continue;
      }

      injuryByPlayer.set(playerName, injury);

      if (normalizedTeamName) {
        playerTeamByName.set(playerName, report.teamName || '');

        if (shouldRejectInjuryEntry(injury)) {
          unavailableCountByTeam.set(normalizedTeamName, (unavailableCountByTeam.get(normalizedTeamName) || 0) + 1);
        }
      }
    }
  }

  return {
    status,
    reports,
    reasons,
    injuryByPlayer,
    playerTeamByName,
    unavailableCountByTeam
  };
}

function buildEmptyMlbResearchResult(status, reasons = []) {
  return {
    status,
    reasons,
    playersByName: new Map(),
    probablePitcherNames: new Set(),
    teamResearchBySide: new Map(),
    projectedLineupStatus: 'not_requested',
    projectedLineupReasons: [],
    projectedTeamResearchBySide: new Map(),
    playerNewsStatus: 'not_requested',
    playerNewsReasons: [],
    playerNewsByName: new Map()
  };
}

function buildProjectedMlbTeamResearch(lineup, teamSide, fallbackTeamName) {
  const teamName = lineup?.teamName || fallbackTeamName || '';
  const players = Array.isArray(lineup?.players)
    ? lineup.players
      .filter((player) => player?.normalizedPlayerName)
      .map((player) => ({
        ...player,
        teamName,
        teamSide
      }))
    : [];

  return {
    teamName,
    teamSide,
    lineupStatus: lineup?.lineupStatus || null,
    hasProjectedBattingOrder: players.length > 0,
    players,
    playersByName: new Map(players.map((player) => [player.normalizedPlayerName, player]))
  };
}

function buildPlayerNewsMap(entries = []) {
  const newsByPlayerName = new Map();

  for (const entry of entries) {
    if (!entry?.normalizedPlayerName) {
      continue;
    }

    const existing = newsByPlayerName.get(entry.normalizedPlayerName) || [];
    existing.push(entry);
    newsByPlayerName.set(entry.normalizedPlayerName, existing);
  }

  return newsByPlayerName;
}

function buildMlbScheduleDateKeys(startTime) {
  const baseDate = new Date(startTime);

  if (Number.isNaN(baseDate.getTime())) {
    return [];
  }

  return [...new Set([-1, 0, 1]
    .map((offset) => getUtcDateKey(new Date(baseDate.getTime() + offset * 24 * 60 * 60 * 1000)))
    .filter(Boolean))];
}

function findMatchingMlbScheduledGame(scheduleResponses, eventContext) {
  const normalizedHomeTeam = normalizeText(eventContext?.homeTeam);
  const normalizedAwayTeam = normalizeText(eventContext?.awayTeam);
  const targetStartMs = Date.parse(eventContext?.startTime);
  let bestMatch = null;

  for (const schedule of scheduleResponses) {
    for (const dateEntry of schedule?.dates || []) {
      for (const game of dateEntry?.games || []) {
        const homeTeam = normalizeText(game?.teams?.home?.team?.name);
        const awayTeam = normalizeText(game?.teams?.away?.team?.name);

        if (homeTeam !== normalizedHomeTeam || awayTeam !== normalizedAwayTeam) {
          continue;
        }

        const gameStartMs = Date.parse(game?.gameDate);
        const startDelta = Number.isFinite(targetStartMs) && Number.isFinite(gameStartMs)
          ? Math.abs(gameStartMs - targetStartMs)
          : Number.MAX_SAFE_INTEGER;

        if (!bestMatch || startDelta < bestMatch.startDelta) {
          bestMatch = {
            game,
            startDelta
          };
        }
      }
    }
  }

  return bestMatch?.game || null;
}

async function loadEventInjuryResearch(sport, eventContext, injuryCache, overrides = {}) {
  if (!sport?.path || (!eventContext?.homeTeamId && !eventContext?.awayTeamId)) {
    return buildInjuryResearchResult('not_available', [], ['ESPN team metadata is missing for pre-pick injury research.']);
  }

  const cacheKey = `${sport.key}:${eventContext.homeTeamId || ''}:${eventContext.awayTeamId || ''}`;

  if (!injuryCache.has(cacheKey)) {
    const loadTeamInjuries = overrides.fetchEspnTeamInjuries || fetchEspnTeamInjuries;
    injuryCache.set(cacheKey, Promise.all([
      eventContext.homeTeamId ? loadTeamInjuries(sport, eventContext.homeTeamId) : Promise.resolve({ injuries: [], status: 'ok' }),
      eventContext.awayTeamId ? loadTeamInjuries(sport, eventContext.awayTeamId) : Promise.resolve({ injuries: [], status: 'ok' })
    ]).then((reports) => {
      const coverageReasons = reports
        .filter((report) => {
          const normalizedStatus = normalizeText(report?.status);
          return normalizedStatus && normalizedStatus !== 'ok';
        })
        .map((report) => `${report?.teamName || report?.teamId || 'team'} returned ${report?.status || 'unknown_status'}`);

      if (coverageReasons.length) {
        return buildInjuryResearchResult('coverage_missing', reports, coverageReasons);
      }

      return buildInjuryResearchResult('ok', reports, []);
    }).catch((error) => buildInjuryResearchResult('lookup_error', [], [error.message])));
  }

  return injuryCache.get(cacheKey);
}

async function loadEventMlbResearch(sport, eventContext, researchCaches, overrides = {}) {
  if (normalizeText(sport?.key || eventContext?.sportKey) !== 'mlb') {
    return buildEmptyMlbResearchResult('not_applicable');
  }

  const mlbCache = researchCaches?.mlb instanceof Map
    ? researchCaches.mlb
    : new Map();
  const mlbSupportCache = researchCaches?.mlbSupport instanceof Map
    ? researchCaches.mlbSupport
    : new Map();
  const cacheKey = `${sport.key}:${normalizeText(eventContext?.homeTeam)}:${normalizeText(eventContext?.awayTeam)}:${eventContext?.startTime || ''}`;

  if (!mlbCache.has(cacheKey)) {
    const loadSchedule = overrides.fetchMlbSchedule || fetchMlbSchedule;
    const loadGameFeed = overrides.fetchMlbGameFeed || fetchMlbGameFeed;
    const loadRotowireLineups = overrides.fetchRotowireMlbDailyLineups || fetchRotowireMlbDailyLineups;
    const loadRotowireNews = overrides.fetchRotowireMlbNews || fetchRotowireMlbNews;
    mlbCache.set(cacheKey, (async () => {
      const scheduleDateKeys = buildMlbScheduleDateKeys(eventContext?.startTime);

      if (!scheduleDateKeys.length) {
        return buildEmptyMlbResearchResult('invalid_start_time', ['MLB start time is missing or invalid for official research.']);
      }

      let schedules;

      try {
        schedules = await Promise.all(scheduleDateKeys.map((dateKey) => loadSchedule(dateKey, {
          hydrate: 'probablePitcher'
        })));
      } catch (error) {
        return buildEmptyMlbResearchResult('schedule_error', [error.message]);
      }

      const matchedGame = findMatchingMlbScheduledGame(schedules, eventContext);

      if (!matchedGame?.gamePk) {
        return buildEmptyMlbResearchResult('game_not_found', [`Official MLB schedule could not match ${eventContext?.eventName || 'the current event'}.`]);
      }

      let feed;

      try {
        feed = await loadGameFeed(matchedGame.gamePk);
      } catch (error) {
        return buildEmptyMlbResearchResult('feed_error', [error.message]);
      }

      const lineupPageKey = getRotowireMlbLineupsPageKey(eventContext?.startTime);
      const lineupCacheKey = `rotowire-lineups:${lineupPageKey}`;
      const newsCacheKey = 'rotowire-news';

      if (!mlbSupportCache.has(lineupCacheKey)) {
        mlbSupportCache.set(lineupCacheKey, loadRotowireLineups(lineupPageKey)
          .then((data) => ({
            status: 'ok',
            reasons: [],
            ...data
          }))
          .catch((error) => ({
            status: 'lookup_error',
            reasons: [error.message],
            games: []
          })));
      }

      if (!mlbSupportCache.has(newsCacheKey)) {
        mlbSupportCache.set(newsCacheKey, loadRotowireNews()
          .then((data) => ({
            status: 'ok',
            reasons: [],
            ...data
          }))
          .catch((error) => ({
            status: 'lookup_error',
            reasons: [error.message],
            entries: []
          })));
      }

      const [lineupSupport, newsSupport] = await Promise.all([
        mlbSupportCache.get(lineupCacheKey),
        mlbSupportCache.get(newsCacheKey)
      ]);
      const matchedRotowireGame = lineupSupport?.status === 'ok'
        ? findMatchingRotowireMlbGame(lineupSupport, eventContext)
        : null;
      const projectedTeamResearchBySide = new Map();

      if (matchedRotowireGame) {
        projectedTeamResearchBySide.set('away', buildProjectedMlbTeamResearch(matchedRotowireGame.away, 'away', eventContext?.awayTeam));
        projectedTeamResearchBySide.set('home', buildProjectedMlbTeamResearch(matchedRotowireGame.home, 'home', eventContext?.homeTeam));
      }

      return {
        status: 'ok',
        reasons: [],
        ...extractMlbGameResearch(feed),
        projectedLineupStatus: lineupSupport?.status === 'ok'
          ? (matchedRotowireGame ? 'ok' : 'game_not_found')
          : (lineupSupport?.status || 'lookup_error'),
        projectedLineupReasons: lineupSupport?.status === 'ok'
          ? (matchedRotowireGame ? [] : [`RotoWire MLB projected lineups did not list ${eventContext?.eventName || 'this event'}.`])
          : (lineupSupport?.reasons || []),
        projectedTeamResearchBySide,
        playerNewsStatus: newsSupport?.status || 'lookup_error',
        playerNewsReasons: newsSupport?.reasons || [],
        playerNewsByName: buildPlayerNewsMap(newsSupport?.entries || [])
      };
    })());
  }

  return mlbCache.get(cacheKey);
}

function isOutdoorWeatherEligibleEvent(sportKey, venue) {
  if (!OUTDOOR_WEATHER_RESEARCH_SPORTS.has(normalizeText(sportKey))) {
    return false;
  }

  const roofType = normalizeText(venue?.roofType);

  if (venue?.indoor === true) {
    return false;
  }

  return !CLOSED_ROOF_MARKERS.some((marker) => roofType.includes(marker));
}

function buildVenueLookupQuery(venue) {
  return [
    venue?.name,
    venue?.city,
    venue?.state,
    venue?.country
  ].filter(Boolean).join(', ');
}

function buildWeatherRiskParts(snapshot) {
  const parts = [];

  if (SEVERE_WEATHER_CODES.has(Number(snapshot?.weatherCode))) {
    parts.push(`weather code ${snapshot.weatherCode}`);
  }

  if ((Number(snapshot?.precipitationProbability) || 0) >= 75 && (Number(snapshot?.precipitationMm) || 0) >= 1.5) {
    parts.push(`${snapshot.precipitationProbability}% precipitation probability with ${snapshot.precipitationMm}mm forecast precipitation`);
  }

  if ((Number(snapshot?.windGustsKmh) || 0) >= 60) {
    parts.push(`${snapshot.windGustsKmh} km/h wind gusts`);
  }

  return parts;
}

function buildSoftWeatherConcernParts(snapshot) {
  const parts = [];

  if ((Number(snapshot?.precipitationProbability) || 0) >= 55 && (Number(snapshot?.precipitationMm) || 0) >= 0.5) {
    parts.push(`${snapshot.precipitationProbability}% precipitation probability with ${snapshot.precipitationMm}mm forecast precipitation`);
  }

  if ((Number(snapshot?.windSpeedKmh) || 0) >= 28) {
    parts.push(`${snapshot.windSpeedKmh} km/h sustained wind`);
  }

  if ((Number(snapshot?.windGustsKmh) || 0) >= 40) {
    parts.push(`${snapshot.windGustsKmh} km/h wind gusts`);
  }

  return parts;
}

function buildWetFieldPlayerPointsRiskParts(candidate, snapshot) {
  if (normalizeText(candidate?.market) !== 'player points') {
    return [];
  }

  const precipitationProbability = Number(snapshot?.precipitationProbability) || 0;
  const precipitationMm = Number(snapshot?.precipitationMm) || 0;
  const weatherCode = Number(snapshot?.weatherCode);
  const hasWetCode = WET_WEATHER_CODES.has(weatherCode);

  if (!hasWetCode && precipitationProbability < 60 && precipitationMm < 0.75) {
    return [];
  }

  const parts = [];

  if (hasWetCode) {
    parts.push(`weather code ${weatherCode}`);
  }

  if (precipitationProbability >= 40) {
    parts.push(`${precipitationProbability}% precipitation probability`);
  }

  if (precipitationMm >= 0.5) {
    parts.push(`${precipitationMm}mm forecast precipitation`);
  }

  const triggersWetFieldRisk = parts.length >= 2 || (hasWetCode && precipitationProbability >= 55) || precipitationMm >= 1;
  return triggersWetFieldRisk ? parts : [];
}

async function loadEventWeatherResearch(sport, eventContext, weatherCache, overrides = {}) {
  if (!isOutdoorWeatherEligibleEvent(sport?.key || eventContext?.sportKey, eventContext?.venue)) {
    return {
      status: 'not_applicable',
      snapshot: null,
      reasons: []
    };
  }

  const venueQuery = buildVenueLookupQuery(eventContext?.venue);

  if (!venueQuery) {
    return {
      status: 'venue_missing',
      snapshot: null,
      reasons: ['Venue metadata is missing for outdoor weather research.']
    };
  }

  const cacheKey = `${sport.key}:${normalizeText(venueQuery)}:${eventContext?.startTime || ''}`;

  if (!weatherCache.has(cacheKey)) {
    const geocodeLocation = overrides.geocodeOpenMeteoLocation || geocodeOpenMeteoLocation;
    const fetchForecast = overrides.fetchOpenMeteoForecast || fetchOpenMeteoForecast;
    weatherCache.set(cacheKey, (async () => {
      let locations;

      try {
        locations = await geocodeLocation(venueQuery, {
          count: 1,
          language: 'en'
        });
      } catch (error) {
        return {
          status: 'geocode_error',
          snapshot: null,
          reasons: [error.message]
        };
      }

      if (!Array.isArray(locations) || !locations.length) {
        return {
          status: 'location_not_found',
          snapshot: null,
          reasons: [`Open-Meteo could not resolve ${venueQuery}.`]
        };
      }

      let forecastResponse;

      try {
        forecastResponse = await fetchForecast(locations[0], {
          timezone: 'auto'
        });
      } catch (error) {
        return {
          status: 'forecast_error',
          snapshot: null,
          reasons: [error.message]
        };
      }

      const snapshot = buildOpenMeteoEventWeatherSnapshot(forecastResponse?.forecast, eventContext?.startTime);

      if (!snapshot) {
        return {
          status: 'snapshot_missing',
          snapshot: null,
          reasons: ['Open-Meteo did not return a usable event-time weather snapshot.']
        };
      }

      const riskParts = buildWeatherRiskParts(snapshot);

      if (riskParts.length) {
        return {
          status: 'severe_weather',
          snapshot,
          reasons: [riskParts.join(', ')]
        };
      }

      return {
        status: 'ok',
        snapshot,
        reasons: []
      };
    })());
  }

  return weatherCache.get(cacheKey);
}

function buildInjuryResearchReason(candidate, injury) {
  const note = String(injury?.note || '').trim();

  if (!isAvailableInjuryStatus(injury?.status)) {
    return `${candidate.description || candidate.label} is ${injury.status}${note ? ` (${note})` : ''} on the ESPN injuries page`;
  }

  return `${candidate.description || candidate.label} still carries a return-risk injury note${note ? ` (${note})` : ''} on the ESPN injuries page`;
}

function isMlbResearchCandidate(sport, candidate) {
  return normalizeText(sport?.key) === 'mlb'
    && candidate?.family === 'prop'
    && MLB_PROP_RESEARCH_MARKETS.has(normalizeMarketKey(candidate?.market));
}

function buildMissingMlbLineupReason(teamName) {
  return `Official MLB batting order is not posted yet for ${teamName || 'the relevant side'}.`;
}

function buildMissingProjectedMlbLineupReason(teamName) {
  return `RotoWire projected MLB lineup is not posted yet for ${teamName || 'the relevant side'}.`;
}

function buildMlbStarterReason(candidate, eventContext) {
  return `${candidate.description || candidate.label} is not listed as an official probable starter for ${eventContext?.eventName || 'this MLB event'}.`;
}

function buildProjectedMlbExclusionReason(candidate, teamResearch) {
  const lineupLabel = teamResearch?.lineupStatus === 'confirmed' ? 'confirmed' : 'expected';
  return `${candidate.description || candidate.label} is not listed in the RotoWire ${lineupLabel} lineup for ${teamResearch?.teamName || 'the relevant side'}.`;
}

function buildProjectedMlbSupportReason(candidate, projectedPlayer, teamResearch) {
  const lineupLabel = teamResearch?.lineupStatus === 'confirmed' ? 'confirmed' : 'expected';
  const battingOrderLabel = projectedPlayer?.battingOrderIndex ? ` batting ${projectedPlayer.battingOrderIndex}` : '';
  return `RotoWire ${lineupLabel} lineup lists ${candidate.description || candidate.label}${battingOrderLabel} for ${teamResearch?.teamName || 'the relevant side'}.`;
}

function shouldIncludeMlbSupportingNews(entry) {
  const normalizedHeadline = normalizeText(entry?.headline);
  const normalizedNote = normalizeText(entry?.note);
  const statusTags = Array.isArray(entry?.statusTags) ? entry.statusTags.map((tag) => normalizeText(tag)) : [];

  if (statusTags.some((tag) => tag.includes('injured'))) {
    return true;
  }

  return MLB_SUPPORTING_NEWS_MARKERS.some((marker) => normalizedHeadline.includes(marker) || normalizedNote.includes(marker));
}

function buildMlbSupportingNewsReason(candidate, entry) {
  const headline = entry?.headline || entry?.note || 'Recent update available';
  const timestamp = entry?.timestamp ? ` (${entry.timestamp})` : '';
  return `Recent RotoWire MLB context for ${candidate.description || candidate.label}: ${headline}${timestamp}.`;
}

function buildCandidateResearch(candidate, sport, eventContext, injuryResearch, weatherResearch, mlbResearch) {
  const reasons = [];
  let blocked = false;
  let hasVerifiedResearch = false;
  let hasResearchGap = false;

  if (candidate?.family === 'prop') {
    if (injuryResearch.status === 'coverage_missing' || injuryResearch.status === 'lookup_error') {
      blocked = true;
      hasResearchGap = true;
      reasons.push(`Pre-pick ESPN injury research is unavailable: ${(injuryResearch.reasons || []).join(', ') || injuryResearch.status}.`);
    } else if (injuryResearch.status === 'ok') {
      hasVerifiedResearch = true;
      const playerName = normalizeText(candidate?.description);
      const injury = injuryResearch.injuryByPlayer.get(playerName);

      if (shouldRejectInjuryEntry(injury)) {
        blocked = true;
        reasons.push(buildInjuryResearchReason(candidate, injury));
      }

      const playerTeamName = injuryResearch.playerTeamByName.get(playerName);
      const normalizedTeamName = normalizeText(playerTeamName);
      const unavailableTeammates = normalizedTeamName
        ? Math.max(0, (injuryResearch.unavailableCountByTeam.get(normalizedTeamName) || 0) - (shouldRejectInjuryEntry(injury) ? 1 : 0))
        : 0;

      if (unavailableTeammates >= 2) {
        blocked = true;
        reasons.push(`${unavailableTeammates} teammates on ${playerTeamName || 'the same side'} are currently listed unavailable or limited, making the role context too volatile for ${candidate.label}.`);
      }
    } else {
      hasResearchGap = true;
      reasons.push('Pre-pick ESPN injury research is not configured for this event.');
    }
  }

  if (isMlbResearchCandidate(sport, candidate)) {
    if (mlbResearch.status !== 'ok') {
      blocked = true;
      hasResearchGap = true;
      reasons.push(`Official MLB starter/lineup research is unavailable: ${(mlbResearch.reasons || []).join(', ') || mlbResearch.status}.`);
    } else {
      hasVerifiedResearch = true;
      const playerName = normalizePlayerName(candidate?.description);
      const matchingPlayers = Array.isArray(mlbResearch.playersByName.get(playerName))
        ? mlbResearch.playersByName.get(playerName)
        : [];
      const normalizedMarket = normalizeMarketKey(candidate?.market);

      if (!matchingPlayers.length) {
        blocked = true;
        reasons.push(`${candidate.description || candidate.label} is not on the official MLB game roster for ${eventContext?.eventName || 'this event'}.`);
      } else if (matchingPlayers.length > 1) {
        blocked = true;
        reasons.push(`Official MLB roster lookup is ambiguous for ${candidate.description || candidate.label}, so the prop cannot be safely validated.`);
      } else {
        const player = matchingPlayers[0];
        const teamResearch = mlbResearch.teamResearchBySide.get(player.teamSide);
        const projectedTeamResearch = mlbResearch.projectedTeamResearchBySide.get(player.teamSide);

        if (normalizedMarket === 'pitcher_strikeouts') {
          if (!mlbResearch.probablePitcherNames.size) {
            blocked = true;
            hasResearchGap = true;
            reasons.push('Official MLB probable starters are not posted yet for this event.');
          } else if (!mlbResearch.probablePitcherNames.has(player.normalizedPlayerName)) {
            blocked = true;
            reasons.push(buildMlbStarterReason(candidate, eventContext));
          }
        }

        if (MLB_BATTER_RESEARCH_MARKETS.has(normalizedMarket)) {
          if (teamResearch?.hasConfirmedBattingOrder) {
            if (!player.inBattingOrder) {
              blocked = true;
              reasons.push(`${candidate.description || candidate.label} is not in the official batting order for ${player.teamName || 'the relevant side'}.`);
            }
          } else if (projectedTeamResearch?.hasProjectedBattingOrder) {
            const projectedPlayer = projectedTeamResearch.playersByName.get(player.normalizedPlayerName);

            if (!projectedPlayer) {
              blocked = true;
              reasons.push(buildProjectedMlbExclusionReason(candidate, projectedTeamResearch));
            } else {
              reasons.push(buildProjectedMlbSupportReason(candidate, projectedPlayer, projectedTeamResearch));
            }
          } else {
            const hoursUntilStart = getHoursUntilStart(eventContext?.startTime);
            const missingLineupReason = buildMissingMlbLineupReason(player.teamName);
            const missingProjectedLineupReason = mlbResearch.projectedLineupStatus === 'lookup_error'
              ? `RotoWire projected MLB lineups are unavailable: ${(mlbResearch.projectedLineupReasons || []).join(', ') || mlbResearch.projectedLineupStatus}.`
              : buildMissingProjectedMlbLineupReason(player.teamName);
            hasResearchGap = true;

            if (hoursUntilStart !== null && hoursUntilStart <= MLB_LINEUP_LOCK_HOURS) {
              blocked = true;
              reasons.push(`${missingLineupReason} ${missingProjectedLineupReason} MLB batter props stay closed inside ${MLB_LINEUP_LOCK_HOURS}h of first pitch.`);
            } else {
              reasons.push(missingLineupReason);
              reasons.push(missingProjectedLineupReason);
            }
          }
        }

        const supportingNews = Array.isArray(mlbResearch.playerNewsByName.get(player.normalizedPlayerName))
          ? mlbResearch.playerNewsByName.get(player.normalizedPlayerName).filter((entry) => shouldIncludeMlbSupportingNews(entry)).slice(0, 1)
          : [];

        for (const newsEntry of supportingNews) {
          reasons.push(buildMlbSupportingNewsReason(candidate, newsEntry));
        }
      }
    }
  }

  if (isOutdoorWeatherEligibleEvent(sport?.key || eventContext?.sportKey, eventContext?.venue)) {
    if (weatherResearch.status === 'ok') {
      hasVerifiedResearch = true;
      const wetFieldRiskParts = normalizeText(sport?.key) === 'nrl'
        ? buildWetFieldPlayerPointsRiskParts(candidate, weatherResearch.snapshot)
        : [];

      if (wetFieldRiskParts.length) {
        blocked = true;
        reasons.push(`Open-Meteo flags wet-field risk for ${candidate.label}: ${wetFieldRiskParts.join(', ')}.`);
      }

      const softWeatherConcernParts = normalizeText(sport?.key) === 'mlb' && candidate?.family === 'prop'
        ? buildSoftWeatherConcernParts(weatherResearch.snapshot)
        : [];

      if (softWeatherConcernParts.length) {
        blocked = true;
        reasons.push(`Open-Meteo flags unstable MLB prop weather for ${candidate.label}: ${softWeatherConcernParts.join(', ')}.`);
      }
    } else if (weatherResearch.status === 'geocode_error'
      || weatherResearch.status === 'location_not_found'
      || weatherResearch.status === 'forecast_error'
      || weatherResearch.status === 'snapshot_missing'
      || weatherResearch.status === 'severe_weather') {
      blocked = true;
      hasResearchGap = true;
      reasons.push(`Pre-pick outdoor weather research is unavailable or unsafe: ${(weatherResearch.reasons || []).join(', ') || weatherResearch.status}.`);
    } else {
      hasResearchGap = true;
      reasons.push('Outdoor weather research could not be fully verified before pick generation.');
    }
  }

  const researchStatus = blocked
    ? 'blocked'
    : hasVerifiedResearch && !hasResearchGap
      ? 'verified'
      : hasVerifiedResearch
        ? 'partial'
        : 'unverified';

  if (researchStatus === 'verified' && !reasons.length) {
    reasons.push('Pre-pick research cleared the currently wired research checks.');
  }

  return {
    ...candidate,
    rationale: researchStatus === 'verified'
      ? `${candidate.rationale} Pre-pick research cleared the currently wired research checks.`
      : candidate.rationale,
    researchStatus,
    researchReasons: reasons
  };
}

async function filterCandidatePoolForResearch(sport, eventContext, candidatePool, researchCaches, overrides = {}) {
  const injuryCache = researchCaches?.injury instanceof Map
    ? researchCaches.injury
    : (researchCaches instanceof Map ? researchCaches : new Map());
  const weatherCache = researchCaches?.weather instanceof Map
    ? researchCaches.weather
    : new Map();
  const injuryResearch = await loadEventInjuryResearch(sport, eventContext, injuryCache, overrides);
  const mlbResearch = await loadEventMlbResearch(sport, eventContext, researchCaches, overrides);
  const weatherResearch = await loadEventWeatherResearch(sport, eventContext, weatherCache, overrides);
  const researchedPool = candidatePool.map((candidate) => buildCandidateResearch(candidate, sport, eventContext, injuryResearch, weatherResearch, mlbResearch));

  return researchedPool.filter((candidate) => candidate.researchStatus !== 'blocked');
}

function getProtectedManualEvents(feed) {
  return new Set((feed?.pending || [])
    .filter((pick) => pick?.source !== 'generated')
    .map((pick) => buildManualEventKey(pick.sportKey || 'unknown', pick)));
}

function isOpenAiQuotaError(error) {
  const status = Number(error?.status);
  const code = String(error?.code || '').toLowerCase();
  const message = String(error?.message || '').toLowerCase();
  return status === 429
    || code.includes('rate_limit')
    || code.includes('insufficient_quota')
    || message.includes('quota')
    || message.includes('rate limit');
}

function resolveAnalysisEngine(config) {
  if (config.analysis.engine === 'auto') {
    return config.openai?.apiKey ? 'openai' : 'rules';
  }

  return config.analysis.engine;
}

export async function runAnalysisJob(context, overrides = {}) {
  const { config, state } = context;
  const now = new Date();
  const loadFeed = overrides.loadFeed || loadRawPicksFeed;
  const saveFeed = overrides.saveFeed || saveRawPicksFeed;
  const analyzeEvent = overrides.analyzeEvent;
  const activeAnalysisEngine = resolveAnalysisEngine(config);

  if (!config.analysis.enabled) {
    state.jobs.analysis = {
      lastRunAt: now.toISOString(),
      skippedReason: 'analysis_disabled'
    };

    return {
      job: 'analysis',
      posted: 0,
      generated: 0,
      considered: 0
    };
  }

  if (activeAnalysisEngine === 'openai' && !config.openai?.apiKey && !analyzeEvent) {
    state.jobs.analysis = {
      lastRunAt: now.toISOString(),
      skippedReason: 'openai_not_configured'
    };

    return {
      job: 'analysis',
      posted: 0,
      generated: 0,
      considered: 0
    };
  }

  const feed = await loadFeed(config.__paths.picksFeedFile);
  const bankrollContext = await loadBankrollContext(config);
  const protectedManualEvents = getProtectedManualEvents(feed);
  const snapshot = overrides.snapshot || await ensureFreshScrapedSnapshot(context, now, {
    force: overrides.forceSnapshotRefresh
  });

  if (!snapshot?.quotes?.length) {
    state.jobs.analysis = {
      lastRunAt: now.toISOString(),
      skippedReason: 'market_scrape_no_quotes'
    };

    return {
      job: 'analysis',
      posted: 0,
      generated: 0,
      considered: 0
    };
  }

  const generatedPicks = [];
  let considered = 0;
  let quotaExceeded = false;
  const scoreboardCache = new Map();
  const researchCaches = {
    injury: new Map(),
    mlb: new Map(),
    mlbSupport: new Map(),
    weather: new Map()
  };

  for (const sport of config.sports.filter((item) => item.enabled && (item.marketKey || item.key))) {
    const events = buildSnapshotEvents(snapshot, config, sport, now)
      .slice(0, Number(config.analysis.maxEventsPerSport || 8));

    if (!events.length) {
      continue;
    }

    for (const event of events) {
      if (quotaExceeded) {
        break;
      }

      const enrichedEvent = await enrichEventWithEspnMetadata(config, sport, event, scoreboardCache, overrides);
      const eventContext = buildEventContext(config, sport, enrichedEvent);
      const eventKey = buildEventKey(sport.key, eventContext.eventName, event.commence_time);

      if (protectedManualEvents.has(eventKey)) {
        continue;
      }

      const snapshotQuotes = Array.isArray(event.snapshotQuotes) && event.snapshotQuotes.length
        ? event.snapshotQuotes
        : getSnapshotEventQuotes(snapshot, config, sport.marketKey || sport.key, event);
      const mergedQuotes = mergeQuoteEntries(snapshotQuotes);
      let candidatePool = buildAnalysisCandidatePool(
        eventContext,
        mergedQuotes,
        Number(config.analysis.maxCandidateLegsPerEvent || 14)
      );
      candidatePool = await filterCandidatePoolForResearch(sport, eventContext, candidatePool, researchCaches, overrides);

      if (candidatePool.length < getMinimumCandidateLegsForSport(config, sport.key)) {
        continue;
      }

      considered += 1;

      try {
        let decision;
        const eventBankrollContext = bankrollContext;

        if (analyzeEvent) {
          decision = await analyzeEvent({
            config,
            eventContext,
            bankrollContext: eventBankrollContext,
            candidatePool,
            activeAnalysisEngine
          });
        } else if (activeAnalysisEngine === 'openai') {
          try {
            decision = await analyzeEventWithOpenAi(context, eventContext, candidatePool, eventBankrollContext);
          } catch (error) {
            if (!isOpenAiQuotaError(error)) {
              throw error;
            }

            quotaExceeded = true;
            console.log(`[analysis] OpenAI quota/rate limit hit for ${eventContext.eventName}; switching to rules fallback for remaining events.`);
            decision = await analyzeEventWithRules(context, eventContext, candidatePool, eventBankrollContext);
          }
        } else {
          decision = await analyzeEventWithRules(context, eventContext, candidatePool, eventBankrollContext);
        }

        const pick = buildPickFromAnalysisDecision(eventContext, candidatePool, decision);

        if (pick) {
          generatedPicks.push(pick);
        }
      } catch (error) {
        console.log(`[analysis] skipped ${eventContext.eventName}: ${error.message}`);
      }
    }
  }

  const mergedFeed = mergeGeneratedPicks(feed, generatedPicks, state);
  await saveFeed(config.__paths.picksFeedFile, mergedFeed);

  state.jobs.analysis = {
    lastRunAt: now.toISOString(),
    generated: generatedPicks.length,
    considered,
    pendingAfterMerge: Array.isArray(mergedFeed.picks) ? mergedFeed.picks.length : 0,
    analysisEngine: activeAnalysisEngine,
    quotaFallbackUsed: quotaExceeded
  };

  return {
    job: 'analysis',
    posted: generatedPicks.length,
    generated: generatedPicks.length,
    considered
  };
}
export { filterCandidatePoolForResearch, buildEventContext, enrichEventWithEspnMetadata };
