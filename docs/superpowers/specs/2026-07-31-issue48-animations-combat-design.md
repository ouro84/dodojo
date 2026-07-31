# Animations de combat — issue #48

> Date : 2026-07-31
> Issue : #48 « animations »
> Suite hors périmètre : #135 (intro VS / FIGHT!)
> Statut : design validé, prêt pour plan d'implémentation

---

## 1. Intention

L'Arène est aujourd'hui statique : héros et Boss jouent une boucle `idle`, et tout le feedback de combat passe par des effets périphériques (shake d'écran, flash, `FloatingText`, un VFX de slash générique au centre de la scène). Aucun personnage ne bouge quand un coup part.

L'issue #48 demande trois choses :

1. Cocher une tâche → **attaque du héros** + **VFX d'impact propre au héros** + **hurt du Boss**.
2. Abandonner une tâche ou dépasser une deadline → **attaque du Boss** + **hurt du héros**.
3. Boss vaincu → **animation de mort du Boss**.

Le cadre esthétique est explicitement **arcade / VS fighting** (cf. `PRODUCT.md`, juice type Street Fighter). Trois mécaniques du genre sont donc ajoutées au-delà de la demande brute : hit-stop, jauge fantôme, et « K.O. » + état danger (§7).

---

## 2. Décisions actées

| Sujet | Décision | Conséquence |
|---|---|---|
| Timing des dégâts | La jauge, le nombre flottant et les VFX tombent à la **frame d'impact** de l'anim d'attaque (~280 ms), pas au clic | L'anim pilote le ressenti ; le gating doit être neutralisé sous `prefers-reduced-motion` (§9) |
| Rafale | **Retrigger + coalesce** : un nouveau coup relance l'anim à la frame 0 et additionne les dégâts en attente ; un seul impact | Jamais de file qui prend du retard sur les clics |
| Variété d'attaque | Tirage parmi `1_atk`/`2_atk`/`3_atk` ; `sp_atk` réservée au coup fatal et aux combos ≥ ×3 | 4 anims d'attaque à extraire par héros |
| Déclencheurs de l'attaque Boss | Les 4 : deadline franchie en direct, Rage Quit, deadlines déjà ratées au chargement, fin du Réveil | **Revient sur la décision « pas de replay au chargement » de `CLAUDE.md` (US-05)** |
| K.O. | Mort complète (1000 ms) + fondu (400 ms) **puis** `PerfectOverlay` | ~1,7 s entre le coup fatal et l'overlay |
| VFX d'impact | Pool par héros (mapping de l'issue), joué **sur le Boss** | Les 4 slashs génériques de `ImpactVfx` sont retirés |
| Format de rendu | **Spritesheets partout**, migration complète, `IdleSprite` supprimé | `/api/share-card` bascule sur un `still.png` (Satori ne sait pas faire de `steps()`) |

---

## 3. Pipeline d'assets

### 3.1 Script unique

`scripts/build-sprite-sheets.mjs` prend en charge **tous les personnages** (7 héros + 27 boss) et produit des spritesheets horizontales.

Scripts retirés / modifiés :

| Fichier | Devenir |
|---|---|
| `scripts/copy-hero-sprites.sh` | **Supprimé** (absorbé) |
| `scripts/trim-hero-idle-frames.mjs` | **Supprimé** (absorbé) |
| `scripts/copy-boss-sprites.mjs` | Ne garde **que** la partie décors (`BG_THEMES`, `bgSource`) ; les listes `FRAME_BOSSES`/`SHEET_BOSSES` migrent vers le nouveau script |
| `scripts/generate-hero-skins.mjs` | Recolorise des **feuilles** au lieu de frames (algorithme par pixel inchangé, calibration Tier A/B/C de l'US-53 inchangée) |
| `scripts/generate-hero-portraits.mjs` | Source = `still.png` au lieu de `idle/frame0000.png` |

### 3.2 Arborescence produite

```
public/sprites/mc/<slug>/anim/{idle,atk1,atk2,atk3,sp_atk,take_hit}.png
public/sprites/mc/<slug>/still.png
public/sprites/mc/<slug>/portrait.png                       (inchangé, régénéré)
public/sprites/mc/<slug>/skins/<skin_id>/anim/{...}.png
public/sprites/mc/<slug>/skins/<skin_id>/still.png
public/sprites/bosses/<slug>/anim/{idle,attack,hurt,death}.png
public/sprites/bosses/<slug>/still.png
public/vfx/hero/<hero_slug>/<variant>.png
lib/sprite-metadata.generated.json                          (committé)
```

Les anciens dossiers `public/sprites/**/idle/frameNNNN.png` et `public/vfx/impact/**` sont supprimés.

### 3.3 Boîte de recadrage commune — piège central

`trim-hero-idle-frames.mjs` et `trimBossFrames` recadrent aujourd'hui sur la bbox alpha **union des frames d'idle uniquement**. Recadrer chaque nouvelle anim sur sa propre bbox ferait changer le personnage de taille **et** de position au démarrage d'une attaque (l'arme déborde largement du cadre idle).

