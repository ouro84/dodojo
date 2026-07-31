// Extrait les animations de combat de tous les personnages (7 héros + 27 boss)
// et les VFX d'impact par héros vers des spritesheets horizontales dans public/,
// puis écrit lib/sprite-metadata.generated.json.
//
// Usage : node scripts/build-sprite-sheets.mjs
// Idempotent : chaque dossier de sortie est nettoyé avant écriture.
import sharp from "sharp";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const A = (p) => path.join(ROOT, "assets", p);
const PUB = (p) => path.join(ROOT, "public", p);

// RÉFÉRENCE DE NON-RÉGRESSION VISUELLE — ISSUE #74.
// Hauteur en pixels de l'ancienne frame idle recadrée de chaque personnage,
// mesurée AVANT la migration en spritesheets. `renderScale` s'en déduit
// (tileH / hauteur de référence) pour que le corps garde exactement la taille
// et la position qu'il a aujourd'hui à hauteur CSS fixe.
// NE JAMAIS recalculer ces valeurs depuis la nouvelle boîte de recadrage :
// la boîte est désormais l'union de TOUTES les anims (l'arme déborde), elle est
// donc plus haute que l'ancienne boîte idle, et s'en servir comme référence
// rétrécirait tous les personnages.
const LEGACY_IDLE_HEIGHTS = {
  // Héros
  "crystal-mauler": 39,
  "fire-knight": 44,
  "ground-monk": 35,
  "leaf-ranger": 44,
  "metal-bladekeeper": 42,
  "water-priestess": 38,
  "wind-hashashin": 37,
  // Boss
  accomplice: 71,
  cthulhu: 64,
  "demon-slime": 107,
  "dock-corpse": 67,
  "fire-wizard": 66,
  "frost-guardian": 92,
  gangster: 72,
  gorgon: 85,
  "gorgon-ivory": 85,
  "gorgon-scarlet": 85,
  idler: 76,
  jaded: 69,
  knight: 64,
  "knight-amethyst": 64,
  "knight-garnet": 64,
  "lightning-mage": 63,
  minotaur: 108,
  "minotaur-ardent": 86,
  "minotaur-occult": 93,
  "minotaur-warrior": 93,
  "mob-baron": 71,
  mushroom: 33,
  procrastinator: 66,
  satyr: 89,
  temptress: 75,
  "urban-zombie": 67,
  "wandering-mage": 66,
};

// Les frames des packs sont 1-indexées et NON zero-paddées
// (`warrior_skill1_frame1.png`, `..._frame10.png`). Un tri lexical donnerait
// 1, 10, 11, 2, 3… et produirait une animation dans le désordre.
function numericSort(files) {
  const rank = (f) => {
    const m = f.match(/(\d+)(?=\.png$)/i);
    return m ? Number(m[1]) : 0;
  };
  return [...files].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

// Charge les frames d'un dossier sous forme de buffers RGBA bruts + dimensions.
async function loadFramesFromDir(dir) {
  const names = numericSort(
    (await fs.readdir(dir)).filter((f) => f.toLowerCase().endsWith(".png")),
  );
  if (names.length === 0) throw new Error(`Aucune frame PNG dans ${dir}`);
  return Promise.all(
    names.map(async (name) => {
      const img = sharp(path.join(dir, name));
      const { width, height } = await img.metadata();
      const data = await img.ensureAlpha().raw().toBuffer();
      return { data, width, height };
    }),
  );
}

// Découpe une spritesheet horizontale en frames de largeur tileW.
async function sliceSheet(file, tileW) {
  const img = sharp(file);
  const { width, height } = await img.metadata();
  if (width % tileW !== 0) {
    throw new Error(
      `${file} : largeur ${width} non divisible par la tuile ${tileW} — ` +
        `découpe impossible sans décaler les frames.`,
    );
  }
  const count = width / tileW;
  const frames = [];
  for (let i = 0; i < count; i += 1) {
    const data = await sharp(file)
      .extract({ left: i * tileW, top: 0, width: tileW, height })
      .ensureAlpha()
      .raw()
      .toBuffer();
    frames.push({ data, width: tileW, height });
  }
  return frames;
}

// Boîte alpha englobant TOUTES les frames passées. Union, jamais par frame :
// un recadrage indépendant désynchroniserait l'animation, et un recadrage par
// anim ferait sauter le personnage au démarrage d'une attaque.
function unionBox(frames) {
  let left = Infinity, top = Infinity, right = -1, bottom = -1;
  for (const { data, width, height } of frames) {
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (data[(y * width + x) * 4 + 3] === 0) continue;
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }
  if (right < 0) throw new Error("Toutes les frames sont entièrement transparentes");
  return { left, top, width: right - left + 1, height: bottom - top + 1 };
}

// Assemble les frames recadrées sur `box` en une bande horizontale.
async function writeSheet(frames, box, outPath) {
  const tiles = await Promise.all(
    frames.map(({ data, width, height }) =>
      sharp(data, { raw: { width, height, channels: 4 } })
        .extract(box)
        .png()
        .toBuffer(),
    ),
  );
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await sharp({
    create: {
      width: box.width * frames.length,
      height: box.height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(tiles.map((input, i) => ({ input, left: i * box.width, top: 0 })))
    .png()
    .toFile(outPath);
}

// Écrit la frame 0 recadrée seule — utilisée par /api/share-card (Satori ne sait
// pas animer une feuille en steps()) et par generate-hero-portraits.mjs.
async function writeStill(frame, box, outPath) {
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await sharp(frame.data, {
    raw: { width: frame.width, height: frame.height, channels: 4 },
  })
    .extract(box)
    .png()
    .toFile(outPath);
}

export {
  A, PUB, LEGACY_IDLE_HEIGHTS, numericSort,
  loadFramesFromDir, sliceSheet, unionBox, writeSheet, writeStill,
};
