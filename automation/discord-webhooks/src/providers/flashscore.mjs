const USER_AGENT = 'SportsTipsDiscordWebhook/1.0';

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

function getFlashscoreResultsUrl(sport) {
  switch (String(sport?.key || '').toLowerCase()) {
    case 'afl':
      return 'https://www.flashscore.com.au/aussie-rules/australia/afl/results/';
    case 'nrl':
      return 'https://www.flashscore.com.au/league/australia/nrl/results/';
    default:
      throw new Error(`Flashscore results are not configured for ${sport?.label || sport?.key || 'this sport'}.`);
  }
}

function parseFeedFields(segment) {
  return String(segment || '')
    .split('¬')
    .map((token) => {
      const delimiterIndex = token.indexOf('÷');

      if (delimiterIndex === -1) {
        return null;
      }

      return [
        token.slice(0, delimiterIndex),
        token.slice(delimiterIndex + 1)
      ];
    })
    .filter(Boolean);
}

function getFieldValue(fields, keys) {
  for (const key of keys) {
    const match = fields.find(([fieldKey, value]) => fieldKey === key && String(value || '').trim());

    if (match) {
      return String(match[1] || '').trim();
    }
  }

  return '';
}

function parseFlashscoreResultsEvent(rawSegment, sourceUrl = '') {
  const segment = `AA÷${String(rawSegment || '')}`;
  const homeMarker = '¬WM÷';
  const homeMarkerIndex = segment.indexOf(homeMarker);

  if (homeMarkerIndex === -1) {
    return null;
  }

  const awaySegment = segment.slice(0, homeMarkerIndex);
  const homeSegment = segment.slice(homeMarkerIndex + 1);
  const eventFields = parseFeedFields(awaySegment);
  const homeFields = parseFeedFields(homeSegment);
  const id = getFieldValue(eventFields, ['AA']);
  const startTimeSeconds = toNumber(getFieldValue(eventFields, ['AD', 'ADE']));
  const awayTeam = getFieldValue(eventFields, ['AF', 'FK']);
  const awayTeamId = getFieldValue(eventFields, ['PY']);
  const awayScore = toNumber(getFieldValue(eventFields, ['AU', 'AH', 'PRN']));
  const homeTeam = getFieldValue(homeFields, ['AE', 'FH']);
  const homeTeamId = getFieldValue(homeFields, ['PX']);
  const homeScore = toNumber(getFieldValue(homeFields, ['AT', 'AG', 'PRN']));

  if (!id || !awayTeam || !homeTeam || startTimeSeconds === null || awayScore === null || homeScore === null) {
    return null;
  }

  return {
    id,
    providerId: id,
    name: `${awayTeam} vs ${homeTeam}`,
    sourceUrl,
    startTime: new Date(startTimeSeconds * 1000).toISOString(),
    homeTeamId,
    homeTeam,
    awayTeamId,
    awayTeam,
    homeScore,
    awayScore,
    homeLinescores: [],
    awayLinescores: [],
    state: 'post',
    shortStatus: 'Final'
  };
}

export function extractFlashscoreInitialFeed(html, feedName = 'summary-results') {
  const escapedFeedName = String(feedName || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`cjs\\.initialFeeds\\["${escapedFeedName}"\\]\\s*=\\s*\\{[\\s\\S]*?data:\\s*` + '`' + `([\\s\\S]*?)` + '`' + `\\s*\\}`, 'i');
  const match = String(html || '').match(pattern);

  return match ? match[1] : '';
}

export function parseFlashscoreResultsFeed(feedData, sourceUrl = '') {
  return String(feedData || '')
    .split('~AA÷')
    .slice(1)
    .map((segment) => parseFlashscoreResultsEvent(segment, sourceUrl))
    .filter(Boolean);
}

export async function fetchFlashscoreSlate(sport, dateKey, timeZone = 'UTC') {
  const url = getFlashscoreResultsUrl(sport);
  const response = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT
    }
  });

  if (!response.ok) {
    throw new Error(`${sport?.label || 'Sport'} Flashscore results request failed (${response.status}).`);
  }

  const html = await response.text();
  const feedData = extractFlashscoreInitialFeed(html, 'summary-results');

  if (!feedData) {
    throw new Error(`${sport?.label || 'Sport'} Flashscore results feed was not present.`);
  }

  let events = parseFlashscoreResultsFeed(feedData, url);

  if (dateKey) {
    events = events.filter((event) => formatDateKey(event.startTime, timeZone) === dateKey);
  }

  return {
    sourceUrl: url,
    events
  };
}