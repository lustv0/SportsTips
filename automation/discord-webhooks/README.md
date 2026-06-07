# Discord Webhooks Automation

This automation publishes slate notes, candidate picks, and settled results to Discord.

## Operating Rules

- Selection logic is support-first, not payout-first.
- The generator should prefer the smallest clean build that still has a strong support case.
- Dependent same-script ladders are globally rejected. Do not stack shapes such as `1st half total + full-game total` in the same direction.
- If a clean third leg does not exist, the workflow should prefer a smaller build or no-bet instead of forcing a filler leg.
- Output formatting is support-based and confidence-based rather than quote-based.

## Jobs

- `analysis`: gathers the current slate, builds candidate pools, and writes pick candidates into the local feed.
- `picks`: watches pending candidates, applies benchmark checks, and posts qualified picks when they are inside the posting window.
- `results`: formats and posts settled results.

## Main Files

- `config.json`: local runtime configuration.
- `src/config.mjs`: runtime config normalization.
- `src/ai-pick-generator.mjs`: support-first structured analysis and rules fallback.
- `src/pick-generator.mjs`: local candidate construction and pairing.
- `src/replacement-generator.mjs`: replacement-path generation for voided legs.
- `src/benchmarks.mjs`: benchmark acceptance checks.
- `src/jobs/`: scheduled job runners.
- `picks-feed.json`: local feed of pending and settled picks.
- `bookmaker-snapshots.json`: local market snapshot cache when available.

## Configuration Notes

- The benchmark configuration now uses support thresholds rather than payout floors.
- The picks job hold behavior is controlled by `jobs.picks.holdIfSupportRulesFail`.
- The generator is expected to return clean `2-leg` builds when they are stronger than a forced third leg.
- Sport-specific defaults still apply, but they must not override the global dependency ban.

## Validation

A quick module-load smoke test from the workspace root:

```bash
node --input-type=module -e "import './automation/discord-webhooks/src/pick-generator.mjs'; import './automation/discord-webhooks/src/ai-pick-generator.mjs'; import './automation/discord-webhooks/src/replacement-generator.mjs'; import './automation/discord-webhooks/src/formatters.mjs'; console.log('module-load-ok')"
```

If you change runtime code, also run a focused error check on the touched files.
