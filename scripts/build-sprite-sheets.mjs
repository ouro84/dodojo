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

const HERO_PACKS = {
  "fire-knight": "MC/Elementals_fire_knight_FREE_v1.1",
  "water-priestess": "MC/Elementals_water_priestess_FREE_v1.1",
  "ground-monk": "MC/Elementals_ground_monk_FREE_v1.3.1",
  "wind-hashashin": "MC/elementals_wind_hashashin_FREE_v1.1",
  "leaf-ranger": "MC/Elementals_Leaf_ranger_Free_v1.0",
  "crystal-mauler": "MC/Elementals_Crystal_Mauler_Free_v1.0",
  "metal-bladekeeper": "MC/Elementals_metal_bladekeeper_FREE_v1.1",
};

// Anim logique -> fragment de nom de dossier présent dans tous les packs.
const HERO_ANIM_PATTERNS = {
  idle: "idle",
  atk1: "1_atk",
  atk2: "2_atk",
  atk3: "3_atk",
  sp_atk: "sp_atk",
  take_hit: "take_hit",
};

async function findDirContaining(root, fragment) {
  const entries = await fs.readdir(root, { withFileTypes: true, recursive: true });
  const hits = entries
    .filter((e) => e.isDirectory() && e.name.toLowerCase().includes(fragment))
    .map((e) => path.join(e.parentPath ?? e.path, e.name));
  if (hits.length === 0) {
    throw new Error(`Dossier "*${fragment}*" introuvable sous ${root}`);
  }
  // Le plus court chemin gagne : évite d'attraper un sous-dossier annexe.
  return hits.sort((a, b) => a.length - b.length)[0];
}

// Frame d'impact par défaut : 40 % de l'animation. Surchargeable ci-dessous
// après calage visuel sur /roster-preview-8f3a2c9d (cf. Task 3.6).
const IMPACT_FRAME_OVERRIDES = {};

function defaultImpactFrame(frames) {
  return Math.max(1, Math.min(frames - 1, Math.round(frames * 0.4)));
}

function impactFrameFor(slug, anim, frames) {
  return IMPACT_FRAME_OVERRIDES[`${slug}.${anim}`] ?? defaultImpactFrame(frames);
}

const HERO_ATTACK_ANIMS = new Set(["atk1", "atk2", "atk3", "sp_atk"]);

async function buildHeroes() {
  const meta = {};
  for (const [slug, pack] of Object.entries(HERO_PACKS)) {
    const root = A(pack);
    // 1. Charger toutes les anims avant de décider de la boîte.
    const loaded = {};
    for (const [anim, fragment] of Object.entries(HERO_ANIM_PATTERNS)) {
      loaded[anim] = await loadFramesFromDir(await findDirContaining(root, fragment));
    }
    // 2. Boîte union sur TOUTES les frames de TOUTES les anims.
    const box = unionBox(Object.values(loaded).flat());
    const idleBox = unionBox(loaded.idle);

    const outDir = PUB(`sprites/mc/${slug}`);
    await fs.rm(path.join(outDir, "anim"), { recursive: true, force: true });

    const anims = {};
    for (const [anim, frames] of Object.entries(loaded)) {
      await writeSheet(frames, box, path.join(outDir, "anim", `${anim}.png`));
      anims[anim] = {
        frames: frames.length,
        impactFrame: HERO_ATTACK_ANIMS.has(anim)
          ? impactFrameFor(slug, anim, frames.length)
          : null,
      };
    }
    await writeStill(loaded.idle[0], box, path.join(outDir, "still.png"));

    const legacy = LEGACY_IDLE_HEIGHTS[slug];
    if (!legacy) throw new Error(`Hauteur de référence manquante pour ${slug}`);
    meta[slug] = {
      tileW: box.width,
      tileH: box.height,
      renderScale: box.height / legacy,
      // Espace ajouté SOUS les pieds de l'idle par l'élargissement de la boîte,
      // en fraction de la tuile. Le rendu décale le sprite de cette valeur vers
      // le bas pour que la ligne de sol reste exactement où elle est aujourd'hui.
      groundOffset: (box.top + box.height - (idleBox.top + idleBox.height)) / box.height,
      // Issue #156 : pendant horizontal de groundOffset. Centre de la
      // silhouette idle dans la tuile, en fraction de largeur — permet
      // d'ancrer le PERSONNAGE et non la boîte, dont le ratio varie du
      // simple au double selon le pack source.
      idleAnchorX: (idleBox.left - box.left + idleBox.width / 2) / box.width,
      idleWidthRatio: idleBox.width / box.width,
      anims,
    };
    console.log(`héros ${slug} : tuile ${box.width}x${box.height}, scale ${meta[slug].renderScale.toFixed(3)}`);
  }
  return meta;
}

