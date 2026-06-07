import assert from 'node:assert/strict';
import test from 'node:test';

import { buildAutomatedMessage } from '../src/discord.mjs';
import { formatCancellationPickMessages, formatPicksMessages, formatReplacementPickMessages, formatSlateMessages } from '../src/formatters.mjs';

test('formatSlateMessages returns embed payloads with relative time fields', () => {
  const messages = formatSlateMessages({ label: 'MLB' }, '2026-05-19', [{
    name: 'New York Yankees vs Boston Red Sox',
    startTime: '2026-05-19T07:30:00.000Z',
    state: 'pre'
  }]);

  assert.equal(messages.length, 1);
  assert.equal(Array.isArray(messages[0].embeds), true);
  assert.match(messages[0].embeds[0].title, /MLB Slate \| 2026-05-19/);
  assert.match(messages[0].embeds[0].fields[0].value, /Starts: <t:\d+:R>/);
  assert.doesNotMatch(messages[0].embeds[0].fields[0].value, /<t:\d+:F>/);
});

test('buildAutomatedMessage preserves embeds while prepending role mention content', () => {
  const automatedMessage = buildAutomatedMessage({
    discord: {
      roleMentions: {
        enabled: true,
        text: '1234567890',
        channels: ['picks']
      }
    }
  }, 'picks', formatPicksMessages([{
    sport: 'mlb',
    sportLabel: 'MLB',
    event: 'Webhook Preview | Design Check',
    summary: 'Joe Mack 1+ Hit + Max Meyer 5+ Strikeouts',
    betType: 'sgm',
    stakeUnits: 1,
    startTime: '2026-05-19T07:30:00.000Z',
    publicationValidation: {
      totalOdds: 1.92
    },
    modelProbability: 0.58,
    supportScore: 6.8,
    confidenceTier: 'medium',
    rationale: 'Manual preview message from the desktop app.',
    legs: [
      { label: 'Joe Mack 1+ Hit' },
      { label: 'Max Meyer 5+ Strikeouts' }
    ]
  }], '2026-05-19')[0]);

  assert.equal(automatedMessage.content, '<@&1234567890>');
  assert.equal(Array.isArray(automatedMessage.embeds), true);
  assert.deepEqual(automatedMessage.allowedMentions, { parse: [], roles: ['1234567890'] });
  assert.match(automatedMessage.embeds[0].title, /MLB Best Picks \| 2026-05-19/);
  assert.equal(automatedMessage.embeds[0].fields[0].name, 'Webhook Preview | Design Check');
  assert.match(automatedMessage.embeds[0].fields[0].value, /Starts: <t:\d+:R>/);
  assert.match(automatedMessage.embeds[0].fields[0].value, /Price: x1\.92/);
  assert.match(automatedMessage.embeds[0].fields[0].value, /Units: 1\.00u/);
  assert.match(automatedMessage.embeds[0].fields[0].value, /Legs:/);
  assert.match(automatedMessage.embeds[0].fields[0].value, /- Joe Mack 1\+ Hit/);
  assert.match(automatedMessage.embeds[0].fields[0].value, /- Max Meyer 5\+ Strikeouts/);
  assert.doesNotMatch(automatedMessage.embeds[0].fields[0].value, /Pick:/);
});

test('buildAutomatedMessage uses sport-specific pick role overrides with shared fallback', () => {
  const message = formatPicksMessages([{
    sport: 'mlb',
    sportLabel: 'MLB',
    event: 'Role Override Check',
    summary: 'Joe Mack 1+ Hit + Max Meyer 5+ Strikeouts',
    betType: 'sgm',
    stakeUnits: 1,
    startTime: '2026-05-19T07:30:00.000Z',
    publicationValidation: {
      totalOdds: 1.92
    },
    legs: [
      { label: 'Joe Mack 1+ Hit' },
      { label: 'Max Meyer 5+ Strikeouts' }
    ]
  }], '2026-05-19')[0];

  const sportSpecific = buildAutomatedMessage({
    discord: {
      roleMentions: {
        enabled: true,
        slates: '',
        picks: {
          shared: '1111111111',
          mlb: '2222222222'
        }
      }
    }
  }, 'picks', message, { sport: 'mlb' });

  const sharedFallback = buildAutomatedMessage({
    discord: {
      roleMentions: {
        enabled: true,
        slates: '',
        picks: {
          shared: '1111111111'
        }
      }
    }
  }, 'picks', message, { sport: 'nba' });

  assert.equal(sportSpecific.content, '<@&2222222222>');
  assert.equal(sharedFallback.content, '<@&1111111111>');
  assert.deepEqual(sportSpecific.allowedMentions, { parse: [], roles: ['2222222222'] });
  assert.deepEqual(sharedFallback.allowedMentions, { parse: [], roles: ['1111111111'] });
});

