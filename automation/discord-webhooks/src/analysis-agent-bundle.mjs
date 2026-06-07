import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_AGENT_FILES = [
  'betting-workflow-orchestrator.agent.md',
  'game-intake-orchestrator.agent.md',
  'conservative-sgm-quant.agent.md',
  'current-slate-verifier.agent.md',
  'ticket-integrity-checker.agent.md',
  'bankroll-risk-manager.agent.md'
];
const FALLBACK_GUIDANCE = [
  'Evaluate one event at a time and do not rank it against other games.',
  'Use a conservative same-game workflow by default for team sports.',
  'Prefer no-bet over weak edge, thin data, invalid structures, or unstable player roles.',
  'Only choose legs from the provided candidate pool. Do not invent players or markets.',
  'When presenting a final ticket, copy the exact validated candidate labels. Never rewrite or substitute a player, team, or market from memory.',
  'Require actionable pregame status, sufficient market depth, a positive support case, acceptable correlation, and ticket integrity before qualifying an event.',
  'Reject dependent ticket shapes. Never stack same-script ladders such as first-half total with full-game total in the same direction, duplicate side ladders, or legs whose failures are tightly coupled.',
  'Use promo-aware sport structure rules without forcing filler: NRL is same-game-multi only and should require a clean 3-leg same-game build from safe markets, EPL should prefer the smallest clean same-game build, AFL is same-game-multi only and should stay in safer 2-3 leg disposal-led builds unless a promo explicitly requires more, and other team sports should lean to the smallest prop-led build that still stays structurally clean.',
  'For MLB, stay fail-closed on a strict 2-leg same-game build: require exactly two verified 1+ hit props, prefer one hitter from each lineup when team data is available, and do not use strikeouts, totals, RBI, H2H, run lines, or total bases in the current profile.',
  'For NRL, prefer totals, first-half totals, first-half plus lines, protected full-game plus lines, and genuine kicker points markets; avoid race-to-points and do not force a fragile filler leg just to reach 3 legs.',
  'For NBA, prioritize rebounds, assists, and combo props ahead of pure points ladders, and de-prioritize 3pts, steals, and blocks for cash-style tickets unless the matchup clearly supports them.',
  'If a promo-driven sport can only reach the required leg count by adding a fragile or dependent filler leg, prefer no-bet over forcing the structure.',
  'Use bankroll context to suggest conservative stake sizing, but do not reject an otherwise valid event solely because the local tracker shows zero currently deployable units. This program publishes analysis and does not auto-place wagers.'
].join('\n');
const cache = new Map();

function stripFrontMatter(raw) {
  return String(raw || '')
    .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '')
    .trim();
}

async function tryReadBundle(rootPath) {
  const agentDirectory = path.join(rootPath, '.github', 'agents');
  const parts = [];

  for (const fileName of DEFAULT_AGENT_FILES) {
    const filePath = path.join(agentDirectory, fileName);

    try {
      const raw = await fs.readFile(filePath, 'utf8');
      parts.push(`### ${fileName}\n${stripFrontMatter(raw)}`);
    } catch {
      return null;
    }
  }

  return parts.join('\n\n');
}

export async function loadAnalysisAgentBundle(workspaceRoot) {
  const cacheKey = workspaceRoot || '__default__';

  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  const candidateRoots = [
    workspaceRoot,
    path.resolve(here, '../../../')
  ].filter(Boolean);

  let bundle = null;

  for (const rootPath of candidateRoots) {
    bundle = await tryReadBundle(rootPath);

    if (bundle) {
      break;
    }
  }

  const finalBundle = bundle ? `${FALLBACK_GUIDANCE}\n\n${bundle}` : FALLBACK_GUIDANCE;
  cache.set(cacheKey, finalBundle);
  return finalBundle;
}