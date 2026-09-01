import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const icon = path.join(root, 'public', 'icon-kexu.png');
const res = path.join(root, 'android', 'app', 'src', 'main', 'res');
const densities = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };

for (const [density, size] of Object.entries(densities)) {
  const directory = path.join(res, `mipmap-${density}`);
  const png = await sharp(icon).resize(size, size).png().toBuffer();
  const adaptiveForeground = await sharp(icon).resize(Math.round(size * 2.25), Math.round(size * 2.25)).png().toBuffer();
  await fs.writeFile(path.join(directory, 'ic_launcher.png'), png);
  await fs.writeFile(path.join(directory, 'ic_launcher_round.png'), png);
  // The source is fully opaque and edge-to-edge. Reusing it as the adaptive
  // foreground prevents OEM launchers from revealing a mismatched rim. Android
  // adaptive layers use a 108 dp canvas, while legacy launcher icons use 48 dp.
  await fs.writeFile(path.join(directory, 'ic_launcher_foreground.png'), adaptiveForeground);
}

const splashFiles = [];
for (const entry of await fs.readdir(res, { withFileTypes: true })) {
  if (!entry.isDirectory() || !entry.name.startsWith('drawable')) continue;
  const target = path.join(res, entry.name, 'splash.png');
  try { await fs.access(target); splashFiles.push(target); } catch { /* no splash in this density */ }
}

for (const target of splashFiles) {
  const meta = await sharp(target).metadata();
  const width = meta.width || 1080;
  const height = meta.height || 1920;
  const iconSize = Math.round(Math.min(width, height) * 0.23);
  const mark = await sharp(icon).resize(iconSize, iconSize).png().toBuffer();
  await sharp({ create: { width, height, channels: 4, background: '#fbfaf7' } })
    .composite([{ input: mark, gravity: 'center' }])
    .png()
    .toFile(`${target}.next`);
  await fs.rename(`${target}.next`, target);
}

console.log(`Generated launcher icons and ${splashFiles.length} splash assets.`);