test('buildAutomatedMessage supports dedicated slate mentions from the structured config', () => {
  const automatedMessage = buildAutomatedMessage({
    discord: {
      roleMentions: {
        enabled: true,
        slates: '3333333333',
        picks: {}
      }
    }
  }, 'slates', formatSlateMessages({ label: 'MLB' }, '2026-05-19', [{
    name: 'New York Yankees vs Boston Red Sox',
    startTime: '2026-05-19T07:30:00.000Z',
    state: 'pre'
  }])[0]);

  assert.equal(automatedMessage.content, '<@&3333333333>');
  assert.deepEqual(automatedMessage.allowedMentions, { parse: [], roles: ['3333333333'] });
});

test('formatPicksMessages splits fallback summary into separate leg lines', () => {
  const messages = formatPicksMessages([{
    sport: 'mlb',
    sportLabel: 'MLB',
    event: 'Fallback Summary Check',
    summary: 'Joe Mack 1+ Hit + Max Meyer 5+ Strikeouts',
    stakeUnits: 1,
    startTime: '2026-05-19T07:30:00.000Z'
  }], '2026-05-19');

  assert.equal(messages[0].embeds[0].fields[0].name, 'Fallback Summary Check');
  assert.match(messages[0].embeds[0].fields[0].value, /Legs:/);
  assert.match(messages[0].embeds[0].fields[0].value, /- Joe Mack 1\+ Hit/);
  assert.match(messages[0].embeds[0].fields[0].value, /- Max Meyer 5\+ Strikeouts/);
  assert.doesNotMatch(messages[0].embeds[0].fields[0].value, /Pick:/);
});

test('formatPicksMessages falls back to top-level priceDecimal when publicationValidation is missing', () => {
  const messages = formatPicksMessages([{
    sport: 'mlb',
    sportLabel: 'MLB',
    event: 'Price Fallback Check',
    summary: 'Joe Mack 1+ Hit + Max Meyer 5+ Strikeouts',
    stakeUnits: 1,
    priceDecimal: 2.74,
    startTime: '2026-05-19T07:30:00.000Z'
  }], '2026-05-19');

  assert.match(messages[0].embeds[0].fields[0].value, /Price: x2\.74/);
});

test('formatPicksMessages includes weather summary details when available', () => {
  const messages = formatPicksMessages([{
    sport: 'mlb',
    sportLabel: 'MLB',
    event: 'Weather Check',
    summary: 'Joe Mack 1+ Hit + Max Meyer 5+ Strikeouts',
    stakeUnits: 1,
    startTime: '2026-05-19T07:30:00.000Z',
    weather: {
      summary: 'Expected Rain',
      details: '18C | 65% rain | Wind 14 km/h'
    }
  }], '2026-05-19');

  assert.match(messages[0].embeds[0].fields[0].value, /Weather: Expected Rain/);
  assert.match(messages[0].embeds[0].fields[0].value, /Forecast: 18C \| 65% rain \| Wind 14 km\/h/);
});

test('formatPicksMessages includes AFL bonus disposal options beneath the main slip', () => {
  const messages = formatPicksMessages([{
    sport: 'afl',
    sportLabel: 'AFL',
    event: 'Bonus Option Check',
    summary: 'James Worpel 15+ Disposals + Jordan Dawson 15+ Disposals + Massimo D\'Ambrosio 15+ Disposals',
    stakeUnits: 1,
    startTime: '2026-05-19T07:30:00.000Z',
    bonusLegOptions: [
      { label: 'Connor Macdonald 15+ Disposals' },
      { label: 'Matt Crouch 15+ Disposals' }
    ]
  }], '2026-05-19');

  assert.match(messages[0].embeds[0].fields[0].value, /Optional AFL bonus disposals:/);
  assert.match(messages[0].embeds[0].fields[0].value, /- Connor Macdonald 15\+ Disposals/);
  assert.match(messages[0].embeds[0].fields[0].value, /- Matt Crouch 15\+ Disposals/);
});

