# Animations de combat (issue #48) — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Donner vie à l'Arène — le héros attaque, le Boss encaisse et meurt, le Boss contre-attaque — en migrant tous les sprites de frames PNG individuelles vers des spritesheets, sans changer d'un pixel la taille ni la position des personnages actuels.

**Architecture:** Un script Node/`sharp` unique extrait les 4 anims de chaque personnage depuis `assets/` vers une spritesheet horizontale par anim, recadrée sur une boîte alpha commune à toutes les anims du personnage, plus un JSON de métadonnées committé. Côté React, `SpriteAnimator` (une anim, `steps()` CSS) et `CharacterSprite` (machine à états `idle|attack|hurt|death`) remplacent `IdleSprite`. Toute la logique de sélection et de timing est extraite en fonctions pures dans `lib/combat-animation.ts`.

**Tech Stack:** Node 24 + `sharp` (scripts), Next.js 16 App Router, React 19, Tailwind CSS v4, Vitest (+ jsdom + Testing Library), Playwright.

## Global Constraints

- **Français** pour tout échange, commentaire de code et message d'erreur utilisateur. Termes techniques en anglais quand c'est l'usage.
- **TypeScript strict, `any` interdit.** Tout type explicitement déclaré.
- **Conventional Commits** : `feat:` / `fix:` / `chore:` / `docs:`, description courte en anglais ou français, cohérente avec l'historique.
- **Branche** : `feat/issue-48-animations-combat` (déjà créée, le spec y est committé). Aucun commit direct sur `main`. **Ne jamais merger sans accord explicite de l'utilisateur.**
- **Zéro PR poussée tant que `npm run lint`, `npm test`, `npx tsc --noEmit`, `npm run build` et `npm run e2e` ne sont pas verts en local.**
- **Logique de jeu pure dans `lib/`**, testable sans rendu UI (règle projet n°2).
- **Vitest n'a pas de plugin `vite-tsconfig-paths`** mais `vitest.config.ts` définit l'alias `@` → `@/lib/...` fonctionne dans les tests. En revanche **tout fichier `.mjs` de `scripts/` ne peut rien importer de TypeScript** : les constantes partagées avec le runtime sont dupliquées avec un commentaire explicite.
- **Tests composants** : docblock `// @vitest-environment jsdom` en première ligne + `afterEach(cleanup)` explicite (pas de `globals: true` dans la config, le cleanup auto de Testing Library ne se déclenche pas).
- **RG-04** : aucun `DELETE` SQL. Ce plan ne touche à aucune table.
- **`prefers-reduced-motion`** : chaque animation ajoutée doit avoir son neutralisant, et le gating temporel doit être **désactivé** sous ce réglage (jauges et overlays instantanés).
- **Hauteurs de référence de l'issue #74** : `renderScale` se dérive **exclusivement** de la table `LEGACY_IDLE_HEIGHTS` figée en Task 1.1, jamais d'une bbox recalculée.

---

## Structure de fichiers

**Créés**

| Fichier | Responsabilité |
|---|---|
| `scripts/build-sprite-sheets.mjs` | Extraction + recadrage + assemblage des feuilles de tous les personnages et des VFX ; écriture du JSON de métadonnées |
| `lib/sprite-metadata.generated.json` | Métadonnées générées, committées |
| `lib/sprite-metadata.ts` | Accesseurs typés au-dessus du JSON |
| `lib/sprite-metadata.test.ts` | Invariants des métadonnées (dont non-régression de taille) |
| `lib/combat-animation.ts` | Fonctions pures : choix d'anim, durées, délai d'impact, hit-stop, coalescing |
| `lib/combat-animation.test.ts` | Tests des fonctions pures |
| `components/combat/SpriteAnimator.tsx` | Rend **une** anim depuis une feuille |
| `components/combat/SpriteAnimator.test.tsx` | Géométrie et callbacks |
| `components/combat/CharacterSprite.tsx` | Machine à états au-dessus de `SpriteAnimator` |
| `components/combat/CharacterSprite.test.tsx` | Transitions d'état |
| `components/combat/HeroVfx.tsx` | VFX d'impact du héros équipé, joué sur le Boss |
| `components/combat/KoSlam.tsx` | Texte « K.O. » pendant le fondu de fin |
| `e2e/combat-animations.spec.ts` | Seul spec e2e en `reducedMotion: "no-preference"` |

**Modifiés**

| Fichier | Changement |
|---|---|
| `scripts/copy-boss-sprites.mjs` | Ne garde que les décors |
| `scripts/generate-hero-skins.mjs` | Recolorise des feuilles |
| `scripts/generate-hero-portraits.mjs` | Source = `still.png` |
| `package.json` | Script `generate:sprites` |
| `types/index.ts` | `Hero`/`Boss` : `spriteBase` remplace `idleFramePrefix`/`idleFrameCount` |
| `lib/heroes.ts`, `lib/bosses.ts`, `lib/hero-skins.ts` | Idem + `getHeroSpriteBase`, `fallbackHurtDeath` |
| `lib/game-engine.ts` | `BOSS_DANGER_HP_RATIO`, `isBossInDanger` |
| `components/combat/VersusScene.tsx` | `CharacterSprite`, `HeroVfx`, état danger |
| `components/combat/Arena.tsx` | Gating, coalescing, déclencheurs Boss, séquence K.O. |
| `components/combat/BossBar.tsx`, `HeroBar.tsx` | Jauge fantôme |
| `components/combat/RosterPreview.tsx` | Rejoue chaque anim (calage des `impactFrame`) |
| `components/shop/SkinsPreview.tsx`, `components/combat/HeroIdle.tsx` | `CharacterSprite` |
| `app/api/share-card/route.tsx` | `still.png` |
| `app/globals.css` | `sprite-run`, `knockback`, `boss-danger-blink` |
| `playwright.config.ts` | `use.reducedMotion: "reduce"` |

**Supprimés** : `components/combat/IdleSprite.tsx`, `components/combat/ImpactVfx.tsx`, `scripts/copy-hero-sprites.sh`, `scripts/trim-hero-idle-frames.mjs`, `public/sprites/**/idle/`, `public/vfx/impact/`.

---

# Phase 1 — Pipeline d'assets

### Task 1.1 : Table de référence et squelette du script

**Files:**
- Create: `scripts/build-sprite-sheets.mjs`

**Interfaces:**
- Consumes: rien.
- Produces: `LEGACY_IDLE_HEIGHTS` (objet `Record<string, number>`), `unionBox(frames)`, `writeSheet(frames, box, outPath)`, `loadFramesFromDir(dir)`, `sliceSheet(file, tileW)` — utilisées par les tâches 1.2 à 1.4.

**Contexte à connaître.** Les hauteurs ci-dessous ont été mesurées sur `public/sprites/**/idle/frame0000.png` **avant** toute régénération. Elles encodent le calibrage visuel de l'issue #74 (héros rendus à 88 px, boss à 96 px). `fire-knight` n'a jamais été traité par `trim-hero-idle-frames.mjs` (rogné à la main), c'est précisément pourquoi la table est figée plutôt que recalculée.

- [ ] **Step 1 : Créer le script avec la table et les utilitaires**

```js
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
```

- [ ] **Step 2 : Vérifier que le script se charge sans erreur**

Run: `node -e "import('./scripts/build-sprite-sheets.mjs').then(()=>console.log('ok'))"`
Expected: `ok`

- [ ] **Step 3 : Commit**

```bash
git add scripts/build-sprite-sheets.mjs
git commit -m "chore: squelette du pipeline de spritesheets + hauteurs de reference issue #74"
```

---

### Task 1.2 : Extraction des héros

**Files:**
- Modify: `scripts/build-sprite-sheets.mjs`

**Interfaces:**
- Consumes: `loadFramesFromDir`, `unionBox`, `writeSheet`, `writeStill`, `LEGACY_IDLE_HEIGHTS` (Task 1.1).
- Produces: `buildHeroes()` → `Record<slug, CharacterMeta>` où
  `CharacterMeta = { tileW: number, tileH: number, renderScale: number, groundOffset: number, anims: Record<string, { frames: number, impactFrame: number | null }> }`.

**Contexte.** Les 7 packs `assets/MC/` nomment leurs dossiers d'anims différemment (`png/fire_knight/05_1_atk`, `png/07_1_atk`, `PNG animations/07_1_atk`, `PNG/1_atk`, `animations/PNG/1_atk`). Plutôt que 42 chemins codés en dur, on cherche récursivement le dossier dont le nom **contient** le motif de l'anim — même approche tolérante que l'ancien `copy-hero-sprites.sh`. `air_atk` ne contient pas `1_atk`, il n'y a donc pas de collision.

- [ ] **Step 1 : Ajouter la table des héros et la recherche tolérante de dossier**

```js
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
```

- [ ] **Step 2 : Ajouter `buildHeroes()`**

```js
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
      anims,
    };
    console.log(`héros ${slug} : tuile ${box.width}x${box.height}, scale ${meta[slug].renderScale.toFixed(3)}`);
  }
  return meta;
}
```

- [ ] **Step 3 : Lancer sur les héros seuls et vérifier**

Ajouter temporairement en fin de fichier `await buildHeroes();` puis :

Run: `node scripts/build-sprite-sheets.mjs`
Expected: 7 lignes `héros <slug> : tuile WxH, scale S` avec `S >= 1` pour chacun, et `public/sprites/mc/<slug>/anim/` contenant 6 PNG.

Vérification visuelle rapide : `npx sharp` n'est pas nécessaire, ouvrir `public/sprites/mc/fire-knight/anim/atk1.png` — on doit voir 11 poses côte à côte, toutes alignées sur la même ligne de sol.

- [ ] **Step 4 : Retirer l'appel temporaire et committer**

```bash
git add scripts/build-sprite-sheets.mjs public/sprites/mc
git commit -m "chore: extraction des animations heros en spritesheets"
```

---

### Task 1.3 : Extraction des boss

**Files:**
- Modify: `scripts/build-sprite-sheets.mjs`

**Interfaces:**
- Consumes: idem Task 1.1 + `sliceSheet`.
- Produces: `buildBosses()` → même forme que `buildHeroes()`, anims `idle|attack|hurt|death` ; `minotaur` sans `hurt` ni `death`.

**Contexte.** 4 boss « réels » livrent des frames individuelles, 23 « low boss » des spritesheets horizontales. La largeur de tuile d'un low boss se déduit de son idle (`largeurIdle / framesIdle`, déjà connu : 128 partout sauf `mushroom` en 70). Les noms de fichiers sont incohérents entre packs (`Dead.png`/`Die.png`, `Hurt.png`/`Hit.png`, `Attack 1.png`/`Attack_1.png`/`Mushroom-Attack.png`).

- [ ] **Step 1 : Reprendre les tables de `copy-boss-sprites.mjs` et ajouter la résolution de noms**

Copier `FRAME_BOSSES` et `SHEET_BOSSES` depuis `scripts/copy-boss-sprites.mjs` (lignes 17-72) dans le nouveau script, puis compléter :

```js
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
    ...SHEET_ANIM_CANDIDATES[anim].map((c) => `${prefix}-${c}`),
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
```

- [ ] **Step 2 : Ajouter `buildBosses()`**

```js
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
    anims,
  };
}
```

- [ ] **Step 3 : Lancer et vérifier les 27 boss**

