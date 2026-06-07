import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(here, '../../..');
const defaultInputPath = path.join(workspaceRoot, 'automation/discord-webhooks/tmp/bookmaker-snapshot-import.template.csv');
const defaultOutputPath = path.join(workspaceRoot, 'automation/discord-webhooks/bookmaker-snapshots.json');
const REQUIRED_HEADERS = ['sportKey', 'homeTeam', 'awayTeam', 'startTime', 'market', 'outcomeName', 'bookmakerKey', 'price'];

function resolveCliPath(value, fallback) {
  if (!value) {
    return fallback;
  }

  return path.isAbsolute(value) ? value : path.join(workspaceRoot, value);
}

function detectDelimiter(headerLine) {
  return headerLine.includes('\t') ? '\t' : ',';
}

function parseDelimitedLine(line, delimiter) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (character === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }

      continue;
    }

    if (character === delimiter && !inQuotes) {
      values.push(current);
      current = '';
      continue;
    }

    current += character;
  }

  values.push(current);
  return values.map((value) => value.trim());
}

function parseInputTable(raw) {
  const lines = raw
    .split(/\r?\n/u)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim());

  if (!lines.length) {
    throw new Error('Snapshot import file is empty.');
  }

  const delimiter = detectDelimiter(lines[0]);
  const headers = parseDelimitedLine(lines[0], delimiter);

  for (const header of REQUIRED_HEADERS) {
    if (!headers.includes(header)) {
      throw new Error(`Snapshot import file is missing required column: ${header}`);
    }
  }

  return lines.slice(1).map((line, index) => {
    const values = parseDelimitedLine(line, delimiter);
    const row = Object.fromEntries(headers.map((header, headerIndex) => [header, values[headerIndex] || '']));
    row.__lineNumber = index + 2;
    return row;
  });
}

function toOptionalNumber(value) {
  const trimmed = String(value || '').trim();

  if (!trimmed) {
    return null;
  }

  const numeric = Number(trimmed);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeRow(row, updatedAt) {
  const price = Number(row.price);

  if (!Number.isFinite(price) || price <= 1) {
    throw new Error(`Invalid price on line ${row.__lineNumber}.`);
  }

  const startTime = row.startTime;

  if (!Number.isFinite(new Date(startTime).getTime())) {
    throw new Error(`Invalid startTime on line ${row.__lineNumber}.`);
  }

  return {
    sportKey: row.sportKey,
    homeTeam: row.homeTeam,
    awayTeam: row.awayTeam,
    startTime: new Date(startTime).toISOString(),
    market: row.market,
    outcomeName: row.outcomeName,
    description: row.description || '',
    point: toOptionalNumber(row.point),
    bookmakerKey: row.bookmakerKey,
    bookmakerTitle: row.bookmakerTitle || row.bookmakerKey,
    price,
    fetchedAt: row.fetchedAt && Number.isFinite(new Date(row.fetchedAt).getTime())
      ? new Date(row.fetchedAt).toISOString()
      : updatedAt
  };
}

function buildQuoteKey(row) {
  return JSON.stringify([
    row.sportKey,
    row.homeTeam,
    row.awayTeam,
    row.startTime,
    row.market,
    row.outcomeName,
    row.description,
    row.point,
    row.fetchedAt
  ]);
}

function sortQuotes(left, right) {
  return JSON.stringify([
    left.startTime,
    left.sportKey,
    left.awayTeam,
    left.homeTeam,
    left.market,
    left.outcomeName,
    left.description,
    left.point ?? ''
  ]).localeCompare(JSON.stringify([
    right.startTime,
    right.sportKey,
    right.awayTeam,
    right.homeTeam,
    right.market,
    right.outcomeName,
    right.description,
    right.point ?? ''
  ]));
}

async function main() {
  const inputPath = resolveCliPath(process.argv[2], defaultInputPath);
  const outputPath = resolveCliPath(process.argv[3], defaultOutputPath);
  const updatedAt = new Date().toISOString();
  const raw = await fs.readFile(inputPath, 'utf8');
  const rows = parseInputTable(raw).map((row) => normalizeRow(row, updatedAt));
  const grouped = new Map();

  for (const row of rows) {
    const key = buildQuoteKey(row);
    const existing = grouped.get(key);

    if (!existing) {
      grouped.set(key, {
        sportKey: row.sportKey,
        homeTeam: row.homeTeam,
        awayTeam: row.awayTeam,
        startTime: row.startTime,
        market: row.market,
        outcomeName: row.outcomeName,
        description: row.description,
        point: row.point,
        fetchedAt: row.fetchedAt,
        prices: [{
          bookmakerKey: row.bookmakerKey,
          bookmakerTitle: row.bookmakerTitle,
          price: row.price
        }]
      });
      continue;
    }

    const existingPrice = existing.prices.find((price) => price.bookmakerKey === row.bookmakerKey);

    if (existingPrice) {
      if (row.price > existingPrice.price) {
        existingPrice.price = row.price;
        existingPrice.bookmakerTitle = row.bookmakerTitle;
      }

      continue;
    }

    existing.prices.push({
      bookmakerKey: row.bookmakerKey,
      bookmakerTitle: row.bookmakerTitle,
      price: row.price
    });
  }

  const quotes = [...grouped.values()]
    .map((quote) => ({
      ...quote,
      prices: quote.prices.sort((left, right) => String(left.bookmakerKey).localeCompare(String(right.bookmakerKey)))
    }))
    .sort(sortQuotes);

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify({ updatedAt, quotes }, null, 2)}\n`, 'utf8');

  console.log(`Imported ${rows.length} rows into ${quotes.length} snapshot quotes.`);
  console.log(`Input: ${inputPath}`);
  console.log(`Output: ${outputPath}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});