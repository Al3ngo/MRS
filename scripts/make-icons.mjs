/**
 * Builds the app icons from the one drawing of the mark (src/assets/mark.svg).
 * Run with `npm run icons` after changing the mark or the colours below; the results are committed.
 *
 *   public/favicon.svg                    browser tab
 *   public/icons/favicon-32.png           browser tab, for browsers without SVG icons
 *   public/icons/icon-{192,512}.png       installed app, drawn as given
 *   public/icons/icon-maskable-{192,512}  installed app on Android, which crops to its own shape
 *   public/icons/apple-touch-icon.png     iPhone and iPad home screen
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GROUND = '#000000';
const INK = '#ffffff';
const ACCENT = '#c6f24e';

const drawing = readFileSync(resolve(root, 'src/assets/mark.svg'), 'utf8')
  .replace(/^[\s\S]*?<svg[^>]*>/, '')
  .replace(/<\/svg>\s*$/, '')
  .replaceAll('currentColor', INK)
  .replaceAll('var(--accent)', ACCENT);

/**
 * The mark on a square tile. `scale` is relative to a 512 tile; `radius` rounds the tile's corners
 * (0 for icons the system crops itself).
 */
const tile = ({ scale, radius }) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${radius}" fill="${GROUND}"/>
  <g transform="translate(256 256) rotate(32) scale(${scale}) translate(-80 -120)" fill="${INK}">${drawing}</g>
</svg>
`;

// Android may crop a maskable icon to a circle 80% of its width; at this scale the whole car is inside it.
const MASKABLE = tile({ scale: 1.3, radius: 0 });
const ROUNDED = tile({ scale: 1.6, radius: 112 });
const APPLE = tile({ scale: 1.5, radius: 0 });

/** `opaque` drops the transparency channel, for the icons the system crops to its own shape. */
const png = (svg, size, file, { opaque = false } = {}) => {
  const image = sharp(Buffer.from(svg), { density: 96 * (size / 512) * 4 }).resize(size, size);
  if (opaque) image.flatten({ background: GROUND });
  return image.png({ compressionLevel: 9 }).toFile(resolve(root, 'public', file));
};

mkdirSync(resolve(root, 'public/icons'), { recursive: true });
writeFileSync(resolve(root, 'public/favicon.svg'), ROUNDED);
await Promise.all([
  png(ROUNDED, 32, 'icons/favicon-32.png'),
  png(ROUNDED, 192, 'icons/icon-192.png'),
  png(ROUNDED, 512, 'icons/icon-512.png'),
  png(MASKABLE, 192, 'icons/icon-maskable-192.png', { opaque: true }),
  png(MASKABLE, 512, 'icons/icon-maskable-512.png', { opaque: true }),
  png(APPLE, 180, 'icons/apple-touch-icon.png', { opaque: true }),
]);
console.log('Icons written to public/ and public/icons/');
