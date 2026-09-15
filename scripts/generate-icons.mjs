import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

await mkdir('public/icon', { recursive: true });
for (const size of [16, 32, 48, 128]) {
  await sharp('codex_references/Icons/Logo.svg').resize(size, size).png().toFile(`public/icon/${size}.png`);
}