// --- Boss à frames individuelles (idle) --- (repris de copy-boss-sprites.mjs)
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
  { slug: "satyr", file: A(`${LB}/Free-Satyr-Sprite-Sheet-Pixel-Art-Pack/Satyr_2/Idle.png`), frames: 7 },
  { slug: "urban-zombie", file: A(`${LB}/Free-Urban-Zombie-Sprite-Sheet-Pixel-Art-Pack/Zombie_1/Idle.png`), frames: 6 },
  { slug: "mushroom", file: A(`${LB}/Mushroom/Mushroom without VFX/Mushroom-Idle.png`), frames: 7 },
  { slug: "gorgon", file: A(`${LB}/free-gorgon-pixel-art-character-sprite-sheets/Gorgon_1/Idle.png`), frames: 7 },
  { slug: "fire-wizard", file: A(`${LB}/free-wizard-sprite-sheets-pixel-art/Fire vizard/Idle.png`), frames: 7 },
  { slug: "lightning-mage", file: A(`${LB}/free-wizard-sprite-sheets-pixel-art/Lightning Mage/Idle.png`), frames: 7 },
  { slug: "gangster", file: A(`${LB}/gangster-pixel-character-sprite-sheets-pack/Gangsters_1/Idle.png`), frames: 6 },
  { slug: "knight", file: A(`${LB}/knight-character-sprites-pixel-art/Spritesheet 128/Knight_1/Idle.png`), frames: 4 },
  { slug: "temptress", file: A(`${LB}/Free-Satyr-Sprite-Sheet-Pixel-Art-Pack/Satyr_1/Idle.png`), frames: 7 },
  { slug: "idler", file: A(`${LB}/Free-Satyr-Sprite-Sheet-Pixel-Art-Pack/Satyr_3/Idle.png`), frames: 6 },
  { slug: "jaded", file: A(`${LB}/Free-Urban-Zombie-Sprite-Sheet-Pixel-Art-Pack/Zombie_2/Idle.png`), frames: 6 },
  { slug: "procrastinator", file: A(`${LB}/Free-Urban-Zombie-Sprite-Sheet-Pixel-Art-Pack/Zombie_3/Idle.png`), frames: 6 },
  { slug: "dock-corpse", file: A(`${LB}/Free-Urban-Zombie-Sprite-Sheet-Pixel-Art-Pack/Zombie_4/Idle.png`), frames: 7 },
  { slug: "gorgon-ivory", file: A(`${LB}/free-gorgon-pixel-art-character-sprite-sheets/Gorgon_2/Idle.png`), frames: 7 },
  { slug: "gorgon-scarlet", file: A(`${LB}/free-gorgon-pixel-art-character-sprite-sheets/Gorgon_3/Idle.png`), frames: 7 },
  { slug: "accomplice", file: A(`${LB}/gangster-pixel-character-sprite-sheets-pack/Gangsters_2/Idle.png`), frames: 7 },
  { slug: "mob-baron", file: A(`${LB}/gangster-pixel-character-sprite-sheets-pack/Gangsters_3/Idle.png`), frames: 7 },
  { slug: "knight-amethyst", file: A(`${LB}/knight-character-sprites-pixel-art/Spritesheet 128/Knight_2/Idle.png`), frames: 4 },
  { slug: "knight-garnet", file: A(`${LB}/knight-character-sprites-pixel-art/Spritesheet 128/Knight_3/Idle.png`), frames: 4 },
  { slug: "wandering-mage", file: A(`${LB}/free-wizard-sprite-sheets-pixel-art/Wanderer Magican/Idle.png`), frames: 8 },
  { slug: "minotaur-warrior", file: A(`${LB}/free-minotaur-sprite-sheet-pixel-art-pack/Minotaur_1/Idle.png`), frames: 10 },
  { slug: "minotaur-ardent", file: A(`${LB}/free-minotaur-sprite-sheet-pixel-art-pack/Minotaur_2/Idle.png`), frames: 10 },
  { slug: "minotaur-occult", file: A(`${LB}/free-minotaur-sprite-sheet-pixel-art-pack/Minotaur_3/Idle.png`), frames: 10 },
];

