import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { loadRawPicksFeed, saveRawPicksFeed } from '../src/picks-feed.mjs';

test('loadRawPicksFeed repairs a torn trailing write and leaves valid JSON behind', async (t) => {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sportstips-picks-feed-repair-'));
  const filePath = path.join(workspaceRoot, 'picks-feed.json');
  const validFeed = {
    picks: [{
      id: 'pick-1',
      sport: 'mlb',
      summary: 'Jose Ramirez 1+ Hit + Tanner Bibee 4+ Strikeouts'
    }]
  };

  t.after(async () => {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });

  await fs.writeFile(
    filePath,
    `${JSON.stringify(validFeed, null, 2)}\n"summary": "stale trailing bytes"\n`,
    'utf8'
  );

  const repaired = await loadRawPicksFeed(filePath);
  const onDisk = JSON.parse(await fs.readFile(filePath, 'utf8'));
  const directoryEntries = await fs.readdir(workspaceRoot);

  assert.equal(repaired.picks.length, 1);
  assert.deepEqual(onDisk, validFeed);
  assert.equal(directoryEntries.some((entry) => entry.startsWith('picks-feed.json.corrupt-')), true);
});

test('saveRawPicksFeed writes parseable JSON', async (t) => {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sportstips-picks-feed-save-'));
  const filePath = path.join(workspaceRoot, 'picks-feed.json');
  const feed = {
    picks: [{
      id: 'pick-2',
      sport: 'afl',
      summary: 'Nick Daicos 20+ Disposals + Bailey Smith 15+ Disposals'
    }]
  };

  t.after(async () => {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });

  await saveRawPicksFeed(filePath, feed);

  assert.deepEqual(JSON.parse(await fs.readFile(filePath, 'utf8')), feed);
});