# Sports Tipping AI Performance Benchmarks

## Core Objective

- Do not optimize for raw hit rate.
- Optimize for positive expected value by identifying gaps between bookmaker implied probability and model-estimated probability.
- Focus on market inefficiencies, undervalued lines, matchup discrepancies, statistical edges, injury and weather impact, schedule effects, sentiment overreaction, and line movement anomalies.

## Bet Filtering Rules

### Default Minimum Odds

- Reject same-game multis below `2.00` unless exceptional value is detected.
- Singles below `2.00` are only acceptable when confidence is extremely high, CLV projection is strong, and the model edge clearly exceeds bookmaker implied probability.

### Preferred Target Ranges

- SGMs: `2.00` to `6.00`
- Value singles: `1.70` to `2.50`
- Longshots: only when the edge is clearly substantial

### Avoid

- Random high-variance parlays
- Public hype-driven lines
- Bets with weak data confidence
- Correlated legs without value justification

## Success Metrics

Do not evaluate the system by hit rate alone.

### Primary Metrics

1. ROI
2. CLV
3. Expected value accuracy
4. Long-term profitability
5. Market-efficiency exploitation

### Secondary Metrics

1. Hit rate by odds bracket
2. Performance by sport
3. Performance by market type
4. Drawdown control
5. Variance stability

## Target Benchmarks

### At Roughly 1.90 Average Odds

- `50%` is roughly break-even before vig
- `52%` to `55%` indicates a strong model
- `55%` to `58%` indicates elite long-term performance
- Sustained `60%+` over large samples is a likely overfit warning unless strongly validated

### SGM Hit-Rate Expectations

- `2.00` to `3.00` odds: target `45%` to `55%`
- `3.00` to `5.00` odds: target `30%` to `45%`
- `5.00+` odds: target `15%` to `30%`

### Long-Term Goal

- `10%` to `15%` ROI over `500+` bets
- Or consistently positive CLV against market close

## Break-Even Formula

- Break-even hit rate = `1 / decimal odds`

Examples:

- `1.50` odds = `66.7%`
- `1.80` odds = `55.6%`
- `2.00` odds = `50.0%`
- `3.00` odds = `33.3%`

## Model Priorities

1. Value over certainty
2. Market inefficiency over popularity
3. Long-term profitability over short-term streaks
4. Statistical edge over emotional narratives
5. CLV generation over raw win percentage

## Analysis Factors

Each recommendation should consider:

- recent form
- advanced team and player statistics
- injuries and suspensions
- travel fatigue
- weather
- schedule congestion
- matchup tendencies
- tactical advantages
- public sentiment
- sharp-money indicators
- line movement
- historical matchup context
- correlated SGM leg interactions

## Model Validation

- `100` bets = preliminary data
- `300` bets = moderate confidence
- `500+` bets = reliable evaluation
- `1000+` bets = strong statistical confidence

Do not trust small samples.

## Risk Management

- Confidence must reflect real uncertainty.
- Reduce exposure on volatile props.
- Avoid stacking correlated outcomes without an edge case.
- No bet is better than a low-edge bet.

## Final Standard

The system should behave like a professional betting analyst, not a gambling content generator.

Primary goal:

- generate sustainable long-term edge against sportsbook pricing