Règle : **une seule boîte de recadrage par personnage, union alpha de toutes les frames de toutes ses anims retenues.** Jamais par anim, jamais par frame.

### 3.4 Conservation des tailles de l'issue #74 — piège critique

L'issue #74 a calibré les tailles à l'écran (`h-[88px]` héros / `h-24` boss) sur des boîtes idle hétérogènes, et `fire-knight` n'est **pas** dans la liste de `trim-hero-idle-frames.mjs` (il a été rogné à la main, frames ~58×44, avant que ce script existe). Élargir la boîte de recadrage change mécaniquement le ratio personnage/canvas de chaque perso, donc sa taille apparente à hauteur CSS fixe.

Procédure obligatoire, **dans cet ordre** :

1. **Avant toute régénération**, mesurer la hauteur en pixels de `public/sprites/mc/<slug>/idle/frame0000.png` et `public/sprites/bosses/<slug>/idle/frame0000.png` pour les 34 personnages.
2. Figer ces valeurs dans une constante `LEGACY_IDLE_HEIGHTS` committée dans `build-sprite-sheets.mjs`, avec un commentaire expliquant qu'elles sont la **référence de non-régression visuelle de l'issue #74** et ne doivent jamais être recalculées depuis la nouvelle boîte.
3. Dériver `renderScale = tileH / LEGACY_IDLE_HEIGHTS[slug]`.

Un test Vitest verrouille l'invariant (§9).

### 3.5 Métadonnées générées

`lib/sprite-metadata.generated.json`, importé par `lib/heroes.ts` / `lib/bosses.ts` (qui restent purs et testables) :

Valeurs ci-dessous purement illustratives — toutes sont mesurées par le script, aucune n'est à recopier :

```jsonc
{
  "heroes": {
    "fire-knight": {
      "tileW": 96,
      "tileH": 72,
      "renderScale": 1.35,      // tileH / LEGACY_IDLE_HEIGHTS["fire-knight"]
      "groundOffset": 0.04,     // (basUnion − basIdle) / tileH, fraction de la tuile
      "anims": {
        "idle":     { "frames": 8,  "impactFrame": null },
        "atk1":     { "frames": 11, "impactFrame": 4 },
        "atk2":     { "frames": 19, "impactFrame": 8 },
        "atk3":     { "frames": 28, "impactFrame": 11 },
        "sp_atk":   { "frames": 18, "impactFrame": 8 },
        "take_hit": { "frames": 6,  "impactFrame": null }
      }
    }
  },
  "bosses": { /* même forme, anims idle|attack|hurt|death */ },
  "vfx":    { "fire-knight": { "slash1": { "frames": 7, "tileW": 128, "tileH": 128 } } }
}
```

Les **tenues réutilisent les métadonnées de leur héros** : le recolor ne modifie aucun canal alpha, donc la boîte est identique.

`impactFrame` par défaut = `round(frames × 0.4)`, surchargeable par une table `IMPACT_FRAME_OVERRIDES` dans le script. L'écran interne `app/roster-preview-8f3a2c9d/page.tsx` est étendu pour rejouer chaque anim au ralenti et caler ces valeurs à l'œil avant merge.

### 3.6 Comptes de frames déduits, pas codés en dur