// Sous-dossiers d'anims des 4 boss à frames individuelles (chemins vérifiés).
const FRAME_BOSS_ANIM_DIRS = {
  "frost-guardian": { idle: "idle", attack: "1_atk", hurt: "take_hit", death: "death" },
  "demon-slime": {
    idle: "01_demon_idle", attack: "03_demon_cleave",
    hurt: "04_demon_take_hit", death: "05_demon_death",
  },
  cthulhu: { idle: "idle", attack: "1atk", hurt: "hurt", death: "death" },
  // mino_v1.1_free n'a ni hurt ni death : lib/bosses.ts porte fallbackHurtDeath.
  minotaur: { idle: "idle", attack: "atk_1" },
};

// Noms de fichiers candidats par anim pour les packs "low boss".
const SHEET_ANIM_CANDIDATES = {
  idle: ["Idle.png"],
  attack: ["Attack_1.png", "Attack 1.png", "Attack.png"],
  hurt: ["Hurt.png", "Hit.png"],
  death: ["Dead.png", "Die.png"],
};

async function resolveSheetFile(dir, prefix, anim) {
  const candidates = [
    ...SHEET_ANIM_CANDIDATES[anim],
    // Le pack Mushroom préfixe tous ses fichiers : Mushroom-Attack.png, etc.
    // Le préfixe réel est le nom du dossier du PACK, pas celui du sous-dossier
    // de variante ("Mushroom without VFX") : on tente donc aussi le nom du
    // dossier parent, plus tolérant que le seul basename(dir).
    ...SHEET_ANIM_CANDIDATES[anim].map((c) => `${prefix}-${c}`),
    ...SHEET_ANIM_CANDIDATES[anim].map((c) => `${path.basename(path.dirname(dir))}-${c}`),
    ...(anim === "death" ? [`${prefix}-Die.png`] : []),
    ...(anim === "hurt" ? [`${prefix}-Hit.png`] : []),
  ];
  for (const name of candidates) {
    const full = path.join(dir, name);
    try {
      await fs.access(full);
      return full;
    } catch {
      // candidat suivant
    }
  }
  return null;
}

async function buildBosses() {
  const meta = {};

  for (const { slug, dir } of FRAME_BOSSES) {
    const animDirs = FRAME_BOSS_ANIM_DIRS[slug];
    const packRoot = path.dirname(dir); // `dir` pointe sur l'idle dans copy-boss-sprites
    const loaded = {};
    for (const [anim, sub] of Object.entries(animDirs)) {
      loaded[anim] = await loadFramesFromDir(path.join(packRoot, sub));
    }
    meta[slug] = await emitBoss(slug, loaded);
  }

  for (const { slug, file, frames: idleFrames } of SHEET_BOSSES) {
    const dir = path.dirname(file);
    const prefix = path.basename(dir); // ex. "Mushroom without VFX" -> non utilisé si candidat direct
    const { width: idleWidth } = await sharp(file).metadata();
    const tileW = idleWidth / idleFrames;
    if (!Number.isInteger(tileW)) {
      throw new Error(`${slug} : tuile non entière (${idleWidth}/${idleFrames})`);
    }
    const loaded = { idle: await sliceSheet(file, tileW) };
    for (const anim of ["attack", "hurt", "death"]) {
      const found = await resolveSheetFile(dir, prefix, anim);
      if (!found) throw new Error(`${slug} : feuille "${anim}" introuvable dans ${dir}`);
      loaded[anim] = await sliceSheet(found, tileW);
    }
    meta[slug] = await emitBoss(slug, loaded);
  }

  return meta;
}

const BOSS_ATTACK_ANIMS = new Set(["attack"]);

async function emitBoss(slug, loaded) {
  const box = unionBox(Object.values(loaded).flat());
  const idleBox = unionBox(loaded.idle);
  const outDir = PUB(`sprites/bosses/${slug}`);
  await fs.rm(path.join(outDir, "anim"), { recursive: true, force: true });

  const anims = {};
  for (const [anim, frames] of Object.entries(loaded)) {
    await writeSheet(frames, box, path.join(outDir, "anim", `${anim}.png`));
    anims[anim] = {
      frames: frames.length,
      impactFrame: BOSS_ATTACK_ANIMS.has(anim)
        ? impactFrameFor(slug, anim, frames.length)
        : null,
    };
  }
  await writeStill(loaded.idle[0], box, path.join(outDir, "still.png"));

  const legacy = LEGACY_IDLE_HEIGHTS[slug];
  if (!legacy) throw new Error(`Hauteur de référence manquante pour ${slug}`);
  console.log(`boss ${slug} : tuile ${box.width}x${box.height}, anims ${Object.keys(anims).join("/")}`);
  return {
    tileW: box.width,
    tileH: box.height,
    renderScale: box.height / legacy,
    groundOffset: (box.top + box.height - (idleBox.top + idleBox.height)) / box.height,
    idleAnchorX: (idleBox.left - box.left + idleBox.width / 2) / box.width,
    idleWidthRatio: idleBox.width / box.width,
    anims,
  };
}

