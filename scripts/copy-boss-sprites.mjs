// Extrait les décors vers public/. Les personnages (boss et héros) sont
// passés à scripts/build-sprite-sheets.mjs (issue #48) — ce script ne traite
// plus que les backgrounds.
// - Backgrounds : rendu plat copié en <slug>.png.
// Usage : node scripts/copy-boss-sprites.mjs
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const A = (p) => path.join(ROOT, "assets", p);
const PUB = (p) => path.join(ROOT, "public", p);

// --- Backgrounds : plusieurs variantes par thème (background 1..N des packs).
// style "png"  → PNG/background <v>/background <v>.png ; style "orig" → background <v>/orig.png.
// On tente les variantes demandées et on saute celles absentes. slug = <theme>
// pour la variante 1, <theme>-<v> ensuite.
const BG = "Backgrounds";
const BG_THEMES = [
  { theme: "ancient-temple", pack: "free-ancient-temple-pixel-game-backgrounds", style: "png", variants: [1, 2, 3] },
  { theme: "castle-interior", pack: "Free-Castle-Interior-Pixel-Game-Backgrounds", style: "png", variants: [1, 2, 3] },
  { theme: "crystal-cave", pack: "free-crystal-cave-pixel-art-backgrounds", style: "png", variants: [1, 2] },
  { theme: "desert-oasis", pack: "free-desert-oasis-pixel-art-background-pack", style: "png", variants: [1, 2] },
  { theme: "mountain-peak", pack: "free-mountain-peak-pixel-art-backgrounds", style: "png", variants: [1, 2] },
  { theme: "steampunk-cityscape", pack: "free-steampunk-cityscape-pixel-backgrounds", style: "orig", variants: [1, 2] },
  { theme: "underwater-world", pack: "free-underwater-world-pixel-art-backgrounds", style: "orig", variants: [1, 2] },
];

function bgSource({ pack, style }, v) {
  return style === "orig"
    ? A(`${BG}/${pack}/background ${v}/orig.png`)
    : A(`${BG}/${pack}/PNG/background ${v}/background ${v}.png`);
}

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function extractBackgrounds() {
  await fs.mkdir(PUB("backgrounds"), { recursive: true });
  const out = [];
  for (const t of BG_THEMES) {
    for (const v of t.variants) {
      const src = bgSource(t, v);
      if (!(await exists(src))) {
        console.warn(`SKIP absent: ${t.theme} v${v} (${src})`);
        continue;
      }
      const slug = v === 1 ? t.theme : `${t.theme}-${v}`;
      await fs.copyFile(src, PUB(`backgrounds/${slug}.png`));
      out.push({ slug, theme: t.theme });
    }
  }
  return out;
}

const bgOut = await extractBackgrounds();

console.log("=== Backgrounds (slug | theme) ===");
for (const b of bgOut) console.log(`${b.slug} | ${b.theme}`);
