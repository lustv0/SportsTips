const DAILY_LINEUPS_BASE_URL = 'https://www.rotowire.com/baseball/daily-lineups.php';
const NEWS_URL = 'https://www.rotowire.com/baseball/news.php';
const USER_AGENT = 'SportsTipsDiscordWebhook/1.0';
const MLB_TEAM_NAMES_BY_ABBR = {
  ARI: 'Arizona Diamondbacks',
  ATL: 'Atlanta Braves',
  BAL: 'Baltimore Orioles',
  BOS: 'Boston Red Sox',
  CHC: 'Chicago Cubs',
  CIN: 'Cincinnati Reds',
  CLE: 'Cleveland Guardians',
  COL: 'Colorado Rockies',
  CWS: 'Chicago White Sox',
  DET: 'Detroit Tigers',
  HOU: 'Houston Astros',
  KC: 'Kansas City Royals',
  LAA: 'Los Angeles Angels',
  LAD: 'Los Angeles Dodgers',
  MIA: 'Miami Marlins',
  MIL: 'Milwaukee Brewers',
  MIN: 'Minnesota Twins',
  NYM: 'New York Mets',
  NYY: 'New York Yankees',
  OAK: 'Athletics',
  ATH: 'Athletics',
  PHI: 'Philadelphia Phillies',
  PIT: 'Pittsburgh Pirates',
  SD: 'San Diego Padres',
  SEA: 'Seattle Mariners',
  SF: 'San Francisco Giants',
  STL: 'St. Louis Cardinals',
  TB: 'Tampa Bay Rays',
  TEX: 'Texas Rangers',
  TOR: 'Toronto Blue Jays',
  WSH: 'Washington Nationals'
};

function stripDiacritics(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '');
}

function decodeHtmlEntities(value) {
  return String(value || '')
    .replace(/&nbsp;/gu, ' ')
    .replace(/&amp;/gu, '&')
    .replace(/&quot;/gu, '"')
    .replace(/&#39;|&apos;/gu, "'")
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&ndash;/gu, '-')
    .replace(/&mdash;/gu, '-')
    .replace(/&#(\d+);/gu, (_match, codePoint) => String.fromCodePoint(Number(codePoint)))
    .replace(/&#x([0-9a-f]+);/giu, (_match, hexCodePoint) => String.fromCodePoint(Number.parseInt(hexCodePoint, 16)));
}

function stripTags(value) {
  return decodeHtmlEntities(value)
    .replace(/<script[\s\S]*?<\/script>/gu, ' ')
    .replace(/<style[\s\S]*?<\/style>/gu, ' ')
    .replace(/<[^>]+>/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function normalizeText(value) {
  return stripDiacritics(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, ' ')
    .trim();
}

function cleanupTeamLabel(value) {
  return stripTags(value)
    .replace(/\s+\([^)]*\)\s*$/u, '')
    .trim();
}

function formatDateInTimeZone(value, timeZone) {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  return formatter.format(date);
}

async function fetchHtml(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT
    }
  });

  if (!response.ok) {
    throw new Error(`RotoWire request failed (${response.status}).`);
  }

  return response.text();
}

function getDailyLineupsUrl(pageKey = 'today') {
  return pageKey === 'tomorrow'
    ? `${DAILY_LINEUPS_BASE_URL}?date=tomorrow`
    : DAILY_LINEUPS_BASE_URL;
}

function toLineupStatus(value) {
  const normalized = normalizeText(value);

  if (normalized.includes('confirmed')) {
    return 'confirmed';
  }

  if (normalized.includes('expected')) {
    return 'expected';
  }

  return normalized || null;
}

function extractMatchValue(segment, pattern) {
  const match = String(segment || '').match(pattern);
  return match ? match[1] : '';
}

function extractSideLineup(segment, side, fallbackTeamName) {
  const sideClass = side === 'away' ? 'visit' : 'home';
  const listHtml = extractMatchValue(segment, new RegExp(`<ul class="lineup__list is-${sideClass}">([\\s\\S]*?)<\\/ul>`, 'u'));
  const starterName = stripTags(extractMatchValue(listHtml, /<div class="lineup__player-highlight-name">[\s\S]*?<a[^>]*>([^<]+)<\/a>/u));
  const lineupStatus = toLineupStatus(stripTags(extractMatchValue(listHtml, /<li class="lineup__status[^>]*">([\s\S]*?)<\/li>/u)));
  const players = [...String(listHtml || '').matchAll(/<li class="lineup__player">([\s\S]*?)<\/li>/gu)]
    .map((match, index) => {
      const playerHtml = match[1] || '';
      const playerName = stripTags(
        extractMatchValue(playerHtml, /<a[^>]*title="([^"]+)"/u)
        || extractMatchValue(playerHtml, /<a[^>]*>([\s\S]*?)<\/a>/u)
      );

      if (!playerName) {
        return null;
      }

      return {
        playerName,
        normalizedPlayerName: normalizeText(playerName),
        battingOrderIndex: index + 1,
        position: stripTags(extractMatchValue(playerHtml, /<div class="lineup__pos">([\s\S]*?)<\/div>/u)) || null
      };
    })
    .filter(Boolean);

  return {
    teamName: fallbackTeamName || '',
    teamSide: side,
    starterName,
    normalizedStarterName: normalizeText(starterName),
    lineupStatus,
    players
  };
}