Pour les 23 « low boss », la largeur de tuile est déjà connue via l'idle (`largeurIdle / framesIdle` — 128 px partout sauf `mushroom` en 70). Pour toute autre feuille du même pack : `frames = largeur / largeurTuile`, avec `assert(largeur % largeurTuile === 0)`. Le script **échoue bruyamment** plutôt que de produire des frames décalées.

### 3.7 Résolution des noms de fichiers

Les packs sont incohérents. Le script résout par **liste de candidats**, premier trouvé :

| Anim | Candidats |
|---|---|
| attack | `Attack_1.png`, `Attack 1.png`, `Attack.png`, `<Nom>-Attack.png` |
| hurt | `Hurt.png`, `Hit.png`, `<Nom>-Hit.png` |
| death | `Dead.png`, `Die.png`, `<Nom>-Die.png` |

Boss à frames individuelles (chemins vérifiés) :

| Boss | idle | attack | hurt | death |
|---|---|---|---|---|
| `frost-guardian` | `idle` | `1_atk` | `take_hit` | `death` |
| `demon-slime` | `01_demon_idle` | `03_demon_cleave` | `04_demon_take_hit` | `05_demon_death` |
| `cthulhu` | `idle` | `1atk` | `hurt` | `death` |
| `minotaur` | `idle` | `atk_1` | **absent** | **absent** |

`minotaur` (`mino_v1.1_free`) porte `fallbackHurtDeath: true` dans `lib/bosses.ts` : hurt = flash blanc sur l'idle (réutilise `hit-flash`), death = fondu d'opacité + descente CSS de 8 px sur 1000 ms. Aucun autre boss n'est concerné — les 23 « low boss » et les 3 autres « réels » ont leurs feuilles.

### 3.8 Tri numérique des frames — piège

Les frames des packs héros et VFX sont **1-indexées et non zero-paddées** (`warrior_skill1_frame1.png`, `..._frame10.png`). Un tri lexical donne `1, 10, 11, 2, 3…` et produit une animation dans le désordre. **Tri numérique obligatoire** (extraction du suffixe entier), pour toutes les sources.

### 3.9 Mapping VFX par héros

Chemins vérifiés dans `assets/VFX/`. Une variante est tirée au hasard à chaque coup.

| Héros | Variantes |
|---|---|
| `fire_knight` | `Pixel Art Animations - Slashes/128x128/Slash 1\|Slash 2\|Slash 3/color2` (rouge) |
| `water_priestess` | `Pixel Art VFX - Frost Knight - FREE Version/VFX1\|VFX2\|VFX3`, `animated-explosion-sprite-pack/PNG/Explosion_8` |
| `wind_hashashin` | `Pixel Art Animations - Warrior (FREE)/VFX 4`, `Pixel Art VFX - Rogue - FREE Version/VFX1\|VFX2`, `animated-explosion-sprite-pack/PNG/Explosion_6` |
| `metal_bladekeeper` | `Pixel Art Animations - Warrior (FREE)/VFX 1`, `Pixel Art Skill Animations - Lightning/VFX4` |
| `ground_monk` | `animated-explosion-sprite-pack/PNG/Explosion_4/2`, `.../Explosion_3`, `.../Explosion_2` |
| `leaf_ranger` | `Pixel Art VFX - Rogue - FREE Version/VFX3\|VFX4\|VFX5` |
| `crystal_mauler` | `Pixel Art Animations - Warrior (FREE)/VFX 5`, `Pixel Art Skill Animations - Lightning/VFX3` |

**Toujours reconstruire la feuille depuis le dossier `Frames/`** (ou `frames/`) du pack, jamais réutiliser le `sprite-sheet.png` fourni : sa disposition (grille, padding) n'est pas garantie horizontale.

### 3.10 Licences

Les cinq packs Frostwindz (`Slashes`, `Warrior`, `Lightning`, `Frost Knight`, `Rogue`) livrent leur licence en `.docx` non lisible automatiquement. À recenser dans `ASSETS.md` comme **« licence Frostwindz — accord fourni en .docx, non vérifié »**, au même rang que les autres entrées non documentées. `animated-explosion-sprite-pack` : licence à vérifier également. Le Gigapack (attribution obligatoire) n'est plus utilisé une fois `public/vfx/impact/` retiré — supprimer aussi `GIGAPACK-LICENSE.txt` s'il ne sert plus, ou le conserver si un autre usage subsiste.

