import { nativeImage } from 'electron';

const ICON_SVG = String.raw`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <defs>
    <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="#102038" />
      <stop offset="100%" stop-color="#1e3a5f" />
    </linearGradient>
    <linearGradient id="accent" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="#ffb000" />
      <stop offset="100%" stop-color="#ff6b00" />
    </linearGradient>
  </defs>
  <rect x="8" y="8" width="112" height="112" rx="24" fill="url(#bg)" />
  <path d="M34 77c10-18 24-27 44-29 11-1 19 1 26 6" fill="none" stroke="#f4f7fb" stroke-width="10" stroke-linecap="round" />
  <circle cx="44" cy="77" r="10" fill="#f4f7fb" />
  <circle cx="90" cy="52" r="12" fill="url(#accent)" />
  <path d="M56 99h34" stroke="url(#accent)" stroke-width="10" stroke-linecap="round" />
</svg>`;

export function createAppIcon(size = 256) {
  const dataUrl = `data:image/svg+xml;base64,${Buffer.from(ICON_SVG).toString('base64')}`;
  return nativeImage.createFromDataURL(dataUrl).resize({
    width: size,
    height: size
  });
}
