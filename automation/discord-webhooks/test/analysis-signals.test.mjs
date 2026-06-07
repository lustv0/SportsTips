import assert from 'node:assert/strict';
import test from 'node:test';

import { buildAnalysisCandidatePool, __testables } from '../src/ai-pick-generator.mjs';
import { filterCandidatePoolForResearch } from '../src/jobs/analysis.mjs';

test('buildAnalysisCandidatePool preserves candidate price metadata for downstream soft signals', () => {
  const eventContext = {
    sportKey: 'soccer_epl',
    homeTeam: 'Arsenal',
    awayTeam: 'Chelsea',
    generatorConfig: {
      minBooks: 1,
      teamSportsH2hPolicy: 'fallback_only'
    }
  };
  const candidatePool = buildAnalysisCandidatePool(eventContext, [{
    market: 'h2h',
    outcomeName: 'Arsenal',
    description: '',
    point: null,
    source: 'web-scrape',
    sourceUrl: 'https://www.sportsbet.com.au/betting/soccer/united-kingdom/english-premier-league/arsenal-v-chelsea-123456',
    prices: [{
      bookmakerKey: 'sportsbet-web',
      bookmakerTitle: 'Sportsbet Web',
      price: 1.8
    }, {
      bookmakerKey: 'tab',
      bookmakerTitle: 'TAB',
      price: 1.78
    }]
  }], 6);

  assert.equal(candidatePool.length, 1);
  assert.equal(candidatePool[0].sourceUrl, 'https://www.sportsbet.com.au/betting/soccer/united-kingdom/english-premier-league/arsenal-v-chelsea-123456');
  assert.equal(candidatePool[0].prices.length, 2);
});

test('filterCandidatePoolForResearch adds recent-form and external soft signals without blocking the candidate', async () => {
  const sport = {
    key: 'soccer_epl',
    label: 'Soccer / EPL',
    marketKey: 'soccer_epl',
    path: 'soccer/eng.1'
  };
  const eventContext = {
    sportKey: 'soccer_epl',
    sportLabel: 'Soccer / EPL',
    marketSportKey: 'soccer_epl',
    eventId: 'snapshot:epl:arsenal-chelsea',
    eventName: 'Arsenal vs Chelsea',
    homeTeam: 'Arsenal',
    homeTeamId: 'arsenal',
    awayTeam: 'Chelsea',
    awayTeamId: 'chelsea',
    startTime: '2026-06-15T09:00:00Z',
    timezone: 'Australia/Sydney',
    generatorConfig: {
      minBooks: 1,
      stakeUnits: 1,
      teamSportsH2hPolicy: 'fallback_only'
    }
  };
  const candidatePool = [{
    candidateId: 'leg-1',
    label: 'Arsenal Head to Head',
    market: 'h2h',
    family: 'side',
    outcomeName: 'Arsenal',
    description: '',
    point: null,
    booksChecked: 2,
    bestPrice: 1.85,
    averagePrice: 1.83,
    prices: [{
      bookmakerKey: 'sportsbet-web',
      bookmakerTitle: 'Sportsbet Web',
      price: 1.85
    }, {
      bookmakerKey: 'tab',
      bookmakerTitle: 'TAB',
      price: 1.81
    }],
    source: 'web-scrape',
    sourceUrl: 'https://www.sportsbet.com.au/betting/soccer/united-kingdom/english-premier-league/arsenal-v-chelsea-123456',
    conflictGroup: 'side',
    subjectKey: 'arsenal',
    rationale: 'Arsenal Head to Head was available across 2 books in the current market scan.'
  }];
  const espnScoreboards = new Map([
    ['2026-06-14', {
      events: [{
        id: 'home-1',
        startTime: '2026-06-14T09:00:00Z',
        homeTeamId: 'arsenal',
        homeTeam: 'Arsenal',
        awayTeamId: 'everton',
        awayTeam: 'Everton',
        homeScore: 3,
        awayScore: 1,
        state: 'post',
        shortStatus: 'Final'
      }, {
        id: 'away-1',
        startTime: '2026-06-14T11:00:00Z',
        homeTeamId: 'chelsea',
        homeTeam: 'Chelsea',
        awayTeamId: 'villa',
        awayTeam: 'Aston Villa',
        homeScore: 0,
        awayScore: 2,
        state: 'post',
        shortStatus: 'Final'
      }]
    }],
    ['2026-06-13', {
      events: [{
        id: 'home-2',
        startTime: '2026-06-13T09:00:00Z',
        homeTeamId: 'westham',
        homeTeam: 'West Ham',
        awayTeamId: 'arsenal',
        awayTeam: 'Arsenal',
        homeScore: 1,
        awayScore: 2,
        state: 'post',
        shortStatus: 'Final'
      }, {
        id: 'away-2',
        startTime: '2026-06-13T11:00:00Z',
        homeTeamId: 'spurs',
        homeTeam: 'Tottenham',
        awayTeamId: 'chelsea',
        awayTeam: 'Chelsea',
        homeScore: 2,
        awayScore: 1,
        state: 'post',
        shortStatus: 'Final'
      }]
    }]
  ]);

  const researchedPool = await filterCandidatePoolForResearch(
    sport,
    eventContext,
    candidatePool,
    {
      form: new Map(),
      injury: new Map(),
      sportsbetTargetBet: new Map(),
      weather: new Map()
    },
    {
      fetchEspnSlate: async (_sport, dateKey) => espnScoreboards.get(dateKey) || { events: [] },
      fetchSportsbetEventTargetBetQuotes: async () => [{
        market: 'h2h',
        outcomeName: 'Arsenal',
        description: '',
        point: null
      }]
    }
  );

  assert.equal(researchedPool.length, 1);
  assert.ok((researchedPool[0].formSignalScore || 0) > 0);
  assert.equal(researchedPool[0].formSignalLabel, 'supportive');
  assert.ok((researchedPool[0].externalSignalScore || 0) > 0);
  assert.deepEqual(researchedPool[0].externalSignalSources, ['tab-market', 'sportsbet-targetbet']);
});

test('estimateCandidateModelProbability increases when form and external soft signals are present', () => {
  const eventContext = {
    sportKey: 'soccer_epl',
    homeTeam: 'Arsenal',
    awayTeam: 'Chelsea',
    generatorConfig: {
      minBooks: 1,
      teamSportsH2hPolicy: 'fallback_only'
    }
  };
  const baseCandidate = {
    market: 'h2h',
    family: 'side',
    outcomeName: 'Arsenal',
    description: '',
    booksChecked: 2,
    bestPrice: 1.85,
    source: 'web-scrape',
    researchStatus: 'not_applicable'
  };
  const baseProbability = __testables.estimateCandidateModelProbability(baseCandidate, eventContext);
  const boostedProbability = __testables.estimateCandidateModelProbability({
    ...baseCandidate,
    formSignalScore: 0.018,
    externalSignalScore: 0.012
  }, eventContext);

  assert.ok(boostedProbability > baseProbability);
});