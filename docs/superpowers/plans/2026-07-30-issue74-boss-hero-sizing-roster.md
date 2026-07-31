# Issue #74 — Uniformiser taille boss/héros + extension roster — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendre la taille des boss cohérente entre eux, ajuster les tailles héros/boss dans l'Arène, corriger un sprite mal assigné, et ajouter 15 nouveaux boss depuis des packs CraftPix déjà possédés mais inexploités.

**Architecture:** Tout le fix de taille vit dans le pipeline d'extraction de sprites (`scripts/copy-boss-sprites.mjs`), jamais dans le code applicatif — même philosophie que `trim-hero-idle-frames.mjs` (recadrage bbox-union, jamais un facteur d'échelle CSS par boss à maintenir). Le roster (`lib/bosses.ts`) reste un catalogue pur, sans dépendance de rendu. `VersusScene.tsx` ne change que deux valeurs de hauteur CSS.

**Tech Stack:** Node.js (script ESM) + `sharp` pour le traitement d'image, TypeScript pour le catalogue, Vitest pour les tests, Tailwind CSS pour le rendu.

**Spec de référence :** `docs/superpowers/specs/2026-07-30-issue74-boss-hero-sizing-roster-design.md`

## Global Constraints

- Langue d'échange et commentaires : français (termes techniques en anglais si usage naturel du domaine).
- Commits : Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`), description courte.
- `main` protégée : travailler sur une branche `feat/issue-74-taille-boss-heros-roster`.
- Zéro merge si un test Vitest est rouge ou si `npm run build` échoue.
- Ne jamais introduire de champ `scale` par boss dans `lib/bosses.ts` — le fix de taille vit dans le script d'extraction (décision de la spec, section A).
- Tout nom de boss doit passer le test existant `lib/bosses.test.ts` (« aucun nom ne commence par un article » — issue #119).
- `ASSETS.md` et `CLAUDE.md` doivent être mis à jour dans les mêmes commits que les changements de comportement/roster qu'ils documentent (règle du projet, cf. CLAUDE.md § « Règle de mise à jour de ce fichier »).
- Ne jamais faire pointer le code vers `assets/` — uniquement `public/` (convention `ASSETS.md`).

---

### Task 1: Recadrer les frames idle des boss sur leur bbox commune (fix racine de taille)

**Files:**
- Modify: `scripts/copy-boss-sprites.mjs`

**Interfaces:**
- Consumes : rien (script autonome, pas d'import d'autres tâches).
- Produces : chaque dossier `public/sprites/bosses/<slug>/idle/frameNNNN.png` recadré sur la bbox alpha union de ses frames — consommé visuellement par `IdleSprite`/`VersusScene`/`RosterPreview` (aucune interface de code à respecter, juste des fichiers PNG).

- [ ] **Step 1 : créer la branche de travail**

```bash
git checkout -b feat/issue-74-taille-boss-heros-roster
```

- [ ] **Step 2 : mesurer l'état actuel (ratio personnage/canvas) avant fix**

Run:
```bash
node -e "
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const dir = 'public/sprites/bosses';
(async () => {
  for (const slug of fs.readdirSync(dir)) {
    const f = path.join(dir, slug, 'idle', 'frame0000.png');
    if (!fs.existsSync(f)) continue;
    const img = sharp(f);
    const { data, info } = await img.raw().ensureAlpha().toBuffer({ resolveWithObject: true });
    const w = info.width, h = info.height, ch = info.channels;
    let minY = h, maxY = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const a = data[(y * w + x) * ch + 3];
      if (a > 10) { if (y < minY) minY = y; if (y > maxY) maxY = y; }
    }
    console.log(slug.padEnd(18), 'ratio=', ((maxY - minY + 1) / h).toFixed(2));
  }
})();
"
```

Expected : des ratios hétérogènes (0.49 à 0.72, cf. spec section A) — confirme le bug avant de le corriger.

- [ ] **Step 3 : ajouter les helpers de recadrage bbox-union dans le script**

Dans `scripts/copy-boss-sprites.mjs`, insérer ce bloc juste après la fonction `sliceSheet` (après la ligne qui contient `return frames;` de `sliceSheet`, avant `async function exists`) :

```js
// Recadre les frames idle d'un boss sur la bbox alpha UNION de toutes ses
// frames (jamais un trim par frame indépendant, qui désynchroniserait la
// boucle idle) — même technique que scripts/trim-hero-idle-frames.mjs,
// appliquée ici pour que tous les boss aient un ratio personnage/canvas ~1.0
// et s'affichent donc à une taille cohérente une fois rendus à hauteur CSS
// fixe (cf. docs/superpowers/specs/2026-07-30-issue74-boss-hero-sizing-roster-design.md §A).
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

