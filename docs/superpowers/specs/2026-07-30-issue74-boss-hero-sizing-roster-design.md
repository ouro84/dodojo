# Issue #74 — Uniformiser la taille des boss + tailles héros + extension du roster

> Date : 2026-07-30
> Issue : [#74](https://github.com/ouro84/dodojo/issues/74)

## Contexte

L'issue signale que chaque boss s'affiche à une taille visuelle différente, plus trois
bonus : réduire le héros sur mobile (75-80% de sa taille actuelle), rapprocher la
taille héros/boss, et exploiter les variantes de packs CraftPix jamais utilisées
(« quand il y en avait 4 dans un pack, tu n'en as utilisé qu'un »).

## A. Cause racine — ratio personnage/canvas incohérent

Mesure faite sur `public/sprites/bosses/<slug>/idle/frame0000.png` (bbox alpha réelle
vs canvas) :

| Boss | Ratio charH/canvasH |
|---|---|
| lightning-mage | 0.49 |
| knight | 0.50 |
| mushroom / urban-zombie | 0.52 |
| gangster | 0.55 |
| satyr | 0.58 |
| gorgon | 0.60 |
| minotaur | 0.63 |
| demon-slime | 0.66 |
| frost-guardian | 0.72 |

`IdleSprite` (`components/combat/IdleSprite.tsx`) rend le sprite avec une hauteur CSS
fixe (`h-28` dans `VersusScene.tsx`) appliquée au **canvas entier**, pas au personnage.
Comme ce ratio varie de 0.49 à 0.72 selon le pack source, deux boss rendus à la même
hauteur CSS affichent un personnage jusqu'à ~1.5× plus grand l'un que l'autre.

Les héros (`public/sprites/mc/<slug>/idle/`), eux, sont déjà à ratio ~1.0 grâce à
`scripts/trim-hero-idle-frames.mjs` (recadrage sur la bbox **union** de toutes les
frames idle d'un héros — jamais frame par frame, pour ne pas désynchroniser la boucle
d'animation). Aucun équivalent n'existe pour les boss.

### Fix

Étendre `scripts/copy-boss-sprites.mjs` : après extraction (`extractFrames`) ou découpe
de spritesheet (`sliceSheet`) des frames idle d'un boss, calculer la bbox alpha
**union de toutes ses frames** puis recadrer chaque frame sur cette bbox commune
(même technique que `trim-hero-idle-frames.mjs`, appliquée en une passe intégrée au
script existant plutôt qu'un script séparé — le pipeline boss est déjà unique,
contrairement au pipeline héros historiquement scindé en deux). Résultat : canvas ≈
personnage pour chaque boss → une hauteur CSS fixe produit alors une taille de
personnage réellement uniforme entre tous les boss, sans introduire de champ `scale`
à maintenir dans `lib/bosses.ts`.

Idempotent comme le reste du script (le dossier `idle/` de chaque boss est déjà vidé
avant écriture).

## B. Tailles hero/boss (bonus 0 + bonus 1)

Dans `components/combat/VersusScene.tsx` :

- Boss (`IdleSprite` boss, actuellement `h-28 w-auto`) → **`h-24 w-auto`** (96px).
- Héros (`IdleSprite` héros, actuellement `h-28 w-auto`) → **`h-[88px] w-auto`** (valeur
  arbitraire Tailwind, déjà utilisée ailleurs dans ce fichier, ex. `text-[0.65rem]`).

Justification des chiffres :
- 88/112 = 78.6% → dans la cible bonus 0 (75-80% de la taille actuelle du héros).
- 88/96 = 91.7% → héros « à peine plus petit » que le boss (bonus 1).

`w-auto` préserve le ratio natif de chaque sprite trimmé (le fix A change les
proportions largeur/hauteur de chaque boss puisque le canvas colle maintenant au
personnage) — aucune autre valeur à toucher.

## C. Bug découvert — sprite `satyr` mal assigné

Le boss `satyr` (« Satyre Sylvestre ») utilise actuellement `Satyr_1` du pack
`Free-Satyr-Sprite-Sheet-Pixel-Art-Pack` — qui n'est pas un satyre mais une femme
humaine en robe rouge. Le vrai personnage mi-homme mi-bouc (cornes, jambes de chèvre,
bâton) est dans `Satyr_2`, jamais utilisé jusqu'ici.

**Fix inclus dans ce chantier** : `scripts/copy-boss-sprites.mjs` bascule la source de
`satyr` vers `Satyr_2`. Le lore existant (« Créature mi-homme mi-bouc des mythes
anciens ») ne change pas — il était déjà correct, seul le sprite ne correspondait pas.
`Satyr_1` (la femme en robe rouge) et `Satyr_3` (une autre femme, chemise blanche/jupe
violette) deviennent deux nouveaux boss à part (cf. section D) plutôt que d'être
perdus.

## D. Extension du roster — 15 nouveaux boss

Inventaire des variantes de packs CraftPix jamais utilisées (7 packs, tuile 128px
confirmée par mesure directe des fichiers déjà catalogués) :

| Pack | Variantes inexploitées | Frames (mesuré : largeur sheet / 128) |
|---|---|---|
| Satyr | `Satyr_1`, `Satyr_3` (`Satyr_2` → fix C) | 7, 6 |
| Urban Zombie | `Zombie_2`, `Zombie_3`, `Zombie_4` | 6, 6, 7 |
| Gorgon | `Gorgon_2`, `Gorgon_3` | 7, 7 |
| Gangster | `Gangsters_2`, `Gangsters_3` | 7, 7 |
| Knight (`Spritesheet 128`) | `Knight_2`, `Knight_3` | 4, 4 |
| Sorciers | `Wanderer Magican` | 8 |
| Minotaure low-boss (pack distinct du minotaure réel déjà utilisé) | `Minotaur_1`, `Minotaur_2`, `Minotaur_3` | ~10 chacun (1280px/128 — à re-mesurer exactement à l'implémentation) |

Chaque sprite a été prévisualisé (frame extraite, upscale nearest-neighbor) avant
d'écrire nom/lore, pour éviter un mismatch comme celui de la section C.

Nouvelles entrées `lib/bosses.ts` :

| id | Nom | Lore | Thèmes décor | Frames | Sprite source | flip |
|---|---|---|---|---|---|---|
| `temptress` | Tentatrice | Voix charmeuse qui jure qu'un jour de repos ne changera rien. | castle-interior, steampunk-cityscape | 7 | Satyr_1 | true |
| `idler` | Flâneuse | Ne presse jamais rien, et voudrait bien que tu fasses pareil. | steampunk-cityscape, desert-oasis | 6 | Satyr_3 | true |
| `jaded` | Blasé | Plus rien ne l'étonne, plus rien ne presse — modèle dangereux à suivre. | steampunk-cityscape | 6 | Zombie_2 | true |
| `procrastinator` | Ajourneuse | Garde toujours un « demain » tout prêt au bord des lèvres. | steampunk-cityscape | 6 | Zombie_3 | true |
| `dock-corpse` | Cadavre des Docks | Traîné jusqu'aux quais par une routine qui ne finit jamais. | steampunk-cityscape | 7 | Zombie_4 | true |
| `gorgon-ivory` | Gorgone d'Ivoire | Regard pétrifiant, teint pâle des cryptes oubliées. | ancient-temple, desert-oasis, underwater-world | 7 | Gorgon_2 | true |
| `gorgon-scarlet` | Gorgone Écarlate | Femme-serpent aux écailles rouges, née des braises anciennes. | ancient-temple, desert-oasis, underwater-world | 7 | Gorgon_3 | true |
| `accomplice` | Complice | Ne dirige rien, ne décide rien — suit, comme toi tu remets à plus tard. | steampunk-cityscape | 7 | Gangsters_2 | true |
| `mob-baron` | Baron | Costume impeccable, mains propres : la procrastination qui a l'air productive. | steampunk-cityscape | 7 | Gangsters_3 | true |
| `knight-amethyst` | Chevalier Améthyste | Ancien duelliste pétrifié dans son armure, fier et immobile. | castle-interior, mountain-peak | 4 | Knight_2 | true |
| `knight-garnet` | Chevalier Grenat | Garde écarlate d'une forteresse qui n'existe plus. | castle-interior, mountain-peak | 4 | Knight_3 | true |
| `wandering-mage` | Sorcier Errant | Mage sans but, économe de ses sorts comme toi de ton énergie. | mountain-peak, crystal-cave | 8 | Wanderer Magican | true |
| `minotaur-warrior` | Minotaure Belliqueux | Bête cornue, lame en main, née pour ne jamais reculer. | ancient-temple, castle-interior, desert-oasis | ~10 | Minotaur_1 (low-boss) | true |
| `minotaur-ardent` | Minotaure Ardent | Bête cornue à la hache, forgée dans les braises du labyrinthe. | ancient-temple, castle-interior, desert-oasis | ~10 | Minotaur_2 (low-boss) | true |
| `minotaur-occult` | Minotaure Occulte | Bête cornue aux rites anciens, gardienne des passages secrets. | ancient-temple, castle-interior, desert-oasis, crystal-cave | ~10 | Minotaur_3 (low-boss) | true |

Note narrative : les 6 boss « humains » (Tentatrice, Flâneuse, Blasé, Ajourneuse,
Complice, Baron) ne sont pas des monstres — cohérent avec le lore « Le Démon
Intérieur » (issue #51) où le Boss représente ce qui traîne non tranché dans la tête
du joueur, pas nécessairement une créature.

`flip=true` hérité du sibling déjà catalogué dans le même pack (tous les low-boss
existants sauf `mushroom` sont déjà `flip=true`) — hypothèse à confirmer visuellement
via l'écran de test interne `/roster-preview-8f3a2c9d`, comme le reste du roster
(piège déjà documenté dans `CLAUDE.md`).

**Contrainte de nommage vérifiée** : `lib/bosses.test.ts` (issue #119) interdit tout
nom de boss commençant par un article (« le »/« la »/« un »/...) — les noms ci-dessus
ont été choisis sans article de tête pour passer ce test existant sans modification.

Total roster : 12 → **27 boss** (15 nouveaux, en plus du fix du sprite `satyr` qui ne
compte pas comme un ajout — il libère `Satyr_1`, l'un des 15, plutôt que d'en
consommer un).

## Fichiers touchés

- `scripts/copy-boss-sprites.mjs` : trim bbox-union post-extraction (tous les boss,
  existants et nouveaux) ; 15 nouvelles entrées `FRAME_BOSSES`/`SHEET_BOSSES` ;
  bascule de la source `satyr` vers `Satyr_2`.
- `lib/bosses.ts` : +15 entrées `Boss`.
- `components/combat/VersusScene.tsx` : `h-28`→`h-24` (boss), `h-28`→`h-[88px]`
  (héros).
- `ASSETS.md` : table roster mise à jour (12→27), doc du trim bbox-union, doc du fix
  `satyr`, doc du pack minotaure low-boss désormais exploité.
- `CLAUDE.md` : mise à jour de l'entrée « Roster de Boss & décors dynamiques »
  (règle projet — tout changement de comportement non-évident documenté dans le même
  commit).
- `CHANGELOG.md` : ligne sous `[Unreleased]`.

## Tests

- `lib/bosses.test.ts` : générique (pas de compte de boss figé), couvre déjà
  l'intégrité des `backgroundThemes` (thème → au moins une variante de décor
  existante), l'unicité des `id`, et l'absence d'article de tête dans les noms —
  vérifié manuellement ci-dessus pour les 15 nouvelles entrées, doit rester vert sans
  modification du test.
- Vérification manuelle obligatoire via `/roster-preview-8f3a2c9d` : les 27 boss
  s'affichent à une hauteur de personnage visuellement cohérente (fix A), et
  l'orientation `flip` de chaque nouveau boss est confirmée à l'œil (comme pour le
  reste du roster).

## Hors scope

- La correction du sprite `satyr` change un boss déjà en prod (le rendu visuel de
  « Satyre Sylvestre » change) — assumé comme un fix de bug, pas une nouvelle
  fonctionnalité nécessitant une entrée Guide Notion.
- Aucune doc utilisateur (Guide) requise : changement cosmétique/contenu, pas une
  règle métier ou une mécanique documentée.
- Les licences des packs `low boss` (CraftPix free license) sont déjà documentées
  dans `ASSETS.md` — aucune vérification supplémentaire nécessaire pour ces
  nouvelles variantes (même pack, même licence).
