# Cartographie des Assets — `assets/`

> Dernière mise à jour : 2026-07-16
> Ce fichier documente le contenu du dossier `assets/` (non versionné dans `public/` pour l'instant — c'est la matière première brute, triée ici avant intégration).

---

## Comment utiliser ce document

`assets/` contient ~15 800 fichiers issus de packs pixel-art tiers (CraftPix, itch.io, Ansimuz/CC0, unTied Games...), pas encore triés dans `public/`. Avant d'intégrer un sprite dans le code :

1. Repérer le pack voulu ci-dessous (thème, animations disponibles, chemin).
2. Vérifier la licence (section [Licences](#licences--à-vérifier-avant-usage-commercial)) — plusieurs packs n'ont **aucune licence documentée localement**.
3. Copier uniquement les fichiers nécessaires dans `public/sprites/...` (ne jamais faire pointer le code vers `assets/` directement — c'est un dossier de matière première, pas un dossier servi).
4. Ignorer systématiquement les fichiers parasites : `.DS_Store`, `__MACOSX/`, `COUPON.pdf`, `*.url` promo CraftPix.

Format dominant : la plupart des packs fournissent le **même contenu sous 3 formes** — frames PNG individuelles (`animations/PNG/<nom>/frame_XX.png`), une spritesheet unique, et un fichier source `.aseprite` (éditable avec Aseprite pour retag/export). Préférer les frames individuelles pour un rendu React (`<Image>` par frame ou animation via CSS steps), la spritesheet pour un rendu canvas/CSS `background-position`.

---

## Vue d'ensemble

| Dossier | Fichiers | Rôle |
|---|---|---|
| `assets/MC` | 1 328 | Sprites du Héros jouable — série "Elementals" (7 personnages) |
| `assets/Boss` | 683 | Sprites des Boss quotidiens (6 packs) |
| `assets/Backgrounds` | 545 | Décors de l'Arène — 7 thèmes CraftPix (parallax) |
| `assets/VFX` | 5 374 | Effets visuels (hit, explosion, sorts, symboles UI) |
| `assets/Icons` | 6 581 | Icônes RPG (armes, potions, monnaie...) — Raven Fantasy Icons |
| `assets/Fonts` | 1 | Police pixel-art "BoldPixels" (webfontkit) |
| `assets/Autres` | 1 271 | Packs tiers hors thème ou à trier (7 sous-packs) |

---

## 1. `assets/MC` — Héros jouable (série "Elementals")

7 personnages d'une même série cohérente, tous en **frames 288×128 px**, avec structure quasi identique : `idle`, `run`/`walk`, `roll`/`tumble`, `jump` (up/down/full), `1_atk`/`2_atk`/`3_atk`, `sp_atk` (spécial), `air_atk`, `defend`, `take_hit`, `death`. Chaque dossier a : frames PNG séparées, une spritesheet unique, un fichier `.aseprite` source, des GIF preview. **Aucune licence documentée localement** (à vérifier auprès de la source d'achat).

| Personnage | Élément | Chemin | Spécificité |
|---|---|---|---|
| Fire Knight | Feu | `MC/Elementals_fire_knight_FREE_v1.1/` | Set standard complet, le plus "générique héros RPG" |
| Water Priestess | Eau | `MC/Elementals_water_priestess_FREE_v1.1/` | Anim `heal` (12 frames) — thème régénération |
| Ground Monk | Terre | `MC/Elementals_ground_monk_FREE_v1.3.1/` | Anim `meditate` (16 frames) |
| Metal Bladekeeper | Métal | `MC/Elementals_metal_bladekeeper_FREE_v1.1/` | Projectile + piège (`projectile_and_trap/`) |
| Wind Hashashin | Vent | `MC/elementals_wind_hashashin_FREE_v1.1/` | Set standard, rapide/critique |
| Crystal Mauler | Cristal | `MC/Elementals_Crystal_Mauler_Free_v1.0/` | Guerrier lourd (masse/marteau) |
| Leaf Ranger | Feuille | `MC/Elementals_Leaf_ranger_Free_v1.0/` | Le plus riche : `slide`, `projectiles_and_effects` (61 frames) |

**Recommandation** : **Fire Knight** comme héros par défaut (MVP). La cohérence structurelle de la série permet d'envisager plus tard un système de **classe élémentaire à débloquer** (skin de héros = récompense de streak/niveau) sans travail d'art supplémentaire.

**Intégration US-18 (Échoppe)** : les frames `01_idle` des 7 héros sont copiées/renommées vers `public/sprites/mc/<slug>/idle/frameNNNN.png` (base 0, 4 chiffres) via `scripts/copy-hero-sprites.sh`, consommées par `components/combat/IdleSprite`. Compteurs de frames réels : la plupart 8, mais **ground-monk = 6**, **leaf-ranger = 12** (reflétés dans `lib/heroes.ts`). Un **portrait** par héros (`public/sprites/mc/<slug>/portrait.png`, perso rogné) est généré depuis la 1re frame idle via `scripts/generate-hero-portraits.mjs` (sharp `.trim()`) — utilisé dans la matrice de l'Échoppe. ⚠️ Ces packs MC sont « sans licence documentée localement » — vérifier les pages source **avant toute prod monétisée** (le déblocage via or virtuel reste OK côté produit).

**Points d'attention** : noms de dossiers d'animations incohérents entre persos (`animations/PNG` vs `png` vs `PNG animations`, casse variable) — normaliser si le chargement est scripté. Un seul (`Ground Monk`) place son `.aseprite` à la racine au lieu de `aseprite/`. `fire-knight` n'est **pas** dans la `map` de `copy-hero-sprites.sh` (extrait/rogné à la main avant que ce script existe, frames ~58×44 px) alors que les 6 autres sont copiés bruts en 288×128 avec du vide transparent autour du perso — corrigé une fois découvert (rendu incohérent à taille CSS fixe) par `scripts/trim-hero-idle-frames.mjs` (recadrage sur la bbox **union** de toutes les frames d'un héros, jamais un trim par frame indépendant qui désynchroniserait l'animation). À relancer après toute modification des frames idle sources.

**Intégration US-53 (Tenues)** : `scripts/generate-hero-skins.mjs` génère les frames idle de chaque tenue (recolor masqué ou overlay tint, cf. `CLAUDE.md`) vers `public/sprites/mc/<slug>/skins/<skin_id>/idle/frameNNNN.png`, à partir des frames idle déjà extraites (pas de re-lecture d'`assets/`). Les fichiers `.aseprite` source n'ont que 3 calques (`bkg`/`base`/`effects`, vérifié par lecture binaire du format Aseprite) — aucun calque peau/armure séparé, d'où le recolor par analyse d'histogramme plutôt qu'un masque peint à la main. Catalogue et calibration : `lib/hero-skins.ts` + `docs/superpowers/specs/2026-07-23-us53-tenues-skins-design.md` §4.

---

## 2. `assets/Boss` — Boss quotidiens

5 "vrais" boss avec animations dédiées + 1 dossier `low boss` regroupant 8 mini-packs Craftpix (ennemis réguliers, pas de vrais boss).

| Boss | Chemin | idle / walk / atk | hit/hurt | death | Notes |
|---|---|---|---|---|---|
| Frost Guardian | `Boss/Frost_Guardian_FREE_v1.0/` | 6/10/14 | 7 | 16 | Complet, propre |
| Boss Demon Slime | `Boss/boss_demon_slime_FREE_v1.0/` | 6/12/15 | 5 | **22** (la plus détaillée) | Bon pour fin de semaine |
| Free Cthulhu | `Boss/free_cthulu_v1/` | 15/12/7+9 (2 attaques) | 5 | 11 | + anim `fly` (6) — le plus riche en variété |
| Mecha-Stone Golem | `Boss/Mecha-stone Golem 0.1/` | — spritesheet brute non taguée — | ? | ? | **Pas prêt à l'emploi**, nécessite retag manuel Aseprite |
| Mino v1.1 | `Boss/mino_v1.1_free/` | 16/12/16 | ❌ absent | ❌ absent | **Incomplet** (pas de hit/death) — mais fournit `bonus_mino_healthbar_UI/` réutilisable pour la jauge HP de **tous** les boss |
| `low boss/` (8 packs) | `Boss/low boss/` | Idle/Walk/Attack/Hurt/Dead en spritesheet unique | ✅ | ✅ | Satyr, Urban Zombie, Mushroom, Gorgon, Minotaure (complet, hurt/dead présents contrairement à `mino_v1.1_free`), 3 sorciers, Gangster, Knight |

**Aucune licence documentée localement** pour les 5 packs "vrais boss". `low boss/` = licence CraftPix standard (craftpix.net/file-licenses).

**Rotation suggérée** : `low boss` pour début de semaine (mini-boss simples), Frost Guardian / Demon Slime en milieu de semaine, Cthulhu en boss de fin de semaine/événement spécial. Golem à mettre de côté tant qu'il n'est pas retaggé.

**Intégration Roster (fait)** — 12 boss câblés dans le jeu via `scripts/copy-boss-sprites.mjs` → `public/sprites/bosses/<slug>/idle/frameNNNN.png` (base 0, 4 chiffres), consommés par `IdleSprite`, catalogués dans `lib/bosses.ts`. Boss "réels" (frost-guardian, demon-slime, cthulhu, minotaur) = copie de frames individuelles ; "low boss" (satyr, urban-zombie, mushroom, gorgon, fire-wizard, lightning-mage, gangster, knight) = **découpe de spritesheet** `Idle.png` (frames explicites par pack : satyr/gorgon/wizards 7, zombie/gangster 6, mushroom 8 en 70×64, knight 4 via la variante `Spritesheet 128`). Golem (non taggé) et mino low-boss (redondant avec le mino réel 16 frames) **écartés**. Chaque boss a un `flip` d'orientation (à confirmer visuellement). Tirage quotidien : cf. piège « Roster de Boss » dans `CLAUDE.md`.

---

## 3. `assets/Backgrounds` — Décors de l'Arène

7 packs CraftPix, tous en **576×324 px natif** (licence craftpix.net/file-licenses), structure identique : `PNG/background 1-4/` avec layers de parallax (`Plan 1.png`...) + rendu plat + PSD source.

| Thème | Chemin | Usage suggéré |
|---|---|---|
| Château (intérieur) | `Backgrounds/Free-Castle-Interior-Pixel-Game-Backgrounds/` | QG / écran d'accueil |
| Temple antique | `Backgrounds/free-ancient-temple-pixel-game-backgrounds/` | Décor Arène alternatif |
| Grotte de cristal | `Backgrounds/free-crystal-cave-pixel-art-backgrounds/` | Thème "récompense rare" (streak élevé) |
| Désert/oasis | `Backgrounds/free-desert-oasis-pixel-art-background-pack/` | Boss "endurance" |
| Sommet montagneux | `Backgrounds/free-mountain-peak-pixel-art-backgrounds/` | Progression/classement |
| Ville steampunk | `Backgrounds/free-steampunk-cityscape-pixel-backgrounds/` | Habillage rétro-futuriste de l'Arène |
| Monde sous-marin | `Backgrounds/free-underwater-world-pixel-art-backgrounds/` | Ambiance focus/pomodoro |

Steampunk et Underwater ont en plus une version haute résolution (`origbig.png`, 2304×1296).

**Recommandation** : rotation de fond d'Arène selon le type de Boss du jour, layering parallax exploitable pour un effet de profondeur pendant le combat.

**Intégration Roster (fait)** — **16 variantes** extraites en rendu plat vers `public/backgrounds/<slug>.png` via `scripts/copy-boss-sprites.mjs` : plusieurs `background N` par thème (ancient-temple & castle-interior ×3, les autres ×2), style `PNG/background N/background N.png` ou `background N/orig.png` (steampunk, underwater). Cataloguées dans `lib/backgrounds.ts` avec un champ `theme`. Le décor du jour est tiré parmi les variantes des **thèmes cohérents avec le lore du boss** (`Boss.backgroundThemes` → `backgroundsForThemes`), jamais au hasard sur les 16. Ajouter une variante d'un thème = ajouter la ligne au catalogue (le pool des boss ciblant ce thème s'étend automatiquement). Parallax non exploité (rendu plat en `object-cover`).

---

## 4. `assets/VFX` — Effets visuels

| Effet | Chemin | Frames | Usage |
|---|---|---|---|
| Hit Effect 01 | `VFX/Hit Effect 01/` | 3 | **Flash de dégâts** léger, fréquent (à chaque tâche complétée) |
| explosion-1-a à d, f, g | `VFX/explosion pack 1/Explosions pack/` | 7-12 | Coup critique / variation visuelle de dégâts |
| explosion-1-e | `VFX/explosion pack 1/Explosions pack/explosion-1-e/` | **22** | **Boss K.O.** (mort/victoire) |
| Super Pixel Effects Gigapack | `VFX/Super Pixel Effects Gigapack (Free Version) v2.6.0/` | variable | Sorts, symboles UI, impacts (voir détail ci-dessous) |

**Gigapack** (auteur Will Tice / unTied Games — licence : usage commercial OK avec **attribution obligatoire**, revente interdite, **usage en entraînement IA interdit**) — 9 catégories : Explosions, Fantasy Spells, Impacts, Lightning, Magic Bursts, Sci-fi, Smoke Bursts, Splatters, Symbols.

Mapping gameplay recommandé :
- **Tâche créée (+20 HP)** → `Fantasy Spells/spell_heal_001` (16 frames)
- **Coup porté au Boss** → `Hit Effect 01` ou `Impacts/directional_impact_00X`
- **Boss K.O.** → `explosion-1-e` + `Symbols/symbol_you_won_text_001`
- **Level up** → `Symbols/symbol_level_up_text_001` (44 frames, texte animé prêt à l'emploi)
- **Tâche en retard / échec** → `Symbols/symbol_warning_001` ou `symbol_failure_001`

---

## 5. `assets/Icons` — Raven Fantasy Icons

Auteur Caio / Clockwork Raven Studios (licence non explicite localement — vérifier la page itch.io d'origine avant usage commercial). 3 résolutions : **16×16, 32×32, 64×64**, chacune en 2192 fichiers individuels (`Separated Files/<taille>/fa1.png`...`fa2192.png`, numérotation séquentielle sans sous-catégories nommées) + 3 spritesheets complètes (`Full Spritesheet/`) + 1 export RPG Maker (`RPG Maker MV and MZ/IconSet.png`).

Contenu visuel (armes, armures, potions, monnaie, parchemins/clés/coffres, nourriture, matériaux, effets magiques, monstres) repéré par inspection visuelle de la spritesheet, pas de nommage par thème.

**Usage** : icônes de tâches (associer une icône à une catégorie), items achetables de l'Échoppe, récompenses de loot. Préférer `Separated Files/32x32/` pour un import React à la demande.

---

## 6. `assets/Fonts` — BoldPixels

Un seul fichier : `webfontkit-BoldPixels.zip`, contient la police **BoldPixels** (Yūki / yukipixels.itch.io) en tous formats (`.ttf`, `.otf`, `.woff`/`.woff2`, `.eot`, `.svg`...).

**Licence : CC BY-SA 4.0** — usage commercial libre, attribution requise ("BoldPixels by YukiPixels"), toute police *dérivée* doit rester sous la même licence (ne s'applique pas au jeu lui-même).

**Usage** : `.woff2`/`.woff` via `next/font/local` pour titres, badge "BOSS", nombres de dégâts, labels HP/XP. Police bold optimisée pour du texte court en majuscules — prévoir une seconde police pour du texte long (descriptions).

---

## 7. `assets/Autres` — packs tiers à trier

| Pack | Licence | Thème | Verdict |
|---|---|---|---|
| gothicvania-cemetery-files (Ansimuz) | **CC0** | Héros complet (idle/run/attack/hurt/death) + Skeleton/Hell-gato + décor + **sons .ogg** + démo Phaser | ✅ **Le plus complet et directement exploitable**, prioritaire |
| Streets of Fight (Ansimuz) | **CC0** | Brawler Girl (héros alt.) + Enemy Punk + décor urbain | ✅ Bon héros/boss alternatif, thème "Street Fighter" |
| gothicvania church (Ansimuz) | **CC0** | Angel/Wizard (boss potentiel) + FX fireball/enemy-death | ✅ Exploitable comme boss de semaine + FX génériques |
| Gothicvania Swamp (Ansimuz) | **CC0** | Ghost/Spider/Thing (ennemis) + décor marécage | ✅ Boss "marécage" ou décor alternatif |
| Lively NPC blacksmith | ❌ non documentée | Forgeron PNJ (idle/bored/greeting/work, pas de combat) | ⚠️ PNJ hors-combat pour QG/boutique, vérifier licence avant prod |
| free-schoolgirls-anime-character | CraftPix free | Personnages anime écolières | ❌ Hors thème, à écarter (ou easter egg cosmétique) |

Les 4 packs Ansimuz (church, swamp, cemetery, Streets of Fight) sont en **CC0**, donc librement réutilisables sans restriction ni attribution.

---

## Licences — à vérifier avant usage commercial

| Statut | Packs concernés |
|---|---|
| ✅ CC0 (libre, sans restriction) | 4 packs Ansimuz dans `Autres/` (church, swamp, cemetery, Streets of Fight) |
| ✅ CC BY-SA 4.0 (attribution requise si police redistribuée) | `Fonts/BoldPixels` |
| ⚠️ CraftPix free license (usage produit final OK, revente/redistribution des assets bruts interdite) | Tous les `Backgrounds/`, `Boss/low boss/`, `Autres/free-schoolgirls...` |
| ⚠️ Attribution obligatoire, entraînement IA interdit | `VFX/Super Pixel Effects Gigapack` (unTied Games) |
| ❌ Aucune licence documentée localement — à vérifier auprès de la source | `MC/` (série Elementals), `Boss/` (5 packs "vrais boss" hors `low boss`), `VFX/Hit Effect 01`, `Autres/Lively NPC blacksmith`, `Icons/Raven Fantasy Icons` |

**Avant tout déploiement en production avec monétisation**, vérifier les pages itch.io/source d'origine pour les packs "non documentés localement" — beaucoup d'assets "FREE" itch.io autorisent l'usage commercial mais ce n'est pas garanti sans la page d'origine.

---

## Dette / points d'attention

- `Boss/Mecha-stone Golem 0.1/` : spritesheet non taguée, nécessite un retag manuel dans Aseprite avant intégration.
- `Boss/mino_v1.1_free/` : pas d'animation `hurt`/`death` — soit compléter avec le Minotaure de `low boss/` (qui les a), soit utiliser un flash générique de dégâts.
- Fichiers parasites à exclure de tout script d'import : `.DS_Store`, `__MACOSX/`, `COUPON.pdf`, `*.url` (CraftPix), `Looking-for-more.pdf`.
- Noms de dossiers d'animation incohérents entre les 7 persos `MC/` (casse, espace, `PNG` vs `png` vs `animations/PNG`) — à normaliser si le chargement des sprites est scripté plutôt que fait à la main.