Run: `node scripts/build-sprite-sheets.mjs` (avec `await buildBosses();` temporaire)
Expected: 27 lignes. `minotaur` affiche `anims idle/attack` ; les 26 autres `idle/attack/hurt/death`. Aucune exception « feuille introuvable » ni « largeur non divisible » — si l'une survient, corriger la liste de candidats, **jamais** contourner l'assertion.

- [ ] **Step 4 : Commit**

```bash
git add scripts/build-sprite-sheets.mjs public/sprites/bosses
git commit -m "chore: extraction des animations boss en spritesheets"
```

---

### Task 1.4 : VFX par héros, métadonnées et tests

**Files:**
- Modify: `scripts/build-sprite-sheets.mjs`
- Create: `lib/sprite-metadata.generated.json` (généré), `lib/sprite-metadata.ts`, `lib/sprite-metadata.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `buildHeroes()`, `buildBosses()`.
- Produces: `lib/sprite-metadata.ts` exportant
  `heroSpriteMeta(slug: string): CharacterSpriteMeta`,
  `bossSpriteMeta(slug: string): CharacterSpriteMeta`,
  `heroVfxVariants(slug: string): string[]`,
  `vfxMeta(slug: string, variant: string): VfxMeta`,
  avec `CharacterSpriteMeta = { tileW: number; tileH: number; renderScale: number; groundOffset: number; anims: Record<string, { frames: number; impactFrame: number | null }> }`
  et `VfxMeta = { frames: number; tileW: number; tileH: number }`.

- [ ] **Step 1 : Écrire le test des métadonnées (il doit échouer, le JSON n'existe pas)**

```ts
// lib/sprite-metadata.test.ts
import { describe, expect, it } from "vitest";
import { HEROES } from "./heroes";
import { BOSSES } from "./bosses";
import raw from "./sprite-metadata.generated.json";

// Référence figée par scripts/build-sprite-sheets.mjs (issue #74). Dupliquée
// ici volontairement : un test qui lirait la même source que le code testé ne
// détecterait aucune dérive.
const LEGACY_IDLE_HEIGHTS: Record<string, number> = {
  "crystal-mauler": 39, "fire-knight": 44, "ground-monk": 35, "leaf-ranger": 44,
  "metal-bladekeeper": 42, "water-priestess": 38, "wind-hashashin": 37,
  accomplice: 71, cthulhu: 64, "demon-slime": 107, "dock-corpse": 67,
  "fire-wizard": 66, "frost-guardian": 92, gangster: 72, gorgon: 85,
  "gorgon-ivory": 85, "gorgon-scarlet": 85, idler: 76, jaded: 69, knight: 64,
  "knight-amethyst": 64, "knight-garnet": 64, "lightning-mage": 63,
  minotaur: 108, "minotaur-ardent": 86, "minotaur-occult": 93,
  "minotaur-warrior": 93, "mob-baron": 71, mushroom: 33, procrastinator: 66,
  satyr: 89, temptress: 75, "urban-zombie": 67, "wandering-mage": 66,
};

