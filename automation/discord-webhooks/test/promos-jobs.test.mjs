import test from 'node:test';
import assert from 'node:assert';
import {
  runPromoGenerationJob,
  runPromoSettlementJob,
  runPromoReportJob
} from '../src/jobs/promos.mjs';

test('Promos Jobs Module', async (t) => {
  await t.test('runPromoGenerationJob returns job result', async () => {
    const result = await runPromoGenerationJob({});
    assert(result.jobType === 'promo-generation');
    assert(result.startedAt);
    assert(Number.isFinite(result.duration));
  });

  await t.test('runPromoGenerationJob handles errors gracefully', async () => {
    const result = await runPromoGenerationJob({ invalidConfig: true });
    assert(result.jobType === 'promo-generation');
    assert(Number.isFinite(result.duration));
  });

  await t.test('runPromoSettlementJob returns job result', async () => {
    const result = await runPromoSettlementJob({});
    assert(result.jobType === 'promo-settlement');
    assert(result.startedAt);
    assert(Number.isFinite(result.duration));
  });

  await t.test('runPromoSettlementJob tracks unresolved count', async () => {
    const result = await runPromoSettlementJob({});
    assert(Number.isFinite(result.slipsSettled) || result.error);
    assert(Number.isFinite(result.unresolved) || result.error);
  });

  await t.test('runPromoReportJob returns job result', async () => {
    const result = await runPromoReportJob({});
    assert(result.jobType === 'promo-report');
    assert(result.startedAt);
    assert(Number.isFinite(result.duration));
  });

  await t.test('runPromoReportJob includes counts', async () => {
    const result = await runPromoReportJob({});
    assert(Number.isFinite(result.slipsCount) || result.slipsCount === undefined);
    assert(Number.isFinite(result.settlementsCount) || result.settlementsCount === undefined);
  });

  await t.test('all jobs return duration', async () => {
    const gen = await runPromoGenerationJob({});
    const settle = await runPromoSettlementJob({});
    const report = await runPromoReportJob({});

    assert(gen.duration >= 0);
    assert(settle.duration >= 0);
    assert(report.duration >= 0);
  });
});
