// Issue #135 : génère un bust (tête + haut du buste) par personnage pour le
// VS card, à partir du plein-pied déjà tight-trim (héros : portrait.png
// existant ; boss : still.png, trim fait ici, portrait.png généré en
// sous-produit — même convention que generate-hero-portraits.mjs).
// Usage : node scripts/generate-vs-portraits.mjs
//
// Liste des boss dérivée du dossier public/sprites/bosses/ (un sous-dossier
// par slug, déjà peuplé par copy-boss-sprites.mjs) plutôt que d'importer
// lib/bosses.ts — un script .mjs ne peut pas importer un module .ts sans
// loader dédié (aucun configuré dans ce projet, cf. build-sprite-sheets.mjs
// qui fait le même choix : jamais d'import direct d'un fichier lib/*.ts).
import sharp from "sharp";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUB = (p) => path.join(ROOT, "public", p);

const BOSS_SLUGS = (
  await fs.readdir(PUB("sprites/bosses"), { withFileTypes: true })
)
  .filter((e) => e.isDirectory())
  .map((e) => e.name);

const HERO_SLUGS = [
  "fire-knight",
  "water-priestess",
  "ground-monk",
  "wind-hashashin",
  "leaf-ranger",
  "crystal-mauler",
  "metal-bladekeeper",
];

// Fraction du haut du cutout plein-pied à conserver (tête + haut du buste).
// Vide au merge : ajuster ici après vérification visuelle sur
// /roster-preview-8f3a2c9d pour un personnage dont le défaut cadre mal.
const BUST_RATIO_DEFAULT = 0.5;
const BUST_RATIO_OVERRIDES = {
  // Ailes déployées au-dessus de la tête dans la pose idle : à 0.5 le crop ne
  // montrait que les ailes, la tête étant plus bas dans la silhouette.
  cthulhu: 0.68,
};

function bustRatioFor(slug) {
  return BUST_RATIO_OVERRIDES[slug] ?? BUST_RATIO_DEFAULT;
}

async function writeBust(fullBodyPath, outPath, slug) {
  const image = sharp(fullBodyPath);
  const meta = await image.metadata();
  const height = Math.round(meta.height * bustRatioFor(slug));
  await image
    .extract({ left: 0, top: 0, width: meta.width, height })
    .toFile(outPath);
}

for (const slug of HERO_SLUGS) {
  const portrait = PUB(`sprites/mc/${slug}/portrait.png`);
  const bust = PUB(`sprites/mc/${slug}/bust.png`);
  await writeBust(portrait, bust, slug);
  console.log(`${slug} (héros) -> ${bust}`);
}

for (const slug of BOSS_SLUGS) {
  const still = PUB(`sprites/bosses/${slug}/still.png`);
  const portrait = PUB(`sprites/bosses/${slug}/portrait.png`);
  const bust = PUB(`sprites/bosses/${slug}/bust.png`);
  await sharp(still).trim().toFile(portrait);
  await writeBust(portrait, bust, slug);
  console.log(`${slug} (boss) -> ${bust}`);
}
