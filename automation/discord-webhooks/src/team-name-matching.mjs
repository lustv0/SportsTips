const GENERIC_TEAM_TOKENS = new Set(['fc', 'cf', 'sc', 'ac', 'afc', 'bk', 'fk', 'if', 'club']);
const GENERIC_TRAILING_ALIAS_TOKENS = new Set(['city', 'united', 'town', 'county', 'athletic', 'sporting', 'real']);

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function stripProbableStarterSuffixTokens(tokens) {
  if (tokens.length < 3) {
    return tokens;
  }

  const probableInitial = tokens.at(-2) || '';
  const probableSurname = tokens.at(-1) || '';

  if (!/^[a-z]$/.test(probableInitial) || !/^[a-z]{2,}$/.test(probableSurname)) {
    return tokens;
  }

  return tokens.slice(0, -2);
}

function stripGenericTeamTokens(tokens) {
  return tokens.filter((token) => !GENERIC_TEAM_TOKENS.has(token));
}

function buildAcronymAlias(tokens) {
  const filteredTokens = tokens.filter(Boolean);

  if (filteredTokens.length < 2) {
    return '';
  }

  const hasShortToken = filteredTokens.some((token) => token.length <= 3);

  if (filteredTokens.length < 3 && !hasShortToken) {
    return '';
  }

  return filteredTokens.map((token) => token[0]).join('');
}

function buildTrailingAlias(tokens) {
  const filteredTokens = tokens.filter(Boolean);

  if (filteredTokens.length < 2) {
    return '';
  }

  const trailingToken = filteredTokens.at(-1) || '';

  if (!trailingToken || trailingToken.length < 4) {
    return '';
  }

  if (GENERIC_TEAM_TOKENS.has(trailingToken) || GENERIC_TRAILING_ALIAS_TOKENS.has(trailingToken)) {
    return '';
  }

  return trailingToken;
}

function tokenSetsMatch(leftTokens, rightTokens) {
  if (!leftTokens.length || !rightTokens.length) {
    return false;
  }

  if (leftTokens.join(' ') === rightTokens.join(' ')) {
    return true;
  }

  const [shorter, longer] = leftTokens.length <= rightTokens.length
    ? [leftTokens, rightTokens]
    : [rightTokens, leftTokens];

  return shorter.every((token) => longer.includes(token));
}

export function buildComparableTeamAliases(value) {
  const normalizedTokens = normalizeText(value)
    .split(' ')
    .map((token) => token.trim())
    .filter(Boolean);

  if (!normalizedTokens.length) {
    return [];
  }

  const candidateTokenSets = [];
  const addTokenSet = (tokens) => {
    if (!tokens.length) {
      return;
    }

    const key = tokens.join(' ');

    if (candidateTokenSets.some((existing) => existing.join(' ') === key)) {
      return;
    }

    candidateTokenSets.push(tokens);
  };

  addTokenSet(normalizedTokens);
  addTokenSet(stripProbableStarterSuffixTokens(normalizedTokens));

  const aliases = new Set();

  for (const tokens of candidateTokenSets) {
    aliases.add(tokens.join(' '));

    const strippedGenericTokens = stripGenericTeamTokens(tokens);
    const aliasTokens = strippedGenericTokens.length ? strippedGenericTokens : tokens;

    if (strippedGenericTokens.length) {
      aliases.add(strippedGenericTokens.join(' '));
    }

    const acronym = buildAcronymAlias(aliasTokens);

    if (acronym) {
      aliases.add(acronym);
    }

    const trailingAlias = buildTrailingAlias(aliasTokens);

    if (trailingAlias) {
      aliases.add(trailingAlias);
    }
  }

  return [...aliases].filter(Boolean);
}

export function teamNamesMatch(left, right) {
  const leftAliases = buildComparableTeamAliases(left);
  const rightAliases = buildComparableTeamAliases(right);

  if (!leftAliases.length || !rightAliases.length) {
    return false;
  }

  const rightAliasSet = new Set(rightAliases);

  if (leftAliases.some((alias) => rightAliasSet.has(alias))) {
    return true;
  }

  const leftTokenSets = leftAliases
    .filter((alias) => alias.includes(' '))
    .map((alias) => alias.split(' ').filter(Boolean));
  const rightTokenSets = rightAliases
    .filter((alias) => alias.includes(' '))
    .map((alias) => alias.split(' ').filter(Boolean));

  return leftTokenSets.some((leftTokens) => rightTokenSets.some((rightTokens) => tokenSetsMatch(leftTokens, rightTokens)));
}

export function textMentionsTeam(text, teamName) {
  const normalizedText = normalizeText(text);

  if (!normalizedText) {
    return false;
  }

  const textTokens = new Set(normalizedText.split(' ').filter(Boolean));

  return buildComparableTeamAliases(teamName).some((alias) => {
    const aliasTokens = alias.split(' ').filter(Boolean);

    if (!aliasTokens.length) {
      return false;
    }

    if (aliasTokens.length === 1) {
      return textTokens.has(aliasTokens[0]);
    }

    return aliasTokens.every((token) => textTokens.has(token));
  });
}