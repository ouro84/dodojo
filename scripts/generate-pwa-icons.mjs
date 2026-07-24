// Décline public/icons/logo-source.svg en icônes PWA :
// - "any" (192/512, fond transparent) — icône standard du manifest.
// - "maskable" (192/512, fond plein --color-bg) — respecte la zone de
//   sécurité du crop adaptatif Android (spec maskable icons).
// - apple-icon (180x180, fond plein) — Next.js sert automatiquement
//   <link rel="apple-touch-icon"> depuis app/apple-icon.png ; iOS
//   recommande un fond opaque (pas de transparence) pour cette icône.
// Pas de vraie déclinaison claire/sombre du logo lui-même : l'app n'a
// qu'un seul thème (sombre, cf. app/globals.css --color-bg). La passe
// d'identité visuelle multi-thème est hors scope (issue #51).
// Usage : npm run generate:icons
import sharp from "sharp";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_SVG = path.join(ROOT, "public", "icons", "logo-source.svg");
const ICONS_DIR = path.join(ROOT, "public", "icons");

// Fond sombre de l'app (--color-bg dans app/globals.css,
// oklch(0.14 0.015 25) converti en sRGB) — fond plein des icônes maskable.
const BRAND_BG = "#0f0706";

// Zone de sécurité maskable : le contenu doit tenir dans un cercle centré
// de 80% du côté (spec Android adaptive icon). On tasse le logo à 60% du
// côté pour garder de la marge, la silhouette de flamme débordant jusqu'aux
// bords de son propre viewBox.
const MASKABLE_CONTENT_RATIO = 0.6;

async function renderAnyIcon(svgBuffer, size) {
  return sharp(svgBuffer)
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

async function renderMaskableIcon(svgBuffer, size) {
  const contentSize = Math.round(size * MASKABLE_CONTENT_RATIO);
  const content = await sharp(svgBuffer)
    .resize(contentSize, contentSize, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  return sharp({
    create: { width: size, height: size, channels: 4, background: BRAND_BG },
  })
    .composite([{ input: content, gravity: "center" }])
    .png()
    .toBuffer();
}

// Audit UX 2026-07-24 (P2) : app/favicon.ico était un triangle générique sans
// rapport avec la marque (orphelin d'un prototype antérieur). Encodeur ICO
// minimal (frames PNG embarquées, supporté par tous les navigateurs modernes
// depuis Windows Vista) — évite d'ajouter une dépendance juste pour ça.
function buildIco(pngBuffersBySize) {
  const count = pngBuffersBySize.length;
  const headerSize = 6 + count * 16;
  let offset = headerSize;
  const dirEntries = [];
  for (const { size, buffer } of pngBuffersBySize) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0); // width (0 = 256)
    entry.writeUInt8(size >= 256 ? 0 : size, 1); // height
    entry.writeUInt8(0, 2); // color count (0 = no palette)
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(buffer.length, 8); // size of image data
    entry.writeUInt32LE(offset, 12); // offset of image data
    dirEntries.push(entry);
    offset += buffer.length;
  }
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: 1 = icon
  header.writeUInt16LE(count, 4); // image count
  return Buffer.concat([header, ...dirEntries, ...pngBuffersBySize.map((p) => p.buffer)]);
}

async function main() {
  const svgBuffer = await fs.readFile(SOURCE_SVG);

  const any192 = await renderAnyIcon(svgBuffer, 192);
  const any512 = await renderAnyIcon(svgBuffer, 512);
  const maskable192 = await renderMaskableIcon(svgBuffer, 192);
  const maskable512 = await renderMaskableIcon(svgBuffer, 512);
  const appleIcon = await renderMaskableIcon(svgBuffer, 180);

  await fs.writeFile(path.join(ICONS_DIR, "icon-192.png"), any192);
  await fs.writeFile(path.join(ICONS_DIR, "icon-512.png"), any512);
  await fs.writeFile(path.join(ICONS_DIR, "icon-maskable-192.png"), maskable192);
  await fs.writeFile(path.join(ICONS_DIR, "icon-maskable-512.png"), maskable512);
  await fs.writeFile(path.join(ROOT, "app", "apple-icon.png"), appleIcon);

  const favicon16 = await renderMaskableIcon(svgBuffer, 16);
  const favicon32 = await renderMaskableIcon(svgBuffer, 32);
  const favicon48 = await renderMaskableIcon(svgBuffer, 48);
  const ico = buildIco([
    { size: 16, buffer: favicon16 },
    { size: 32, buffer: favicon32 },
    { size: 48, buffer: favicon48 },
  ]);
  await fs.writeFile(path.join(ROOT, "app", "favicon.ico"), ico);

  console.log("Icônes PWA générées dans public/icons/ + app/apple-icon.png + app/favicon.ico");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
