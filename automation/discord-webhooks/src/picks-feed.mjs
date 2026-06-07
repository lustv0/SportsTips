import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

function assertPicksFeedShape(data) {
  if (!Array.isArray(data.picks)) {
    throw new Error('picks-feed.json must contain a picks array.');
  }

  return data;
}

function serializePicksFeed(data) {
  return `${JSON.stringify(data, null, 2)}\n`;
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

  const recoveredRaw = `${raw.slice(0, boundary).trimEnd()}\n`;

  try {
    return assertPicksFeedShape(JSON.parse(recoveredRaw));
  } catch {
    return null;
  }
}

async function writeFileAtomically(filePath, content) {
  const directory = path.dirname(filePath);
  const tempPath = path.join(directory, `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`);

  await fs.writeFile(tempPath, content, 'utf8');

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

async function writeRecoveryBackup(filePath, raw) {
  const backupPath = path.join(
    path.dirname(filePath),
    `${path.basename(filePath)}.corrupt-${new Date().toISOString().replace(/[:.]/g, '-')}`
  );

  await fs.writeFile(backupPath, raw, 'utf8');
  return backupPath;
}

async function loadAndRepairPicksFeed(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');

  try {
    return assertPicksFeedShape(JSON.parse(raw));
  } catch (error) {
    const recovered = recoverTrailingJsonWrite(raw, error);

    if (!recovered) {
      throw error;
    }

    const backupPath = await writeRecoveryBackup(filePath, raw);
    await writeFileAtomically(filePath, serializePicksFeed(recovered));
    console.warn(`[picks-feed] recovered torn JSON write in ${path.basename(filePath)} and saved backup to ${backupPath}`);
    return recovered;
  }
}

export async function loadPicksFeed(filePath) {
  return loadAndRepairPicksFeed(filePath);
}

export async function loadRawPicksFeed(filePath) {
  return loadAndRepairPicksFeed(filePath);
}

export async function saveRawPicksFeed(filePath, data) {
  const validated = assertPicksFeedShape(data);
  await writeFileAtomically(filePath, serializePicksFeed(validated));
  return validated;
}