---

## 4. Rendu

### 4.1 Composants

`IdleSprite` est supprimé. Deux composants le remplacent :

**`components/combat/SpriteAnimator.tsx`** — rend **une** anim depuis une feuille.

```
Props : sheetSrc, frames, tileW, tileH, renderedHeight, loop, durationMs,
        flip?, frozen?, impactFrame?, onImpact?, onEnd?
```

- Un `div` de dimensions `renderedHeight × (renderedHeight × tileW / tileH)`, `background-image: url(sheetSrc)`, `background-size: (frames × 100%) 100%`, `image-rendering: pixelated`.
- Animation CSS partagée `@keyframes sprite-run { from { background-position-x: 0 } to { background-position-x: var(--sprite-end) } }` avec `animation-timing-function: steps(frames)` et `--sprite-end` = `calc(-1 * frames * 100%)`.
- `loop: false` → `animation-fill-mode: forwards` + `onEnd` via timeout aligné sur `durationMs`.
- `frozen: true` → `animation-play-state: paused` (support du hit-stop, §7.1).
- `onImpact` déclenché par timeout à `impactFrame / frames × durationMs`.

**`components/combat/CharacterSprite.tsx`** — machine à états au-dessus.

```
Props : characterKind ('hero'|'boss'), spriteBase, metadata, baseHeight,
        state ('idle'|'attack'|'hurt'|'death'), stateKey, attackAnim?,
        flip?, frozen?, danger?, onImpact?, onStateEnd?
```

- Une anim non bouclée terminée → retour automatique à `idle`. `death` reste figée sur sa dernière frame.
- `stateKey` (nonce) : incrémenter relance la même anim à la frame 0 (retrigger de rafale).
- Géométrie : `renderedHeight = baseHeight × renderScale`, `transform: translateY(groundOffset × renderedHeight)` (plus `scaleX(-1)` si `flip`). Cette formule garantit que la ligne de sol de l'idle reste exactement où elle est aujourd'hui.
- Expose `data-anim-state` (valeur de `state`) pour les assertions e2e.

### 4.2 Durées

Durées **par catégorie**, pas par frame : le pas est dérivé (`frameMs = durée / frames`). `3_atk` (28 frames) et `1_atk` (11 frames) durent donc pareil, et tous les héros ont le même rythme quel que soit leur pack source.

| Anim | Durée | Boucle |
|---|---|---|
| `idle` | 120 ms/frame | ✅ |
| attaque (`atk1/2/3`, `attack` boss) | 600 ms | ❌ |
| `sp_atk` | 800 ms | ❌ |
| `hurt` / `take_hit` | 350 ms | ❌ |
| `death` | 1000 ms | ❌ (fige la dernière frame) |

### 4.3 Sites de rendu migrés

| Site | Hauteur de base | Note |
|---|---|---|
| `VersusScene` héros | 88 px | `h-[88px]` actuel |
| `VersusScene` boss | 96 px | `h-24` actuel |
| `RosterPreview` | 88 / 96 px | Étendu pour rejouer chaque anim (§3.5) |
| `SkinsPreview` | 96 px | `h-24` |
| `HeroIdle` (boutique + onboarding) | 112 px | `className="h-28"` converti en `baseHeight={112}` explicite |

`/api/share-card/route.tsx` : `${hero.idleFramePrefix}0000.png` → `${spriteBase}/still.png`. `portrait.png` inchangé côté consommateurs (`CharacterSelect`, `OnboardingAvatarPicker`), simplement régénéré.

### 4.4 Impact sur les types et catalogues

`Hero.idleFramePrefix` / `Hero.idleFrameCount` et leurs équivalents `Boss` disparaissent de `types/index.ts` au profit d'un `spriteBase` (chemin de dossier). Les frames et les tailles se lisent dans `lib/sprite-metadata.generated.json`. `getHeroSpritePrefix` (`lib/hero-skins.ts`) devient `getHeroSpriteBase`. Tests à mettre à jour : `lib/heroes.test.ts`, `lib/bosses.test.ts`, `lib/hero-skins.test.ts`.

