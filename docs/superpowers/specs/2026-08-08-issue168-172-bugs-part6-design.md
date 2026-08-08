# Issues #168-172 — « bugs part6 » — design

> Date : 2026-08-08
> Issues : [#168](https://github.com/ouro84/dodojo/issues/168) · [#169](https://github.com/ouro84/dodojo/issues/169) · [#170](https://github.com/ouro84/dodojo/issues/170) · [#171](https://github.com/ouro84/dodojo/issues/171) · [#172](https://github.com/ouro84/dodojo/issues/172)
> Portée : une seule PR. Cinq correctifs indépendants sur le Marché Noir, `BottomNav` et le design system — même patron que #156/#160.
> Hors scope : issue #75 (preview tenue en miniature) — liée à #169/#170 par le fichier `CharacterSelect.tsx`, pas par le bug. Brainstorming séparé, plus tard.

---

## 1. Cadre

| # | Issue | Symptôme remonté | Cause racine | Section |
|---|---|---|---|---|
| A | #168 | Lien texte « Retour au Vestiaire » redondant avec l'onglet actif de `BottomNav` | `BackLink` laissé en place lors de l'audit UX #67 sur le seul écran qui a un onglet dédié | [§2](#2-a--backlink-redondant-168) |
| B | #170 | Swatches de tenues sous la cible tactile WCAG (36px) | Grille tenues jamais mise à jour quand la grille héros est passée à 44px | [§3](#3-b--swatches-tenues-sous-44px-170) |
| C | #169 | Héros/tenues verrouillés indiscernables entre eux | Filtre `grayscale`/`brightness` trop sombre sur une palette déjà très sombre | [§4](#4-c--contraste-verrouillé-illisible-169) |
| D | #172 | Vocabulaire interne `qg`/`echoppe` non aligné avec le lexique « Démon Intérieur » | Renommage de l'issue #51 n'a touché que les libellés affichés, pas les identifiants internes | [§5](#5-d--vocabulaire-interne-legacy-172) |
| E | #171 | 9 tailles de police littérales hors du ramp `DESIGN.md` | Même besoin (« libellé encore plus petit que `text-xs` ») résolu à la main à 9 endroits plutôt que via un palier commun | [§6](#6-e--9-tailles-hors-ramp-171) |

**Ordre d'exécution imposé pour cette PR** : A → B → C → D → E, puis documentation. B avant C parce que les deux touchent la même grille (tenues) — autant régler la taille avant le contraste sur le même fichier. D et E partagent un point de contact (`.impeccable/design.json`), traités l'un après l'autre pour éviter un aller-retour.

---

## 2. A — BackLink redondant (#168)

### Cause

`app/marche-noir/page.tsx:57` : `<BackLink href="/vestiaire" label="Retour au Vestiaire" />`, alors que `BottomNav active="echoppe"` (ligne 65, et ligne 46 dans le fallback d'erreur) couvre déjà ce retour. C'est la seule des 6 utilisations de `BackLink` dans le code qui viole la règle posée par l'audit UX #67 (`BackLink` réservé aux sous-flux sans onglet dédié) — Le Marché Noir a un onglet dédié.

### Correctif

Supprimer la ligne 57 et l'import ligne 7 (`import BackLink from "@/components/ui/BackLink";`). `BackLink` est un sibling flex direct dans `<main className="screen-main gap-4 px-4 py-8">` (pas de wrapper dédié autour de lui) — sa suppression retire un enfant du flex, `gap-4` continue de s'appliquer uniformément entre les enfants restants (`CharacterSelect` devient le premier). Aucun trou visuel attendu.

Aucun autre fichier n'importe/utilise `BackLink` dans `app/marche-noir/page.tsx` — deux lignes à toucher, rien d'autre.

---

## 3. B — Swatches tenues sous 44px (#170)

### Cause

`components/shop/CharacterSelect.tsx:185` : les boutons de swatch de tenue (`h-9 w-9`, 36×36px) sont plus petits que la grille de héros juste en dessous (`h-11 w-11`, ligne 215, 44×44px) — sous la cible tactile minimale WCAG 2.5.5, pertinent sur un produit mobile-first « une main » (`PRODUCT.md`).

### Correctif

`h-9 w-9` → `h-11 w-11` ligne 185, alignement pur sur la grille héros.

**Risque de wrap évalué et écarté** : le conteneur tenues (`flex flex-wrap justify-center gap-1.5`, ligne 161) n'a pas de `max-w` contrairement à la grille héros (`max-w-[240px]`, ligne 198) — grandir les swatches de 8px chacun ne peut pas provoquer un retour à la ligne qui n'existerait pas déjà à taille égale, la largeur disponible est celle de la colonne entière (`div.flex.w-full.flex-col.gap-4`, ligne 124). À vérifier visuellement quand même sur les héros au plus grand nombre de tenues (`water_priestess` et `crystal_mauler`, 4 tenues chacun via `lib/hero-skins.ts`) pour confirmer que l'espacement reste propre à l'œil, pas seulement en théorie.

---

## 4. C — Contraste verrouillé illisible (#169)

### Cause

Deux grilles du même fichier appliquent le même principe de dégradation visuelle pour l'état « verrouillé », à des valeurs légèrement différentes, sur une palette déjà très sombre (`bg` L=0.14, `stage` L=0.11, `surface` L=0.2 en oklch) :

- **Grille héros** (lignes 197-234) : fond toujours `bg-black/40`, filtre inline `grayscale(1) brightness(0.4)` appliqué uniquement si non possédé (aucun filtre si possédé). Bordure différencie owned/selected/equipped (`border-border`/`border-gold`/`border-xp`), mais le fond ne varie jamais.
- **Bande tenues** (lignes 160-195) : fond = `swatchColor` brut du catalogue (jamais un token neutre), filtre `grayscale(1) brightness(0.5)` si la tenue n'est pas possédée (héros lui-même possédé).

`DESIGN.md` ne documente ni token de fond dédié à un état « verrouillé », ni la convention `grayscale`/`brightness` (ses sections Elevation et Do's/Don'ts n'en parlent pas) — la seule convention de dégradation documentée ailleurs dans l'app est `opacity-40`/`opacity-50` pour « disabled » (Inputs/Fields), un mécanisme différent (l'opacité laisse deviner la forme sous-jacente, la désaturation+luminosité réduite l'efface).

### Correctif

Contrainte posée ici, valeur **non figée** : le traitement final doit (1) rester dans la palette `DESIGN.md` documentée, (2) garder les silhouettes/couleurs de swatch identifiables entre elles à l'œil, (3) préserver la distinction verrouillé ≠ possédé ≠ équipé sur les deux grilles simultanément (ne pas résoudre l'un en cassant l'autre).

La direction concrète (remonter la luminosité du filtre existant vs remplacer le fond `bg-black/40`/`swatchColor` par un token de surface plus clair type `surface`/`surface-2`) est **déléguée à `/impeccable colorize`** au moment de l'implémentation — décision explicite et volontaire (pas un TBD) : ce choix bénéficie d'un rendu visuel réel pour être tranché correctement, ce qu'un spec texte ne peut pas garantir a priori. Le résultat proposé par l'outil est vérifié visuellement sur les deux grilles (héros ET tenues) avant commit.

---

## 5. D — Vocabulaire interne legacy `qg`/`echoppe` (#172)

### Cause

`components/ui/BottomNav.tsx:3` : `type NavKey = "arene" | "qg" | "echoppe"` (non exporté). Le reframe « Le Démon Intérieur » (issue #51, 2026-07-24) a purgé le vocabulaire japonais/militaire du jeu ("QG" → "Le Vestiaire", "Échoppe" → "Le Marché Noir") — mais uniquement les libellés affichés (`label: "Vestiaire"`, `"Marché Noir"`), pas ces deux identifiants internes. Comportement utilisateur inchangé (le mapping interne→libellé est correct), mais toute recherche de code par vocabulaire actuel ("vestiaire", "marché noir") rate `BottomNav.tsx`.

### Correctif

Renommer `NavKey` en `"arene" | "vestiaire" | "marche-noir"`, et les clés de `ITEMS` (ligne 9-13) en conséquence. Grep exhaustif effectué — **16 sites d'appel réels** (pas ~10 comme supposé par l'issue) :

| Fichier | Ligne | Valeur actuelle |
|---|---|---|
| `app/vestiaire/page.tsx` | 72 | `active="qg"` |
| `app/vestiaire/profil/page.tsx` | 90 | `active="qg"` |
| `app/vestiaire/error.tsx` | 26 | `active="qg"` |
| `app/vestiaire/entrainement/page.tsx` | 71 | `active="qg"` |
| `app/vestiaire/entrainement/error.tsx` | 28 | `active="qg"` |
| `app/tableau-de-chasse/page.tsx` | 66, 96, 184 | `active="qg"` |
| `app/tableau-de-chasse/succes/page.tsx` | 79, 198 | `active="qg"` |
| `app/guide/page.tsx` | 42 | `active="qg"` |
| `app/guide/error.tsx` | 28 | `active="qg"` |
| `app/guide/[slug]/page.tsx` | 55 | `active="qg"` |
| `app/guide/[slug]/error.tsx` | 28 | `active="qg"` |
| `app/marche-noir/page.tsx` | 46, 65 | `active="echoppe"` |

14 occurrences de `active="qg"` → `active="vestiaire"`, 2 de `active="echoppe"` → `active="marche-noir"`. Aucun test/e2e n'assert sur la valeur de `active` (vérifié par grep) — `tsc --noEmit` est le seul filet une fois `NavKey` resserré : tout site oublié échoue à la compilation.

**Corrigé dans la même passe** : `.impeccable/design.json`, composant `"Bottom Nav"` — son champ `description` (« Navigation basse à 3 items (Arène / QG / Échoppe). ») et son `html` d'exemple (`...QG</a>...`) codent encore le vocabulaire legacy. Même dette que celle documentée dans `CLAUDE.md` (« toute valeur d'un type partagé dupliquée en dur... casse silencieusement au prochain renommage ») — laissé tel quel, `/impeccable audit` (demandé par l'issue elle-même, dimension Implementation Integrity) le re-signalerait immédiatement après ce fix.

Docs historiques (`docs/superpowers/specs/2026-08-01-issue69-page-profil-design.md`, `docs/superpowers/plans/2026-08-01-issue69-page-profil.md`, `docs/superpowers/plans/2026-07-31-issue72-succes-titres.md`) citent aussi `active="qg"` comme extrait de code figé dans le temps — **non touchés** : ce sont des comptes-rendus de décisions passées, pas du code vivant, les réécrire falsifierait l'historique.

---

## 6. E — 9 tailles hors ramp (#171)

### Cause

`DESIGN.md` (front-matter `typography:`) documente 4 tokens : `display` (clamp 1.25rem-2.25rem), `label` (0.75rem), `body` (0.875rem), `data` (0.75rem). Aucun palier pour « plus petit que `label`/`data` ». Grep+lecture exhaustifs (pas seulement le comptage de l'issue) trouvent **9 occurrences** du même besoin résolu à la main, pas 8 :

| # | Fichier | Ligne | Littéral |
|---|---|---|---|
| 1 | `components/combat/VersusScene.tsx` | 163 (l'issue citait 144, ligne stale) | `text-[0.65rem]` |
| 2 | `components/combat/TaskRow.tsx` | 164 | `text-[0.65rem]` |
| 3 | `components/combat/TaskRow.tsx` | 172 | `text-[0.65rem]` |
| 4 | `components/ui/BottomNav.tsx` | 28 | `text-[0.65rem]` |
| 5 | `app/tableau-de-chasse/page.tsx` | 129 | `text-[10px]` |
| 6 | `app/tableau-de-chasse/page.tsx` | 200 | `text-[10px]` (helper local `Stat`, non compté par l'issue) |
| 7 | `app/tableau-de-chasse/page.tsx` | 147 | `text-[11px]` |
| 8 | `app/tableau-de-chasse/succes/page.tsx` | 166 | `text-[11px]` |
| 9 | `app/tableau-de-chasse/succes/page.tsx` | 185 | `text-[10px]` |

`0.65rem` (10.4px) est la valeur qui a gagné dans les faits (4/9 usages exacts, les 5 en `10px`/`11px` sont à moins d'1px d'écart, imperceptible). `DESIGN.md` a aussi une mention isolée de `text-[0.65rem]` ligne 206 (section 5, Navigation/Components) documentant déjà cette valeur comme convention de fait sans en faire un token du ramp.

### Correctif

Ajouter un token `micro` (`0.65rem`) au front-matter `typography:` de `DESIGN.md`, cohérent avec le style des 4 tokens existants (`fontFamily`/`fontSize`/`fontWeight`/`lineHeight`/`letterSpacing` — repris de `label` : BoldPixels, poids 400, `lineHeight: 1.2`, `letterSpacing: 0.05em`, seul `fontSize` change). Mettre à jour la mention ligne 206 pour qu'elle référence le token plutôt que la valeur brute. Migrer les 9 occurrences vers la classe correspondante (`text-[0.65rem]`/`text-[10px]`/`text-[11px]` → `text-micro`, ou toute classe Tailwind générée par la convention choisie à l'implémentation — aucun littéral CSS ne doit rester après ce fix). Toutes les occurrences sont des `className` statiques ou en position statique dans un template literal (confirmé par lecture ligne à ligne) — remplacement direct sans risque d'interpolation cassée.

**Corrigé dans la même passe** (même fichier que #172, une seule visite) : `.impeccable/design.json`, `extensions.typographyMeta` (4 clés `{displayName, purpose}`, jamais de valeurs CSS — celles-ci vivent uniquement dans `DESIGN.md`) reçoit une 5e clé `micro`. Le composant `"Bottom Nav"` du même fichier a par ailleurs `font-size: 0.65rem` codé en dur dans son `css` — remplacé par une référence cohérente avec le nouveau token, dans la continuité du fix D ci-dessus sur ce même composant.

Aucun changement visuel perceptible attendu — objectif de cohérence de source, pas de restyle.

---

## 7. Matrice de couverture de tests

| Fix | Test | Nature | Ce qu'il verrouille |
|---|---|---|---|
| A — BackLink | Vérification visuelle (screenshot mobile/desktop) + `grep -rn "BackLink href"` | Manuel | Aucun trou de layout ; aucune autre régression du même type introduite depuis l'audit #67. |
| B — swatches 44px | `e2e/echoppe-skins.spec.ts` (existant, non-régression) + vérification visuelle sur `water_priestess`/`crystal_mauler` (4 tenues) | Playwright + manuel | Le changement de taille ne casse pas le flux d'achat/équipement, ni le wrap sur le héros à 4 tenues. |
| C — contraste verrouillé | `e2e/echoppe.spec.ts` + `e2e/echoppe-skins.spec.ts` (existants, non-régression) + vérification visuelle (verrouillé lisible ET distinct de possédé/équipé, sur les deux grilles) | Playwright + manuel | Aucune régression fonctionnelle ; contraste réellement amélioré à l'œil, pas seulement en théorie. |
| D — rename `NavKey` | `npx tsc --noEmit` | Compilateur | Tout site d'appel oublié échoue à la compilation (aucun test dédié possible, aucune assertion existante sur `active`). |
| E — token `micro` | Vérification visuelle (aucun changement de taille perceptible) + `/impeccable audit` | Manuel + outil | Les 9 occurrences ont bien migré ; le sidecar `.impeccable/design.json` ne recontient plus de littéral typo hors ramp. |

Pas de nouveau test Vitest/Playwright écrit pour ce lot : quatre fixes sont purement visuels/markup (aucune logique dans `lib/`, règle projet n°2 non concernée), le cinquième (D) est un renommage de type mécanique déjà couvert par le compilateur. Cohérent avec la nature de ces 5 issues (P2/P3, tailles S/S/S/S/M) — pas la même situation que #160/#156 qui corrigeaient des bugs de comportement.

---

## 8. Documentation et clôture

Dans le même commit que l'implémentation :

- **`CHANGELOG.md`** — une ligne bundlée sous `## [Unreleased]` → `### Corrections`.
- **`CLAUDE.md`** — pas de nouveau piège non-évident anticipé par ce spec. Un candidat possible existe (la convention retenue pour un fond/filtre « verrouillé », une fois #169 implémenté avec la valeur réellement choisie par `/impeccable colorize`) — à évaluer à ce moment-là, pas avant : le spec ne doit pas documenter une valeur qui n'existe pas encore.
- **Issues #168, #169, #170, #171, #172** — clôturées par la PR, avec le détail des 5 corrections (et la mention explicite des comptages corrigés, cf. §9).

**Pas de documentation utilisateur.** Cinq correctifs de cohérence UI/design-system, aucun changement de règle de jeu, de barème ou de comportement visible en tant que *nouvelle fonctionnalité*. Hors périmètre de la règle du Guide (issue #68).

---

## 9. Risques assumés

**Écart de comptage entre les issues et l'implémentation réelle.** #172 touche 16 sites d'appel, pas ~10 ; #171 migre 9 occurrences, pas 8. Ces écarts viennent d'une vérification exhaustive (grep + lecture ligne à ligne), pas d'un élargissement de scope délibéré — à mentionner explicitement dans la PR/les commentaires de clôture pour qu'un relecteur ne pense pas que le correctif a dérivé au-delà de ce qui était demandé.

**#169 — décision de traitement visuel non tranchée dans ce spec.** La valeur CSS finale dépend du rendu réel proposé par `/impeccable colorize`, pas d'une analyse a priori. Risque assumé : si l'outil ne propose rien de satisfaisant dans la contrainte posée (rester dans la palette documentée), une itération supplémentaire sera nécessaire à l'implémentation — pas un blocage du reste du lot, les 4 autres fixes sont indépendants.

**Docs historiques non mis à jour (#172).** Plusieurs specs/plans passés (`docs/superpowers/specs/2026-08-01-issue69-page-profil-design.md` et 2 fichiers `plans/`) citent encore `active="qg"` comme extrait de code. Volontairement non touchés (comptes-rendus figés d'une décision passée) — un futur lecteur de ces docs verra une valeur qui n'existe plus dans le code vivant ; le risque est jugé mineur et cohérent avec la façon dont le reste du repo traite déjà ses docs historiques (jamais réécrits rétroactivement).
