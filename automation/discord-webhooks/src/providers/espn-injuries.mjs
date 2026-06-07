const BASE_URL = 'https://site.api.espn.com/apis/site/v2/sports';
const USER_AGENT = 'SportsTipsDiscordWebhook/1.0';

function decodeHtmlEntities(value) {
  return String(value || '')
    .replace(/&#x([0-9a-f]+);/giu, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/gu, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/gu, '&')
    .replace(/&quot;/gu, '"')
    .replace(/&#x27;|&#39;/gu, "'")
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&nbsp;/gu, ' ');
}

function normalizeText(value) {
  return decodeHtmlEntities(String(value || '').replace(/<[^>]+>/gu, ' '))
    .replace(/\s+/gu, ' ')
    .trim();
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT
    }
  });

  if (!response.ok) {
    throw new Error(`ESPN request failed (${response.status}).`);
  }

  return response.json();
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT
    }
  });

  if (!response.ok) {
    throw new Error(`ESPN request failed (${response.status}).`);
  }

  return response.text();
}

function getInjuryLink(teamPayload) {
  const links = Array.isArray(teamPayload?.team?.links) ? teamPayload.team.links : [];
  const injuryLink = links.find((link) => Array.isArray(link?.rel) && link.rel.includes('injuries'));
  return injuryLink?.href || '';
}

export function extractEspnTeamInjuries(html) {
  const entries = [];
  const sectionPattern = /<div class="[^"]*Injuries__groupDate[^"]*">([^<]+)<\/div>([\s\S]*?)(?=<div class="[^"]*Injuries__groupDate|<aside class="Injuries__dataProvider|$)/gu;
  const itemPattern = /<a href="([^"]+)"[^>]*>[\s\S]*?<span class="Athlete__PlayerName">([\s\S]*?)<\/span>[\s\S]*?<span class="Athlete__NameDetails[^"]*">([\s\S]*?)<\/span>[\s\S]*?<span class="TextStatus[^"]*">([\s\S]*?)<\/span>[\s\S]*?<div class="pt3 clr-gray-04 Athlete__Text--md">([\s\S]*?)<\/div>/gu;

  for (const section of String(html || '').matchAll(sectionPattern)) {
    const dateLabel = normalizeText(section[1]);
    const sectionHtml = section[2] || '';

    for (const item of sectionHtml.matchAll(itemPattern)) {
      const playerUrl = item[1] || '';
      const playerName = normalizeText(item[2]);
      const position = normalizeText(item[3]);
      const status = normalizeText(item[4]);
      const note = normalizeText(item[5]);

      if (!playerName || !status) {
        continue;
      }

      entries.push({
        dateLabel,
        playerName,
        position,
        status,
        note,
        playerUrl
      });
    }
  }

  return entries;
}

export async function fetchEspnTeamInjuries(sport, teamId) {
  if (!sport?.path || !teamId) {
    return {
      teamId: String(teamId || ''),
      injuries: [],
      sourceUrl: '',
      status: 'invalid_request'
    };
  }

  const teamUrl = `${BASE_URL}/${sport.path}/teams/${teamId}`;
  const teamPayload = await fetchJson(teamUrl);
  const sourceUrl = getInjuryLink(teamPayload);

  if (!sourceUrl) {
    return {
      teamId: String(teamId),
      injuries: [],
      sourceUrl: '',
      status: 'injury_link_missing'
    };
  }

  const html = await fetchText(sourceUrl);

  return {
    teamId: String(teamId),
    teamName: teamPayload?.team?.displayName || '',
    sourceUrl,
    status: 'ok',
    injuries: extractEspnTeamInjuries(html)
  };
}