---

## 5. Séquencement — coup du héros

1. **Clic** sur la case d'une tâche. Ligne barrée immédiatement (optimistic UI inchangé), `pendingDamage` accumulé, anim d'attaque lancée à la frame 0.
2. **Choix de l'anim** : `sp_atk` si le coup est fatal (`nextHp === 0`) ou si `comboCount ≥ 3` ; sinon tirage uniforme parmi `atk1`/`atk2`/`atk3`.
3. **Frame d'impact** : dégâts appliqués à la jauge, `FloatingText` `-X`, `FloatingText` XP, VFX du héros joué **sur le Boss**, shake `.is-hit`, `.hit-flash-overlay`, hit-stop (§7.1), recul du Boss (§7.1).
4. **Boss** : `hurt` (350 ms), **sauf coup fatal** où il enchaîne directement `death` sans hurt.
5. **Retour idle** des deux personnages.

### 5.1 Coalescing

`pendingDamage` en `useRef`. Un nouveau coup pendant une anim : incrémente `stateKey` (relance frame 0), additionne les dégâts, reprogramme le timer d'impact.

Garde-fou : **flush forcé 1200 ms après le premier coup en attente**, pour qu'un spam continu ne repousse jamais l'impact indéfiniment.

### 5.2 Placement du VFX

`components/combat/ImpactVfx.tsx` est **remplacé** par `components/combat/HeroVfx.tsx` : même principe de flipbook, mais alimenté par une feuille (`SpriteAnimator`) et par le pool du héros équipé au lieu des 4 slashs génériques. Positionné en absolu, centré sur le sprite du Boss, hauteur = `1,2 × hauteur rendue du Boss`, `image-rendering: pixelated`, `z-index` au-dessus des sprites et sous les jauges — au lieu du centre de scène actuel.

Le préchargement de `IMPACT_VARIANTS` au montage de `VersusScene` (`useEffect` qui instancie 28 `new window.Image()`) disparaît : une feuille par variante rend le préchargement par frame inutile. Précharger au montage les feuilles du héros équipé et du boss du jour suffit.

---

## 6. Séquencement — attaque du Boss

Une seule attaque Boss à la fois. Si une anim de héros est en cours, l'attaque du Boss attend sa fin (file d'un seul slot).

| Déclencheur | Effet chiffré | Particularité |
|---|---|---|
| Deadline franchie en direct (poll ~45 s, `missedDeadlineTasks`) | −10 HP | Remplace l'« Attaque Surprise » actuelle (clignotement + toast conservés) |
| Rage Quit | −5 XP, **aucun HP** | Anim narrative ; `FloatingText` XP côté héros, la jauge de HP ne bouge pas |
| Deadlines déjà ratées à l'ouverture de l'Arène | HP déjà décomptés au premier rendu | **Une seule** attaque récapitulative, jamais une par deadline |
| Fin du Réveil (restes reportés) | HP déjà décomptés | Attend la fermeture de l'overlay bloquant, qui masque l'Arène |

Si les deux cas « au chargement » se présentent ensemble, **une seule** attaque est jouée.

Séquence : `attack` du Boss (600 ms) → à sa frame d'impact : `take_hit` du héros (350 ms), shake, flash, `FloatingText` ancré héros, recul du héros vers la gauche, chute de la jauge Héros le cas échéant → retour idle.

**Revirement documenté** : `CLAUDE.md` (entrée « Deadlines horaires — détection par polling, pas de replay (US-05) ») affirme aujourd'hui qu'aucune animation n'est rejouée au chargement. Cette entrée doit être réécrite dans le même commit que l'implémentation, en expliquant la nouvelle règle (une attaque récapitulative unique, jamais une par item).

---

## 7. Mécaniques arcade / VS fighting

### 7.1 Hit-stop et recul

À la frame d'impact, les deux `CharacterSprite` passent `frozen` pendant une courte durée, puis reprennent. Le Boss recule de 6 px vers la droite puis revient en `ease-out` sur 220 ms (le héros recule de 6 px vers la gauche quand c'est lui qui encaisse).

Durée du hit-stop, fonction pure `hitStopMs(damage, isFatal, comboCount)` :

