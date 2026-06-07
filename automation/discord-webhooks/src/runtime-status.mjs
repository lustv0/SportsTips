import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

function defaultRuntimeStatus() {
  return {
    running: false,
    pid: null,
    mode: 'daemon',
    startedAt: null,
    heartbeatAt: null,
    stoppedAt: null,
    stopReason: null,
    status: 'stopped',
    watchedPicks: 0,
    lastMarketQuoteCount: null,
    lastMarketRefreshAt: null,
    webhooks: {
      slates: false,
      picks: false,
      picksNba: false,
      picksMlb: false,
      picksAfl: false,
      picksNrl: false,
      picksNfl: false,
      picksEpl: false,
      picksOther: false,
      referralsNew: false,
      referralsUpdatedTerms: false,
      referralsCancelled: false,
      referralsMasterlist: false,
      unitTracking: false,
      unitReport: false
    },
    lastRuns: {},
    lastError: null
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

async function loadRawRuntimeStatus(filePath) {
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
    console.warn(`[runtime-status] recovered torn JSON write in ${path.basename(filePath)} and saved backup to ${backupPath}`);
    return recovered;
  }
}

export async function loadRuntimeStatus(filePath) {
  try {
    const parsed = await loadRawRuntimeStatus(filePath);
    return {
      ...defaultRuntimeStatus(),
      ...parsed,
      webhooks: {
        ...defaultRuntimeStatus().webhooks,
        ...(parsed.webhooks || {})
      },
      lastRuns: {
        ...(parsed.lastRuns || {})
      }
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return defaultRuntimeStatus();
    }

    throw error;
  }
}

export async function saveRuntimeStatus(filePath, status) {
  await writeJsonFileAtomically(filePath, status);
}
