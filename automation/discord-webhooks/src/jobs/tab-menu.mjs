import { getDateKey } from '../scheduler.mjs';
import { captureTabMarketMenu, mergeTabMenu, loadTabMarketMenu, saveTabMarketMenu } from '../providers/tab.mjs';

// Hard ceiling so a slow/blocked headless session can never stall the daemon job loop.
const TAB_CAPTURE_HARD_TIMEOUT_MS = 4 * 60 * 1000;
// Soft budget: stop starting new sports past this, leaving headroom under the hard timeout.
const TAB_CAPTURE_SOFT_BUDGET_MS = 3 * 60 * 1000;

function countOkSports(menu) {
  return Object.values(menu?.sports || {}).filter((entry) => entry?.status === 'ok').length;
}

// Daily, best-effort TAB market-menu refresh. NEVER throws (a throw would crash the daemon
// loop) and is hard-timeout-guarded (TAB's headless access is intermittent/slow). Partial
// captures are fine — mergeTabMenu unions into and preserves the existing cache.
export async function runTabMenuJob(context) {
  const { config, state } = context;
  const now = new Date();
  const dateKey = getDateKey(now, config.timezone);

  state.jobs ??= {};

  if (config.tab?.enabled === false) {
    state.jobs.tabMenu = { lastRunDate: dateKey, lastRunAt: now.toISOString(), skippedReason: 'tab_disabled' };
    return { posted: 0, changes: 0 };
  }

  const sportKeys = (config.sports || [])
    .filter((sport) => sport.enabled !== false)
    .map((sport) => sport.key);

  let captured = null;
  let timedOut = false;

  try {
    captured = await Promise.race([
      captureTabMarketMenu({
        sportKeys,
        jurisdiction: config.tab?.jurisdiction || 'NSW',
        edgePath: config.tab?.edgePath || '',
        maxDurationMs: TAB_CAPTURE_SOFT_BUDGET_MS,
        log: (message) => console.log(message)
      }),
      new Promise((resolve) => setTimeout(() => { timedOut = true; resolve(null); }, TAB_CAPTURE_HARD_TIMEOUT_MS))
    ]);
  } catch (error) {
    // Headless launch / Akamai block / no Edge — log and carry on; the cached menu stands.
    console.log(`[tabMenu] capture failed: ${error.message}`);
    state.jobs.tabMenu = { lastRunDate: dateKey, lastRunAt: now.toISOString(), error: error.message };
    return { posted: 0, changes: 0 };
  }

  if (!captured) {
    console.log(`[tabMenu] capture ${timedOut ? 'hit the hard timeout' : 'returned nothing'}; keeping the existing menu.`);
    state.jobs.tabMenu = { lastRunDate: dateKey, lastRunAt: now.toISOString(), skippedReason: timedOut ? 'timeout' : 'no_result' };
    return { posted: 0, changes: 0 };
  }

  try {
    const previous = await loadTabMarketMenu(config.__paths.tabMarketMenuFile);
    const merged = mergeTabMenu(previous, captured);
    await saveTabMarketMenu(config.__paths.tabMarketMenuFile, merged);
    const okCount = countOkSports(merged);
    console.log(`[tabMenu] menu refreshed — ${okCount} sport(s) with a TAB menu.`);
    state.jobs.tabMenu = { lastRunDate: dateKey, lastRunAt: now.toISOString(), okSports: okCount };
    return { posted: 0, changes: okCount };
  } catch (error) {
    console.log(`[tabMenu] failed to save menu: ${error.message}`);
    state.jobs.tabMenu = { lastRunDate: dateKey, lastRunAt: now.toISOString(), error: error.message };
    return { posted: 0, changes: 0 };
  }
}