export function extractRotowireMlbDailyLineups(html, options = {}) {
  const pageKey = options.pageKey || 'today';
  const segments = String(html || '')
    .split(/<div class="lineup is-mlb">/u)
    .slice(1);
  const games = segments.map((segment) => {
    const awayAbbr = stripTags(extractMatchValue(segment, /<div class="lineup__team is-visit">[\s\S]*?<div class="lineup__abbr">([\s\S]*?)<\/div>/u));
    const homeAbbr = stripTags(extractMatchValue(segment, /<div class="lineup__team is-home">[\s\S]*?<div class="lineup__abbr">([\s\S]*?)<\/div>/u));
    const awayTeam = MLB_TEAM_NAMES_BY_ABBR[awayAbbr] || cleanupTeamLabel(extractMatchValue(segment, /<div class="lineup__mteam is-visit">([\s\S]*?)<\/div>/u));
    const homeTeam = MLB_TEAM_NAMES_BY_ABBR[homeAbbr] || cleanupTeamLabel(extractMatchValue(segment, /<div class="lineup__mteam is-home">([\s\S]*?)<\/div>/u));

    if (!awayTeam || !homeTeam) {
      return null;
    }

    return {
      pageKey,
      startTimeLabel: stripTags(extractMatchValue(segment, /<div class="lineup__time">([\s\S]*?)<\/div>/u)) || null,
      awayTeam,
      awayAbbr,
      normalizedAwayTeam: normalizeText(awayTeam),
      homeTeam,
      homeAbbr,
      normalizedHomeTeam: normalizeText(homeTeam),
      away: extractSideLineup(segment, 'away', awayTeam),
      home: extractSideLineup(segment, 'home', homeTeam)
    };
  }).filter(Boolean);

  return {
    pageKey,
    games
  };
}

export function findMatchingRotowireMlbGame(lineupData, eventContext) {
  const normalizedHomeTeam = normalizeText(cleanupTeamLabel(eventContext?.homeTeam));
  const normalizedAwayTeam = normalizeText(cleanupTeamLabel(eventContext?.awayTeam));

  return (lineupData?.games || []).find((game) => game.normalizedHomeTeam === normalizedHomeTeam && game.normalizedAwayTeam === normalizedAwayTeam) || null;
}

export function getRotowireMlbLineupsPageKey(startTime, now = new Date()) {
  const eventDateKey = formatDateInTimeZone(startTime, 'America/New_York');
  const currentDateKey = formatDateInTimeZone(now, 'America/New_York');

  if (!eventDateKey || !currentDateKey) {
    return 'today';
  }

  return eventDateKey > currentDateKey ? 'tomorrow' : 'today';
}

export async function fetchRotowireMlbDailyLineups(pageKey = 'today') {
  const html = await fetchHtml(getDailyLineupsUrl(pageKey));
  return extractRotowireMlbDailyLineups(html, { pageKey });
}

export function extractRotowireMlbNews(html) {
  const entries = [...String(html || '').matchAll(/<div class="news-update([^"]*)">([\s\S]*?)(?=<div class="news-update(?: [^"]*)?">|$)/gu)]
    .map((match) => {
      const rootClass = normalizeText(match[1] || '');
      const segment = match[2] || '';
      const playerName = stripTags(extractMatchValue(segment, /news-update__player-link"[^>]*>([\s\S]*?)<\/a>/u));
      const headline = stripTags(extractMatchValue(segment, /news-update__headline"[^>]*>([\s\S]*?)<\/a>/u));

      if (!playerName || !headline) {
        return null;
      }

      return {
        playerName,
        normalizedPlayerName: normalizeText(playerName),
        headline,
        note: stripTags(extractMatchValue(segment, /<div class="news-update__news">([\s\S]*?)<\/div>/u)) || null,
        timestamp: stripTags(extractMatchValue(segment, /<div class="news-update__timestamp">([\s\S]*?)<\/div>/u)) || null,
        statusTags: rootClass.split(' ').filter(Boolean)
      };
    })
    .filter(Boolean);

  return { entries };
}

export async function fetchRotowireMlbNews() {
  const html = await fetchHtml(NEWS_URL);
  return extractRotowireMlbNews(html);
}