import fs from 'node:fs/promises';

import { fetchSportsGameOddsConsensus } from './providers/sports-game-odds.mjs';
import { canUseSportsGameOdds, getSportsGameOddsLeagueId, recordSportsGameOddsUsage } from './sports-game-odds-fallback.mjs';

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function numbersEqual(left, right) {
  if (left === undefined || right === undefined || left === null || right === null) {
    return true;
  }

  return Number(left) === Number(right);
}

function numberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isFresh(isoString, ttlMinutes) {
  if (!isoString) {
    return false;
  }

  const timestamp = new Date(isoString).getTime();

  if (!Number.isFinite(timestamp)) {
    return false;
  }

  return Date.now() - timestamp <= ttlMinutes * 60_000;
}

function getCacheKey(oddsCheck) {
  const normalized = {
    sportKey: oddsCheck.sportKey || '',
    market: oddsCheck.market || '',
    homeTeam: normalizeText(oddsCheck.homeTeam),
    awayTeam: normalizeText(oddsCheck.awayTeam),
    outcomeName: normalizeText(oddsCheck.outcomeName),
    description: normalizeText(oddsCheck.description),
    point: oddsCheck.point ?? null,
    minimumOdds: numberOrNull(oddsCheck.minimumOdds || 2),
    minimumBooksAtOrAbove: numberOrNull(oddsCheck.minimumBooksAtOrAbove || 0),
    regions: oddsCheck.regions || '',
    bookmakers: Array.isArray(oddsCheck.bookmakers)
      ? [...oddsCheck.bookmakers].map((item) => normalizeText(item)).sort()
      : []
  };

  return JSON.stringify(normalized);
}

function buildConsensusResult(matchedBooks, oddsCheck, extras = {}) {
  const minimumOdds = Number(oddsCheck.minimumOdds || 2);
  const booksAtOrAbove = matchedBooks.filter((book) => book.price >= minimumOdds);
  const best = matchedBooks.reduce((current, candidate) => candidate.price > current.price ? candidate : current);
  const averageOdds = matchedBooks.reduce((sum, book) => sum + book.price, 0) / matchedBooks.length;

  return {
    status: 'ok',
    booksChecked: matchedBooks.length,
    booksAtOrAbove: booksAtOrAbove.length,
    minimumOdds,
    bestOdds: best.price,
    bestBookmaker: best.bookmakerTitle,
    averageOdds,
    ...extras
  };
}

function pickPreferredPrices(prices, providers) {
  if (!Array.isArray(prices) || !prices.length) {
    return [];
  }

  const normalizedProviders = Array.isArray(providers)
    ? providers.map((item) => normalizeText(item)).filter(Boolean)
    : [];

  if (!normalizedProviders.length) {
    return prices;
  }

  const providerOrder = new Map(normalizedProviders.map((item, index) => [item, index]));
  const preferred = prices.filter((price) => {
    const key = normalizeText(price.bookmakerKey || price.bookmakerTitle);
    return providerOrder.has(key);
  });

  if (!preferred.length) {
    return prices;
  }

  return preferred.sort((left, right) => {
    const leftKey = normalizeText(left.bookmakerKey || left.bookmakerTitle);
    const rightKey = normalizeText(right.bookmakerKey || right.bookmakerTitle);
    return providerOrder.get(leftKey) - providerOrder.get(rightKey);
  });
}

function findMatchingSnapshotQuote(quotes, oddsCheck) {
  const sportKey = normalizeText(oddsCheck.sportKey);
  const market = normalizeText(oddsCheck.market);
  const homeTeam = normalizeText(oddsCheck.homeTeam);
  const awayTeam = normalizeText(oddsCheck.awayTeam);
  const outcomeName = normalizeText(oddsCheck.outcomeName);
  const description = normalizeText(oddsCheck.description);

  return quotes.find((quote) => {
    if (normalizeText(quote.sportKey) !== sportKey) {
      return false;
    }

    if (normalizeText(quote.market) !== market) {
      return false;
    }

    if (normalizeText(quote.homeTeam) !== homeTeam || normalizeText(quote.awayTeam) !== awayTeam) {
      return false;
    }

    if (outcomeName && normalizeText(quote.outcomeName) !== outcomeName) {
      return false;
    }

    if (description && normalizeText(quote.description) !== description) {
      return false;
    }

    if (!numbersEqual(quote.point, oddsCheck.point)) {
      return false;
    }

    return true;
  });
}

