const BASE_URL = 'https://api.sportsgameodds.com/v2';
const USER_AGENT = 'SportsTipsDiscordWebhook/1.0';

const EVENT_BATCH_CACHE = new Map();

const MARKET_KEYWORDS = {
  player_points: ['points'],
  player_rebounds: ['rebounds'],
  player_assists: ['assists'],
  player_threes: ['threes', 'three pointers', 'made threes'],
  player_disposals: ['disposals'],
  player_goals: ['goals', 'goal'],
  player_shots_on_goal: ['shots on goal'],
  pitcher_strikeouts: ['strikeouts', 'strikeout'],
  batter_hits: ['hits', 'hit'],
  batter_total_bases: ['total bases', 'total base'],
  batter_rbis: ['rbi', 'runs batted in'],
  player_pass_yds: ['passing yards'],
  player_pass_tds: ['passing touchdowns', 'passing touchdown'],
  player_rush_yds: ['rushing yards'],
  player_reception_yds: ['receiving yards']
};

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizeComparableTeamName(value) {
  return normalizeText(String(value || '')
    .replace(/\s*\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim());
}

export const __testables = {
  normalizeComparableTeamName
};

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

function numbersEqual(left, right) {
  if (left === undefined || left === null || right === undefined || right === null) {
    return true;
  }

  return Number(left) === Number(right);
}

function americanToDecimal(value) {
  const trimmed = String(value || '').trim();

  if (!trimmed) {
    return null;
  }

  const numeric = Number(trimmed);

  if (!Number.isFinite(numeric)) {
    return null;
  }

  if (!trimmed.startsWith('+') && !trimmed.startsWith('-') && numeric > 1) {
    return Number(numeric.toFixed(2));
  }

  if (numeric === 0) {
    return null;
  }

  const decimal = numeric > 0
    ? 1 + (numeric / 100)
    : 1 + (100 / Math.abs(numeric));

  return Number(decimal.toFixed(2));
}

function buildUrl(pathname, params = {}) {
  const url = new URL(`${BASE_URL}${pathname}`);

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') {
      continue;
    }

    url.searchParams.set(key, String(value));
  }

  return url;
}

async function fetchJson(url, apiKey) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'x-api-key': apiKey
    }
  });

  if (!response.ok) {
    throw new Error(`SportsGameOdds request failed (${response.status}).`);
  }

  return response.json();
}

function getEventHomeTeam(event) {
  return event?.teams?.home?.name
    || event?.teams?.home?.names?.long
    || event?.home_team
    || '';
}

function getEventAwayTeam(event) {
  return event?.teams?.away?.name
    || event?.teams?.away?.names?.long
    || event?.away_team
    || '';
}

function getEventStartTime(event) {
  return event?.startTime || event?.status?.startsAt || event?.commence_time || null;
}

function getEventPlayerName(event, playerId) {
  return event?.players?.[playerId]?.name || '';
}

function getBookEntries(odd) {
  return Object.entries(odd?.byBookmaker || {});
}

function getBookLine(odd, bookmakerEntry) {
  return toNumber(bookmakerEntry?.overUnder ?? odd?.bookOverUnder ?? odd?.fairOverUnder ?? null);
}

function getBookPrice(bookmakerEntry) {
  return americanToDecimal(bookmakerEntry?.odds ?? bookmakerEntry?.bookOdds ?? '');
}

function getSportMarketKeywords(market) {
  return MARKET_KEYWORDS[market] || [];
}

function buildSelectionShape(oddsCheck) {
  const normalizedOutcomeName = normalizeText(oddsCheck?.outcomeName);

  if (normalizedOutcomeName === 'over' || normalizedOutcomeName === 'under') {
    return {
      side: normalizedOutcomeName,
      line: toNumber(oddsCheck?.point)
    };
  }

  const thresholdMatch = String(oddsCheck?.outcomeName || '').trim().match(/^(\d+(?:\.\d+)?)\+\s+(.+)$/i);

  if (thresholdMatch) {
    const threshold = Number(thresholdMatch[1]);
    return {
      side: 'over',
      line: Number((threshold - 0.5).toFixed(1))
    };
  }

  return {
    side: normalizedOutcomeName,
    line: toNumber(oddsCheck?.point)
  };
}

function eventMatchesOddsCheck(event, oddsCheck) {
  if (normalizeComparableTeamName(getEventHomeTeam(event)) !== normalizeComparableTeamName(oddsCheck.homeTeam)) {
    return false;
  }

  if (normalizeComparableTeamName(getEventAwayTeam(event)) !== normalizeComparableTeamName(oddsCheck.awayTeam)) {
    return false;
  }

  if (!oddsCheck.startTime) {
    return true;
  }

  const expectedStart = new Date(oddsCheck.startTime).getTime();
  const eventStart = new Date(getEventStartTime(event)).getTime();

  if (!Number.isFinite(expectedStart) || !Number.isFinite(eventStart)) {
    return true;
  }

  return Math.abs(expectedStart - eventStart) <= 12 * 60 * 60 * 1000;
}

