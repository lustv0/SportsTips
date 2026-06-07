import assert from 'node:assert/strict';
import test from 'node:test';

import { resetFreshDailyState, runForcedDailyCheck } from '../src/forced-daily-check.mjs';

test('resetFreshDailyState clears generated run markers while preserving manual and settled history', () => {
  const state = {
    jobs: {
      slates: { lastRunDate: '2026-05-22' },
      analysis: { lastRunAt: '2026-05-22T01:00:00.000Z' },
      picks: { lastRunAt: '2026-05-22T01:15:00.000Z' },
      results: { lastRunAt: '2026-05-22T01:30:00.000Z' }
    },
    posts: {
      slates: {
        '2026-05-22:afl': '2026-05-22T01:00:00.000Z'
      },
      picks: {
        'auto-generator:afl:event-1': '2026-05-22T01:00:00.000Z',
        'manual:nba:event-1': '2026-05-22T01:05:00.000Z'
      },
      results: {}
    },
    tracking: {
      picks: {
        'auto-generator:afl:event-1': { status: 'posted_waiting_for_pregame_recheck' },
        'manual:nba:event-1': { status: 'waiting_for_window' }
      }
    }
  };
  const feed = {
    picks: [{
      id: 'auto-generator:afl:event-1',
      source: 'auto-generator',
      status: 'pending',
      summary: 'Generated pending pick'
    }, {
      id: 'auto-generator:afl:event-2',
      source: 'auto-generator',
      status: 'loss',
      summary: 'Generated settled pick'
    }, {
      id: 'manual:nba:event-1',
      source: 'manual',
      status: 'pending',
      summary: 'Manual pending pick'
    }]
  };

  const result = resetFreshDailyState(state, feed);

  assert.equal(state.jobs.slates, undefined);
  assert.equal(state.jobs.analysis, undefined);
  assert.equal(state.jobs.picks, undefined);
  assert.deepEqual(Object.keys(state.posts.picks), ['manual:nba:event-1']);
  assert.deepEqual(Object.keys(state.tracking.picks), ['manual:nba:event-1']);
  assert.equal(result.removedGeneratedFeedPicks, 1);
  assert.deepEqual(result.nextFeed.picks.map((pick) => pick.id), [
    'auto-generator:afl:event-2',
    'manual:nba:event-1'
  ]);
});

test('runForcedDailyCheck prepares state and runs slates, analysis, and picks in order with one fresh snapshot', async () => {
  const callLog = [];
  const context = {
    config: {
      __paths: {
        picksFeedFile: 'ignored.json'
      }
    },
    state: {
      jobs: {},
      posts: { slates: {}, picks: {}, results: {} },
      tracking: { picks: {} }
    },
    dryRun: false
  };

  const result = await runForcedDailyCheck(context, {
    loadRawPicksFeed: async () => ({ picks: [] }),
    saveRawPicksFeed: async () => ({ picks: [] }),
    ensureFreshScrapedSnapshot: async (_context, _now, options) => {
      callLog.push(`snapshot:${options.force}`);
      return { quotes: [{ id: 'q1' }] };
    },
    runSlatesJob: async (_context, overrides) => {
      callLog.push(`slates:${overrides.snapshot.quotes.length}`);
      return { posted: 2, targetDateKey: '2026-05-23' };
    },
    runAnalysisJob: async (_context, overrides) => {
      callLog.push(`analysis:${overrides.snapshot.quotes.length}`);
      return { generated: 3, considered: 4 };
    },
    runPicksJob: async () => {
      callLog.push('picks');
      return { posted: 1, watched: 0, postedDetails: [{ event: 'Test Event', legCount: 2 }] };
    }
  });

  assert.deepEqual(callLog, ['snapshot:true', 'slates:1', 'analysis:1', 'picks']);
  assert.equal(result.slates.posted, 2);
  assert.equal(result.analysis.generated, 3);
  assert.equal(result.picks.posted, 1);
});