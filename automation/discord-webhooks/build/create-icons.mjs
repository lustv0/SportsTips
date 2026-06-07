import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import pngToIco from 'png-to-ico';
import sharp from 'sharp';

const here = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.join(here, '../build-resources');
const svgMarkup = `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0a1b33" />
      <stop offset="100%" stop-color="#11284d" />
    </linearGradient>
    <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ffb300" />
      <stop offset="100%" stop-color="#ff6a00" />
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="120" fill="url(#bg)" />
  <circle cx="256" cy="186" r="92" fill="url(#accent)" opacity="0.95" />
  <path d="M161 319c0-35 28-63 63-63h64c35 0 63 28 63 63v16c0 9-7 16-16 16H177c-9 0-16-7-16-16z" fill="#f4f7fb" />
  <path d="M154 389h204" stroke="#ffb300" stroke-width="30" stroke-linecap="round" />
  <path d="M256 128v116" stroke="#11284d" stroke-width="22" stroke-linecap="round" />
  <path d="M198 182h116" stroke="#11284d" stroke-width="22" stroke-linecap="round" />
</svg>`;

async function main() {
  await fs.mkdir(outputDir, { recursive: true });

  const svgPath = path.join(outputDir, 'icon.svg');
  const png512Path = path.join(outputDir, 'icon.png');
  const icoPath = path.join(outputDir, 'icon.ico');
  const svgBuffer = Buffer.from(svgMarkup.trim());
  const icoSizes = [16, 24, 32, 48, 64, 128, 256];

  await fs.writeFile(svgPath, svgBuffer);
  await sharp(svgBuffer).resize(512, 512).png().toFile(png512Path);

  const icoSources = [];

  for (const size of icoSizes) {
    const pngPath = path.join(outputDir, `icon-${size}.png`);
    await sharp(svgBuffer).resize(size, size).png().toFile(pngPath);
    icoSources.push(pngPath);
  }

  const icoBuffer = await pngToIco(icoSources);
  await fs.writeFile(icoPath, icoBuffer);

  console.log(`Created icon assets in ${outputDir}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});