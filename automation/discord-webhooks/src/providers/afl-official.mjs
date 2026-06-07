const API_BASE_URL = 'https://aflapi.afl.com.au/afl/v2';
const CFS_API_BASE_URL = 'https://api.afl.com.au/cfs/afl';
const MIS_TOKEN_URL = `${CFS_API_BASE_URL}/WMCTok`;
const USER_AGENT = 'SportsTipsDiscordWebhook/1.0';
const TOKEN_TTL_MS = 10 * 60 * 1000;

let cachedMisToken = null;
let cachedMisTokenAt = 0;
let compSeasonsPromise = null;
let teamsPromise = null;

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function decodeHtmlEntities(value) {
  return String(value || '')
    .replace(/&#x([0-9a-f]+);/giu, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/gu, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/gu, '&')
    .replace(/&quot;/gu, '"')
    .replace(/&#x27;|&#39;/gu, "'")
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&nbsp;/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function toNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
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

function mapMatchStatus(status) {
  switch (String(status || '').toUpperCase()) {
    case 'CONCLUDED':
      return 'post';
    case 'LIVE':
    case 'IN_PROGRESS':
      return 'in';
    default:
      return 'pre';
  }
}

function getOfficialTeamName(team) {
  return team?.club?.name || team?.name || team?.nickname || '';
}

function getAflPlayerName(player) {
  const name = player?.playerName || {};
  const fullName = `${String(name?.givenName || '').trim()} ${String(name?.surname || '').trim()}`.trim();

  return fullName;
}

async function fetchCompSeasons() {
  compSeasonsPromise ??= (async () => {
    const response = await fetch(`${API_BASE_URL}/competitions/1/compseasons?pageSize=50`, {
      headers: {
        'User-Agent': USER_AGENT
      }
    });

    if (!response.ok) {
      throw new Error(`Official AFL comp-seasons request failed (${response.status}).`);
    }

    const data = await response.json();
    return Array.isArray(data?.compSeasons) ? data.compSeasons : [];
  })();

  return compSeasonsPromise;
}

export async function fetchAflOfficialTeams() {
  teamsPromise ??= (async () => {
    const response = await fetch(`${API_BASE_URL}/teams?pageSize=200`, {
      headers: {
        'User-Agent': USER_AGENT
      }
    });

    if (!response.ok) {
      throw new Error(`Official AFL teams request failed (${response.status}).`);
    }

    const data = await response.json();
    return Array.isArray(data?.teams) ? data.teams : [];
  })();

  return teamsPromise;
}

async function resolveCompSeasonId(year) {
  const compSeasons = await fetchCompSeasons();
  const match = compSeasons.find((compSeason) => String(compSeason?.providerId || '').includes(String(year))
    || String(compSeason?.name || '').includes(String(year)));

  if (!match?.id) {
    throw new Error(`Official AFL compSeasonId lookup failed for ${year}.`);
  }

  return match.id;
}

async function getMisToken() {
  const now = Date.now();

  if (cachedMisToken && (now - cachedMisTokenAt) < TOKEN_TTL_MS) {
    return cachedMisToken;
  }

  const response = await fetch(MIS_TOKEN_URL, {
    method: 'POST',
    headers: {
      'User-Agent': USER_AGENT,
      origin: 'https://www.afl.com.au',
      referer: 'https://www.afl.com.au/'
    }
  });

  if (!response.ok) {
    throw new Error(`Official AFL MIS token request failed (${response.status}).`);
  }

  const data = await response.json();
  const token = String(data?.token || '').trim();

  if (!token) {
    throw new Error('Official AFL MIS token response did not include a token.');
  }

  cachedMisToken = token;
  cachedMisTokenAt = now;

  return token;
}

export function extractAflClubRosterEntries(html) {
  const entries = [];
  const seenPlayerIds = new Set();
  const itemPattern = /<li class="squad-list__item">[\s\S]*?<a class="player-item[^"]*" href="\/players\/(\d+)\/[^"]+">[\s\S]*?<h1 class="player-item__name">\s*([^<]+?)\s*<span class="player-item__last-name">([^<]+)<\/span>[\s\S]*?<span class="player-item__position">([^<]*)<\/span>[\s\S]*?<\/h1>/gu;

  for (const match of String(html || '').matchAll(itemPattern)) {
    const playerId = String(match[1] || '').trim();
    const firstName = decodeHtmlEntities(match[2]);
    const lastName = decodeHtmlEntities(match[3]);
    const position = decodeHtmlEntities(match[4]);
    const playerName = `${firstName} ${lastName}`.replace(/\s+/g, ' ').trim();

    if (!playerId || !playerName || seenPlayerIds.has(playerId)) {
      continue;
    }

    seenPlayerIds.add(playerId);
    entries.push({
      playerId,
      playerName,
      normalizedPlayerName: normalizeText(playerName),
      position
    });
  }

  return entries;
}

export async function fetchAflClubTeamRoster(clubSiteUrl) {
  const normalizedClubSiteUrl = String(clubSiteUrl || '').trim();

  if (!normalizedClubSiteUrl) {
    return {
      status: 'missing_club_site_url',
      sourceUrl: '',
      players: []
    };
  }

  const sourceUrl = new URL('teams/afl', normalizedClubSiteUrl.endsWith('/') ? normalizedClubSiteUrl : `${normalizedClubSiteUrl}/`).toString();
  const response = await fetch(sourceUrl, {
    headers: {
      'User-Agent': USER_AGENT
    }
  });

  if (!response.ok) {
    throw new Error(`Official AFL club roster request failed (${response.status}).`);
  }

  const html = await response.text();
  const players = extractAflClubRosterEntries(html);

  return {
    status: players.length ? 'ok' : 'empty_roster',
    sourceUrl,
    players
  };
}

export async function fetchAflOfficialPlayer(playerId) {
  const resolvedPlayerId = String(playerId || '').trim();

  if (!resolvedPlayerId) {
    throw new Error('Official AFL player lookup requires a player id.');
  }

  const sourceUrl = `${API_BASE_URL}/players/${resolvedPlayerId}`;
  const response = await fetch(sourceUrl, {
    headers: {
      'User-Agent': USER_AGENT
    }
  });

  if (!response.ok) {
    throw new Error(`Official AFL player lookup failed (${response.status}).`);
  }

  const data = await response.json();
  return {
    sourceUrl,
    player: Array.isArray(data?.players) ? (data.players[0] || null) : null
  };
}

export async function fetchAflStatsProPlayerProfile(playerProviderId, competitionCode = 'CD_C014') {
  const resolvedPlayerProviderId = String(playerProviderId || '').trim();

  if (!resolvedPlayerProviderId) {
    throw new Error('Official AFL stats profile lookup requires a player provider id.');
  }

  const token = await getMisToken();
  const sourceUrl = `https://api.afl.com.au/statspro/playerProfile/${resolvedPlayerProviderId}?competitionCode=${encodeURIComponent(competitionCode)}`;
  const response = await fetch(sourceUrl, {
    headers: {
      'User-Agent': USER_AGENT,
      origin: 'https://www.afl.com.au',
      referer: 'https://www.afl.com.au/',
      'x-media-mis-token': token
    }
  });

  if (!response.ok) {
    throw new Error(`Official AFL stats profile request failed (${response.status}).`);
  }

  return {
    sourceUrl,
    ...(await response.json())
  };
}

export function parseAflOfficialMatch(match) {
  const providerId = String(match?.providerId || '').trim();

  return {
    id: providerId || String(match?.id || '').trim(),
    providerId,
    sourceId: String(match?.id || '').trim(),
    startTime: match?.utcStartTime || '',
    homeTeamId: String(match?.home?.team?.providerId || match?.home?.team?.id || ''),
    homeTeam: getOfficialTeamName(match?.home?.team),
    awayTeamId: String(match?.away?.team?.providerId || match?.away?.team?.id || ''),
    awayTeam: getOfficialTeamName(match?.away?.team),
    homeScore: toNumber(match?.home?.score?.totalScore),
    awayScore: toNumber(match?.away?.score?.totalScore),
    homeLinescores: [],
    awayLinescores: [],
    state: mapMatchStatus(match?.status),
    shortStatus: String(match?.status || '')
  };
}

export function extractAflOfficialPlayerStats(data, event = null) {
  const teamNameById = new Map();

  if (event?.homeTeamId && event?.homeTeam) {
    teamNameById.set(String(event.homeTeamId), event.homeTeam);
  }

  if (event?.awayTeamId && event?.awayTeam) {
    teamNameById.set(String(event.awayTeamId), event.awayTeam);
  }

  const rows = [
    ...(Array.isArray(data?.homeTeamPlayerStats) ? data.homeTeamPlayerStats : []),
    ...(Array.isArray(data?.awayTeamPlayerStats) ? data.awayTeamPlayerStats : [])
  ];

  return rows.reduce((playerStats, row) => {
    const player = row?.playerStats?.player || row?.player?.player?.player || {};
    const playerName = getAflPlayerName(player);
    const teamId = String(row?.teamId || row?.playerStats?.teamId || '');

    if (!playerName) {
      return playerStats;
    }

    const rawStats = row?.playerStats?.stats || {};
    const statValues = {};

    for (const [key, value] of Object.entries(rawStats)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        for (const [nestedKey, nestedValue] of Object.entries(value)) {
          const numericNestedValue = toNumber(nestedValue);

          if (numericNestedValue !== null) {
            statValues[nestedKey] = numericNestedValue;
          }
        }

        continue;
      }

      const numeric = toNumber(value);

      if (numeric !== null) {
        statValues[key] = numeric;
      }
    }

    playerStats.push({
      playerId: String(player?.playerId || '').trim(),
      playerName,
      teamName: teamNameById.get(teamId) || '',
      statValues,
      disposals: toNumber(rawStats?.disposals)
        ?? ((toNumber(rawStats?.kicks) ?? 0) + (toNumber(rawStats?.handballs) ?? 0))
    });

    return playerStats;
  }, []);
}

export async function fetchAflOfficialSlate(_sport, dateKey, timeZone = 'Australia/Sydney') {
  const year = Number(String(dateKey || '').slice(0, 4));

  if (!Number.isInteger(year) || year < 2000) {
    throw new Error(`Official AFL slate could not derive a season from ${dateKey}.`);
  }

  const compSeasonId = await resolveCompSeasonId(year);
  const sourceUrl = `${API_BASE_URL}/matches?compSeasonId=${compSeasonId}&pageSize=500`;
  const response = await fetch(sourceUrl, {
    headers: {
      'User-Agent': USER_AGENT
    }
  });

  if (!response.ok) {
    throw new Error(`Official AFL matches request failed (${response.status}).`);
  }

  const data = await response.json();
  const events = (Array.isArray(data?.matches) ? data.matches : [])
    .map(parseAflOfficialMatch)
    .filter((event) => formatDateKey(event.startTime, timeZone) === dateKey);

  return {
    sourceUrl,
    events
  };
}

export async function fetchAflOfficialSummary(_sport, event) {
  const providerId = String(event?.providerId || event?.id || '').trim();

  if (!providerId) {
    throw new Error('Official AFL summary requires a provider match id.');
  }

  const token = await getMisToken();
  const sourceUrl = `${CFS_API_BASE_URL}/playerStats/match/${providerId}`;
  const response = await fetch(sourceUrl, {
    headers: {
      'User-Agent': USER_AGENT,
      origin: 'https://www.afl.com.au',
      referer: 'https://www.afl.com.au/',
      'x-media-mis-token': token
    }
  });

  if (!response.ok) {
    throw new Error(`Official AFL player stats request failed (${response.status}).`);
  }

  const data = await response.json();

  return {
    sourceUrl,
    event,
    playerStats: extractAflOfficialPlayerStats(data, event),
    summary: data
  };
}