async function trimBossFrames(dir, frameCount) {
  const buffers = [];
  let union = null;
  for (let i = 0; i < frameCount; i++) {
    const file = path.join(dir, `frame${String(i).padStart(4, "0")}.png`);
    const buf = await fs.readFile(file);
    const { data, info } = await sharp(buf)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    buffers.push(buf);
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
  if (!union) return;
  const extract = {
    left: union.left,
    top: union.top,
    width: union.right - union.left + 1,
    height: union.bottom - union.top + 1,
  };
  for (let i = 0; i < frameCount; i++) {
    const file = path.join(dir, `frame${String(i).padStart(4, "0")}.png`);
    await sharp(buffers[i]).extract(extract).toFile(file);
  }
}
```

- [ ] **Step 4 : appeler `trimBossFrames` après chaque extraction/découpe dans la boucle principale**

Remplacer les deux boucles de génération des boss (dans le bloc `const summary = []; ...`) :

```js
const summary = [];
for (const b of FRAME_BOSSES) {
  const count = await extractFrames(b);
  await trimBossFrames(PUB(`sprites/bosses/${b.slug}/idle`), count);
  summary.push([b.slug, count, "frames"]);
}
for (const b of SHEET_BOSSES) {
  const count = await sliceSheet(b);
  await trimBossFrames(PUB(`sprites/bosses/${b.slug}/idle`), count);
  summary.push([b.slug, count, "sheet"]);
}
const bgOut = await extractBackgrounds();
```

- [ ] **Step 5 : exécuter le script**

Run: `node scripts/copy-boss-sprites.mjs`
Expected : la sortie `=== BOSS idle frames ===` liste les 12 boss existants avec leurs comptes de frames inchangés (aucune erreur).

- [ ] **Step 6 : re-mesurer le ratio personnage/canvas après fix**

Run la même commande que Step 2.
Expected : chaque boss affiche un `ratio=` ≥ 0.95 (idéalement 1.00 — une petite marge est possible si le seuil alpha de bordure anti-aliasée coupe 1-2px). Si un boss affiche encore un ratio bas, vérifier que `trimBossFrames` est bien appelée pour son entrée (`FRAME_BOSSES` ou `SHEET_BOSSES`).

- [ ] **Step 7 : commit**

```bash
git add scripts/copy-boss-sprites.mjs public/sprites/bosses
git commit -m "fix: recadrer les frames idle des boss sur leur bbox commune (uniformise leur taille)"
```

---

### Task 2: Corriger le sprite du boss `satyr` (Satyr_2, le vrai satyre)

**Files:**
- Modify: `scripts/copy-boss-sprites.mjs`

**Interfaces:**
- Consumes : `trimBossFrames`/`sliceSheet` de la Task 1 (déjà en place, aucune interface nouvelle).
- Produces : `public/sprites/bosses/satyr/idle/frameNNNN.png` contient désormais le personnage mi-homme mi-bouc au lieu de la femme en robe rouge. `lib/bosses.ts` (id `satyr`, lore déjà correcte) n'a besoin d'aucune modification — seul le contenu des fichiers PNG change, le chemin (`idleFramePrefix`) reste identique.

- [ ] **Step 1 : localiser et corriger l'entrée `satyr` dans `SHEET_BOSSES`**

Dans `scripts/copy-boss-sprites.mjs`, remplacer :

```js
  { slug: "satyr", file: A(`${LB}/Free-Satyr-Sprite-Sheet-Pixel-Art-Pack/Satyr_1/Idle.png`), frames: 7 },
```

par :

```js
  { slug: "satyr", file: A(`${LB}/Free-Satyr-Sprite-Sheet-Pixel-Art-Pack/Satyr_2/Idle.png`), frames: 7 },
```

- [ ] **Step 2 : ré-exécuter le script**

Run: `node scripts/copy-boss-sprites.mjs`
Expected : `satyr: 7 (sheet)` dans la sortie, aucune erreur.

- [ ] **Step 3 : vérifier visuellement le changement**

Run:
```bash
node -e "
const sharp = require('sharp');
sharp('public/sprites/bosses/satyr/idle/frame0000.png').resize(256,256,{kernel:'nearest'}).toFile('satyr-check.png').then(() => console.log('écrit satyr-check.png'));
"
```
Ouvrir `satyr-check.png` (à la racine du repo) et confirmer visuellement la présence de cornes/jambes de chèvre (le vrai satyre), puis supprimer ce fichier de contrôle :

```bash
rm satyr-check.png
```

- [ ] **Step 4 : commit**

```bash
git add scripts/copy-boss-sprites.mjs public/sprites/bosses/satyr
git commit -m "fix: corriger le sprite du boss satyr (Satyr_2, le vrai satyre)"
```

---

### Task 3: Extraire les 15 nouveaux boss depuis les packs CraftPix inexploités

**Files:**
- Modify: `scripts/copy-boss-sprites.mjs`

**Interfaces:**
- Consumes : `trimBossFrames`, `sliceSheet`, `SHEET_BOSSES` (Task 1/2).
- Produces : 15 nouveaux dossiers `public/sprites/bosses/<slug>/idle/frameNNNN.png`, un par id listé ci-dessous — consommés par la Task 4 (`lib/bosses.ts`) via `idleFramePrefix`/`idleFrameCount`.

- [ ] **Step 1 : ajouter les 15 entrées à `SHEET_BOSSES`**

Dans `scripts/copy-boss-sprites.mjs`, juste avant la ligne `];` qui ferme le tableau `SHEET_BOSSES`, ajouter :

```js
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
```

- [ ] **Step 2 : exécuter le script**

Run: `node scripts/copy-boss-sprites.mjs`
Expected : les 15 nouveaux slugs apparaissent dans `=== BOSS idle frames ===` avec les comptes de frames ci-dessus (`sheet`), sans erreur `SKIP` ni exception.

- [ ] **Step 3 : vérifier que le compte de frames mesuré (1280px/128) est correct pour les 3 minotaures low-boss**

Run:
```bash
node -e "
const fs = require('fs');
for (const slug of ['minotaur-warrior', 'minotaur-ardent', 'minotaur-occult']) {
  const files = fs.readdirSync('public/sprites/bosses/' + slug + '/idle');
  console.log(slug, files.length, 'fichiers');
}
"
```
Expected : `10 fichiers` pour chacun des trois. Si un compte diffère, ouvrir une frame médiane à l'œil (`node -e "require('sharp')('public/sprites/bosses/minotaur-warrior/idle/frame0005.png').resize(256,256,{kernel:'nearest'}).toFile('check.png')"` puis ouvrir `check.png`) pour confirmer que le personnage n'est pas coupé en deux ; ajuster `frames` dans `SHEET_BOSSES` si besoin et refaire Step 2.

- [ ] **Step 4 : nettoyer les fichiers de contrôle éventuels et commit**

```bash
rm -f check.png
git add scripts/copy-boss-sprites.mjs public/sprites/bosses
git commit -m "feat: extraire 15 nouvelles variantes de boss depuis les packs CraftPix inexploités"
```

---

### Task 4: Ajouter les 15 nouveaux boss au catalogue `lib/bosses.ts`

**Files:**
- Modify: `lib/bosses.ts`
- Test: `lib/bosses.test.ts` (existant, non modifié — couvre déjà génériquement tout `BOSSES`)

**Interfaces:**
- Consumes : `boss(id, name, idleFrameCount, lore, backgroundThemes, flip = false)` (fonction déjà définie dans `lib/bosses.ts`, inchangée) ; les dossiers `public/sprites/bosses/<slug>/idle/` produits par la Task 3.
- Produces : `BOSSES` (tableau exporté) contient 27 entrées. Consommé par `pickDailyBoss`/`pickBackgroundId` (inchangés) et par tout composant impliquant le roster (`RosterPreview`, `Arena` via `resolveDailyBoss`).

- [ ] **Step 1 : lancer les tests existants avant modification (référence verte)**

Run: `npx vitest run lib/bosses.test.ts`
Expected : PASS (4 tests dans `describe("catalogue boss (intégrité)")`, 4 dans `pickDailyBoss`, 2 dans `pickBackgroundId`).

- [ ] **Step 2 : ajouter les 15 entrées dans `lib/bosses.ts`**

Dans `lib/bosses.ts`, juste avant la ligne `];` qui ferme le tableau `BOSSES`, ajouter :

```ts
  boss("temptress", "Tentatrice", 7,
    "Voix charmeuse qui jure qu'un jour de repos ne changera rien.",
    ["castle-interior", "steampunk-cityscape"], true),
  boss("idler", "Flâneuse", 6,
    "Ne presse jamais rien, et voudrait bien que tu fasses pareil.",
    ["steampunk-cityscape", "desert-oasis"], true),
  boss("jaded", "Blasé", 6,
    "Plus rien ne l'étonne, plus rien ne presse — modèle dangereux à suivre.",
    ["steampunk-cityscape"], true),
  boss("procrastinator", "Ajourneuse", 6,
    "Garde toujours un « demain » tout prêt au bord des lèvres.",
    ["steampunk-cityscape"], true),
  boss("dock-corpse", "Cadavre des Docks", 7,
    "Traîné jusqu'aux quais par une routine qui ne finit jamais.",
    ["steampunk-cityscape"], true),
  boss("gorgon-ivory", "Gorgone d'Ivoire", 7,
    "Regard pétrifiant, teint pâle des cryptes oubliées.",
    ["ancient-temple", "desert-oasis", "underwater-world"], true),
  boss("gorgon-scarlet", "Gorgone Écarlate", 7,
    "Femme-serpent aux écailles rouges, née des braises anciennes.",
    ["ancient-temple", "desert-oasis", "underwater-world"], true),
  boss("accomplice", "Complice", 7,
    "Ne dirige rien, ne décide rien — suit, comme toi tu remets à plus tard.",
    ["steampunk-cityscape"], true),
  boss("mob-baron", "Baron", 7,
    "Costume impeccable, mains propres : la procrastination qui a l'air productive.",
    ["steampunk-cityscape"], true),
  boss("knight-amethyst", "Chevalier Améthyste", 4,
    "Ancien duelliste pétrifié dans son armure, fier et immobile.",
    ["castle-interior", "mountain-peak"], true),
  boss("knight-garnet", "Chevalier Grenat", 4,
    "Garde écarlate d'une forteresse qui n'existe plus.",
    ["castle-interior", "mountain-peak"], true),
  boss("wandering-mage", "Sorcier Errant", 8,
    "Mage sans but, économe de ses sorts comme toi de ton énergie.",
    ["mountain-peak", "crystal-cave"], true),
  boss("minotaur-warrior", "Minotaure Belliqueux", 10,
    "Bête cornue, lame en main, née pour ne jamais reculer.",
    ["ancient-temple", "castle-interior", "desert-oasis"], true),
  boss("minotaur-ardent", "Minotaure Ardent", 10,
    "Bête cornue à la hache, forgée dans les braises du labyrinthe.",
    ["ancient-temple", "castle-interior", "desert-oasis"], true),
  boss("minotaur-occult", "Minotaure Occulte", 10,
    "Bête cornue aux rites anciens, gardienne des passages secrets.",
    ["ancient-temple", "castle-interior", "desert-oasis", "crystal-cave"], true),