function oddMatchesSelection(event, odd, oddsCheck) {
  const market = String(oddsCheck?.market || '');
  const selectionShape = buildSelectionShape(oddsCheck);
  const normalizedPlayerName = normalizeText(oddsCheck?.description);
  const normalizedOutcomeName = normalizeText(oddsCheck?.outcomeName);
  const normalizedMarketName = normalizeText(odd?.marketName || '');
  const normalizedPlayerFromOdd = normalizeText(getEventPlayerName(event, odd?.playerID));

  if (market === 'h2h') {
    return normalizeText(odd?.betTypeID) === 'ml'
      && normalizeText(odd?.sideID) === (normalizeText(oddsCheck.outcomeName) === normalizeText(oddsCheck.homeTeam) ? 'home' : 'away');
  }

  if (market === 'spreads') {
    const sideMatches = normalizeText(odd?.betTypeID) === 'sp'
      && normalizeText(odd?.sideID) === (normalizeText(oddsCheck.outcomeName) === normalizeText(oddsCheck.homeTeam) ? 'home' : 'away');

    if (!sideMatches) {
      return false;
    }

    const line = getBookLine(odd, {});
    return line === null || numbersEqual(Math.abs(oddsCheck.point), line);
  }

  if (market === 'totals') {
    const sideMatches = normalizeText(odd?.betTypeID) === 'ou' && normalizeText(odd?.sideID) === normalizedOutcomeName;

    if (!sideMatches) {
      return false;
    }

    return numbersEqual(getBookLine(odd, {}), oddsCheck.point);
  }

  if (normalizeText(odd?.periodID) && normalizeText(odd?.periodID) !== 'game') {
    return false;
  }

  if (normalizedPlayerName && normalizedPlayerFromOdd && normalizedPlayerName !== normalizedPlayerFromOdd) {
    return false;
  }

  if (normalizedPlayerName && !normalizedPlayerFromOdd && !normalizedMarketName.includes(normalizedPlayerName)) {
    return false;
  }

  if (!getSportMarketKeywords(market).some((keyword) => normalizedMarketName.includes(normalizeText(keyword)))) {
    return false;
  }

  if (selectionShape.side === 'over' || selectionShape.side === 'under') {
    if (normalizeText(odd?.betTypeID) !== 'ou' || normalizeText(odd?.sideID) !== selectionShape.side) {
      return false;
    }

    if (selectionShape.line !== null) {
      const topLevelLine = getBookLine(odd, {});

      if (topLevelLine !== null && !numbersEqual(topLevelLine, selectionShape.line)) {
        return false;
      }
    }

    return true;
  }

  return normalizedMarketName.includes(normalizedOutcomeName);
}

async function fetchLeagueEvents(apiConfig, leagueId) {
  const cacheKey = String(leagueId || '').toUpperCase();
  const cached = EVENT_BATCH_CACHE.get(cacheKey);

  if (cached && isFresh(cached.cachedAt, apiConfig.eventCacheTtlMinutes || 180)) {
    return {
      status: 'ok',
      events: cached.events,
      objectCost: 0,
      cached: true,
      sourceUrl: cached.sourceUrl
    };
  }

  const url = buildUrl('/events', {
    leagueID: leagueId,
    oddsAvailable: 'true',
    finalized: 'false',
    limit: 100
  });
  const payload = await fetchJson(url, apiConfig.apiKey);
  const events = Array.isArray(payload?.data) ? payload.data : [];

  EVENT_BATCH_CACHE.set(cacheKey, {
    cachedAt: new Date().toISOString(),
    events,
    sourceUrl: url.toString()
  });

  return {
    status: 'ok',
    events,
    objectCost: Math.max(1, events.length),
    cached: false,
    sourceUrl: url.toString(),
    notice: payload?.notice || null
  };
}

export async function fetchSportsGameOddsUsage(apiConfig) {
  if (!apiConfig?.enabled || !apiConfig?.apiKey) {
    return {
      status: 'disabled'
    };
  }

  const payload = await fetchJson(buildUrl('/account/usage'), apiConfig.apiKey);
  const monthly = payload?.data?.rateLimits?.['per-month'] || {};
  const max = toNumber(monthly.maxEntitiesPerInterval);
  const used = toNumber(monthly.currentIntervalEntities);

  return {
    status: 'ok',
    monthlyObjectsMax: max,
    monthlyObjectsUsed: used,
    monthlyObjectsRemaining: max !== null && used !== null ? Math.max(0, max - used) : null
  };
}

