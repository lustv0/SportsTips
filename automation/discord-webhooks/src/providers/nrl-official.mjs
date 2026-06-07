const BASE_URL = 'https://www.nrl.com';
const DRAW_COMPETITION_ID = 111;
const USER_AGENT = 'SportsTipsDiscordWebhook/1.0';

function toNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function decodeHtmlEntities(value) {
  return String(value || '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function buildAbsoluteUrl(value) {
  if (!value) {
    return '';
  }

  return String(value).startsWith('http')
    ? String(value)
    : `${BASE_URL}${value}`;
}

function formatDateKey(value, timeZone) {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const formatter = new Intl.DateTimeFormat('en', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = formatter.formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value || '';
  const month = parts.find((part) => part.type === 'month')?.value || '';
  const day = parts.find((part) => part.type === 'day')?.value || '';

  return year && month && day ? `${year}-${month}-${day}` : '';
}

function mapMatchState(matchMode, matchState) {
  const normalizedMode = String(matchMode || '').toLowerCase();
  const normalizedState = String(matchState || '').toLowerCase();

  if (normalizedMode === 'post' || normalizedState === 'fulltime') {
    return 'post';
  }

  if (normalizedMode === 'live' || normalizedState === 'inprogress') {
    return 'in';
  }

  return 'pre';
}

function buildFirstHalfLinescore(score) {
  return [{
    period: 1,
    value: score,
    cumulativeValue: score,
    displayValue: String(score)
  }];
}

function buildFirstHalfScores(match) {
  const timeline = Array.isArray(match?.timeline) ? match.timeline : [];
  const segmentDuration = toNumber(match?.segmentDuration) ?? 2400;

  if (!timeline.length) {
    return null;
  }

  let homeScore = 0;
  let awayScore = 0;

  for (const entry of timeline) {
    const gameSeconds = toNumber(entry?.gameSeconds);

    if (gameSeconds === null || gameSeconds > segmentDuration) {
      continue;
    }

    const nextHomeScore = toNumber(entry?.homeScore);
    const nextAwayScore = toNumber(entry?.awayScore);

    if (nextHomeScore !== null) {
      homeScore = nextHomeScore;
    }

    if (nextAwayScore !== null) {
      awayScore = nextAwayScore;
    }
  }

  return {
    homeScore,
    awayScore
  };
}

function extractPlayerName(player) {
  const firstName = String(player?.firstName || '').trim();
  const lastName = String(player?.lastName || '').trim();
  const fullName = `${firstName} ${lastName}`.trim();

  return fullName || String(player?.displayName || '').trim();
}

function buildPlayerLookup(players) {
  const lookup = new Map();

  for (const player of Array.isArray(players) ? players : []) {
    const playerId = String(player?.playerId || '').trim();
    const playerName = extractPlayerName(player);

    if (playerId && playerName) {
      lookup.set(playerId, playerName);
    }
  }

  return lookup;
}

function buildPlayerStatsRows(rows, playerLookup, teamName) {
  const playerStats = [];

  for (const row of Array.isArray(rows) ? rows : []) {
    const playerId = String(row?.playerId || '').trim();
    const playerName = playerLookup.get(playerId) || '';

    if (!playerName) {
      continue;
    }

    const statValues = {};

    for (const [key, value] of Object.entries(row || {})) {
      if (key === 'playerId') {
        continue;
      }

      const numeric = toNumber(value);

      if (numeric !== null) {
        statValues[key] = numeric;
      }
    }

    playerStats.push({
      playerId,
      playerName,
      teamName,
      statValues,
      points: toNumber(row?.points)
    });
  }

  return playerStats;
}

function parseFixtureEvent(fixture) {
  const matchCentreUrl = String(fixture?.matchCentreUrl || '').trim();

  return {
    id: String(fixture?.matchId || matchCentreUrl || `${fixture?.clock?.kickOffTimeLong || ''}:${fixture?.homeTeam?.teamId || ''}:${fixture?.awayTeam?.teamId || ''}`),
    matchCentreUrl,
    sourceUrl: buildAbsoluteUrl(matchCentreUrl),
    startTime: fixture?.clock?.kickOffTimeLong || '',
    homeTeamId: String(fixture?.homeTeam?.teamId || ''),
    homeTeam: fixture?.homeTeam?.name || fixture?.homeTeam?.nickName || '',
    awayTeamId: String(fixture?.awayTeam?.teamId || ''),
    awayTeam: fixture?.awayTeam?.name || fixture?.awayTeam?.nickName || '',
    homeScore: toNumber(fixture?.homeTeam?.score),
    awayScore: toNumber(fixture?.awayTeam?.score),
    homeLinescores: [],
    awayLinescores: [],
    state: mapMatchState(fixture?.matchMode, fixture?.matchState),
    shortStatus: fixture?.matchState || fixture?.matchMode || ''
  };
}

export function extractNrlOfficialQData(html, elementId) {
  const pattern = new RegExp(`id="${elementId}"[^>]*q-data="([\\s\\S]*?)"`, 'i');
  const match = String(html || '').match(pattern);

  if (!match) {
    return null;
  }

  return JSON.parse(decodeHtmlEntities(match[1]));
}

export function parseNrlOfficialFixtureData(data) {
  return (Array.isArray(data?.fixtures) ? data.fixtures : [])
    .filter((fixture) => String(fixture?.type || '').toLowerCase() === 'match')
    .map(parseFixtureEvent);
}

export function parseNrlOfficialMatchData(data, sourceUrl = '') {
  const match = data?.match || {};
  const homeTeam = match?.homeTeam || {};
  const awayTeam = match?.awayTeam || {};
  const homePlayerLookup = buildPlayerLookup(homeTeam.players);
  const awayPlayerLookup = buildPlayerLookup(awayTeam.players);
  const firstHalfScores = buildFirstHalfScores(match);

  return {
    sourceUrl,
    event: {
      id: String(match?.matchId || sourceUrl || ''),
      matchCentreUrl: sourceUrl ? new URL(sourceUrl).pathname : '',
      sourceUrl,
      startTime: match?.startTime || '',
      homeTeamId: String(homeTeam?.teamId || ''),
      homeTeam: homeTeam?.name || homeTeam?.nickName || '',
      awayTeamId: String(awayTeam?.teamId || ''),
      awayTeam: awayTeam?.name || awayTeam?.nickName || '',
      homeScore: toNumber(homeTeam?.score),
      awayScore: toNumber(awayTeam?.score),
      homeLinescores: firstHalfScores ? buildFirstHalfLinescore(firstHalfScores.homeScore) : [],
      awayLinescores: firstHalfScores ? buildFirstHalfLinescore(firstHalfScores.awayScore) : [],
      state: mapMatchState(match?.matchMode, match?.matchState),
      shortStatus: match?.matchState || match?.matchMode || ''
    },
    playerStats: [
      ...buildPlayerStatsRows(match?.stats?.players?.homeTeam, homePlayerLookup, homeTeam?.name || homeTeam?.nickName || ''),
      ...buildPlayerStatsRows(match?.stats?.players?.awayTeam, awayPlayerLookup, awayTeam?.name || awayTeam?.nickName || '')
    ],
    summary: data
  };
}

async function fetchDrawData(season, roundNumber) {
  const sourceUrl = `${BASE_URL}/draw/?competition=${DRAW_COMPETITION_ID}&season=${season}&round=${roundNumber}`;
  const response = await fetch(sourceUrl, {
    headers: {
      'User-Agent': USER_AGENT
    }
  });

  if (!response.ok) {
    throw new Error(`Official NRL draw request failed (${response.status}).`);
  }

  const html = await response.text();
  const data = extractNrlOfficialQData(html, 'vue-draw');

  if (!data) {
    throw new Error('Official NRL draw page did not expose q-data.');
  }

  return {
    sourceUrl,
    data
  };
}

export async function fetchNrlOfficialSlate(_sport, dateKey, timeZone = 'Australia/Sydney') {
  const season = Number(String(dateKey || '').slice(0, 4));

  if (!Number.isInteger(season) || season < 2000) {
    throw new Error(`Official NRL slate could not derive a season from ${dateKey}.`);
  }

  const initialRound = await fetchDrawData(season, 1);
  const roundValues = [...new Set((Array.isArray(initialRound.data?.filterRounds) ? initialRound.data.filterRounds : [])
    .map((round) => toNumber(round?.value))
    .filter((value) => value !== null))];
  const roundFetches = await Promise.allSettled(roundValues.map(async (roundValue) => {
    if (roundValue === 1) {
      return initialRound;
    }

    return fetchDrawData(season, roundValue);
  }));
  const matchedEvents = [];
  let sourceUrl = initialRound.sourceUrl;

  for (const result of roundFetches) {
    if (result.status !== 'fulfilled') {
      continue;
    }

    const parsedEvents = parseNrlOfficialFixtureData(result.value.data)
      .filter((event) => formatDateKey(event.startTime, timeZone) === dateKey);

    if (parsedEvents.length) {
      sourceUrl = result.value.sourceUrl;
      matchedEvents.push(...parsedEvents);
    }
  }

  const dedupedEvents = [...new Map(matchedEvents.map((event) => [event.matchCentreUrl || event.id, event])).values()];

  return {
    sourceUrl,
    events: dedupedEvents
  };
}

export async function fetchNrlOfficialSummary(_sport, eventOrUrl) {
  const relativeUrl = typeof eventOrUrl === 'string'
    ? eventOrUrl
    : (eventOrUrl?.matchCentreUrl || eventOrUrl?.sourceUrl || eventOrUrl?.url || '');
  const sourceUrl = buildAbsoluteUrl(relativeUrl);

  if (!sourceUrl) {
    throw new Error('Official NRL summary requires a match-centre URL.');
  }

  const response = await fetch(sourceUrl, {
    headers: {
      'User-Agent': USER_AGENT
    }
  });

  if (!response.ok) {
    throw new Error(`Official NRL match-centre request failed (${response.status}).`);
  }

  const html = await response.text();
  const data = extractNrlOfficialQData(html, 'vue-match-centre');

  if (!data) {
    throw new Error('Official NRL match-centre page did not expose q-data.');
  }

  return parseNrlOfficialMatchData(data, sourceUrl);
}