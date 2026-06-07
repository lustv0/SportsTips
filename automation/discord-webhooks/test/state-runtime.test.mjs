import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { loadRuntimeStatus, saveRuntimeStatus } from '../src/runtime-status.mjs';
import { loadState, saveState } from '../src/state.mjs';

test('loadState repairs a torn trailing write and persists a valid state file', async (t) => {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sportstips-state-repair-'));
  const filePath = path.join(workspaceRoot, 'state.json');
  const state = {
    jobs: {},
    posts: { slates: {}, picks: {}, referrals: {}, results: {} },
    cache: { oddsValidation: {} },
    providers: { sportsGameOdds: {}, marketScrape: {} },
    tracking: { picks: { 'pick-1': { status: 'pending' } } }
  };

  t.after(async () => {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });

  await fs.writeFile(filePath, `${JSON.stringify(state, null, 2)}\n"stale": true\n`, 'utf8');

  const repaired = await loadState(filePath);
  const onDisk = JSON.parse(await fs.readFile(filePath, 'utf8'));
  const entries = await fs.readdir(workspaceRoot);

  assert.equal(repaired.tracking.picks['pick-1'].status, 'pending');
  assert.deepEqual(onDisk, state);
  assert.equal(entries.some((entry) => entry.startsWith('state.json.corrupt-')), true);
});

test('saveState writes parseable JSON', async (t) => {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sportstips-state-save-'));
  const filePath = path.join(workspaceRoot, 'state.json');
  const state = {
    jobs: { analysis: { lastRunAt: '2026-05-30T00:00:00.000Z' } },
    posts: { slates: {}, picks: {}, referrals: {}, results: {} },
    cache: { oddsValidation: {} },
    providers: { sportsGameOdds: {}, marketScrape: {} },
    tracking: { picks: {} }
  };

  t.after(async () => {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });

  await saveState(filePath, state);

  assert.deepEqual(JSON.parse(await fs.readFile(filePath, 'utf8')), state);
});

test('loadRuntimeStatus repairs a torn trailing write and persists a valid status file', async (t) => {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sportstips-runtime-status-repair-'));
  const filePath = path.join(workspaceRoot, 'runtime-status.json');
  const status = {
    running: true,
    pid: 1234,
    mode: 'daemon',
    status: 'idle',
    webhooks: { picks: true },
    lastRuns: { results: '2026-05-30T00:00:00.000Z' }
  };

  t.after(async () => {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });

  await fs.writeFile(filePath, `${JSON.stringify(status, null, 2)}\n"stale": true\n`, 'utf8');

  const repaired = await loadRuntimeStatus(filePath);
  const onDisk = JSON.parse(await fs.readFile(filePath, 'utf8'));
  const entries = await fs.readdir(workspaceRoot);

  assert.equal(repaired.running, true);
  assert.equal(repaired.webhooks.picks, true);
  assert.deepEqual(onDisk, status);
  assert.equal(entries.some((entry) => entry.startsWith('runtime-status.json.corrupt-')), true);
});

test('saveRuntimeStatus writes parseable JSON', async (t) => {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sportstips-runtime-status-save-'));
  const filePath = path.join(workspaceRoot, 'runtime-status.json');
  const status = {
    running: false,
    pid: null,
    mode: 'daemon',
    status: 'stopped',
    webhooks: { picks: false },
    lastRuns: {}
  };

  t.after(async () => {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });

  await saveRuntimeStatus(filePath, status);

  assert.deepEqual(JSON.parse(await fs.readFile(filePath, 'utf8')), status);
});