describe("sprite-metadata.generated.json", () => {
  it("couvre les 7 héros du catalogue", () => {
    for (const hero of HEROES) {
      expect(raw.heroes, `héros manquant : ${hero.slug}`).toHaveProperty(hero.slug);
    }
  });

  it("couvre les 27 boss du catalogue", () => {
    for (const boss of BOSSES) {
      expect(raw.bosses, `boss manquant : ${boss.slug}`).toHaveProperty(boss.slug);
    }
  });

  it("déclare au moins une frame par anim", () => {
    for (const group of [raw.heroes, raw.bosses]) {
      for (const [slug, meta] of Object.entries(group)) {
        for (const [anim, a] of Object.entries(meta.anims)) {
          expect(a.frames, `${slug}.${anim}`).toBeGreaterThanOrEqual(1);
        }
      }
    }
  });

  it("place chaque impactFrame dans l'animation", () => {
    for (const group of [raw.heroes, raw.bosses]) {
      for (const [slug, meta] of Object.entries(group)) {
        for (const [anim, a] of Object.entries(meta.anims)) {
          if (a.impactFrame === null) continue;
          expect(a.impactFrame, `${slug}.${anim}`).toBeGreaterThanOrEqual(1);
          expect(a.impactFrame, `${slug}.${anim}`).toBeLessThan(a.frames);
        }
      }
    }
  });

  // NON-RÉGRESSION ISSUE #74 : garantit que le passage à une boîte de recadrage
  // élargie n'a pas changé la taille apparente des personnages.
  it("dérive renderScale des hauteurs de référence de l'issue #74", () => {
    for (const group of [raw.heroes, raw.bosses]) {
      for (const [slug, meta] of Object.entries(group)) {
        const legacy = LEGACY_IDLE_HEIGHTS[slug];
        expect(legacy, `pas de hauteur de référence pour ${slug}`).toBeDefined();
        expect(meta.tileH / meta.renderScale).toBeCloseTo(legacy, 5);
        expect(meta.renderScale).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it("donne au moins deux variantes de VFX à chaque héros", () => {
    for (const hero of HEROES) {
      const variants = Object.keys(raw.vfx[hero.slug] ?? {});
      expect(variants.length, `VFX manquants : ${hero.slug}`).toBeGreaterThanOrEqual(2);
    }
  });

  it("laisse minotaur sans hurt ni death (pack incomplet, fallback CSS)", () => {
    expect(raw.bosses.minotaur.anims).not.toHaveProperty("hurt");
    expect(raw.bosses.minotaur.anims).not.toHaveProperty("death");
  });
});
```

- [ ] **Step 2 : Vérifier l'échec**

Run: `npx vitest run lib/sprite-metadata.test.ts`
Expected: FAIL — `Cannot find module './sprite-metadata.generated.json'`

- [ ] **Step 3 : Ajouter l'extraction VFX et l'écriture du JSON**

```js
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

await main();
```

- [ ] **Step 4 : Générer**

Run: `node scripts/build-sprite-sheets.mjs`
Expected: 7 lignes héros + 27 lignes boss + 7 lignes vfx + `Métadonnées écrites`.

- [ ] **Step 5 : Écrire l'accesseur typé**

```ts
// lib/sprite-metadata.ts
// Accès typé aux métadonnées produites par scripts/build-sprite-sheets.mjs.
// Le JSON est committé : aucun accès disque au runtime.
import raw from "./sprite-metadata.generated.json";

export interface AnimMeta {
  frames: number;
  impactFrame: number | null;
}

export interface CharacterSpriteMeta {
  tileW: number;
  tileH: number;
  /** tileH / hauteur idle de référence (issue #74). Toujours >= 1. */
  renderScale: number;
  /** Espace sous les pieds de l'idle, en fraction de la tuile. */
  groundOffset: number;
  anims: Record<string, AnimMeta>;
}

export interface VfxMeta {
  frames: number;
  tileW: number;
  tileH: number;
}

const HEROES_META = raw.heroes as Record<string, CharacterSpriteMeta>;
const BOSSES_META = raw.bosses as Record<string, CharacterSpriteMeta>;
const VFX_META = raw.vfx as Record<string, Record<string, VfxMeta>>;

export function heroSpriteMeta(slug: string): CharacterSpriteMeta {
  const meta = HEROES_META[slug];
  if (!meta) throw new Error(`Métadonnées de sprite introuvables pour le héros ${slug}`);
  return meta;
}

export function bossSpriteMeta(slug: string): CharacterSpriteMeta {
  const meta = BOSSES_META[slug];
  if (!meta) throw new Error(`Métadonnées de sprite introuvables pour le boss ${slug}`);
  return meta;
}

export function heroVfxVariants(slug: string): string[] {
  return Object.keys(VFX_META[slug] ?? {});
}

export function vfxMeta(slug: string, variant: string): VfxMeta {
  const meta = VFX_META[slug]?.[variant];
  if (!meta) throw new Error(`VFX introuvable : ${slug}/${variant}`);
  return meta;
}
```

- [ ] **Step 6 : Vérifier que les tests passent**

Run: `npx vitest run lib/sprite-metadata.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 7 : Ajouter le script npm et committer**

Dans `package.json`, à côté de `generate:icons` :

```json
"generate:sprites": "node scripts/build-sprite-sheets.mjs"
```

```bash
git add scripts/build-sprite-sheets.mjs package.json lib/sprite-metadata.generated.json lib/sprite-metadata.ts lib/sprite-metadata.test.ts public/vfx/hero
git commit -m "chore: metadonnees de sprites generees + VFX par heros"
```

---

### Task 1.5 : Tenues, portraits, nettoyage

**Files:**
- Modify: `scripts/generate-hero-skins.mjs`, `scripts/generate-hero-portraits.mjs`, `scripts/copy-boss-sprites.mjs`
- Delete: `scripts/copy-hero-sprites.sh`, `scripts/trim-hero-idle-frames.mjs`, `public/sprites/mc/*/idle/`, `public/sprites/bosses/*/idle/`, `public/vfx/impact/`

**Interfaces:**
- Consumes: les feuilles produites en Task 1.2.
- Produces: `public/sprites/mc/<slug>/skins/<skin_id>/anim/*.png` + `still.png` pour les 13 tenues non-défaut.

**Contexte.** Le recolor de l'US-53 est une transformation **par pixel** (recolor masqué par bande de teinte pour les tiers A/C, recolor global pour le tier B). Il s'applique donc identiquement à une spritesheet — aucune logique de calibration à retoucher, seuls les chemins d'entrée/sortie changent. La boîte de recadrage n'est pas modifiée par un recolor (canal alpha intact), les tenues **réutilisent les métadonnées de leur héros**.

- [ ] **Step 1 : Réorienter `generate-hero-skins.mjs`**

Ne toucher **ni** à la fonction de recolor, **ni** aux seuils de teinte, **ni** à la table de calibration par tier : seuls les chemins d'entrée/sortie changent.

Entrée actuelle : `public/sprites/mc/<slug>/idle/frame0000.png` … `frameNNNN.png`.
Entrée cible : la liste fixe ci-dessous, plus `still.png`.

```js
// Le recolor est une transformation par pixel : appliqué à une spritesheet il
// produit exactement le même résultat que frame par frame, et le canal alpha
// est intact — les tenues réutilisent donc les métadonnées de leur héros.
const SHEETS = ["idle", "atk1", "atk2", "atk3", "sp_atk", "take_hit"];

for (const name of SHEETS) {
  await recolor(
    PUB(`sprites/mc/${slug}/anim/${name}.png`),
    PUB(`sprites/mc/${slug}/skins/${skinId}/anim/${name}.png`),
    params,
  );
}
await recolor(
  PUB(`sprites/mc/${slug}/still.png`),
  PUB(`sprites/mc/${slug}/skins/${skinId}/still.png`),
  params,
);
```

(`recolor` et `params` sont les noms locaux existants du script — les conserver tels quels.)

- [ ] **Step 2 : Lancer et vérifier**

Run: `node scripts/generate-hero-skins.mjs`
Expected: 13 dossiers `skins/<skin_id>/anim/` contenant 6 PNG chacun + `still.png`.

- [ ] **Step 3 : Réorienter `generate-hero-portraits.mjs` vers `still.png`**

Remplacer la source `public/sprites/mc/<slug>/idle/frame0000.png` par `public/sprites/mc/<slug>/still.png`. Le `.trim()` de sharp et la sortie `portrait.png` sont inchangés.

Run: `node scripts/generate-hero-portraits.mjs`
Expected: 7 `portrait.png` régénérés, visuellement identiques aux précédents.

- [ ] **Step 4 : Élaguer `copy-boss-sprites.mjs`**

Supprimer `FRAME_BOSSES`, `SHEET_BOSSES`, `trimBossFrames` et leur appel dans `main()`. Ne garder que `BG_THEMES`, `bgSource` et la copie des décors. Mettre à jour l'en-tête du fichier pour dire qu'il ne traite plus que les décors, les personnages étant passés à `build-sprite-sheets.mjs`.

Run: `node scripts/copy-boss-sprites.mjs`
Expected: seuls les 16 décors sont (re)copiés, aucun accès à `public/sprites/bosses`.

- [ ] **Step 5 : Supprimer l'ancien pipeline et les anciennes sorties**

```bash
git rm scripts/copy-hero-sprites.sh scripts/trim-hero-idle-frames.mjs
git rm -r public/vfx/impact
git rm -r "public/sprites/mc/*/idle" "public/sprites/bosses/*/idle"
```

Si le glob ne fonctionne pas sous PowerShell, supprimer les dossiers un à un puis `git add -A public/sprites`.

- [ ] **Step 6 : Vérifier que la suite complète passe**

Run: `npm test`
Expected: PASS. Les tests des catalogues échouent encore s'ils référencent `idleFramePrefix` — c'est **attendu**, ils sont mis à jour en Task 2.1. Si c'est le cas, ne pas les corriger ici : committer seulement ce qui est vert, ou enchaîner directement sur la Task 2.1 avant de committer.

- [ ] **Step 7 : Commit**

```bash
git add -A scripts public/sprites public/vfx
git commit -m "chore: tenues et portraits sur spritesheets, retrait de l'ancien pipeline"
```

---

# Phase 2 — Rendu (iso-visuel)

### Task 2.1 : Types et catalogues

**Files:**
- Modify: `types/index.ts`, `lib/heroes.ts`, `lib/bosses.ts`, `lib/hero-skins.ts`
- Test: `lib/heroes.test.ts`, `lib/bosses.test.ts`, `lib/hero-skins.test.ts`

**Interfaces:**
- Consumes: `heroSpriteMeta`, `bossSpriteMeta` (Task 1.4).
- Produces: `Hero.spriteBase: string`, `Boss.spriteBase: string`, `Boss.fallbackHurtDeath?: boolean`, `getHeroSpriteBase(heroId: string, skinId: string | null): string`.

- [ ] **Step 1 : Écrire le test de `getHeroSpriteBase`**

```ts
// dans lib/hero-skins.test.ts
it("renvoie le dossier du héros pour la tenue par défaut", () => {
  expect(getHeroSpriteBase("fire_knight", null)).toBe("/sprites/mc/fire-knight");
  expect(getHeroSpriteBase("fire_knight", "fire_knight_default")).toBe("/sprites/mc/fire-knight");
});

it("renvoie le dossier de la tenue pour une tenue non-défaut", () => {
  expect(getHeroSpriteBase("fire_knight", "fire_knight_shadow_purple")).toBe(
    "/sprites/mc/fire-knight/skins/fire_knight_shadow_purple",
  );
});
```

- [ ] **Step 2 : Vérifier l'échec**

Run: `npx vitest run lib/hero-skins.test.ts`
Expected: FAIL — `getHeroSpriteBase is not a function`

- [ ] **Step 3 : Modifier types et catalogues**

Dans `types/index.ts`, remplacer sur `Hero` et `Boss` les champs `idleFramePrefix: string` et `idleFrameCount: number` par `spriteBase: string`. Ajouter `fallbackHurtDeath?: boolean` sur `Boss`.

Dans `lib/heroes.ts`, remplacer `idlePrefix` par :

```ts
const spriteBase = (slug: string) => `/sprites/mc/${slug}`;
```

et, sur chaque héros, `idleFramePrefix: idlePrefix("x"), idleFrameCount: N` par `spriteBase: spriteBase("x")`.

Dans `lib/bosses.ts`, même substitution (`/sprites/bosses/${slug}`), suppression de `idleFrameCount`, et ajout de `fallbackHurtDeath: true` sur le seul boss `minotaur`.

Dans `lib/hero-skins.ts`, remplacer `getHeroSpritePrefix` par :

```ts
export function getHeroSpriteBase(heroId: string, skinId: string | null): string {
  const hero = getHero(heroId);
  if (!hero) throw new Error(`Héros inconnu : ${heroId}`);
  if (!skinId || skinId === defaultSkinIdFor(heroId)) return hero.spriteBase;
  return `${hero.spriteBase}/skins/${skinId}`;
}
```

- [ ] **Step 4 : Mettre à jour les tests existants**

Dans `lib/heroes.test.ts` et `lib/bosses.test.ts`, remplacer toute assertion sur `idleFramePrefix`/`idleFrameCount` par une assertion sur `spriteBase` (format `/sprites/mc/<slug>` ou `/sprites/bosses/<slug>`).

- [ ] **Step 5 : Vérifier**

Run: `npx vitest run lib/ && npx tsc --noEmit`
Expected: les tests `lib/` passent. `tsc` signale encore les composants non migrés (`IdleSprite`, `VersusScene`, `share-card`…) — attendu, corrigé en Task 2.3.

- [ ] **Step 6 : Commit**

```bash
git add types lib
git commit -m "refactor: spriteBase remplace idleFramePrefix dans les catalogues"
```

---

### Task 2.2 : `SpriteAnimator` et `CharacterSprite`

**Files:**
- Create: `components/combat/SpriteAnimator.tsx`, `components/combat/SpriteAnimator.test.tsx`, `components/combat/CharacterSprite.tsx`, `components/combat/CharacterSprite.test.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: `CharacterSpriteMeta` (Task 1.4).
- Produces:
  - `SpriteAnimator` props : `{ sheetSrc: string; frames: number; tileW: number; tileH: number; renderedHeight: number; durationMs: number; loop: boolean; animKey: string; flip?: boolean; frozen?: boolean; impactFrame?: number | null; extraDelayMs?: number; onImpact?: () => void; onEnd?: () => void; staticFrame?: "first" | "last"; className?: string; style?: React.CSSProperties; ariaLabel?: string }`
  - `CharacterSprite` props : `{ spriteBase: string; meta: CharacterSpriteMeta; baseHeight: number; state: CharacterAnimState; attackAnim?: string; stateKey?: number; alt: string; flip?: boolean; frozen?: boolean; extraDelayMs?: number; danger?: boolean; fallbackHurtDeath?: boolean; reducedMotion?: boolean; onImpact?: () => void; onStateEnd?: () => void; className?: string }`
  - `export type CharacterAnimState = "idle" | "attack" | "hurt" | "death"`

- [ ] **Step 1 : Ajouter la keyframe partagée dans `app/globals.css`**

À placer à côté de `@keyframes hit-shake` :

```css
/* Flipbook de spritesheet : la bande défile d'une tuile par step.
   --sprite-end est posé en style inline par SpriteAnimator (px, pas de %,
   car un background-position en pourcentage est relatif à l'écart
   conteneur/image et donnerait un décalage sur les tuiles non carrées). */
@keyframes sprite-run {
  from {
    background-position-x: 0;
  }
  to {
    background-position-x: var(--sprite-end);
  }
}
```

Dans le bloc `@media (prefers-reduced-motion: reduce)` existant (vers la ligne 330), ajouter :

```css
  .sprite-run {
    animation: none !important;
  }
```

- [ ] **Step 2 : Écrire le test de `SpriteAnimator`**

```tsx
// components/combat/SpriteAnimator.test.tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import SpriteAnimator from "./SpriteAnimator";

afterEach(cleanup);

const base = {
  sheetSrc: "/sprites/mc/fire-knight/anim/idle.png",
  frames: 8,
  tileW: 96,
  tileH: 72,
  renderedHeight: 108,
  durationMs: 960,
  loop: true,
  animKey: "idle",
  ariaLabel: "Héros",
};

describe("SpriteAnimator", () => {
  it("dimensionne la tuile en conservant le ratio de la source", () => {
    render(<SpriteAnimator {...base} />);
    const el = screen.getByRole("img", { name: "Héros" });
    expect(el).toHaveStyle({ height: "108px", width: "144px" });
  });

  it("étale la feuille sur frames tuiles et pose la borne d'animation", () => {
    render(<SpriteAnimator {...base} />);
    const el = screen.getByRole("img", { name: "Héros" });
    expect(el.style.backgroundSize).toBe("1152px 108px");
    expect(el.style.getPropertyValue("--sprite-end")).toBe("-1152px");
  });

  it("gèle l'animation quand frozen est vrai", () => {
    render(<SpriteAnimator {...base} frozen />);
    expect(screen.getByRole("img", { name: "Héros" })).toHaveStyle({
      animationPlayState: "paused",
    });
  });

  it("déclenche onImpact au prorata de impactFrame", () => {
    vi.useFakeTimers();
    const onImpact = vi.fn();
    render(
      <SpriteAnimator
        {...base}
        loop={false}
        frames={10}
        durationMs={600}
        impactFrame={4}
        onImpact={onImpact}
        animKey="atk1"
      />,
    );
    vi.advanceTimersByTime(239);
    expect(onImpact).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2);
    expect(onImpact).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("décale onEnd du hit-stop annoncé", () => {
    vi.useFakeTimers();
    const onEnd = vi.fn();
    render(
      <SpriteAnimator
        {...base}
        loop={false}
        durationMs={600}
        extraDelayMs={200}
        onEnd={onEnd}
        animKey="atk1"
      />,
    );
    vi.advanceTimersByTime(799);
    expect(onEnd).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2);
    expect(onEnd).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("fige la dernière tuile quand staticFrame vaut last", () => {
    render(<SpriteAnimator {...base} staticFrame="last" />);
    const el = screen.getByRole("img", { name: "Héros" });
    expect(el.style.backgroundPositionX).toBe("-1008px");
    expect(el.style.animationName).toBe("");
  });
});
```

- [ ] **Step 3 : Vérifier l'échec**

Run: `npx vitest run components/combat/SpriteAnimator.test.tsx`
Expected: FAIL — module introuvable.

- [ ] **Step 4 : Implémenter `SpriteAnimator`**

```tsx
"use client";

import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";

interface SpriteAnimatorProps {
  sheetSrc: string;
  frames: number;
  tileW: number;
  tileH: number;
  /** Hauteur de rendu en px, déjà multipliée par renderScale par l'appelant. */
  renderedHeight: number;
  durationMs: number;
  loop: boolean;
  /** Change de valeur pour relancer l'animation à la frame 0. */
  animKey: string;
  flip?: boolean;
  /** Hit-stop : met l'animation CSS en pause sans la réinitialiser. */
  frozen?: boolean;
  impactFrame?: number | null;
  /** Durée de hit-stop à ajouter au timer de fin (l'anim CSS étant gelée). */
  extraDelayMs?: number;
  onImpact?: () => void;
  onEnd?: () => void;
  /** Rend une tuile fixe au lieu d'animer (reduced-motion, boss déjà mort). */
  staticFrame?: "first" | "last";
  className?: string;
  style?: CSSProperties;
  ariaLabel?: string;
}

export default function SpriteAnimator({
  sheetSrc,
  frames,
  tileW,
  tileH,
  renderedHeight,
  durationMs,
  loop,
  animKey,
  flip = false,
  frozen = false,
  impactFrame = null,
  extraDelayMs = 0,
  onImpact,
  onEnd,
  staticFrame,
  className,
  style,
  ariaLabel,
}: SpriteAnimatorProps) {
  const onImpactRef = useRef(onImpact);
  const onEndRef = useRef(onEnd);
  onImpactRef.current = onImpact;
  onEndRef.current = onEnd;

  const renderedWidth = (renderedHeight * tileW) / tileH;
  const stripWidth = renderedWidth * frames;

  useEffect(() => {
    if (staticFrame) {
      // Pas d'animation : l'impact et la fin sont immédiats pour ne jamais
      // faire attendre un utilisateur en reduced-motion (cf. spec §9).
      onImpactRef.current?.();
      onEndRef.current?.();
      return;
    }
    const timers: ReturnType<typeof setTimeout>[] = [];
    if (impactFrame !== null && onImpactRef.current) {
      timers.push(
        setTimeout(() => onImpactRef.current?.(), (impactFrame / frames) * durationMs),
      );
    }
    if (!loop && onEndRef.current) {
      timers.push(setTimeout(() => onEndRef.current?.(), durationMs + extraDelayMs));
    }
    return () => timers.forEach(clearTimeout);
  }, [animKey, durationMs, extraDelayMs, frames, impactFrame, loop, staticFrame]);

  const staticX =
    staticFrame === "last" ? -(renderedWidth * (frames - 1)) : 0;

  return (
    <div
      role="img"
      aria-label={ariaLabel}
      data-frames={frames}
      className={`${staticFrame ? "" : "sprite-run"} ${className ?? ""}`}
      style={{
        width: `${renderedWidth}px`,
        height: `${renderedHeight}px`,
        backgroundImage: `url(${sheetSrc})`,
        backgroundSize: `${stripWidth}px ${renderedHeight}px`,
        backgroundRepeat: "no-repeat",
        imageRendering: "pixelated",
        transform: flip ? "scaleX(-1)" : "scaleX(1)",
        ...(staticFrame
          ? { backgroundPositionX: `${staticX}px` }
          : {
              ["--sprite-end" as string]: `-${stripWidth}px`,
              animationName: "sprite-run",
              animationDuration: `${durationMs}ms`,
              animationTimingFunction: `steps(${frames})`,
              animationIterationCount: loop ? "infinite" : 1,
              animationFillMode: loop ? "none" : "forwards",
              animationPlayState: frozen ? "paused" : "running",
            }),
        ...style,
      }}
    />
  );
}
```

- [ ] **Step 5 : Vérifier**

Run: `npx vitest run components/combat/SpriteAnimator.test.tsx`
Expected: PASS, 6 tests.

- [ ] **Step 6 : Écrire le test de `CharacterSprite`**

```tsx
// components/combat/CharacterSprite.test.tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import CharacterSprite from "./CharacterSprite";
import type { CharacterSpriteMeta } from "@/lib/sprite-metadata";

afterEach(cleanup);

const meta: CharacterSpriteMeta = {
  tileW: 96,
  tileH: 72,
  renderScale: 1.5,
  groundOffset: 0.1,
  anims: {
    idle: { frames: 8, impactFrame: null },
    atk1: { frames: 10, impactFrame: 4 },
    hurt: { frames: 6, impactFrame: null },
    death: { frames: 12, impactFrame: null },
  },
};

const base = {
  spriteBase: "/sprites/mc/fire-knight",
  meta,
  baseHeight: 88,
  stateKey: 1,
  alt: "Héros",
};

describe("CharacterSprite", () => {
  it("applique renderScale et groundOffset à la géométrie", () => {
    render(<CharacterSprite {...base} state="idle" />);
    // 88 × 1.5 = 132 px de haut, décalé de 0.1 × 132 = 13.2 px vers le bas.
    const wrapper = screen.getByTestId("character-sprite");
    expect(wrapper).toHaveStyle({ transform: "translateY(13.2px)" });
    expect(screen.getByRole("img", { name: "Héros" })).toHaveStyle({ height: "132px" });
  });

  it("expose l'état courant pour les assertions e2e", () => {
    render(<CharacterSprite {...base} state="attack" attackAnim="atk1" />);
    expect(screen.getByTestId("character-sprite")).toHaveAttribute("data-anim-state", "attack");
  });

  it("revient à idle à la fin d'une anim non bouclée", () => {
    vi.useFakeTimers();
    render(<CharacterSprite {...base} state="attack" attackAnim="atk1" />);
    act(() => {
      vi.advanceTimersByTime(700);
    });
    expect(screen.getByTestId("character-sprite")).toHaveAttribute("data-anim-state", "idle");
    vi.useRealTimers();
  });

  it("reste figé sur death", () => {
    vi.useFakeTimers();
    render(<CharacterSprite {...base} state="death" />);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByTestId("character-sprite")).toHaveAttribute("data-anim-state", "death");
    vi.useRealTimers();
  });

  it("retombe sur l'idle quand une anim manque (minotaur)", () => {
    const partial: CharacterSpriteMeta = {
      ...meta,
      anims: { idle: { frames: 8, impactFrame: null } },
    };
    render(<CharacterSprite {...base} meta={partial} state="hurt" fallbackHurtDeath />);
    const el = screen.getByRole("img", { name: "Héros" });
    expect(el.style.backgroundImage).toContain("/anim/idle.png");
    expect(screen.getByTestId("character-sprite")).toHaveAttribute("data-anim-fallback", "true");
  });
});
```

- [ ] **Step 7 : Vérifier l'échec puis implémenter `CharacterSprite`**

Run: `npx vitest run components/combat/CharacterSprite.test.tsx` → FAIL.

```tsx
"use client";

import { useEffect, useState } from "react";
import SpriteAnimator from "./SpriteAnimator";
import type { CharacterSpriteMeta } from "@/lib/sprite-metadata";
import {
  ATTACK_DURATION_MS,
  DEATH_DURATION_MS,
  HURT_DURATION_MS,
  IDLE_FRAME_MS,
  SP_ATTACK_DURATION_MS,
} from "@/lib/combat-animation";

export type CharacterAnimState = "idle" | "attack" | "hurt" | "death";

interface CharacterSpriteProps {
  spriteBase: string;
  meta: CharacterSpriteMeta;
  /** Hauteur historique du site de rendu (88 Arène héros, 96 boss, 112 boutique). */
  baseHeight: number;
  state: CharacterAnimState;
  /** Nom de feuille pour state="attack" : atk1/atk2/atk3/sp_atk côté héros, attack côté boss. */
  attackAnim?: string;
  stateKey?: number;
  alt: string;
  flip?: boolean;
  frozen?: boolean;
  extraDelayMs?: number;
  danger?: boolean;
  /** minotaur : pack sans hurt ni death, on retombe sur l'idle + effet CSS. */
  fallbackHurtDeath?: boolean;
  reducedMotion?: boolean;
  onImpact?: () => void;
  onStateEnd?: () => void;
  className?: string;
}

function animNameFor(state: CharacterAnimState, attackAnim: string | undefined): string {
  if (state === "attack") return attackAnim ?? "attack";
  return state;
}

function durationFor(animName: string, frames: number): number {
  if (animName === "idle") return frames * IDLE_FRAME_MS;
  if (animName === "sp_atk") return SP_ATTACK_DURATION_MS;
  if (animName === "hurt" || animName === "take_hit") return HURT_DURATION_MS;
  if (animName === "death") return DEATH_DURATION_MS;
  return ATTACK_DURATION_MS;
}

export default function CharacterSprite({
  spriteBase,
  meta,
  baseHeight,
  state,
  attackAnim,
  stateKey = 0,
  alt,
  flip = false,
  frozen = false,
  extraDelayMs = 0,
  danger = false,
  fallbackHurtDeath = false,
  reducedMotion = false,
  onImpact,
  onStateEnd,
  className,
}: CharacterSpriteProps) {
  // État réellement rendu : `state` demandé, ramené à "idle" quand une anim
  // non bouclée s'achève. `death` ne revient jamais à idle de lui-même.
  const [rendered, setRendered] = useState<CharacterAnimState>(state);
  useEffect(() => setRendered(state), [state, stateKey]);

  const requested = animNameFor(rendered, attackAnim);
  const available = meta.anims[requested] !== undefined;
  const animName = available ? requested : "idle";
  const anim = meta.anims[animName];

  // Fallback (minotaur) : l'anim demandée n'existe pas, on joue l'idle bouclé,
  // donc `onEnd` de SpriteAnimator ne se déclenchera jamais. Sans ce retour
  // programmé, l'état resterait bloqué sur "hurt" indéfiniment.
  useEffect(() => {
    if (available || rendered === "idle" || rendered === "death") return;
    const timer = setTimeout(() => setRendered("idle"), HURT_DURATION_MS);
    return () => clearTimeout(timer);
  }, [available, rendered, stateKey]);

  const renderedHeight = baseHeight * meta.renderScale;
  const loop = animName === "idle";
  const duration = durationFor(animName, anim.frames) * (danger && loop ? 1.3 : 1);

  return (
    <div
      data-testid="character-sprite"
      data-anim-state={rendered}
      data-anim-fallback={available ? undefined : "true"}
      // `relative` obligatoire : le flash de fallback est en absolute inset-0.
      className={`relative ${className ?? ""}`}
      style={{
        transform: `translateY(${meta.groundOffset * renderedHeight}px)`,
        filter: danger ? "saturate(1.15) brightness(0.92)" : undefined,
      }}
    >
      <SpriteAnimator
        sheetSrc={`${spriteBase}/anim/${animName}.png`}
        frames={anim.frames}
        tileW={meta.tileW}
        tileH={meta.tileH}
        renderedHeight={renderedHeight}
        durationMs={duration}
        loop={loop}
        animKey={`${animName}-${stateKey}`}
        flip={flip}
        frozen={frozen}
        extraDelayMs={extraDelayMs}
        impactFrame={anim.impactFrame}
        ariaLabel={alt}
        staticFrame={
          reducedMotion ? (rendered === "death" ? "last" : "first") : undefined
        }
        onImpact={onImpact}
        onEnd={() => {
          if (rendered !== "death") setRendered("idle");
          onStateEnd?.();
        }}
      />
      {fallbackHurtDeath && !available && rendered === "hurt" && (
        <div className="hit-flash-overlay pointer-events-none absolute inset-0" />
      )}
    </div>
  );
}
```

- [ ] **Step 8 : Vérifier**

Run: `npx vitest run components/combat/`
Expected: PASS.

- [ ] **Step 9 : Commit**

```bash
git add components/combat/SpriteAnimator.tsx components/combat/SpriteAnimator.test.tsx components/combat/CharacterSprite.tsx components/combat/CharacterSprite.test.tsx app/globals.css
git commit -m "feat: SpriteAnimator et CharacterSprite bases sur spritesheets"
```

> **Note :** `CharacterSprite` importe des constantes de `lib/combat-animation.ts`, créé en Task 3.1. Créer dès maintenant ce fichier avec les seules constantes de durée (`IDLE_FRAME_MS = 120`, `ATTACK_DURATION_MS = 600`, `SP_ATTACK_DURATION_MS = 800`, `HURT_DURATION_MS = 350`, `DEATH_DURATION_MS = 1000`) ; la Task 3.1 y ajoute les fonctions.

---

### Task 2.3 : Migration des 5 sites de rendu

**Files:**
- Modify: `components/combat/VersusScene.tsx`, `components/combat/HeroIdle.tsx`, `components/combat/RosterPreview.tsx`, `components/shop/SkinsPreview.tsx`, `app/api/share-card/route.tsx`, `components/combat/Arena.tsx`
- Delete: `components/combat/IdleSprite.tsx`

**Interfaces:**
- Consumes: `CharacterSprite`, `heroSpriteMeta`, `bossSpriteMeta`, `getHeroSpriteBase`.
- Produces: aucune nouvelle interface. **Objectif : iso-visuel.**

Hauteurs de base à passer, par site :

| Site | `baseHeight` | Ancien class |
|---|---|---|
| `VersusScene` héros | `88` | `h-[88px]` |
| `VersusScene` boss | `96` | `h-24` |
| `RosterPreview` héros / boss | `88` / `96` | idem |
| `SkinsPreview` | `96` | `h-24` |
| `HeroIdle` | `112` | `h-28` sur le wrapper |

- [ ] **Step 1 : Migrer `VersusScene`**

Remplacer les deux `<IdleSprite>` par des `<CharacterSprite>`. Les props `heroFramePrefix`/`heroFrameCount`/`bossFramePrefix`/`bossFrameCount` deviennent `heroSpriteBase`/`heroSlug`/`bossSpriteBase`/`bossSlug`. Supprimer le `useEffect` de préchargement des `IMPACT_VARIANTS` et l'import de `ImpactVfx`. Conserver les classes de positionnement (`absolute bottom-2 left-4` / `right-4`) sur le wrapper.

- [ ] **Step 2 : Migrer `HeroIdle`, `RosterPreview`, `SkinsPreview`**

Même substitution. `HeroIdle` remplace son `className="h-full w-auto"` par un `baseHeight` explicite : ajouter une prop `baseHeight?: number` défaut `112`, et retirer `h-28` du wrapper côté appelants (`CharacterSelect.tsx:134`, `OnboardingAvatarPicker.tsx:19`).

- [ ] **Step 3 : Migrer `/api/share-card`**

```tsx
// app/api/share-card/route.tsx, lignes 59-60
toDataUri(`${hero.spriteBase.replace(/^\//, "")}/still.png`),
toDataUri(`${boss.spriteBase.replace(/^\//, "")}/still.png`),
```

Rappel du piège Satori déjà documenté : le style `transform` du sprite Boss doit **toujours** valoir `scaleX(1)` ou `scaleX(-1)`, jamais `undefined` ni `"none"`.

- [ ] **Step 4 : Supprimer `IdleSprite`**

```bash
git rm components/combat/IdleSprite.tsx
```

- [ ] **Step 5 : Vérifier la compilation et les tests**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: tout vert.

- [ ] **Step 6 : Vérification iso-visuelle manuelle**

Run: `npm run dev`
Vérifier à l'œil, en comparant à une capture prise avant la Phase 2 :
1. `/` — héros et Boss à la même taille et à la même hauteur qu'avant.
2. `/marche-noir` — sélection de héros, tenues.
3. `/roster-preview-8f3a2c9d` — les 27 boss.
4. `/skins-preview-4c7a1e9b` — les 20 tenues.
5. `/onboarding` — sélection d'avatar.
6. La carte de partage : depuis un K.O., bouton de partage.

**Critère de rejet :** un personnage visiblement plus grand, plus petit, ou décollé du sol. Dans ce cas, ne pas ajuster le CSS — vérifier `LEGACY_IDLE_HEIGHTS` et `groundOffset`.

- [ ] **Step 7 : Commit**

```bash
git add -A components app
git commit -m "refactor: migration des sites de rendu vers CharacterSprite"
```

---

# Phase 3 — Coup du héros

### Task 3.1 : Fonctions pures de combat

**Files:**
- Modify: `lib/combat-animation.ts` (créé en Task 2.2)
- Create: `lib/combat-animation.test.ts`

**Interfaces:**
- Produces:
  - `export type HeroAttackAnim = "atk1" | "atk2" | "atk3" | "sp_atk"`
  - `pickAttackAnim(comboCount: number, isFatal: boolean, rng?: () => number): HeroAttackAnim`
  - `impactDelayMs(frames: number, impactFrame: number | null, durationMs: number): number`
  - `hitStopMs(input: { isFatal: boolean; comboCount: number; hits: number }): number`
  - `export interface PendingHits { damage: number; xp: number; hits: number; firstAt: number }`
  - `addPendingHit(prev: PendingHits | null, damage: number, xp: number, now: number): PendingHits`
  - `shouldForceFlush(pending: PendingHits | null, now: number): boolean`
  - constantes `COALESCE_MAX_WAIT_MS = 1200`, `KNOCKBACK_MS = 220`, `KO_FADE_MS = 400`, `COMBO_SPECIAL_THRESHOLD = 3`

- [ ] **Step 1 : Écrire les tests**

```ts
// lib/combat-animation.test.ts
import { describe, expect, it } from "vitest";
import {
  addPendingHit,
  COALESCE_MAX_WAIT_MS,
  hitStopMs,
  impactDelayMs,
  pickAttackAnim,
  shouldForceFlush,
} from "./combat-animation";

describe("pickAttackAnim", () => {
  it("sort l'attaque spéciale sur le coup fatal", () => {
    expect(pickAttackAnim(0, true, () => 0)).toBe("sp_atk");
  });

  it("sort l'attaque spéciale à partir d'un combo ×3", () => {
    expect(pickAttackAnim(3, false, () => 0)).toBe("sp_atk");
  });

  it("tire une attaque de base en dessous du seuil de combo", () => {
    expect(pickAttackAnim(2, false, () => 0)).toBe("atk1");
    expect(pickAttackAnim(2, false, () => 0.5)).toBe("atk2");
    expect(pickAttackAnim(2, false, () => 0.99)).toBe("atk3");
  });
});

describe("impactDelayMs", () => {
  it("place l'impact au prorata de la frame de contact", () => {
    expect(impactDelayMs(10, 4, 600)).toBe(240);
  });

  it("renvoie 0 quand l'anim n'a pas de frame d'impact", () => {
    expect(impactDelayMs(8, null, 960)).toBe(0);
  });
});

describe("hitStopMs", () => {
  it("gèle longuement sur le coup fatal", () => {
    expect(hitStopMs({ isFatal: true, comboCount: 0, hits: 1 })).toBe(200);
  });

  it("gèle davantage sur une cascade ou un combo ×3", () => {
    expect(hitStopMs({ isFatal: false, comboCount: 3, hits: 1 })).toBe(120);
    expect(hitStopMs({ isFatal: false, comboCount: 0, hits: 4 })).toBe(120);
  });

  it("gèle brièvement sur un coup simple", () => {
    expect(hitStopMs({ isFatal: false, comboCount: 1, hits: 1 })).toBe(50);
  });
});

describe("coalescing des rafales", () => {
  it("additionne les coups et conserve l'instant du premier", () => {
    const a = addPendingHit(null, 25, 10, 1000);
    const b = addPendingHit(a, 25, 15, 1150);
    expect(b).toEqual({ damage: 50, xp: 25, hits: 2, firstAt: 1000 });
  });

  it("force le flush passé la fenêtre maximale", () => {
    const p = addPendingHit(null, 25, 10, 1000);
    expect(shouldForceFlush(p, 1000 + COALESCE_MAX_WAIT_MS - 1)).toBe(false);
    expect(shouldForceFlush(p, 1000 + COALESCE_MAX_WAIT_MS)).toBe(true);
  });

  it("ne force jamais le flush sans coup en attente", () => {
    expect(shouldForceFlush(null, 99999)).toBe(false);
  });
});
```

- [ ] **Step 2 : Vérifier l'échec**

Run: `npx vitest run lib/combat-animation.test.ts`
Expected: FAIL — exports manquants.

- [ ] **Step 3 : Implémenter**

```ts
// Ajouts à lib/combat-animation.ts (les constantes de durée existent déjà).

export const COALESCE_MAX_WAIT_MS = 1200;
export const KNOCKBACK_MS = 220;
export const KO_FADE_MS = 400;
export const COMBO_SPECIAL_THRESHOLD = 3;

export type HeroAttackAnim = "atk1" | "atk2" | "atk3" | "sp_atk";

const BASE_ATTACKS: HeroAttackAnim[] = ["atk1", "atk2", "atk3"];

/**
 * Anim de personnage du coup de héros. L'attaque spéciale est réservée aux
 * moments qui comptent (coup fatal, combo installé) ; le reste tire au hasard
 * parmi les trois attaques de base pour éviter la répétition du geste le plus
 * souvent vu dans l'app.
 */
export function pickAttackAnim(
  comboCount: number,
  isFatal: boolean,
  rng: () => number = Math.random,
): HeroAttackAnim {
  if (isFatal || comboCount >= COMBO_SPECIAL_THRESHOLD) return "sp_atk";
  return BASE_ATTACKS[Math.min(BASE_ATTACKS.length - 1, Math.floor(rng() * BASE_ATTACKS.length))];
}

export function impactDelayMs(
  frames: number,
  impactFrame: number | null,
  durationMs: number,
): number {
  if (impactFrame === null || frames <= 0) return 0;
  return (impactFrame / frames) * durationMs;
}

/**
 * Hit-stop : figer brièvement les deux sprites à l'impact est ce qui donne du
 * poids au coup (juice arcade, cf. PRODUCT.md). Plus le coup est important,
 * plus le gel est long.
 */
export function hitStopMs(input: {
  isFatal: boolean;
  comboCount: number;
  hits: number;
}): number {
  if (input.isFatal) return 200;
  if (input.comboCount >= COMBO_SPECIAL_THRESHOLD || input.hits > 1) return 120;
  return 50;
}

export interface PendingHits {
  damage: number;
  xp: number;
  hits: number;
  /** Instant du premier coup en attente, pour le flush forcé. */
  firstAt: number;
}

export function addPendingHit(
  prev: PendingHits | null,
  damage: number,
  xp: number,
  now: number,
): PendingHits {
  if (!prev) return { damage, xp, hits: 1, firstAt: now };
  return {
    damage: prev.damage + damage,
    xp: prev.xp + xp,
    hits: prev.hits + 1,
    firstAt: prev.firstAt,
  };
}

/**
 * Garde-fou anti-spam : sans lui, chaque nouveau clic relançant l'anim,
 * un utilisateur qui coche en continu ne verrait jamais l'impact tomber.
 */
export function shouldForceFlush(pending: PendingHits | null, now: number): boolean {
  if (!pending) return false;
  return now - pending.firstAt >= COALESCE_MAX_WAIT_MS;
}
```

- [ ] **Step 4 : Vérifier**

Run: `npx vitest run lib/combat-animation.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5 : Commit**

```bash
git add lib/combat-animation.ts lib/combat-animation.test.ts
git commit -m "feat: fonctions pures d'animation de combat"
```

---

### Task 3.2 : `HeroVfx`

**Files:**
- Create: `components/combat/HeroVfx.tsx`
- Delete: `components/combat/ImpactVfx.tsx`
- Modify: `components/combat/VersusScene.tsx`

**Interfaces:**
- Consumes: `heroVfxVariants`, `vfxMeta` (Task 1.4), `SpriteAnimator` (Task 2.2).
- Produces: `HeroVfx` props `{ heroSlug: string; variant: string; bossHeight: number; reducedMotion?: boolean }` et `pickVfxVariant(heroSlug: string, rng?: () => number): string`.

- [ ] **Step 1 : Implémenter `HeroVfx`**

```tsx
"use client";

import SpriteAnimator from "./SpriteAnimator";
import { heroVfxVariants, vfxMeta } from "@/lib/sprite-metadata";

const VFX_DURATION_MS = 320;

export function pickVfxVariant(heroSlug: string, rng: () => number = Math.random): string {
  const variants = heroVfxVariants(heroSlug);
  if (variants.length === 0) throw new Error(`Aucun VFX pour le héros ${heroSlug}`);
  return variants[Math.min(variants.length - 1, Math.floor(rng() * variants.length))];
}

interface HeroVfxProps {
  heroSlug: string;
  variant: string;
  /** Hauteur rendue du Boss : le VFX se joue sur la cible, pas au centre. */
  bossHeight: number;
  reducedMotion?: boolean;
}

export default function HeroVfx({
  heroSlug,
  variant,
  bossHeight,
  reducedMotion = false,
}: HeroVfxProps) {
  if (reducedMotion) return null;
  const meta = vfxMeta(heroSlug, variant);
  return (
    <SpriteAnimator
      sheetSrc={`/vfx/hero/${heroSlug}/${variant}.png`}
      frames={meta.frames}
      tileW={meta.tileW}
      tileH={meta.tileH}
      renderedHeight={bossHeight * 1.2}
      durationMs={VFX_DURATION_MS}
      loop={false}
      animKey={variant}
      className="pointer-events-none absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2"
    />
  );
}
```

- [ ] **Step 2 : Le monter sur le Boss dans `VersusScene`**

Le rendre dans le wrapper positionné du Boss (celui qui porte `absolute bottom-2 right-4`), en `relative`, pour qu'il soit centré sur le sprite et non sur la scène.

- [ ] **Step 3 : Supprimer l'ancien composant**

```bash
git rm components/combat/ImpactVfx.tsx
```

Retirer de `Arena.tsx` l'import de `ImpactVfx`/`pickImpactVariant`, et le champ `impactVariant` du type `Pulse` (remplacé en Task 3.3).

- [ ] **Step 4 : Vérifier**

Run: `npx tsc --noEmit && npm run lint`
Expected: vert (des erreurs subsistent dans `Arena.tsx` tant que la Task 3.3 n'est pas faite — enchaîner sans committer si c'est le cas).

- [ ] **Step 5 : Commit**

```bash
git add -A components
git commit -m "feat: VFX d'impact par heros joue sur le Boss"
```

---

### Task 3.3 : Gating et coalescing dans l'Arène

**Files:**
- Modify: `components/combat/Arena.tsx`, `components/combat/VersusScene.tsx`

**Interfaces:**
- Consumes: `pickAttackAnim`, `addPendingHit`, `shouldForceFlush`, `hitStopMs`, `impactDelayMs`, `pickVfxVariant`.
- Produces: `VersusScene` gagne les props `heroState`, `heroAttackAnim`, `heroStateKey`, `bossState`, `bossStateKey`, `frozen`, `vfxVariant`, `bossDanger`, `onHeroImpact`.

**Contexte.** `Arena.tsx` fait 1 386 lignes. Ne pas restructurer : ajouter les états à côté de l'existant. Le point d'entrée est `handleToggle` (vers la ligne 700), qui calcule déjà `previousHp`, `nextHp`, `hpDelta` et appelle `triggerPulse` / `triggerXpPulse` / `koOutcome`.

- [ ] **Step 1 : Détecter `prefers-reduced-motion` une fois**

Reprendre exactement le patron déjà utilisé par `ImpactVfx`/`IdleSprite` :

```tsx
const [reducedMotion] = useState(
  () =>
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches,
);
```

- [ ] **Step 2 : Ajouter l'état d'animation**

```tsx
const [heroAnim, setHeroAnim] = useState<{
  state: "idle" | "attack";
  anim: HeroAttackAnim;
  key: number;
} | null>(null);
const [bossAnim, setBossAnim] = useState<{
  state: "idle" | "hurt" | "death";
  key: number;
}>({ state: "idle", key: 0 });
const [frozen, setFrozen] = useState(false);
const [vfxVariant, setVfxVariant] = useState<string | null>(null);
const pendingRef = useRef<PendingHits | null>(null);
const animKeyRef = useRef(0);
const impactTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
const freezeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
```

Nettoyer `impactTimerRef` et `freezeTimerRef` dans le `useEffect` de cleanup existant (vers la ligne 351), à côté de `pulseTimeoutRef`.

- [ ] **Step 3 : Remplacer l'appel direct de `triggerPulse` par le gating**

Dans `handleToggle`, à l'endroit où `triggerPulse(hpDelta, "damage")` est appelé aujourd'hui :

```tsx
// Sous reduced-motion, aucun gating : le feedback reste instantané (spec §9).
if (reducedMotion) {
  triggerPulse(hpDelta, "damage");
  triggerXpPulse(xpDelta, "xp");
  return;
}

const isFatal = nextHp === 0;
const now = Date.now();
pendingRef.current = addPendingHit(pendingRef.current, hpDelta, xpDelta, now);
const hits = pendingRef.current.hits;

animKeyRef.current += 1;
const key = animKeyRef.current;
const anim = pickAttackAnim(comboCount, isFatal, Math.random);
setHeroAnim({ state: "attack", anim, key });
setVfxVariant(pickVfxVariant(equippedHero.slug));

const meta = heroSpriteMeta(equippedHero.slug).anims[anim];
const delay = impactDelayMs(
  meta.frames,
  meta.impactFrame,
  anim === "sp_atk" ? SP_ATTACK_DURATION_MS : ATTACK_DURATION_MS,
);

if (impactTimerRef.current) clearTimeout(impactTimerRef.current);
impactTimerRef.current = setTimeout(
  () => flushImpact(isFatal, hits),
  shouldForceFlush(pendingRef.current, now) ? 0 : delay,
);
```

- [ ] **Step 4 : Écrire `flushImpact`**

```tsx
function flushImpact(isFatal: boolean, hits: number) {
  const pending = pendingRef.current;
  pendingRef.current = null;
  if (!pending) return;

  triggerPulse(pending.damage, "damage");
  triggerXpPulse(pending.xp, "xp");
  setBossAnim((prev) => ({
    state: isFatal ? "death" : "hurt",
    key: prev.key + 1,
  }));

  const stop = hitStopMs({ isFatal, comboCount, hits });
  setFrozen(true);
  if (freezeTimerRef.current) clearTimeout(freezeTimerRef.current);
  freezeTimerRef.current = setTimeout(() => setFrozen(false), stop);
}
```

Le `setKoState({ ... })` existant de `handleToggle` (`Arena.tsx:744`) reste **inchangé** à cette étape : l'overlay s'ouvre encore immédiatement pendant que la mort se joue. La Task 4.3 l'enveloppe dans `startKoSequence` pour le décaler. Laisser l'app dans un état cohérent entre les deux tâches, plutôt que sans overlay du tout.

- [ ] **Step 5 : Passer les nouvelles props à `VersusScene`**

Ajouter `heroState`, `heroAttackAnim`, `heroStateKey`, `bossState`, `bossStateKey`, `frozen`, `vfxVariant`, `reducedMotion`, et faire redescendre `frozen`/`extraDelayMs` jusqu'aux deux `CharacterSprite`.

- [ ] **Step 6 : Vérification manuelle**

Run: `npm run dev`
Cocher une tâche : le héros s'élance, l'impact tombe ~250 ms plus tard avec le VFX sur le Boss, le Boss encaisse, la jauge chute au même instant. Cocher trois tâches en rafale : une seule chute de jauge, du montant cumulé.

- [ ] **Step 7 : `npm test && npx tsc --noEmit && npm run lint`, puis commit**

```bash
git add components
git commit -m "feat: degats cales sur la frame d'impact avec coalescing des rafales"
```

---

### Task 3.4 : Hit-stop visuel et recul

**Files:**
- Modify: `app/globals.css`, `components/combat/VersusScene.tsx`

- [ ] **Step 1 : Ajouter la keyframe de recul**

```css
/* Recul à l'impact : le personnage touché est repoussé puis revient.
   --knockback-x vaut +6px pour le Boss (poussé vers la droite) et -6px pour
   le Héros. Complète le hit-stop : le gel donne la frappe, le recul le poids. */
@keyframes knockback {
  0% {
    transform: translateX(0);
  }
  25% {
    transform: translateX(var(--knockback-x));
  }
  100% {
    transform: translateX(0);
  }
}

.is-knockback {
  animation: knockback 220ms ease-out;
}
```

Dans le bloc `@media (prefers-reduced-motion: reduce)` :

```css
  .is-knockback {
    animation: none;
  }
```

- [ ] **Step 2 : Appliquer la classe**

Sur le wrapper du Boss dans `VersusScene`, ajouter `is-knockback` quand `bossState === "hurt"` (avec `--knockback-x: 6px`), sur celui du Héros quand `heroState === "hurt"` (avec `--knockback-x: -6px`). Utiliser la clé d'état comme `key` React pour que l'animation se rejoue à chaque coup.

**Attention :** `CharacterSprite` pose déjà un `transform: translateY(...)` sur son propre wrapper. Le recul doit donc s'appliquer sur un **élément parent distinct**, sinon les deux `transform` se remplacent.

- [ ] **Step 3 : Vérification manuelle + commit**

Run: `npm run dev` — le Boss recule visiblement à chaque coup ; sous « réduire les animations » du système, plus rien ne bouge.

```bash
git add app/globals.css components/combat/VersusScene.tsx
git commit -m "feat: hit-stop et recul a l'impact"
```

---

### Task 3.5 : Jauge fantôme

**Files:**
- Modify: `components/combat/BossBar.tsx`, `components/combat/HeroBar.tsx`

**Contexte.** `role="progressbar"` et `aria-valuenow` restent sur le conteneur : la couche fantôme est purement décorative, aucun test e2e existant n'est affecté.

- [ ] **Step 1 : Ajouter la couche dans `BossBar`**

```tsx
<div
  role="progressbar"
  aria-valuenow={currentHp}
  aria-valuemin={0}
  aria-valuemax={maxHp}
  aria-label={`Vie du Boss : ${currentHp} sur ${maxHp}`}
  className="relative h-3.5 overflow-hidden rounded-sm bg-hp-dim"
>
  {/* Chip damage : la couche fantôme descend en retard sur la barre réelle.
      L'écart entre les deux donne l'ampleur du coup — signature visuelle des
      jeux de combat. Décorative : aria-hidden, la valeur reste sur le parent. */}
  <div
    aria-hidden="true"
    className="absolute inset-y-0 left-0 bg-white/40 transition-[width] delay-200 duration-500 ease-out motion-reduce:transition-none"
    style={{ width: `${pct}%` }}
  />
  <div
    className="absolute inset-y-0 left-0 bg-hp transition-[width] duration-100 ease-out motion-reduce:transition-none"
    style={{ width: `${pct}%` }}
  />
</div>
```

- [ ] **Step 2 : Même chose dans `HeroBar`**

Reprendre la structure à l'identique en substituant les tokens de couleur du Héros à `bg-hp`. Conserver la logique `alarm` existante.

- [ ] **Step 3 : Vérifier que les e2e existants passent**

Run: `npm run e2e -- e2e/combat-loop.spec.ts e2e/deadline-missed-chip.spec.ts`
Expected: PASS.

- [ ] **Step 4 : Commit**

```bash
git add components/combat/BossBar.tsx components/combat/HeroBar.tsx
git commit -m "feat: jauge fantome facon jeu de combat"
```

---

### Task 3.6 : Calage des frames d'impact

**Files:**
- Modify: `components/combat/RosterPreview.tsx`, `scripts/build-sprite-sheets.mjs`, `lib/sprite-metadata.generated.json`

- [ ] **Step 1 : Étendre `RosterPreview`**

Ajouter, pour chaque personnage affiché, des boutons qui forcent l'état (`idle`/`attack`/`hurt`/`death`) et un curseur de vitesse (×1 / ×0,25) qui multiplie `durationMs`. Afficher la valeur d'`impactFrame` courante et un repère visuel (bordure clignotante) au moment où `onImpact` se déclenche.

- [ ] **Step 2 : Caler à l'œil**

Run: `npm run dev` puis `/roster-preview-8f3a2c9d`
Pour chaque héros (7 × 4 anims d'attaque) et chaque boss (27 × 1 anim), vérifier que l'impact tombe bien au **contact visuel** de l'arme. Noter les écarts.

- [ ] **Step 3 : Renseigner les surcharges**

Remplir `IMPACT_FRAME_OVERRIDES` dans `scripts/build-sprite-sheets.mjs`, format `"<slug>.<anim>": <index>` :

```js
const IMPACT_FRAME_OVERRIDES = {
  // Exemple de format — à remplir avec les valeurs relevées à l'étape 2.
  // "fire-knight.atk3": 13,
};
```

- [ ] **Step 4 : Régénérer et vérifier**

Run: `npm run generate:sprites && npx vitest run lib/sprite-metadata.test.ts`
Expected: PASS (le test vérifie que chaque `impactFrame` reste dans `[1, frames-1]`).

- [ ] **Step 5 : Commit**

```bash
git add scripts/build-sprite-sheets.mjs lib/sprite-metadata.generated.json components/combat/RosterPreview.tsx
git commit -m "chore: calage des frames d'impact par animation"
```

---

# Phase 4 — Attaque du Boss, mort, K.O.

### Task 4.1 : Attaque du Boss sur deadline et Rage Quit

**Files:**
- Modify: `components/combat/Arena.tsx`, `components/combat/VersusScene.tsx`

**Interfaces:**
- Produces: `triggerBossAttack(reason: "deadline" | "rage_quit" | "recap")` dans `Arena.tsx`.

**Contexte.** Le polling de deadline (~45 s) et son `Set` de refs de tâches déjà signalées existent déjà. Le Rage Quit passe par `rageQuitTask`. Le Boss et le Héros ne doivent jamais animer en même temps : si une anim de héros est en cours, l'attaque du Boss attend.

- [ ] **Step 1 : Écrire `triggerBossAttack`**

```tsx
const bossAttackPendingRef = useRef<null | "deadline" | "rage_quit" | "recap">(null);

function triggerBossAttack(reason: "deadline" | "rage_quit" | "recap") {
  if (reducedMotion) return;
  // Une seule attaque à la fois ; si le héros frappe, on attend la fin de son
  // anim (relancé depuis onStateEnd du CharacterSprite héros).
  if (heroAnim?.state === "attack") {
    bossAttackPendingRef.current = reason;
    return;
  }
  animKeyRef.current += 1;
  setBossAnim({ state: "attack", key: animKeyRef.current });
  setBossAttackReason(reason);
}
```

Ajouter `bossAttackReason` en `useState`, et étendre le type d'état du Boss à `"idle" | "attack" | "hurt" | "death"`.

- [ ] **Step 2 : Brancher l'impact du Boss**

Sur `onImpact` du `CharacterSprite` du Boss quand `bossState === "attack"` :

```tsx
function onBossImpact() {
  animKeyRef.current += 1;
  setHeroAnim({ state: "hurt", key: animKeyRef.current });
  const stop = hitStopMs({ isFatal: false, comboCount: 0, hits: 1 });
  setFrozen(true);
  if (freezeTimerRef.current) clearTimeout(freezeTimerRef.current);
  freezeTimerRef.current = setTimeout(() => setFrozen(false), stop);

  if (bossAttackReason === "rage_quit") {
    // Rage Quit : −5 XP, aucun HP. L'anim est narrative, la jauge ne bouge pas.
    // RAGE_QUIT_XP_PENALTY est exporté par lib/game-engine.ts (ligne 520).
    triggerXpPulse(-RAGE_QUIT_XP_PENALTY, "xp");
  }
  // deadline / recap : les HP sont déjà décomptés par le calcul de heroHp,
  // le FloatingText et le clignotement de jauge existants restent en place.
}
```

- [ ] **Step 3 : Brancher les deux déclencheurs**

- Dans l'effet de polling des deadlines, à l'endroit où une deadline nouvellement franchie déclenche aujourd'hui `heroPulse` : ajouter `triggerBossAttack("deadline")`.
- Dans le handler de Rage Quit, après la confirmation : `triggerBossAttack("rage_quit")`.

- [ ] **Step 4 : Rejouer l'attaque en attente**

Dans le `onStateEnd` du `CharacterSprite` du Héros :

```tsx
if (bossAttackPendingRef.current) {
  const reason = bossAttackPendingRef.current;
  bossAttackPendingRef.current = null;
  triggerBossAttack(reason);
}
```

- [ ] **Step 5 : Vérification manuelle**

Run: `npm run dev`
Rage Quit d'une tâche → le Boss attaque, le héros encaisse, « −5 XP » flotte côté héros, la jauge de HP ne bouge pas.

- [ ] **Step 6 : `npm test && npx tsc --noEmit`, puis commit**

```bash
git add components
git commit -m "feat: attaque du Boss sur deadline ratee et rage quit"
```

---

### Task 4.2 : Attaque récapitulative au chargement

**Files:**
- Modify: `components/combat/Arena.tsx`

**Contexte.** Ce comportement **revient sur** l'entrée « pas de replay au chargement » de `CLAUDE.md` (US-05). Règle : **une seule** attaque, jamais une par deadline ni une par reste. Si Le Réveil est monté, l'Arène est masquée derrière un overlay bloquant : l'attaque attend sa fermeture.

- [ ] **Step 1 : Ajouter l'effet de récapitulatif**

```tsx
// Une seule attaque récapitulative par montage : ce qui était déjà raté avant
// l'ouverture (deadlines dépassées, restes reportés au Réveil) se solde par un
// seul coup du Boss, jamais un par élément.
const recapPlayedRef = useRef(false);

useEffect(() => {
  if (recapPlayedRef.current || reducedMotion) return;
  if (showWakeUp) return; // Le Réveil bloque : on attend sa fermeture.
  const hadPenalties = missedDeadlines.length > 0 || overdueTasks.length > 0;
  if (!hadPenalties) return;
  recapPlayedRef.current = true;
  triggerBossAttack("recap");
}, [missedDeadlines.length, overdueTasks.length, reducedMotion, showWakeUp]);
```

- [ ] **Step 2 : Vérification manuelle**

Run: `npm run dev`
1. Compte avec deux deadlines déjà ratées → **une** attaque du Boss à l'ouverture.
2. Compte avec des restes → Le Réveil s'ouvre, l'attaque ne part **pas** ; après avoir reporté un reste et fermé l'overlay, **une** attaque part.

- [ ] **Step 3 : Commit**

```bash
git add components/combat/Arena.tsx
git commit -m "feat: attaque recapitulative du Boss a l'ouverture de l'Arene"
```

---

### Task 4.3 : Mort, K.O., état danger

**Files:**
- Create: `components/combat/KoSlam.tsx`
- Modify: `components/combat/Arena.tsx`, `components/combat/VersusScene.tsx`, `components/combat/BossBar.tsx`, `app/globals.css`, `lib/game-engine.ts`, `lib/game-engine.test.ts`

**Interfaces:**
- Produces: `BOSS_DANGER_HP_RATIO = 0.25` et `isBossInDanger(currentHp: number, maxHp: number): boolean` dans `lib/game-engine.ts`.

- [ ] **Step 1 : Écrire le test de `isBossInDanger`**

```ts
// dans lib/game-engine.test.ts
describe("isBossInDanger", () => {
  it("passe en danger sous le quart des HP", () => {
    expect(isBossInDanger(24, 100)).toBe(true);
    expect(isBossInDanger(25, 100)).toBe(false);
  });

  it("n'est pas en danger quand le Boss est déjà K.O.", () => {
    expect(isBossInDanger(0, 100)).toBe(false);
  });

  it("gère un Boss sans HP maximum", () => {
    expect(isBossInDanger(0, 0)).toBe(false);
  });
});
```

- [ ] **Step 2 : Vérifier l'échec puis implémenter**

```ts
/** Sous ce ratio, le Boss entre en « danger » : jauge clignotante et idle
 *  ralenti. C'est ce qui fait monter la tension sur la fin d'un combat. */
export const BOSS_DANGER_HP_RATIO = 0.25;

export function isBossInDanger(currentHp: number, maxHp: number): boolean {
  if (maxHp <= 0 || currentHp <= 0) return false;
  return currentHp / maxHp < BOSS_DANGER_HP_RATIO;
}
```

Run: `npx vitest run lib/game-engine.test.ts` → PASS.

- [ ] **Step 3 : Créer `KoSlam`**

```tsx
"use client";

// Texte « K.O. » qui claque pendant le fondu qui précède PerfectOverlay.
// Police BoldPixels : libellé court et en majuscules, seul usage autorisé
// (cf. ASSETS.md § Fonts). `.ko-burst` existe déjà dans globals.css, avec son
// variant reduced-motion.
export default function KoSlam() {
  return (
    <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center">
      <span className="ko-burst font-display text-5xl uppercase tracking-widest text-ink drop-shadow-[0_3px_0_rgba(0,0,0,0.9)]">
        K.O.
      </span>
    </div>
  );
}
```

- [ ] **Step 4 : Séquencer le K.O. dans `Arena.tsx`**

`setKoState` reçoit déjà un objet complet (`{ tier, milestone, damageDealt, monstersDefeated, firstVictory }`, cf. `Arena.tsx:744`). La séquence transporte donc la charge telle quelle plutôt que de la reconstruire :

```tsx
type KoPayload = NonNullable<Parameters<typeof setKoState>[0]>;

const koSequenceRef = useRef<ReturnType<typeof setTimeout>[]>([]);
const [koSlam, setKoSlam] = useState(false);

function startKoSequence(payload: KoPayload) {
  if (reducedMotion) {
    setKoState(payload);
    return;
  }
  // death (1000 ms) → slam + fondu (400 ms) → PerfectOverlay.
  koSequenceRef.current.push(
    setTimeout(() => setKoSlam(true), DEATH_DURATION_MS),
    setTimeout(() => {
      setKoSlam(false);
      setKoState(payload);
    }, DEATH_DURATION_MS + KO_FADE_MS),
  );
}

function cancelKoSequence() {
  koSequenceRef.current.forEach(clearTimeout);
  koSequenceRef.current = [];
  setKoSlam(false);
}
```

Remplacer le `setKoState({ tier, milestone, damageDealt, monstersDefeated, firstVictory })` de `Arena.tsx:744` par `startKoSequence({ ... })` avec exactement la même charge, et appeler `cancelKoSequence()` dans un effet qui observe `currentHp` :

```tsx
// Renaissance : une tâche ajoutée après le K.O. re-soigne le Boss. La séquence
// de mort en cours est annulée — pas de slam, pas d'overlay (cf. koOutcome).
useEffect(() => {
  if (currentHp > 0) {
    cancelKoSequence();
    setBossAnim((prev) => (prev.state === "death" ? { state: "idle", key: prev.key + 1 } : prev));
  }
}, [currentHp]);
```

Nettoyer `koSequenceRef` dans le cleanup général.

- [ ] **Step 5 : Boss mort au chargement**

Dans le calcul de l'état initial du Boss : si `currentHp === 0` au premier rendu, initialiser `bossAnim` à `{ state: "death", key: 0 }` **sans** déclencher de séquence K.O. Le `CharacterSprite` fige alors la dernière frame ; aucun overlay ne s'ouvre (comportement actuel conservé).

- [ ] **Step 6 : État danger**

- `VersusScene` : passer `danger={isBossInDanger(currentHp, maxHp)}` au `CharacterSprite` du Boss.
- `BossBar` : ajouter une prop `danger?: boolean` qui applique une classe `boss-danger-blink` sur la barre principale.
- `app/globals.css` :

```css
/* Jauge du Boss en danger : le clignotement annonce le dernier coup. */
@keyframes boss-danger-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.45; }
}

.boss-danger-blink {
  animation: boss-danger-blink 900ms ease-in-out infinite;
}
```

Plus l'entrée `.boss-danger-blink { animation: none; }` dans le bloc reduced-motion.

- [ ] **Step 7 : Vérification manuelle**

Run: `npm run dev`
Amener le Boss sous 25 % → jauge qui clignote, idle ralenti. Coup fatal → mort complète, « K.O. » qui claque, puis `PerfectOverlay`. Ajouter une tâche pendant la mort → retour à l'idle, pas d'overlay.

- [ ] **Step 8 : `npm test && npx tsc --noEmit && npm run lint`, puis commit**

```bash
git add -A components lib app/globals.css
git commit -m "feat: mort du Boss, slam K.O. et etat danger"
```

---

### Task 4.4 : Playwright

**Files:**
- Modify: `playwright.config.ts`
- Create: `e2e/combat-animations.spec.ts`

**Contexte.** Sans neutralisation, les 280 ms de gating casseraient des assertions dans une bonne partie des 24 specs existants. Passer toute la suite en `reducedMotion: "reduce"` désactive le gating (spec §9) et rend le comportement **identique à celui d'avant l'issue #48** — d'où zéro modification des specs existants.

- [ ] **Step 1 : Neutraliser les animations pour la suite existante**

Dans `playwright.config.ts`, bloc `use` :

```ts
  use: {
    baseURL,
    trace: "on-first-retry",
    // Neutralise toutes les animations de combat (issue #48) : sous
    // prefers-reduced-motion, le gating temporel est désactivé et jauges,
    // chiffres et overlays redeviennent instantanés — le comportement sur
    // lequel toute la suite existante a été écrite. Le seul spec qui teste
    // les animations le surcharge localement.
    reducedMotion: "reduce",
  },
```

- [ ] **Step 2 : Écrire le nouveau spec**

Sélecteurs et fixtures repris **à l'identique** de `e2e/combat-loop.spec.ts` (`login`, `abandonViaUi`, `getByLabel("Ajouter une tâche")`, `getByRole("button", { name: "Ajouter" })`, `getByLabel('Marquer "…" comme accomplie')`). Il n'existe pas de fixture `resetCombatState` : le reset global est fait une fois par `e2e/global-setup.ts`, et chaque spec nettoie derrière lui via `abandonViaUi` (RG-04, jamais de suppression).

```ts
// e2e/combat-animations.spec.ts
import { expect, test } from "@playwright/test";
import { abandonViaUi, login } from "./fixtures";

// Seul spec qui laisse les animations actives : partout ailleurs la config
// force prefers-reduced-motion (cf. playwright.config.ts).
test.use({ reducedMotion: "no-preference" });

test.describe("Animations de combat (issue #48)", () => {
  let taskTitle: string | undefined;

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test.afterEach(async ({ page }) => {
    if (!taskTitle) return;
    await abandonViaUi(page, taskTitle);
    taskTitle = undefined;
  });

  test("le héros attaque, le Boss encaisse, puis les deux reviennent à l'idle", async ({ page }) => {
    taskTitle = `E2E anim ${Date.now()}`;

    const hero = page.getByTestId("character-sprite").first();
    const boss = page.getByTestId("character-sprite").last();
    await expect(hero).toHaveAttribute("data-anim-state", "idle");

    await page.getByLabel("Ajouter une tâche").fill(taskTitle);
    await page.getByRole("button", { name: "Ajouter" }).click();
    await page.getByLabel(`Marquer "${taskTitle}" comme accomplie`).check();

    await expect(hero).toHaveAttribute("data-anim-state", "attack");
    await expect(boss).toHaveAttribute("data-anim-state", "hurt");
    await expect(hero).toHaveAttribute("data-anim-state", "idle", { timeout: 3000 });
    await expect(boss).toHaveAttribute("data-anim-state", "idle", { timeout: 3000 });
  });
});
```

**Le K.O. n'est pas couvert en e2e.** Le compte e2e fixe est partagé et son Boss porte les tâches des autres specs : amener ses HP à 0 de façon fiable demanderait de solder tout l'état du jour, ce que la suite évite précisément (cf. `fullyParallel: false` et le nettoyage par `abandonViaUi`). La séquence mort → slam → overlay est donc validée **manuellement** à l'étape 7 de la Task 4.3, et par les tests unitaires de `CharacterSprite` (« reste figé sur death »).

- [ ] **Step 3 : Lancer la suite complète**

Run: `npm run e2e`
Expected: tous les specs verts, y compris le nouveau. **Si un spec existant échoue, c'est un vrai bug** : la config `reducedMotion: "reduce"` est censée restaurer exactement l'ancien comportement. Ne pas bumper de timeout — chercher le chemin où le gating n'a pas été neutralisé.

- [ ] **Step 4 : Commit**

```bash
git add playwright.config.ts e2e/combat-animations.spec.ts
git commit -m "test: e2e des animations de combat, suite existante en reduced-motion"
```

---

# Phase 5 — Documentation

### Task 5.1 : Docs, changelog, issue

**Files:**
- Modify: `CLAUDE.md`, `ASSETS.md`, `CHANGELOG.md`

- [ ] **Step 1 : `CLAUDE.md`**

Réécrire l'entrée **« Deadlines horaires — détection par polling, pas de replay (US-05) »** : le paragraphe « Pas de replay au chargement » devient une **attaque récapitulative unique** à l'ouverture, jamais une par deadline, et jamais pendant Le Réveil.

Mettre à jour l'entrée **« Roster de Boss & décors dynamiques »** : frames individuelles → spritesheets, `copy-boss-sprites.mjs` ne traite plus que les décors.

Ajouter une nouvelle entrée :

> **Sprites de combat — spritesheets, boîte de recadrage commune et hauteurs figées (issue #48)** — Tous les personnages sont rendus depuis des spritesheets horizontales (`public/sprites/**/anim/<anim>.png`) via `SpriteAnimator` (`steps()` CSS) et `CharacterSprite` (machine à états `idle|attack|hurt|death`) ; `IdleSprite` n'existe plus. La boîte de recadrage d'un personnage est l'**union alpha de toutes ses anims**, jamais par anim — sinon le perso change de taille et de position au démarrage d'une attaque (l'arme déborde du cadre idle). Conséquence : cette boîte est plus haute que l'ancienne boîte idle, donc `renderScale` **doit** se dériver de la table `LEGACY_IDLE_HEIGHTS` (`scripts/build-sprite-sheets.mjs`), mesurée sur les anciennes frames **avant** la migration et figée — la recalculer depuis la nouvelle boîte rétrécirait tous les personnages et annulerait le calibrage de l'issue #74. Un test Vitess (`lib/sprite-metadata.test.ts`) verrouille l'invariant `tileH / renderScale === LEGACY_IDLE_HEIGHTS[slug]`. Les dégâts sont **calés sur la frame d'impact** de l'anim (~280 ms après le clic) et les rafales sont **coalescées** (retrigger frame 0 + somme des dégâts, flush forcé à 1200 ms). Sous `prefers-reduced-motion`, le gating est **désactivé** : jauges, chiffres et `PerfectOverlay` redeviennent instantanés — et `playwright.config.ts` force `reducedMotion: "reduce"` pour toute la suite, ce qui restaure exactement le comportement pré-#48 et évite de retoucher les 24 specs existants (seul `e2e/combat-animations.spec.ts` repasse en `no-preference`). `minotaur` (`mino_v1.1_free`) n'a ni hurt ni death dans son pack : `fallbackHurtDeath` sur son entrée de `lib/bosses.ts` retombe sur l'idle + effet CSS.

Corriger « Vitess » en « Vitest » en écrivant l'entrée.

- [ ] **Step 2 : `ASSETS.md`**

- Section `MC` : remplacer la description du pipeline idle par la nouvelle arborescence `anim/` + `still.png`, mentionner que `copy-hero-sprites.sh` et `trim-hero-idle-frames.mjs` ont disparu.
- Section `Boss` : idem.
- Section `VFX` : nouvelle sous-section « VFX d'impact par héros (issue #48) » avec le tableau de mapping du spec §3.9, et la mention **« licence Frostwindz — accord fourni en `.docx`, non vérifié »** pour les cinq packs concernés ; retirer la ligne `public/vfx/impact/` (Gigapack) si plus aucun usage ne subsiste.

- [ ] **Step 3 : `CHANGELOG.md`**

Sous `## [Unreleased]` :

```markdown
- Animations de combat : le héros attaque avec un effet propre à son élément, le Boss encaisse et meurt, et contre-attaque sur une deadline ratée ou un Rage Quit. Hit-stop, recul, jauge fantôme et « K.O. » qui claque (#48).
```

- [ ] **Step 4 : Vérification finale complète**

Run: `npm run lint && npm test && npx tsc --noEmit && npm run build && npm run e2e`
Expected: tout vert. **Ne pas pousser avant.**

- [ ] **Step 5 : Commit et push**

```bash
git add CLAUDE.md ASSETS.md CHANGELOG.md
git commit -m "docs: animations de combat (issue #48)"
git push -u origin feat/issue-48-animations-combat
```

- [ ] **Step 6 : Ouvrir la PR**

```bash
gh pr create --title "feat: animations de combat (issue #48)" --body "Closes #48. Débloque #135."
```

**Ne pas merger.** Attendre l'accord explicite de l'utilisateur.

---

## Notes pour l'implémenteur

- **Migration Supabase** : aucune. Ce plan ne crée ni ne modifie de table. Inutile de lancer `supabase migration list`.
- **Doc utilisateur (Le Guide / Notion)** : aucune. Aucune règle de jeu ne change — c'est du juice visuel, et la règle projet exclut explicitement la doc utilisateur dans ce cas.
- **Si une anim paraît trop longue ou trop courte en usage réel**, ne pas toucher aux frames : ajuster la constante de durée correspondante dans `lib/combat-animation.ts`. Le pas par frame est dérivé, tous les personnages suivent.
- **Le délai de 1,7 s avant `PerfectOverlay`** (mort + fondu) est un choix produit assumé, à réévaluer après usage réel : supprimer `KO_FADE_MS` du séquencement le ramène à ~1,3 s sans rien casser d'autre.

## Stratégie de branche

Le spec (§12) décrit 5 PRs. Ce plan est écrit pour **une seule branche**, `feat/issue-48-animations-combat`, avec un commit par tâche et une PR unique à la fin — c'est le mode le plus simple pour une exécution pilotée par sous-agents, et les phases restent des points de coupe nets.

Pour revenir à 5 PRs : après la dernière tâche de chaque phase, pousser la branche, ouvrir la PR, et repartir d'une branche fille. Les phases 1 et 2 n'ont **aucun** effet visible (le critère de recette de la phase 2 est justement l'iso-visuel), elles peuvent donc être mergées sans risque de régression perçue.
