// Mirrors desktop/main.mjs reanalyzeAllSlips() to validate against real feed + snapshot.
import { loadConfig } from '../src/config.mjs';
import { loadRawPicksFeed } from '../src/picks-feed.mjs';
import { loadSnapshotFile, buildSnapshotEvents } from '../src/web-market-intake.mjs';
import { buildAnalysisCandidatePool, analyzeEventWithRules, buildPickFromAnalysisDecision } from '../src/ai-pick-generator.mjs';

const config = await loadConfig();
const feed = await loadRawPicksFeed(config.__paths.picksFeedFile);
const snapshot = await loadSnapshotFile(config.__paths.snapshotFile);
const now = new Date();

const pregame = (feed.picks || []).filter((pick) => {
  if (String(pick.status || '').toLowerCase() !== 'pending') return false;
  const start = pick.startTime ? new Date(pick.startTime) : null;
  return start && !Number.isNaN(start.getTime()) && start.getTime() > now.getTime();
});
console.log(`Active pre-game slips found: ${pregame.length}\n`);

for (const pick of pregame) {
  const sport = (config.sports || []).find((s) => {
    const sk = String(s.key || '').toLowerCase();
    const pk = String(pick.sport || '').toLowerCase();
    return sk === pk || String(s.marketKey || '').toLowerCase() === pk;
  });
  if (!sport) { console.log(`- ${pick.sport}: NO SPORT CONFIG`); continue; }

  const events = buildSnapshotEvents(snapshot, config, sport, now);
  const pickName = String(pick.event || pick.summary || '').toLowerCase().trim();
  const matched = events.find((ev) => {
    const evName = String(ev.displayName || `${ev.home_team} vs ${ev.away_team}`).toLowerCase().trim();
    return evName === pickName || evName.includes(pickName) || pickName.includes(evName);
  }) || events[0];
  if (!matched) { console.log(`- ${pick.event}: NO MATCHING EVENT IN SNAPSHOT (started/stale)`); continue; }

  const eventContext = {
    sportKey: sport.key, sportLabel: sport.label, marketSportKey: sport.marketKey || sport.key,
    eventId: matched.id, eventName: matched.displayName || `${matched.away_team} vs ${matched.home_team}`,
    homeTeam: matched.home_team, awayTeam: matched.away_team, startTime: matched.commence_time,
    venue: matched.venue || null, generatorConfig: config.analysis.generator
  };
  const pool = buildAnalysisCandidatePool(eventContext, matched.snapshotQuotes || [], Number(config.analysis?.maxCandidateLegsPerEvent || 14));
  if (!pool.length) { console.log(`- ${eventContext.eventName}: empty candidate pool`); continue; }

  const decision = await analyzeEventWithRules({ config, state: {}, dryRun: true }, eventContext, pool, { availableUnits: pick.stakeUnits });
  const newPick = buildPickFromAnalysisDecision(eventContext, pool, decision);
  const orig = pick.summary || '';
  const next = newPick?.summary || null;
  const changed = Boolean(next && next !== orig);
  console.log(`- ${eventContext.eventName} [${pick.sport}]`);
  console.log(`    current : ${orig}`);
  console.log(`    rebuilt : ${next || '(no qualifying build)'}  ${changed ? '<<< CHANGED' : '(same)'}`);
}