// Mapping VFX par héros (issue #48). Chemins vérifiés dans assets/VFX/.
// TOUJOURS reconstruire la feuille depuis le dossier Frames/ du pack : le
// sprite-sheet.png fourni n'a pas de disposition horizontale garantie.
const HERO_VFX = {
  "fire-knight": {
    slash1: "Pixel Art Animations - Slashes/128x128/Slash 1/color2/Frames",
    slash2: "Pixel Art Animations - Slashes/128x128/Slash 2/color2/Frames",
    slash3: "Pixel Art Animations - Slashes/128x128/Slash 3/color2/Frames",
  },
  "water-priestess": {
    frost1: "Pixel Art VFX - Frost Knight - FREE Version/VFX1/frames",
    frost2: "Pixel Art VFX - Frost Knight - FREE Version/VFX2/frames",
    frost3: "Pixel Art VFX - Frost Knight - FREE Version/VFX3/frames",
    burst: "animated-explosion-sprite-pack/PNG/Explosion_8",
  },
  "wind-hashashin": {
    warrior4: "Pixel Art Animations - Warrior (FREE)/VFX 4/Frames",
    rogue1: "Pixel Art VFX - Rogue - FREE Version/VFX1/frames",
    rogue2: "Pixel Art VFX - Rogue - FREE Version/VFX2/frames",
    burst: "animated-explosion-sprite-pack/PNG/Explosion_6",
  },
  "metal-bladekeeper": {
    warrior1: "Pixel Art Animations - Warrior (FREE)/VFX 1/Frames",
    lightning4: "Pixel Art Skill Animations - Lightning/VFX4/Frames",
  },
  "ground-monk": {
    quake1: "animated-explosion-sprite-pack/PNG/Explosion_4/2",
    quake2: "animated-explosion-sprite-pack/PNG/Explosion_3",
    quake3: "animated-explosion-sprite-pack/PNG/Explosion_2",
  },
  "leaf-ranger": {
    rogue3: "Pixel Art VFX - Rogue - FREE Version/VFX3/frames",
    rogue4: "Pixel Art VFX - Rogue - FREE Version/VFX4/frames",
    rogue5: "Pixel Art VFX - Rogue - FREE Version/VFX5/frames",
  },
  "crystal-mauler": {
    warrior5: "Pixel Art Animations - Warrior (FREE)/VFX 5/Frames",
    lightning3: "Pixel Art Skill Animations - Lightning/VFX3/Frames",
  },
};

async function buildVfx() {
  const meta = {};
  for (const [slug, variants] of Object.entries(HERO_VFX)) {
    meta[slug] = {};
    await fs.rm(PUB(`vfx/hero/${slug}`), { recursive: true, force: true });
    for (const [variant, rel] of Object.entries(variants)) {
      const frames = await loadFramesFromDir(A(path.join("VFX", rel)));
      const box = unionBox(frames);
      await writeSheet(frames, box, PUB(`vfx/hero/${slug}/${variant}.png`));
      meta[slug][variant] = { frames: frames.length, tileW: box.width, tileH: box.height };
    }
    console.log(`vfx ${slug} : ${Object.keys(variants).join(", ")}`);
  }
  return meta;
}

async function main() {
  const heroes = await buildHeroes();
  const bosses = await buildBosses();
  const vfx = await buildVfx();
  const out = path.join(ROOT, "lib", "sprite-metadata.generated.json");
  await fs.writeFile(out, `${JSON.stringify({ heroes, bosses, vfx }, null, 2)}\n`, "utf8");
  console.log(`\nMétadonnées écrites : ${out}`);
}

export {
  A, PUB, LEGACY_IDLE_HEIGHTS, numericSort,
  loadFramesFromDir, sliceSheet, unionBox, writeSheet, writeStill,
  buildHeroes, buildBosses, buildVfx,
};

await main();
