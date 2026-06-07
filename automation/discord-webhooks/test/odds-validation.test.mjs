import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { loadConfig } from '../src/config.mjs';
import { resolveOddsValidation } from '../src/odds-validation.mjs';

test('resolveOddsValidation uses snapshot quotes when market scrape is enabled', async (t) => {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sportstips-odds-validation-'));
  t.after(async () => {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });

  const snapshotFile = path.join(workspaceRoot, 'bookmaker-snapshots.json');
  const configPath = path.join(workspaceRoot, 'config.json');
  const fetchedAt = new Date().toISOString();

  await fs.writeFile(snapshotFile, JSON.stringify({
    updatedAt: fetchedAt,
    quotes: [{
      sportKey: 'mlb',
      market: 'batter_hits',
      homeTeam: 'Los Angeles Angels (J Soriano)',
      awayTeam: 'Athletics (L Severino)',
      outcomeName: '1+ Hit',
      description: 'Lawrence Butler',
      point: null,
      fetchedAt,
      prices: [{
        bookmakerKey: 'sportsbet-web',
        bookmakerTitle: 'Sportsbet Web',
        price: 1.76
      }]
    }]
  }, null, 2));

  await fs.writeFile(configPath, JSON.stringify({
    timezone: 'Australia/Sydney',
    dryRun: true,
    discord: {
      webhooks: {
        slates: '',
        picks: '',
        results: '',
        unitTracking: '',
        unitReport: ''
      }
    },
    bookmakerFallback: {
      enabled: true,
      snapshotFile,
      providers: ['sportsbet-web'],
      maxSnapshotAgeMinutes: 180,
      preferSnapshot: true
    },
    marketScrape: {
      enabled: true,
      snapshotFile,
      refreshIntervalMinutes: 60,
      maxSnapshotAgeMinutes: 180,
      bookmakerKey: 'sportsbet-web',
      bookmakerTitle: 'Sportsbet Web'
    },
    sportsGameOdds: {
      enabled: false
    },
    jobs: {
      slates: { enabled: false },
      analysis: { enabled: false },
      picks: { enabled: false },
      results: { enabled: false }
    },
    bankrollTracker: {
      enabled: false
    },
    sports: [{
      key: 'mlb',
      label: 'MLB',
      provider: 'espn',
      path: 'baseball/mlb',
      enabled: true
    }]
  }, null, 2));

  const config = await loadConfig(configPath);
  const result = await resolveOddsValidation({
    config,
    state: {
      cache: {
        oddsValidation: {}
      },
      providers: {
        sportsGameOdds: {}
      }
    }
  }, {
    sportKey: 'mlb',
    market: 'batter_hits',
    homeTeam: 'Los Angeles Angels (J Soriano)',
    awayTeam: 'Athletics (L Severino)',
    outcomeName: '1+ Hit',
    description: 'Lawrence Butler',
    point: null,
    minimumOdds: 1.01,
    minimumBooksAtOrAbove: 0
  }, {
    maxAgeMinutes: 180
  });

  assert.equal(result?.status, 'ok');
  assert.equal(result?.source, 'snapshot');
  assert.equal(result?.bestOdds, 1.76);
});