test('formatReplacementPickMessages uses the slip layout and hides public model-support stats', () => {
  const messages = formatReplacementPickMessages({
    summary: 'Old slip',
    replacementReason: 'Late line move'
  }, {
    sport: 'nrl',
    sportLabel: 'NRL',
    event: 'Replacement Price Check',
    summary: 'New slip',
    betType: 'sgm',
    stakeUnits: 1,
    startTime: '2026-05-19T07:30:00.000Z',
    publicationValidation: {
      totalOdds: 2.46
    },
    modelProbability: 0.593,
    supportScore: 9.1,
    confidenceTier: 'high',
    rationale: 'Rules engine approved a 2-leg build from market depth, structural fit, and benchmark acceptance.',
    legs: [
      { label: 'Matt Burton 6+ Points' },
      { label: 'Under 47.5' }
    ]
  }, '2026-05-19');

  assert.match(messages[0].embeds[0].fields[0].value, /Price: x2\.46/);
  assert.match(messages[0].embeds[0].fields[0].value, /Units: 1\.00u/);
  assert.match(messages[0].embeds[0].fields[0].value, /Legs:/);
  assert.match(messages[0].embeds[0].fields[0].value, /Previous slip: Old slip/);
  assert.match(messages[0].embeds[0].fields[0].value, /Why replaced: Late line move/);
  assert.match(messages[0].embeds[0].fields[0].value, /Replacement detail: Rebuilt from the latest same-event board and kept the cleanest available legs that still passed the live publication checks\./);
  assert.doesNotMatch(messages[0].embeds[0].fields[0].value, /Type:/);
  assert.doesNotMatch(messages[0].embeds[0].fields[0].value, /Model:/);
  assert.doesNotMatch(messages[0].embeds[0].fields[0].value, /Support:/);
  assert.doesNotMatch(messages[0].embeds[0].fields[0].value, /Confidence:/);
});

test('formatReplacementPickMessages rewrites generic fallback detail into plain language', () => {
  const messages = formatReplacementPickMessages({
    summary: 'Old slip',
    replacementReason: 'Original player was ruled out during the late recheck.'
  }, {
    sport: 'nba',
    sportLabel: 'NBA',
    event: 'Fallback Detail Check',
    summary: 'Jalen Williams Over 19.5',
    stakeUnits: 1,
    startTime: '2026-05-19T07:30:00.000Z',
    rationale: 'Fallback leg stays live.',
    legs: [
      { label: 'Jalen Williams Over 19.5' }
    ]
  }, '2026-05-19');

  assert.match(messages[0].embeds[0].fields[0].value, /Replacement detail: This was the cleanest remaining same-event leg that stayed available and still passed the late publication checks\./);
});

test('formatCancellationPickMessages keeps the reason at the bottom with a blank line before it', () => {
  const messages = formatCancellationPickMessages({
    sport: 'mlb',
    sportLabel: 'MLB',
    event: 'Cancellation Layout Check',
    summary: 'Joe Mack 1+ Hit + Max Meyer 5+ Strikeouts',
    stakeUnits: 1,
    startTime: '2026-05-19T07:30:00.000Z',
    publicationValidation: {
      totalOdds: 1.92
    },
    legs: [
      { label: 'Joe Mack 1+ Hit' },
      { label: 'Max Meyer 5+ Strikeouts' }
    ]
  }, 'Event postponed on the ESPN scoreboard.', '2026-05-19');

  assert.match(messages[0].embeds[0].fields[0].value, /Price: x1\.92/);
  assert.match(messages[0].embeds[0].fields[0].value, /Stake returned: 1\.00u\n\nReason: Event postponed on the ESPN scoreboard\./);
});

test('formatPicksMessages splits same-sport picks into separate embeds when they land on different local dates', () => {
  const messages = formatPicksMessages([{
    sport: 'mlb',
    sportLabel: 'MLB',
    event: 'Chicago Cubs Game',
    summary: 'Alex Bregman 1+ Hit + Braden Shewmake 1+ Hit',
    stakeUnits: 1,
    startTime: '2026-05-22T13:30:00.000Z'
  }, {
    sport: 'mlb',
    sportLabel: 'MLB',
    event: 'Cincinnati Reds Game',
    summary: 'JJ Bleday 1+ Hit + Tyler Stephenson 1+ Hit',
    stakeUnits: 1,
    startTime: '2026-05-23T01:30:00.000Z'
  }], '2026-05-22', 'Australia/Sydney');

  assert.equal(messages.length, 2);
  assert.match(messages[0].embeds[0].title, /MLB Best Picks \| 2026-05-22/);
  assert.match(messages[1].embeds[0].title, /MLB Best Picks \| 2026-05-23/);
});