// Extrait les sprites idle des boss + les décors vers public/.
// - Boss "réels" : frames PNG individuelles → copie/renomme en frameNNNN.png.
// - Boss "low boss" : spritesheet horizontale → découpée en frames via sharp.
// - Backgrounds : rendu plat copié en <slug>.png.
// Usage : node scripts/copy-boss-sprites.mjs
// Idempotent : nettoie le dossier idle de chaque boss avant extraction.
import sharp from "sharp";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const A = (p) => path.join(ROOT, "assets", p);
const PUB = (p) => path.join(ROOT, "public", p);

// --- Boss à frames individuelles (idle) ---
const FRAME_BOSSES = [
  {
    slug: "frost-guardian",
    dir: A("Boss/Frost_Guardian_FREE_v1.0/Frost_Guardian_FREE_v1.0/PNG files/idle"),
  },
  {
    slug: "demon-slime",
    dir: A("Boss/boss_demon_slime_FREE_v1.0/boss_demon_slime_FREE_v1.0/individual sprites/01_demon_idle"),
  },
  {
    slug: "cthulhu",
    dir: A("Boss/free_cthulu_v1/free_cthulu/animations/PNG/idle"),
  },
  {
    slug: "minotaur",
    dir: A("Boss/mino_v1.1_free/mino_v1.1_free/animations/idle"),
  },
];

// --- Boss "low boss" à spritesheet (idle) : frames = nb d'images dans la bande ---
const LB = "Boss/low boss";
const SHEET_BOSSES = [
  { slug: "satyr", file: A(`${LB}/Free-Satyr-Sprite-Sheet-Pixel-Art-Pack/Satyr_1/Idle.png`), frames: 7 },
  { slug: "urban-zombie", file: A(`${LB}/Free-Urban-Zombie-Sprite-Sheet-Pixel-Art-Pack/Zombie_1/Idle.png`), frames: 6 },
  { slug: "mushroom", file: A(`${LB}/Mushroom/Mushroom without VFX/Mushroom-Idle.png`), frames: 8 },
  { slug: "gorgon", file: A(`${LB}/free-gorgon-pixel-art-character-sprite-sheets/Gorgon_1/Idle.png`), frames: 7 },
  { slug: "fire-wizard", file: A(`${LB}/free-wizard-sprite-sheets-pixel-art/Fire vizard/Idle.png`), frames: 7 },
  { slug: "lightning-mage", file: A(`${LB}/free-wizard-sprite-sheets-pixel-art/Lightning Mage/Idle.png`), frames: 7 },
  { slug: "gangster", file: A(`${LB}/gangster-pixel-character-sprite-sheets-pack/Gangsters_1/Idle.png`), frames: 6 },
  { slug: "knight", file: A(`${LB}/knight-character-sprites-pixel-art/Spritesheet 128/Knight_1/Idle.png`), frames: 4 },
];

// --- Backgrounds : rendu plat par thème ---
const BG = "Backgrounds";
const BACKGROUNDS = [
  { slug: "ancient-temple", file: A(`${BG}/free-ancient-temple-pixel-game-backgrounds/PNG/background 1/background 1.png`) },
  { slug: "castle-interior", file: A(`${BG}/Free-Castle-Interior-Pixel-Game-Backgrounds/PNG/background 1/background 1.png`) },
  { slug: "crystal-cave", file: A(`${BG}/free-crystal-cave-pixel-art-backgrounds/PNG/background 1/background 1.png`) },
  { slug: "desert-oasis", file: A(`${BG}/free-desert-oasis-pixel-art-background-pack/PNG/background 1/background 1.png`) },
  { slug: "mountain-peak", file: A(`${BG}/free-mountain-peak-pixel-art-backgrounds/PNG/background 1/background 1.png`) },
  { slug: "steampunk-cityscape", file: A(`${BG}/free-steampunk-cityscape-pixel-backgrounds/background 1/orig.png`) },
  { slug: "underwater-world", file: A(`${BG}/free-underwater-world-pixel-art-backgrounds/background 1/orig.png`) },
];

const numOf = (name) => {
  const m = name.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
};

async function emptyIdle(slug) {
  const dir = PUB(`sprites/bosses/${slug}/idle`);
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

async function extractFrames({ slug, dir }) {
  const out = await emptyIdle(slug);
  const files = (await fs.readdir(dir))
    .filter((f) => /\.png$/i.test(f))
    .sort((a, b) => numOf(a) - numOf(b));
  for (let i = 0; i < files.length; i++) {
    const target = path.join(out, `frame${String(i).padStart(4, "0")}.png`);
    await fs.copyFile(path.join(dir, files[i]), target);
  }
  return files.length;
}

async function sliceSheet({ slug, file, frames }) {
  const out = await emptyIdle(slug);
  const meta = await sharp(file).metadata();
  const frameW = Math.round(meta.width / frames);
  const frameH = meta.height;
  for (let i = 0; i < frames; i++) {
    const target = path.join(out, `frame${String(i).padStart(4, "0")}.png`);
    await sharp(file)
      .extract({ left: i * frameW, top: 0, width: frameW, height: frameH })
      .toFile(target);
  }
  return frames;
}

async function copyBackground({ slug, file }) {
  await fs.mkdir(PUB("backgrounds"), { recursive: true });
  await fs.copyFile(file, PUB(`backgrounds/${slug}.png`));
}

const summary = [];
for (const b of FRAME_BOSSES) summary.push([b.slug, await extractFrames(b), "frames"]);
for (const b of SHEET_BOSSES) summary.push([b.slug, await sliceSheet(b), "sheet"]);
for (const bg of BACKGROUNDS) await copyBackground(bg);

console.log("=== BOSS idle frames ===");
for (const [slug, count, kind] of summary) console.log(`${slug}: ${count} (${kind})`);
console.log("=== Backgrounds ===");
console.log(BACKGROUNDS.map((b) => b.slug).join(", "));
