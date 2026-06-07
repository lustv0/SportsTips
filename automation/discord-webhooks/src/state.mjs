import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

function defaultState() {
  return {
    jobs: {},
    posts: {
      slates: {},
      picks: {},
      referrals: {},
      results: {}
    },
    cache: {
      oddsValidation: {}
    },
    providers: {
      sportsGameOdds: {},
      marketScrape: {}
    },
    tracking: {
      picks: {}
    }
  };
}

function recoverTrailingJsonWrite(raw, error) {
  const message = String(error?.message || '');
  const match = message.match(/Unexpected non-whitespace character after JSON at position (\d+)/);

  if (!match) {
    return null;
  }

  const boundary = Number(match[1]);

  if (!Number.isInteger(boundary) || boundary <= 0 || boundary >= raw.length) {
    return null;
  }

  try {
    return JSON.parse(`${raw.slice(0, boundary).trimEnd()}\n`);
  } catch {
    return null;
  }
}

async function writeJsonFileAtomically(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`);

  await fs.writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');

  try {
    await fs.rename(tempPath, filePath);
  } catch (error) {
    if (error?.code !== 'EEXIST' && error?.code !== 'EPERM') {
      await fs.rm(tempPath, { force: true }).catch(() => {});
      throw error;
    }

    await fs.rm(filePath, { force: true });
    await fs.rename(tempPath, filePath);
  }
}

async function backupCorruptFile(filePath, raw) {
  const backupPath = path.join(
    path.dirname(filePath),
    `${path.basename(filePath)}.corrupt-${new Date().toISOString().replace(/[:.]/g, '-')}`
  );

  await fs.writeFile(backupPath, raw, 'utf8');
  return backupPath;
}

async function loadRawState(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');

  try {
    return JSON.parse(raw);
  } catch (error) {
    const recovered = recoverTrailingJsonWrite(raw, error);

    if (!recovered) {
      throw error;
    }

    const backupPath = await backupCorruptFile(filePath, raw);
    await writeJsonFileAtomically(filePath, recovered);
    console.warn(`[state] recovered torn JSON write in ${path.basename(filePath)} and saved backup to ${backupPath}`);
    return recovered;
  }
}

export async function loadState(filePath) {
  try {
    const parsed = await loadRawState(filePath);
    const { oddsApi: legacyOddsApi, ...parsedProviders } = parsed.providers || {};

    return {
      ...defaultState(),
      ...parsed,
      posts: {
        ...defaultState().posts,
        ...(parsed.posts || {})
      },
      cache: {
        ...defaultState().cache,
        ...(parsed.cache || {})
      },
      providers: {
        ...defaultState().providers,
        ...parsedProviders
      },
      tracking: {
        ...defaultState().tracking,
        ...(parsed.tracking || {})
      }
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return defaultState();
    }

    throw error;
  }
}

export async function saveState(filePath, state) {
  await writeJsonFileAtomically(filePath, state);
}