async function loadSnapshotFile(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      updatedAt: parsed.updatedAt || null,
      quotes: Array.isArray(parsed.quotes) ? parsed.quotes : []
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {
        updatedAt: null,
        quotes: []
      };
    }

    throw error;
  }
}

async function trySnapshotValidation(config, oddsCheck, maxAgeMinutes) {
  if (!config.bookmakerFallback.enabled || !config.bookmakerFallback.preferSnapshot) {
    return null;
  }

  const snapshot = await loadSnapshotFile(config.__paths.snapshotFile);
  const quote = findMatchingSnapshotQuote(snapshot.quotes, oddsCheck);

  if (!quote) {
    return null;
  }

  const fetchedAt = quote.fetchedAt || snapshot.updatedAt || null;
  const freshnessLimit = Math.min(config.bookmakerFallback.maxSnapshotAgeMinutes, maxAgeMinutes ?? config.bookmakerFallback.maxSnapshotAgeMinutes);

  if (fetchedAt && !isFresh(fetchedAt, freshnessLimit)) {
    return {
      status: 'snapshot_stale',
      source: 'snapshot',
      sourceLabel: 'bookmaker snapshot',
      snapshotFetchedAt: fetchedAt
    };
  }

  const matchedBooks = pickPreferredPrices(quote.prices, config.bookmakerFallback.providers)
    .map((price) => ({
      bookmakerKey: price.bookmakerKey || normalizeText(price.bookmakerTitle),
      bookmakerTitle: price.bookmakerTitle || price.bookmakerKey || 'Bookmaker',
      price: Number(price.price)
    }))
    .filter((price) => Number.isFinite(price.price));

  if (!matchedBooks.length) {
    return null;
  }

  return buildConsensusResult(matchedBooks, oddsCheck, {
    source: 'snapshot',
    sourceLabel: 'bookmaker snapshot',
    snapshotFetchedAt: fetchedAt
  });
}

function getValidationCache(state) {
  state.cache ??= {};
  state.cache.oddsValidation ??= {};
  return state.cache.oddsValidation;
}

function getCachedValidation(state, oddsCheck, ttlMinutes) {
  const entry = getValidationCache(state)[getCacheKey(oddsCheck)];

  if (!entry || !isFresh(entry.cachedAt, ttlMinutes)) {
    return null;
  }

  return {
    ...entry.result,
    cached: true
  };
}

function cacheValidation(state, oddsCheck, result) {
  getValidationCache(state)[getCacheKey(oddsCheck)] = {
    cachedAt: new Date().toISOString(),
    result
  };
}

export async function resolveOddsValidation(context, oddsCheck, options = {}) {
  if (!oddsCheck) {
    return null;
  }

  const { config, state } = context;
  const freshnessLimit = Math.min(config.sportsGameOdds.cacheTtlMinutes, Number(options.maxAgeMinutes || config.sportsGameOdds.cacheTtlMinutes));
  const cached = getCachedValidation(state, oddsCheck, freshnessLimit);

  if (cached) {
    return cached;
  }

  const snapshot = await trySnapshotValidation(config, oddsCheck, freshnessLimit);

  if (snapshot?.status === 'ok') {
    cacheValidation(state, oddsCheck, snapshot);
    return snapshot;
  }

  if (!await canUseSportsGameOdds(context, 'picks')) {
    return snapshot || {
      status: config.sportsGameOdds.enabled ? 'budget_guard' : 'disabled',
      source: 'snapshot',
      sourceLabel: config.sportsGameOdds.enabled ? 'SportsGameOdds reserve guard' : 'snapshot-only mode'
    };
  }

  let liveResult;

  try {
    liveResult = await fetchSportsGameOddsConsensus(config.sportsGameOdds, oddsCheck, {
      leagueId: getSportsGameOddsLeagueId(config, oddsCheck.sportKey)
    });
  } catch (error) {
    liveResult = {
      status: 'error',
      message: error.message
    };
  }

  const annotatedResult = {
    ...liveResult,
    source: 'sportsGameOdds',
    sourceLabel: 'SportsGameOdds'
  };

  recordSportsGameOddsUsage(state, annotatedResult);

  if (annotatedResult.status === 'ok') {
    cacheValidation(state, oddsCheck, annotatedResult);
  }

  return annotatedResult;
}