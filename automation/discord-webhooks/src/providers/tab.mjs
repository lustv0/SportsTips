// TAB market-menu provider.
//
// TAB's public API (api.beta.tab.com.au) sits behind an Akamai WAF that blocks plain
// fetch, and headless access is intermittently challenged — so this is NOT used on the
// daemon's per-cycle hot path. Instead it captures TAB's (essentially static) market
// MENU per sport opportunistically and caches it to tab-market-menu.json. The pick
// generator reads that cache to softly prefer markets TAB actually offers, so tips stay
// placeable on TAB. Reliability of a single capture is therefore non-critical: we keep
// the previous cache for any sport that can't be captured right now.

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

export const TAB_DEFAULT_EDGE_PATHS = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
];

const TAB_INFO_BASE = 'https://api.beta.tab.com.au/v1/tab-info-service';

// Match the bot's sportKey to TAB's sport + competition naming.
// NOTE: sport patterns must be specific — TAB names AFL "AFL Football" and gridiron
// "American Football", so soccer must NOT match a bare "football".
const TAB_SPORT_MATCHERS = {
  nrl: { sport: /rugby league/i, competition: /^nrl$|national rugby league/i },
  afl: { sport: /afl football|australian (rules|football)/i, competition: /^afl$/i },
  mlb: { sport: /baseball/i, competition: /mlb|major league/i },
  nba: { sport: /basketball/i, competition: /^nba$|national basketball/i },
  nfl: { sport: /american football|gridiron/i, competition: /^nfl$|national football/i },
  nhl: { sport: /ice hockey/i, competition: /^nhl$/i },
  soccer_fifa_world_cup: { sport: /^soccer$/i, competition: /world cup/i },
  soccer_epl: { sport: /^soccer$/i, competition: /premier league|epl/i },
  soccer_uefa_champs_league: { sport: /^soccer$/i, competition: /champions league/i },
  tennis_atp: { sport: /tennis/i, competition: /\batp\b/i }
};