export async function fetchSportsGameOddsConsensus(apiConfig, oddsCheck, options = {}) {
  if (!apiConfig?.enabled) {
    return {
      status: 'disabled'
    };
  }

  if (!apiConfig.apiKey) {
    return {
      status: 'missing_api_key'
    };
  }

  if (!options.leagueId) {
    return {
      status: 'league_unmapped'
    };
  }

  const batch = await fetchLeagueEvents(apiConfig, options.leagueId);
  const matchedEvent = batch.events.find((event) => eventMatchesOddsCheck(event, oddsCheck));

  if (!matchedEvent) {
    return {
      status: 'event_not_found',
      objectCost: batch.objectCost,
      cached: batch.cached,
      sourceUrl: batch.sourceUrl
    };
  }

  const bookmakerFilter = new Set((Array.isArray(apiConfig.bookmakers) ? apiConfig.bookmakers : []).map((item) => normalizeText(item)).filter(Boolean));
  const matchedBooks = [];

  for (const odd of Object.values(matchedEvent?.odds || {})) {
    if (!oddMatchesSelection(matchedEvent, odd, oddsCheck)) {
      continue;
    }

    for (const [bookmakerKey, bookmakerEntry] of getBookEntries(odd)) {
      if (bookmakerFilter.size > 0 && !bookmakerFilter.has(normalizeText(bookmakerKey))) {
        continue;
      }

      if (selectionShapeRequiresLine(oddsCheck)) {
        const line = getBookLine(odd, bookmakerEntry);

        if (!numbersEqual(line, buildSelectionShape(oddsCheck).line)) {
          continue;
        }
      }

      const price = getBookPrice(bookmakerEntry);

      if (price === null || price <= 1) {
        continue;
      }

      matchedBooks.push({
        bookmakerKey,
        bookmakerTitle: bookmakerKey,
        price
      });
    }
  }

  if (!matchedBooks.length) {
    return {
      status: 'selection_not_found',
      eventId: matchedEvent.eventID,
      objectCost: batch.objectCost,
      cached: batch.cached,
      sourceUrl: batch.sourceUrl
    };
  }

  const minimumOdds = Number(oddsCheck.minimumOdds || 1.01);
  const booksAtOrAbove = matchedBooks.filter((book) => book.price >= minimumOdds);
  const best = matchedBooks.reduce((current, candidate) => candidate.price > current.price ? candidate : current);
  const averageOdds = matchedBooks.reduce((sum, book) => sum + book.price, 0) / matchedBooks.length;

  return {
    status: 'ok',
    eventId: matchedEvent.eventID,
    booksChecked: matchedBooks.length,
    booksAtOrAbove: booksAtOrAbove.length,
    minimumOdds,
    bestOdds: best.price,
    bestBookmaker: best.bookmakerTitle,
    averageOdds,
    objectCost: batch.objectCost,
    cached: batch.cached,
    sourceUrl: batch.sourceUrl
  };
}

function selectionShapeRequiresLine(oddsCheck) {
  const shape = buildSelectionShape(oddsCheck);
  return shape.line !== null && (shape.side === 'over' || shape.side === 'under');
}

export async function fetchSportsGameOddsSlate(apiConfig, options = {}) {
  if (!apiConfig?.enabled) {
    return {
      status: 'disabled',
      events: []
    };
  }

  if (!apiConfig.apiKey) {
    return {
      status: 'missing_api_key',
      events: []
    };
  }

  if (!options.leagueId) {
    return {
      status: 'league_unmapped',
      events: []
    };
  }

  const batch = await fetchLeagueEvents(apiConfig, options.leagueId);
  const events = batch.events
    .filter((event) => {
      if (!options.dateKey || !options.timeZone) {
        return true;
      }

      const dateKey = new Intl.DateTimeFormat('en-CA', {
        timeZone: options.timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(new Date(getEventStartTime(event)));

      return dateKey === options.dateKey;
    })
    .map((event) => ({
      id: event.eventID,
      name: `${getEventAwayTeam(event)} vs ${getEventHomeTeam(event)}`,
      startTime: getEventStartTime(event),
      state: event?.status?.live ? 'in' : event?.status?.completed || event?.status?.finalized ? 'post' : 'pre',
      shortStatus: event?.status?.displayShort || event?.status?.displayLong || 'Upcoming'
    }));

  return {
    status: 'ok',
    events,
    objectCost: batch.objectCost,
    cached: batch.cached,
    sourceUrl: batch.sourceUrl
  };
}