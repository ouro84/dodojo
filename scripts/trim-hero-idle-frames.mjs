// Corrige une incohérence de cadrage héritée de US-18 : scripts/copy-hero-sprites.sh
// ne liste pas fire-knight (extrait/rogné à la main avant que ce script existe,
// frames déjà ~58x44) alors que les 6 autres héros sont copiés bruts en 288x128
// avec beaucoup de vide transparent autour du perso — ce qui les fait paraître
// bien plus petits une fois affichés à hauteur CSS fixe (IdleSprite).
//
// Recadre chaque héros sur la bbox UNION de ses frames idle (pas un trim par
// frame indépendant, qui désynchroniserait l'animation frame à frame).
// Usage : node scripts/trim-hero-idle-frames.mjs
import sharp from "sharp";
import { promises as fs } from "node:fs";

const HEROES = [
  "water-priestess",
  "ground-monk",
  "wind-hashashin",
  "crystal-mauler",
  "leaf-ranger",
  "metal-bladekeeper",
];

const FRAME_COUNTS = {
  "water-priestess": 8,
  "ground-monk": 6,
  "wind-hashashin": 8,
  "crystal-mauler": 8,
  "leaf-ranger": 12,
  "metal-bladekeeper": 8,
};

function bboxFromRaw(data, info, alphaThreshold = 10) {
  const { width, height, channels } = info;
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = data[(y * width + x) * channels + 3];
      if (a > alphaThreshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { left: minX, top: minY, right: maxX, bottom: maxY };
}

for (const slug of HEROES) {
  const frameCount = FRAME_COUNTS[slug];
  const dir = `public/sprites/mc/${slug}/idle`;
  const buffers = [];
  let union = null;

  for (let i = 0; i < frameCount; i++) {
    const file = `${dir}/frame${String(i).padStart(4, "0")}.png`;
    const buf = await fs.readFile(file);
    const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    buffers.push({ file, buf, width: info.width, height: info.height });
    const box = bboxFromRaw(data, info);
    if (!box) continue;
    union = union
      ? {
          left: Math.min(union.left, box.left),
          top: Math.min(union.top, box.top),
          right: Math.max(union.right, box.right),
          bottom: Math.max(union.bottom, box.bottom),
        }
      : box;
  }

  if (!union) {
    console.log(`${slug} : aucune bbox détectée, ignoré`);
    continue;
  }

  const extract = {
    left: union.left,
    top: union.top,
    width: union.right - union.left + 1,
    height: union.bottom - union.top + 1,
  };

  for (const { file, buf } of buffers) {
    await sharp(buf).extract(extract).toFile(file);
  }
  console.log(`${slug} : recadré à ${extract.width}x${extract.height} (${frameCount} frames)`);
}
