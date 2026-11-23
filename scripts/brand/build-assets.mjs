// PromptPerfect brand asset pipeline.
// Single source of truth: the SVG masters in public/brand/.
// Regenerates every raster asset the surfaces consume (Next.js app icons,
// favicon.ico, PWA icons, social images, extension icons).
// Run: node scripts/brand/build-assets.mjs   (requires sharp, a project dep)
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const brand = (n) => readFileSync(join(root, "public", "brand", n));
const out = (rel, buf) => { writeFileSync(join(root, rel), buf); console.log("wrote", rel, buf.length, "B"); };

const png = (svg, size) => sharp(svg, { density: 384 }).resize(size, size).png().toBuffer();

function ico(entries) {
  // ICO container with PNG-compressed entries (valid for all modern browsers/OSes).
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(entries.length, 4);
  const dirs = []; let offset = 6 + entries.length * 16;
  for (const e of entries) {
    const d = Buffer.alloc(16);
    d.writeUInt8(e.size >= 256 ? 0 : e.size, 0); d.writeUInt8(e.size >= 256 ? 0 : e.size, 1);
    d.writeUInt8(0, 2); d.writeUInt8(0, 3); d.writeUInt16LE(1, 4); d.writeUInt16LE(32, 6);
    d.writeUInt32LE(e.buf.length, 8); d.writeUInt32LE(offset, 12);
    offset += e.buf.length; dirs.push(d);
  }
  return Buffer.concat([header, ...dirs, ...entries.map((e) => e.buf)]);
}

const logo = brand("logo.svg");
const small = brand("logo-small.svg");
const maskable = brand("logo-maskable.svg");
const og = brand("og.svg");

// Next.js app icons (file conventions picked up automatically by the framework)
out("src/app/icon.png", await png(logo, 512));
out("src/app/apple-icon.png", await png(logo, 180));
writeFileSync(join(root, "src/app/icon.svg"), logo); console.log("wrote src/app/icon.svg");
const icoEntries = [];
for (const s of [16, 32, 48]) icoEntries.push({ size: s, buf: await png(small, s) });
out("src/app/favicon.ico", ico(icoEntries));

// PWA / generic web icons
out("public/icons/icon-192.png", await png(logo, 192));
out("public/icons/icon-512.png", await png(logo, 512));
out("public/icons/icon-maskable-512.png", await png(maskable, 512));

// Social images (file conventions + a public copy for external references)
const ogPng = await sharp(og, { density: 200 }).png().toBuffer();
out("src/app/opengraph-image.png", ogPng);
out("src/app/twitter-image.png", ogPng);
out("public/brand/og.png", ogPng);

// Extension icons (16 uses the small-size master: no sparkle, heavier strokes)
out("extension/icons/icon16.png", await png(small, 16));
out("extension/icons/icon48.png", await png(logo, 48));
out("extension/icons/icon128.png", await png(logo, 128));
console.log("brand assets complete");
