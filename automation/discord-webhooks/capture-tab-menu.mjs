#!/usr/bin/env node
// Refresh the cached TAB market menu (tab-market-menu.json).
//
// TAB's API is behind an Akamai WAF, so this drives a headless Microsoft Edge to read
// TAB's (essentially static) market menu per sport and caches it. Run it occasionally
// (e.g. weekly, or when a new competition/season starts) — it is NOT on the daemon's
// per-cycle path. Captures are best-effort and UNION into the existing cache, so running
// it a few times (ideally close to kickoff, when TAB has the most markets open) builds
// the fullest menu. Usage:  node capture-tab-menu.mjs
import { loadConfig } from './src/config.mjs';
import { captureTabMarketMenu, mergeTabMenu, loadTabMarketMenu, saveTabMarketMenu } from './src/providers/tab.mjs';

const config = await loadConfig();
const cachePath = config.__paths.tabMarketMenuFile;
const sportKeys = (config.sports || []).filter((sport) => sport.enabled !== false).map((sport) => sport.key);

console.log(`Capturing TAB market menu for: ${sportKeys.join(', ')}`);
console.log('(headless Edge — TAB access is intermittent; re-run if a sport shows an error)\n');

const captured = await captureTabMarketMenu({
  sportKeys,
  jurisdiction: config.tab?.jurisdiction || 'NSW',
  edgePath: config.tab?.edgePath || '',
  log: (message) => console.log(message)
});
const merged = mergeTabMenu(await loadTabMarketMenu(cachePath), captured);
await saveTabMarketMenu(cachePath, merged);

console.log('\n=== TAB market menu (merged + saved) ===');
for (const [sport, entry] of Object.entries(merged.sports)) {
  const markets = entry.canonicalMarkets ? ` -> [${entry.canonicalMarkets.join(', ')}]` : '';
  console.log(`${sport.padEnd(26)} ${String(entry.status).padEnd(20)}${markets}`);
}
console.log(`\nSaved to ${cachePath}`);