| Cas | Durée |
|---|---|
| Coup simple | 50 ms |
| Cascade parent+enfants, ou combo ≥ ×3 | 120 ms |
| Coup fatal | 200 ms |

Nouvelle keyframe `knockback` dans `app/globals.css`, à côté de `hit-shake`, avec son override sous `prefers-reduced-motion` (comme `.is-hit` et `.hit-flash-overlay` l'ont déjà).

### 7.2 Jauge fantôme (chip damage)

`BossBar` et `HeroBar` reçoivent une couche décorative sous la barre principale, liée à la même valeur mais avec `transition: width 500ms ease-out 200ms`, tandis que la barre principale passe à `duration-100`. L'écart entre les deux couches donne l'ampleur du coup ; en rafale, la couche fantôme prend un retard visible.

- Couche fantôme en blanc translucide, `aria-hidden`, insérée **avant** la barre principale dans le DOM (les deux en absolu dans un conteneur relatif).
- `role="progressbar"` / `aria-valuenow` restent sur le conteneur : **aucun impact a11y ni e2e**, les assertions existantes lisent `aria-valuenow` ou le texte `X/Y HP`.
- `motion-reduce:transition-none` sur les deux couches.

### 7.3 « K.O. » et état danger

**Slam K.O.** — nouveau composant `components/combat/KoSlam.tsx`, affiché pendant les 400 ms de fondu qui précèdent `PerfectOverlay` : texte `K.O.` en `font-display` (`BoldPixels` — libellé court et majuscule, usage autorisé cf. `ASSETS.md`), classe `.ko-burst` existante (overshoot 520 ms, déjà présente dans `globals.css` avec son variant reduced-motion).

**État danger** — sous 25 % des HP du Boss :
- `BossBar` clignote en rouge (nouvelle keyframe, ou réutilisation de `hero-alarm-blink`).
- Le `CharacterSprite` du Boss reçoit `danger` : durée d'idle × 1,3 (respiration lourde) et `filter: saturate(1.15) brightness(0.92)`.

Le seuil est une constante exportée depuis `lib/game-engine.ts` (`BOSS_DANGER_HP_RATIO = 0.25`) pour rester testable.

---

## 8. Mort, renaissance, rechargement

- **Coup fatal** → impact → `death` (1000 ms) → fondu 400 ms avec slam K.O. → `PerfectOverlay`. Environ 1,7 s entre le clic et l'overlay.
- **Annulation** : si une tâche est ajoutée pendant la séquence et que le Boss repasse au-dessus de 0 HP (renaissance, cf. garde de `koOutcome`), la séquence est **interrompue** — retour `idle`, pas de slam, pas d'overlay.
- **Rechargement avec un Boss déjà à 0 HP** : sprite figé sur la dernière frame de `death`, aucune anim rejouée, aucun overlay. C'est le comportement actuel côté overlay, seul le visuel du sprite change (aujourd'hui il continue son idle alors qu'il est mort).
- `koOutcome` (`lib/game-engine.ts`) est **inchangé** : seule la date d'ouverture de `PerfectOverlay` est décalée.

---

## 9. `prefers-reduced-motion`

Sous `prefers-reduced-motion: reduce` :

- Aucun état animé : `still.png` partout (dernière frame de `death` si le Boss est K.O.).
- Aucun VFX, aucun shake, aucun hit-stop, aucun recul, aucune jauge fantôme animée, aucun slam K.O. animé (le texte peut apparaître sans overshoot).
- **Le gating est désactivé** : jauge, chiffres et `PerfectOverlay` redeviennent instantanés, exactement comme aujourd'hui. Un utilisateur reduced-motion ne doit pas attendre 280 ms un feedback dont on lui a retiré l'animation, ni 1,7 s son overlay de victoire.

---

## 10. Tests

**Vitest — `lib/combat-animation.ts` (pur, sans UI)**
- `pickAttackAnim(comboCount, isFatal, rng)` : `sp_atk` si fatal ou combo ≥ 3, sinon une des trois de base.
- `coalesceHits` : addition des dégâts, flush forcé à 1200 ms.
- `impactDelayMs(frames, impactFrame, durationMs)`.
- `hitStopMs(damage, isFatal, comboCount)`.

**Vitest — métadonnées**
- Chaque personnage des catalogues a une entrée dans `sprite-metadata.generated.json`.
- `frames ≥ 1` pour chaque anim (garde-fou contre un pack mal extrait).
- **Non-régression de taille** : `tileH / renderScale === LEGACY_IDLE_HEIGHTS[slug]` pour les 34 personnages.

**Playwright**
- `playwright.config.ts` passe `use.reducedMotion: "reduce"` : toute la suite existante conserve le comportement instantané, **zéro churn sur les specs actuelles** (`toggle-cascade`, `rafale-optimistic`, `nesting-dnd`, etc.).
- Un seul nouveau spec `e2e/combat-animations.spec.ts` en `reducedMotion: "no-preference"` vérifie les `data-anim-state` : `attack → hurt → idle` sur un coup, `death` figée au K.O., `attack` côté boss sur un Rage Quit.

---

## 11. Documentation à mettre à jour

| Fichier | Contenu |
|---|---|
| `CLAUDE.md` | **Réécrire** l'entrée US-05 (« pas de replay au chargement » devient « une attaque récapitulative unique »). **Ajouter** : boîte de recadrage commune + `LEGACY_IDLE_HEIGHTS`, gating des dégâts à la frame d'impact, `reducedMotion: "reduce"` en config Playwright comme mécanisme de neutralisation des anims en e2e. **Mettre à jour** l'entrée « Roster de Boss » (frames individuelles → spritesheets). |
| `ASSETS.md` | Nouvelle arborescence `public/sprites/**/anim/`, section VFX par héros avec les chemins sources, licences Frostwindz à vérifier, retrait de `public/vfx/impact/`. |
| `CHANGELOG.md` | Ligne sous `## [Unreleased]`, dans le commit d'implémentation. |
| Issue #48 | Clôture avec le récapitulatif ; lien vers #135. |
| Le Guide (Notion) | **Rien.** Aucune règle de jeu ne change, c'est du juice visuel — la règle projet exclut explicitement la doc utilisateur dans ce cas. |

---

## 12. Découpage en PRs

Chaque PR est mergeable seule ; les deux premières n'ont **aucun** effet visible.

| PR | Contenu | Critère de vérification |
|---|---|---|
| 1 | `build-sprite-sheets.mjs`, `LEGACY_IDLE_HEIGHTS`, métadonnées générées, refonte de `generate-hero-skins.mjs`, retrait des 2 anciens scripts | Feuilles + JSON générés ; tests métadonnées verts |
| 2 | `SpriteAnimator`, `CharacterSprite`, migration des 5 sites + `share-card`, suppression d'`IdleSprite`, mise à jour types/catalogues/tests | **Iso-visuel** : application identique à l'œil, `roster-preview` et `skins-preview` inclus |
| 3 | Coup du héros : gating, coalescing, VFX par héros, `hurt` du Boss, hit-stop, recul, jauge fantôme | `roster-preview` étendu pour caler les `impactFrame` |
| 4 | Attaque du Boss (4 déclencheurs), mort, renaissance, K.O. + slam, état danger, `reducedMotion` en config Playwright | Nouveau spec e2e |
| 5 | `CLAUDE.md`, `ASSETS.md`, `CHANGELOG.md`, clôture de l'issue | — |

---

## 13. Hors périmètre

- **Intro VS / FIGHT!** au premier chargement du jour → issue #135, bloquée par celle-ci. Contrainte retenue : ne jamais bloquer la saisie de tâche.
- **Animation de mort du héros** : les HP du héros peuvent tomber à 0 sans qu'il meure (la jauge est un indicateur de charge mentale, pas une condition de défaite). Aucune anim `death` héros n'est extraite.
- **Anims non retenues** des packs (`run`, `walk`, `roll`, `jump`, `defend`, `meditate`, `heal`, `air_atk`, `projectile`) : aucune n'a de déclencheur dans le jeu.
- **Parallax des décors** : toujours non exploité (rendu plat `object-cover`), inchangé.
- **Boss `Mecha-stone Golem`** : toujours écarté (spritesheet non taguée), inchangé.
