const SCHEDULE_API_BASE_URL = 'https://statsapi.mlb.com/api/v1';
const GAME_FEED_API_BASE_URL = 'https://statsapi.mlb.com/api/v1.1';
const USER_AGENT = 'SportsTipsDiscordWebhook/1.0';

function stripDiacritics(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '');
}

function normalizePersonName(value) {
  return stripDiacritics(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, ' ')
    .trim();
}

function toPlayerId(value) {
  const match = String(value ?? '').match(/(\d+)/u);

  if (!match) {
    return null;
  }

  const numeric = Number(match[1]);
  return Number.isFinite(numeric) ? numeric : null;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT
    }
  });

  if (!response.ok) {
    throw new Error(`MLB StatsAPI request failed (${response.status}).`);
  }

  return response.json();
}

function getBattingOrderIds(teamBoxscore) {
  return Array.isArray(teamBoxscore?.battingOrder)
    ? teamBoxscore.battingOrder
      .map((entry) => toPlayerId(entry))
      .filter((entry) => entry !== null)
    : [];
}

function buildTeamResearch(teamBoxscore, teamSide, fallbackTeamName) {
  const teamName = teamBoxscore?.team?.name || fallbackTeamName || '';
  const battingOrderIds = getBattingOrderIds(teamBoxscore);
  const battingOrderIndexByPlayerId = new Map(
    battingOrderIds.map((playerId, index) => [playerId, index + 1])
  );
  const players = Object.values(teamBoxscore?.players || {})
    .map((player) => {
      const playerId = toPlayerId(player?.person?.id ?? player?.id);
      const playerName = player?.person?.fullName || player?.fullName || player?.name || '';
      const normalizedPlayerName = normalizePersonName(playerName);

      if (!playerId || !normalizedPlayerName) {
        return null;
      }

      return {
        playerId,
        playerName,
        normalizedPlayerName,
        teamName,
        teamSide,
        inBattingOrder: battingOrderIndexByPlayerId.has(playerId),
        battingOrderIndex: battingOrderIndexByPlayerId.get(playerId) || null
      };
    })
    .filter(Boolean);

  return {
    teamName,
    teamSide,
    hasConfirmedBattingOrder: battingOrderIds.length > 0,
    players
  };
}

export async function fetchMlbSchedule(dateKey, options = {}) {
  const params = new URLSearchParams({
    sportId: '1',
    date: String(dateKey || '')
  });

  if (options.hydrate) {
    params.set('hydrate', String(options.hydrate));
  }

  return fetchJson(`${SCHEDULE_API_BASE_URL}/schedule?${params.toString()}`);
}

export async function fetchMlbGameFeed(gamePk) {
  return fetchJson(`${GAME_FEED_API_BASE_URL}/game/${gamePk}/feed/live`);
}

export function extractMlbGameResearch(feed) {
  const homeTeamName = feed?.gameData?.teams?.home?.name || '';
  const awayTeamName = feed?.gameData?.teams?.away?.name || '';
  const homeTeamResearch = buildTeamResearch(feed?.liveData?.boxscore?.teams?.home, 'home', homeTeamName);
  const awayTeamResearch = buildTeamResearch(feed?.liveData?.boxscore?.teams?.away, 'away', awayTeamName);
  const playersByName = new Map();

  for (const player of [...awayTeamResearch.players, ...homeTeamResearch.players]) {
    const existing = playersByName.get(player.normalizedPlayerName) || [];
    existing.push(player);
    playersByName.set(player.normalizedPlayerName, existing);
  }

  const probablePitcherNames = new Set([
    feed?.gameData?.probablePitchers?.away?.fullName,
    feed?.gameData?.probablePitchers?.home?.fullName
  ].map((entry) => normalizePersonName(entry)).filter(Boolean));

  return {
    playersByName,
    probablePitcherNames,
    teamResearchBySide: new Map([
      ['away', awayTeamResearch],
      ['home', homeTeamResearch]
    ])
  };
}