function normalize(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// Classify a TAB market into the bot's canonical market key, or null if unmapped.
// Defensive name/betOption matching — exact for a SOFT preference is not critical.
export function classifyTabMarket(sportKey, market) {
  const text = normalize(`${market?.betOption || ''} ${market?.name || ''} ${market?.shortName || ''}`);
  if (!text) {
    return null;
  }

  const isFirstHalf = /(1st half|first half|1h|half time)/.test(text);
  const isTotal = /(total (points|match|runs|match points)|tot pts|totptsou|over under|o u\b)/.test(text);
  const isLine = /(\bline\b|handicap|spread)/.test(text);
  const isH2h = /(head to head|hd to hd|match betting|money ?line|match result|to win)/.test(text);

  if (isH2h && !isLine && !isTotal) {
    return 'h2h';
  }
  if (isTotal) {
    return isFirstHalf ? 'first_half_totals' : 'totals';
  }
  if (isLine) {
    return isFirstHalf ? 'first_half_spreads' : 'spreads';
  }

  // Player props by sport.
  if (sportKey === 'afl') {
    if (/disposal/.test(text)) return 'player_disposals';
    if (/\bgoal/.test(text)) return 'player_goals';
  }
  if (sportKey === 'mlb') {
    if (/strikeout/.test(text)) return 'pitcher_strikeouts';
    if (/\bhits?\b/.test(text)) return 'batter_hits';
  }
  if (sportKey === 'nrl') {
    if (/player.*points|points scored|to score points/.test(text)) return 'player points';
    if (/try scorer|score a try|anytime try|first try|to score/.test(text)) return 'try_scorer';
  }
  if (sportKey === 'nba') {
    if (/points/.test(text)) return 'player_points';
    if (/rebound/.test(text)) return 'player_rebounds';
    if (/assist/.test(text)) return 'player_assists';
  }

  return null;
}

function makeApiGetter(page, jurisdiction, waitMs) {
  const withJ = (url) => (url.includes('jurisdiction') ? url : `${url}${url.includes('?') ? '&' : '?'}jurisdiction=${jurisdiction}`);
  const reprime = async () => {
    try {
      await page.goto('https://www.tab.com.au/sports', { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(waitMs);
    } catch {
      // Ignore; the next fetch attempt will simply retry.
    }
  };

  return async function apiGet(url) {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const out = await page.evaluate(async (target) => {
        try {
          const response = await fetch(target, { headers: { Accept: 'application/json' } });
          return { status: response.status, body: await response.text() };
        } catch (error) {
          return { status: 0, body: String(error) };
        }
      }, withJ(url));

      if (out.status === 200) {
        try {
          return JSON.parse(out.body);
        } catch {
          return null;
        }
      }

      await page.waitForTimeout(2500);
      if (attempt === 3) {
        await reprime();
      }
    }

    return null;
  };
}

function findNamedLinkArray(obj) {
  for (const value of Object.values(obj || {})) {
    if (Array.isArray(value) && value.length && value[0] && (value[0]._links || value[0].name)) {
      return value;
    }
  }
  return [];
}

async function captureSportMenu(apiGet, sportsList, sportKey, matcher) {
  const sport = sportsList.find((entry) => matcher.sport.test(entry.name || ''));
  if (!sport?._links?.self) {
    return { status: 'sport_not_found' };
  }

  const sportDetail = await apiGet(sport._links.self);
  if (!sportDetail) {
    return { status: 'sport_fetch_failed' };
  }

  const competitions = sportDetail.competitions || findNamedLinkArray(sportDetail);
  // No fallback to competitions[0]: recording the wrong competition's markets is worse
  // than recording nothing (the menu would mislabel what TAB offers).
  const competition = competitions.find((entry) => matcher.competition.test(entry.name || ''));
  if (!competition) {
    return { status: 'competition_not_found', sport: sport.name, competitions: competitions.map((c) => c.name).slice(0, 12) };
  }

  const compUrl = competition._links?.self
    || `${TAB_INFO_BASE}/sports/${encodeURIComponent(sport.name)}/competitions/${encodeURIComponent(competition.name)}/matches`;
  const compDetail = await apiGet(compUrl);
  const matches = (compDetail?.matches || findNamedLinkArray(compDetail || {})).filter((entry) => entry?._links?.self);
  // Pick the match with the most open markets — TAB opens more markets (props, etc.)
  // closer to kickoff, so the richest match gives the fullest menu snapshot.
  const match = [...matches].sort((a, b) => (Number(b.openMarketCount) || 0) - (Number(a.openMarketCount) || 0))[0];
  if (!match) {
    return { status: 'no_matches', sport: sport.name, competition: competition.name };
  }

  const matchDetail = await apiGet(match._links.self);
  const markets = matchDetail?.markets || [];
  if (!markets.length) {
    return { status: 'no_markets', sport: sport.name, competition: competition.name, sampleMatch: match.name };
  }

  const canonical = new Set();
  const rawMarketTypes = new Set();
  for (const market of markets) {
    rawMarketTypes.add(market.betOption || market.name || 'unknown');
    const key = classifyTabMarket(sportKey, market);
    if (key) {
      canonical.add(key);
    }
  }

  return {
    status: 'ok',
    sport: sport.name,
    competition: competition.name,
    sampleMatch: match.name,
    marketCount: markets.length,
    canonicalMarkets: [...canonical].sort(),
    rawMarketTypes: [...rawMarketTypes].sort()
  };
}

export function resolveEdgePath(configured) {
  return [configured, ...TAB_DEFAULT_EDGE_PATHS].filter(Boolean).find((path) => existsSync(path)) || null;
}

// Capture TAB's market menu for the given sportKeys. Best-effort: returns whatever it
// could capture; callers should merge with the prior cache for any non-'ok' sport.
export async function captureTabMarketMenu(options = {}) {
  const {
    sportKeys = Object.keys(TAB_SPORT_MATCHERS),
    edgePath,
    jurisdiction = 'NSW',
    settleMs = 8000,
    maxDurationMs = 0, // 0 = no soft budget; otherwise stop starting new sports past this
    log = () => {}
  } = options;

  const resolvedEdge = resolveEdgePath(edgePath);
  if (!resolvedEdge) {
    throw new Error('No Microsoft Edge executable found for TAB capture. Set tab.edgePath in config.');
  }

  const { chromium } = await import('playwright-core');
  const browser = await chromium.launch({
    executablePath: resolvedEdge,
    headless: true,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox']
  });

  const sports = {};

  try {
    const context = await browser.newContext({
      locale: 'en-AU',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36 Edg/149.0.0.0'
    });
    const page = await context.newPage();
    await page.goto('https://www.tab.com.au/sports', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(settleMs);

    const apiGet = makeApiGetter(page, jurisdiction, settleMs);
    const sportsResp = await apiGet(`${TAB_INFO_BASE}/sports`);
    const sportsList = sportsResp?.sports || [];

    if (!sportsList.length) {
      throw new Error('TAB sports list could not be loaded (Akamai likely blocked this session — retry).');
    }

    log(`[tab] sports available: ${sportsList.map((entry) => entry.name).join(', ')}`);

    const startedAt = Date.now();

    for (const sportKey of sportKeys) {
      const matcher = TAB_SPORT_MATCHERS[sportKey];
      if (!matcher) {
        sports[sportKey] = { status: 'no_matcher' };
        continue;
      }

      if (maxDurationMs && Date.now() - startedAt > maxDurationMs) {
        sports[sportKey] = { status: 'skipped_time_budget' };
        continue;
      }

      try {
        const result = await captureSportMenu(apiGet, sportsList, sportKey, matcher);
        sports[sportKey] = { ...result, capturedAt: new Date().toISOString() };
        log(`[tab] ${sportKey}: ${result.status}${result.canonicalMarkets ? ` -> ${result.canonicalMarkets.join(', ')}` : ''}`);
      } catch (error) {
        sports[sportKey] = { status: 'error', error: error.message };
        log(`[tab] ${sportKey}: error ${error.message}`);
      }
    }
  } finally {
    await browser.close();
  }

  return { capturedAt: new Date().toISOString(), jurisdiction, sports };
}

function unionSorted(a, b) {
  return [...new Set([...(a || []), ...(b || [])])].sort();
}

// Merge a fresh capture into an existing cache. TAB's menu is a superset that varies by
// match/closeness to kickoff, so for sports captured 'ok' in both we UNION the market
// lists (accumulate TAB's full menu over time); we keep a prior 'ok' menu when the new
// capture failed or had no matches.
export function mergeTabMenu(previous, captured) {
  const merged = { capturedAt: captured.capturedAt, jurisdiction: captured.jurisdiction, sports: { ...(previous?.sports || {}) } };

  for (const [sportKey, entry] of Object.entries(captured.sports || {})) {
    const prior = merged.sports[sportKey];

    if (entry.status === 'ok' && prior?.status === 'ok') {
      merged.sports[sportKey] = {
        ...entry,
        canonicalMarkets: unionSorted(prior.canonicalMarkets, entry.canonicalMarkets),
        rawMarketTypes: unionSorted(prior.rawMarketTypes, entry.rawMarketTypes),
        firstCapturedAt: prior.firstCapturedAt || prior.capturedAt || entry.capturedAt
      };
    } else if (entry.status === 'ok' || !prior) {
      merged.sports[sportKey] = entry;
    }
    // else: keep the prior 'ok' menu when this capture failed/no_matches.
  }

  return merged;
}

export async function loadTabMarketMenu(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch {
    return { capturedAt: null, sports: {} };
  }
}

export async function saveTabMarketMenu(filePath, menu) {
  await writeFile(filePath, `${JSON.stringify(menu, null, 2)}\n`);
}

// The canonical market keys TAB offers for a sport, or null if unknown (uncaptured).
export function getTabCanonicalMarkets(menu, sportKey) {
  const entry = menu?.sports?.[String(sportKey || '').toLowerCase()];
  if (!entry || entry.status !== 'ok' || !Array.isArray(entry.canonicalMarkets)) {
    return null;
  }
  return entry.canonicalMarkets;
}