```

Si la Task 3 (Step 3) a révélé un compte de frames différent de 10 pour les trois minotaures low-boss, utiliser la valeur réelle mesurée ici plutôt que 10.

- [ ] **Step 3 : lancer les tests**

Run: `npx vitest run lib/bosses.test.ts`
Expected : PASS. Le test « ids de boss uniques » vérifie l'absence de collision avec les 12 ids existants ; « aucun nom ne commence par un article » vérifie les 15 nouveaux noms ; « chaque thème a au moins une variante » vérifie les `backgroundThemes` utilisés ci-dessus contre `lib/backgrounds.ts` (tous déjà catalogués, aucune nouvelle variante de décor à créer).

- [ ] **Step 4 : lancer toute la suite Vitest pour détecter une régression ailleurs (ex. `RosterPreview`, `Arena`)**

Run: `npm test`
Expected : PASS (aucun autre test ne fige le nombre de boss à 12).

- [ ] **Step 5 : commit**

```bash
git add lib/bosses.ts
git commit -m "feat: ajouter 15 nouveaux boss au roster (lib/bosses.ts)"
```

---

### Task 5: Ajuster les tailles héros/boss dans l'Arène

**Files:**
- Modify: `components/combat/VersusScene.tsx:121-133`

**Interfaces:**
- Consumes : `IdleSprite` (`components/combat/IdleSprite.tsx`, inchangé — accepte `className` en prop).
- Produces : aucune nouvelle interface, changement de rendu uniquement.

- [ ] **Step 1 : modifier la hauteur du sprite héros**

Dans `components/combat/VersusScene.tsx`, remplacer :

```tsx
      <IdleSprite
        framePrefix={heroFramePrefix}
        frameCount={heroFrameCount}
        alt={`Ton héros : ${heroName}`}
        className="absolute bottom-2 left-4 h-28 w-auto [image-rendering:pixelated] drop-shadow-[0_4px_8px_rgba(0,0,0,0.6)]"
      />
