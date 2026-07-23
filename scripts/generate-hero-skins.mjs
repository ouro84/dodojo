// US-53 : génère les frames idle de chaque tenue (recolor) à partir des
// frames idle déjà extraites par copy-hero-sprites.sh. Jamais exécuté au
// runtime — offline uniquement. Usage : node scripts/generate-hero-skins.mjs
import sharp from "sharp";
import { promises as fs } from "node:fs";
import path from "node:path";

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  const d = max - min;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case r: h = ((g - b) / d) % 6; break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, s, l];
}

function hslToRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

// Recolor masqué (Tier A/B) : ne retinte que les pixels dans la bande de
// teinte du costume, au-delà du seuil de saturation. Le reste (contours,
// hautes lumières, peau quand séparable) reste inchangé pixel pour pixel.
async function maskedRecolor(src, out, { hueMin, hueMax, minSat, hueShift }) {
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  for (let i = 0; i < data.length; i += channels) {
    const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
    if (a < 10) continue;
    const [h, s, l] = rgbToHsl(r, g, b);
    if (s < minSat) continue;
    const inBand = hueMin <= hueMax ? h >= hueMin && h <= hueMax : h >= hueMin || h <= hueMax;
    if (!inBand) continue;
    const [nr, ng, nb] = hslToRgb((h + hueShift + 360) % 360, s, l);
    data[i] = nr; data[i + 1] = ng; data[i + 2] = nb;
  }
  await sharp(data, { raw: { width, height, channels } }).png().toFile(out);
}

// Overlay tint multiply (Tier C) : ne retinte que les pixels quasi neutres
// (gris métal), préserve les accents colorés existants.
async function tintRecolor(src, out, { maxSat, tint }) {
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const [tr, tg, tb] = tint;
  for (let i = 0; i < data.length; i += channels) {
    const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
    if (a < 10) continue;
    const [, s] = rgbToHsl(r, g, b);
    if (s >= maxSat) continue;
    data[i] = Math.round((r * tr) / 255);
    data[i + 1] = Math.round((g * tg) / 255);
    data[i + 2] = Math.round((b * tb) / 255);
  }
  await sharp(data, { raw: { width, height, channels } }).png().toFile(out);
}

// Calibration par héros — cf. docs/superpowers/specs/2026-07-23-us53-tenues-skins-design.md §4.
const PLAN = [
  {
    slug: "fire-knight", frameCount: 8,
    band: { hueMin: 0, hueMax: 60, minSat: 0.35 },
    skins: [{ id: "fire_knight_shadow_purple", hueShift: 250 }],
  },
  {
    slug: "ground-monk", frameCount: 6,
    band: { hueMin: 0, hueMax: 30, minSat: 0.35 },
    skins: [{ id: "ground_monk_shadow_purple", hueShift: 250 }],
  },
  {
    slug: "wind-hashashin", frameCount: 8,
    band: { hueMin: 15, hueMax: 45, minSat: 0.35 },
    skins: [{ id: "wind_hashashin_azure", hueShift: 180 }],
  },
  {
    slug: "water-priestess", frameCount: 8,
    band: { hueMin: 180, hueMax: 255, minSat: 0.35 },
    skins: [
      { id: "water_priestess_ember", hueShift: 150 },
      { id: "water_priestess_verdant", hueShift: 275 },
      { id: "water_priestess_amethyst", hueShift: 55 },
    ],
  },
  {
    slug: "leaf-ranger", frameCount: 12,
    band: { hueMin: 150, hueMax: 195, minSat: 0.4 },
    skins: [
      { id: "leaf_ranger_ember", hueShift: 190 },
      { id: "leaf_ranger_amethyst", hueShift: 95 },
    ],
  },
  {
    slug: "crystal-mauler", frameCount: 8,
    band: { hueMin: 165, hueMax: 240, minSat: 0.3 },
    skins: [
      { id: "crystal_mauler_ember", hueShift: 170 },
      { id: "crystal_mauler_verdant", hueShift: 295 },
      { id: "crystal_mauler_amethyst", hueShift: 75 },
    ],
  },
  {
    slug: "metal-bladekeeper", frameCount: 8,
    tint: { maxSat: 0.15 },
    skins: [
      { id: "metal_bladekeeper_bronze", color: [138, 106, 58] },
      { id: "metal_bladekeeper_dark_steel", color: [58, 63, 71] },
    ],
  },
];

for (const hero of PLAN) {
  for (const skin of hero.skins) {
    const outDir = `public/sprites/mc/${hero.slug}/skins/${skin.id}/idle`;
    await fs.mkdir(outDir, { recursive: true });
    for (let i = 0; i < hero.frameCount; i++) {
      const frame = String(i).padStart(4, "0");
      const src = `public/sprites/mc/${hero.slug}/idle/frame${frame}.png`;
      const out = path.join(outDir, `frame${frame}.png`);
      if (hero.tint) {
        await tintRecolor(src, out, { maxSat: hero.tint.maxSat, tint: skin.color });
      } else {
        await maskedRecolor(src, out, { ...hero.band, hueShift: skin.hueShift });
      }
    }
    console.log(`${hero.slug} -> ${skin.id} : ${hero.frameCount} frames`);
  }
}
