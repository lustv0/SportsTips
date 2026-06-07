import { runAnalysisJob } from './jobs/analysis.mjs';
import { runPicksJob } from './jobs/picks.mjs';
import { runSlatesJob } from './jobs/slates.mjs';
import { loadRawPicksFeed, saveRawPicksFeed } from './picks-feed.mjs';
import { ensureFreshScrapedSnapshot } from './web-market-intake.mjs';

const GENERATED_ID_PREFIXES = ['auto-generator:', 'ai-generator:'];
const SETTLED_STATUSES = new Set(['win', 'loss', 'return']);

function isGeneratedPickId(value) {
  return GENERATED_ID_PREFIXES.some((prefix) => String(value || '').startsWith(prefix));
}

function isGeneratedPickRecord(pick) {
  return isGeneratedPickId(pick?.id) || isGeneratedPickId(pick?.source);
}

function isSettledPick(pick) {
  return SETTLED_STATUSES.has(String(pick?.status || '').toLowerCase());
}

export function resetFreshDailyState(state, feed) {
  state.jobs ??= {};
  state.posts ??= {};
  state.posts.slates ??= {};
  state.posts.picks ??= {};
  state.tracking ??= {};
  state.tracking.picks ??= {};

  delete state.jobs.slates;
  delete state.jobs.analysis;
  delete state.jobs.picks;

  const removedPostedPickIds = Object.keys(state.posts.picks).filter((pickId) => isGeneratedPickId(pickId));

  for (const pickId of removedPostedPickIds) {
    delete state.posts.picks[pickId];
  }

  const removedTrackingPickIds = Object.keys(state.tracking.picks).filter((pickId) => isGeneratedPickId(pickId));

  for (const pickId of removedTrackingPickIds) {
    delete state.tracking.picks[pickId];
  }

  const nextFeed = {
    ...feed,
    picks: Array.isArray(feed?.picks)
      ? feed.picks.filter((pick) => !isGeneratedPickRecord(pick) || isSettledPick(pick))
      : []
  };

  return {
    nextFeed,
    removedPostedPickIds,
    removedTrackingPickIds,
    removedGeneratedFeedPicks: Math.max(0, Number((feed?.picks || []).length) - nextFeed.picks.length)
  };
}

export async function prepareFreshDailyCheck(config, state, overrides = {}) {
  const loadFeed = overrides.loadRawPicksFeed || loadRawPicksFeed;
  const saveFeed = overrides.saveRawPicksFeed || saveRawPicksFeed;
  const feed = await loadFeed(config.__paths.picksFeedFile);
  const resetResult = resetFreshDailyState(state, feed);

  await saveFeed(config.__paths.picksFeedFile, resetResult.nextFeed);

  return {
    ...resetResult,
    remainingFeedPicks: Array.isArray(resetResult.nextFeed?.picks) ? resetResult.nextFeed.picks.length : 0
  };
}

export async function runForcedDailyCheck(context, overrides = {}) {
  const now = overrides.now || new Date();
  const snapshotLoader = overrides.ensureFreshScrapedSnapshot || ensureFreshScrapedSnapshot;
  const slatesJob = overrides.runSlatesJob || runSlatesJob;
  const analysisJob = overrides.runAnalysisJob || runAnalysisJob;
  const picksJob = overrides.runPicksJob || runPicksJob;
  const prepareResult = overrides.skipPrepare
    ? {
        nextFeed: null,
        removedPostedPickIds: [],
        removedTrackingPickIds: [],
        removedGeneratedFeedPicks: 0,
        remainingFeedPicks: null
      }
    : await prepareFreshDailyCheck(context.config, context.state, overrides);
  const snapshot = overrides.snapshot || await snapshotLoader(context, now, { force: true });
  const slates = await slatesJob(context, { snapshot });
  const analysis = await analysisJob(context, { snapshot });
  const picks = await picksJob(context);

  return {
    prepareResult,
    slates,
    analysis,
    picks
  };
}