```

par :

```tsx
      <IdleSprite
        framePrefix={heroFramePrefix}
        frameCount={heroFrameCount}
        alt={`Ton héros : ${heroName}`}
        className="absolute bottom-2 left-4 h-[88px] w-auto [image-rendering:pixelated] drop-shadow-[0_4px_8px_rgba(0,0,0,0.6)]"
      />
```

- [ ] **Step 2 : modifier la hauteur du sprite boss**

Dans le même fichier, remplacer :

```tsx
      <IdleSprite
        framePrefix={bossFramePrefix}
        frameCount={bossFrameCount}
        flip={bossFlip}
        alt={`Le Boss du jour : ${bossName}`}
        className="absolute bottom-2 right-4 h-28 w-auto [image-rendering:pixelated] drop-shadow-[0_4px_8px_rgba(0,0,0,0.6)]"
      />
```

par :

```tsx
      <IdleSprite
        framePrefix={bossFramePrefix}
        frameCount={bossFrameCount}
        flip={bossFlip}
        alt={`Le Boss du jour : ${bossName}`}
        className="absolute bottom-2 right-4 h-24 w-auto [image-rendering:pixelated] drop-shadow-[0_4px_8px_rgba(0,0,0,0.6)]"
      />
```

- [ ] **Step 3 : lancer le serveur de dev et vérifier visuellement dans le navigateur**

Run: `npm run dev`
Ouvrir l'Arène (page d'accueil authentifiée) et confirmer :
- le héros paraît plus petit qu'avant (78.6% de sa taille précédente),
- le héros est légèrement plus petit que le boss, pas radicalement,
- rien ne déborde ni ne se chevauche dans le bandeau HP/XP au-dessus.

Arrêter le serveur (`Ctrl+C`) une fois vérifié.

- [ ] **Step 4 : commit**

```bash
git add components/combat/VersusScene.tsx
git commit -m "fix: ajuster les tailles héros/boss dans l'Arène (héros 88px, boss 96px)"
```

---

### Task 6: Mettre à jour la documentation (ASSETS.md, CLAUDE.md, CHANGELOG.md)

**Files:**
- Modify: `ASSETS.md`
- Modify: `CLAUDE.md`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes : rien (tâche documentaire).
- Produces : rien consommé par du code — respecte la règle projet de mise à jour de la documentation dans le même chantier que le changement de comportement.

- [ ] **Step 1 : mettre à jour la table du roster dans `ASSETS.md`**

Dans `ASSETS.md`, section « 2. `assets/Boss` — Boss quotidiens », dans le paragraphe « **Intégration Roster (fait)** », remplacer la phrase :

```
**Intégration Roster (fait)** — 12 boss câblés dans le jeu via `scripts/copy-boss-sprites.mjs` → `public/sprites/bosses/<slug>/idle/frameNNNN.png` (base 0, 4 chiffres), consommés par `IdleSprite`, catalogués dans `lib/bosses.ts`. Boss "réels" (frost-guardian, demon-slime, cthulhu, minotaur) = copie de frames individuelles ; "low boss" (satyr, urban-zombie, mushroom, gorgon, fire-wizard, lightning-mage, gangster, knight) = **découpe de spritesheet** `Idle.png` (frames explicites par pack : satyr/gorgon/wizards 7, zombie/gangster 6, mushroom 8 en 70×64, knight 4 via la variante `Spritesheet 128`). Golem (non taggé) et mino low-boss (redondant avec le mino réel 16 frames) **écartés**. Chaque boss a un `flip` d'orientation (à confirmer visuellement). Tirage quotidien : cf. piège « Roster de Boss » dans `CLAUDE.md`.
```

par :

```
**Intégration Roster (fait, issue #74)** — 27 boss câblés dans le jeu via `scripts/copy-boss-sprites.mjs` → `public/sprites/bosses/<slug>/idle/frameNNNN.png` (base 0, 4 chiffres), consommés par `IdleSprite`, catalogués dans `lib/bosses.ts`. Boss "réels" (frost-guardian, demon-slime, cthulhu, minotaur) = copie de frames individuelles ; "low boss" (les 23 autres) = **découpe de spritesheet** `Idle.png` (tuile 128px quasi systématique dans cette famille de packs, sauf mushroom en 70×64/8 frames et le Golem non taggé, toujours écarté). Chaque frame idle est ensuite **recadrée sur la bbox alpha union de toutes ses frames** (`trimBossFrames`, même technique que `scripts/trim-hero-idle-frames.mjs` pour les héros) — sans ce recadrage, le ratio personnage/canvas variait de 0.49 à 0.72 selon le pack source, donnant à chaque boss une taille visuelle différente à hauteur CSS fixe (bug résolu par l'issue #74). Le pack minotaure "low boss" (Minotaur_1/2/3, distinct du minotaure réel `mino_v1.1_free`), auparavant écarté par redondance perçue, fournit finalement 3 boss à part (`minotaur-warrior`/`minotaur-ardent`/`minotaur-occult`). Chaque boss a un `flip` d'orientation (à confirmer visuellement, hérité du sibling du même pack pour les 15 boss ajoutés par l'issue #74). Tirage quotidien : cf. piège « Roster de Boss » dans `CLAUDE.md`.
```

- [ ] **Step 2 : documenter le fix du sprite satyr dans `ASSETS.md`**

Toujours dans `ASSETS.md`, ajouter juste après le paragraphe modifié au Step 1 :

```
**Fix sprite satyr (issue #74)** — le boss `satyr` pointait vers `Satyr_1` (une femme humaine en robe, pas un satyre) au lieu de `Satyr_2` (le vrai personnage mi-homme mi-bouc). Corrigé dans `copy-boss-sprites.mjs` ; les deux sprites humains du pack (`Satyr_1`, `Satyr_3`) sont réutilisés comme boss à part (`temptress`, `idler`) plutôt que perdus — cohérent avec le lore « Le Démon Intérieur » (issue #51), où le Boss n'a pas besoin d'être un monstre.
```

- [ ] **Step 3 : mettre à jour l'entrée « Roster de Boss & décors dynamiques » dans `CLAUDE.md`**

Dans `CLAUDE.md`, section « Pièges et décisions non-évidentes », trouver le paragraphe commençant par **« Roster de Boss & décors dynamiques »**. Ajouter à la fin de ce paragraphe (avant le `---` suivant) :

```
**Mise à jour issue #74 (2026-07-30)** : le roster passe de 12 à 27 boss (15 ajouts depuis des variantes de packs CraftPix jusque-là inexploitées, + 1 fix : `satyr` pointait vers un sprite humain au lieu du vrai satyre). Chaque frame idle de boss est désormais recadrée sur sa bbox alpha union (`trimBossFrames` dans `copy-boss-sprites.mjs`) pour uniformiser le ratio personnage/canvas entre tous les boss — sans ce recadrage, ce ratio variait de 0.49 à 0.72 selon le pack source, donnant à chaque boss une taille visuelle différente à hauteur CSS fixe. Les hauteurs de rendu dans `VersusScene.tsx` sont passées de `h-28` (112px, héros et boss) à `h-[88px]` (héros) / `h-24` (96px, boss) pour répondre à un retour utilisateur (héros trop grand sur mobile) tout en gardant le héros « à peine » plus petit que le boss.
```

- [ ] **Step 4 : ajouter une ligne au `CHANGELOG.md`**

Dans `CHANGELOG.md`, sous la section `## [Unreleased]` (la créer en tête de fichier si elle n'existe pas encore), ajouter :

```
- feat: 15 nouveaux boss dans le roster quotidien, tailles boss/héros uniformisées dans l'Arène (issue #74)
```

- [ ] **Step 5 : commit**

```bash
git add ASSETS.md CLAUDE.md CHANGELOG.md
git commit -m "docs: documenter l'extension du roster et le fix de taille des boss (issue #74)"
```

---

### Task 7: Vérification finale et gate de merge

**Files:**
- Aucun fichier modifié (tâche de vérification uniquement).

**Interfaces:**
- Consumes : l'ensemble des changements des Tasks 1 à 6.
- Produces : confirmation que le travail respecte les règles de merge du projet (CLAUDE.md § Workflow Git).

- [ ] **Step 1 : lancer la suite Vitest complète**

Run: `npm test`
Expected : tous les tests PASS, y compris `lib/bosses.test.ts` et `lib/backgrounds.test.ts` (si présent).

- [ ] **Step 2 : lancer le lint**

Run: `npm run lint`
Expected : aucune erreur.

- [ ] **Step 3 : lancer le build de production**

Run: `npm run build`
Expected : build réussi, sans erreur TypeScript ni erreur de build Next.js.

- [ ] **Step 4 : vérification visuelle du roster complet via l'écran de test interne**

Run: `npm run dev`, se connecter, ouvrir `/roster-preview-8f3a2c9d`.
Pour chacun des 15 nouveaux boss (`temptress`, `idler`, `jaded`, `procrastinator`, `dock-corpse`, `gorgon-ivory`, `gorgon-scarlet`, `accomplice`, `mob-baron`, `knight-amethyst`, `knight-garnet`, `wandering-mage`, `minotaur-warrior`, `minotaur-ardent`, `minotaur-occult`) et pour `satyr` (sprite corrigé) :
- confirmer que le personnage occupe bien toute la hauteur de la vignette (plus de marge transparente visible autour, signe que le recadrage Task 1 a fonctionné),
- basculer le bouton « flip » pour vérifier l'orientation correcte (le personnage doit regarder vers la gauche, comme tous les boss existants) — si `flip: ON` (catalogue) fait regarder le personnage à droite, inverser la valeur `flip` de ce boss dans `lib/bosses.ts` et refaire ce commit,
- vérifier que les décors en surbrillance (★) correspondent bien au thème/lore du boss.

Si un `flip` doit être corrigé :

```bash
git add lib/bosses.ts
git commit -m "fix: corriger l'orientation flip de <slug> (vérification visuelle roster-preview)"
```

- [ ] **Step 5 : vérification manuelle de la taille héros/boss dans l'Arène (mobile)**

Dans le navigateur (toujours `npm run dev`), réduire la fenêtre à une largeur mobile (ou utiliser les devtools en mode responsive, ~375px) et ouvrir l'Arène :
- le héros doit paraître nettement plus compact qu'avant le chantier, sans donner l'impression d'écraser le décor,
- le héros doit rester légèrement plus petit que le boss, pas égal ni beaucoup plus petit.

Arrêter le serveur une fois vérifié.

- [ ] **Step 6 : résumé pour la Pull Request**

Ne pas pousser ni ouvrir de PR sans confirmation explicite (règle globale du projet : jamais de push/PR/merge sans validation). Une fois les Steps 1 à 5 validés, informer l'utilisateur que la branche `feat/issue-74-taille-boss-heros-roster` est prête, avec un résumé : fix de taille des boss (Task 1), fix du sprite satyr (Task 2), 15 nouveaux boss (Task 3+4), tailles héros/boss ajustées (Task 5), docs à jour (Task 6), tests/lint/build verts (Task 7).
