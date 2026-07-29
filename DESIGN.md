---
name: Dodojo
description: Combat de boss d'arcade quotidien contre la procrastination
colors:
  bg: "oklch(0.14 0.015 25)"
  stage: "oklch(0.11 0.014 25)"
  surface: "oklch(0.2 0.02 25)"
  surface-2: "oklch(0.17 0.018 25)"
  ink: "oklch(0.96 0.01 25)"
  muted: "oklch(0.66 0.02 25)"
  faint: "oklch(0.6 0.02 25)"
  border: "oklch(0.32 0.02 25)"
  hp: "oklch(0.55 0.19 25)"
  hp-dim: "oklch(0.3 0.08 25)"
  hp-text: "oklch(0.64 0.19 25)"
  xp: "oklch(0.54 0.17 275)"
  xp-dim: "oklch(0.28 0.08 275)"
  xp-text: "oklch(0.625 0.17 275)"
  gold: "oklch(0.85 0.13 85)"
  gold-ink: "oklch(0.22 0.03 85)"
  alert: "oklch(0.62 0.17 55)"
  alert-dim: "oklch(0.28 0.06 55)"
  alert-ink: "oklch(0.15 0.02 55)"
typography:
  display:
    fontFamily: "BoldPixels, Courier New, monospace"
    fontSize: "clamp(1.25rem, 4vw, 2.25rem)"
    fontWeight: 400
    lineHeight: 1.1
    letterSpacing: "0.05em"
  label:
    fontFamily: "BoldPixels, Courier New, monospace"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.2
    letterSpacing: "0.05em"
  body:
    fontFamily: "ui-monospace, SFMono-Regular, Consolas, Liberation Mono, Menlo, monospace"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "normal"
  data:
    fontFamily: "ui-monospace, SFMono-Regular, Consolas, Liberation Mono, Menlo, monospace"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.2
    letterSpacing: "normal"
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
  full: "9999px"
spacing:
  xs: "6px"
  sm: "8px"
  md: "12px"
  lg: "16px"
components:
  button-primary:
    backgroundColor: "{colors.hp}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "6px 12px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-gold-outline:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.gold}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "8px 20px"
  progress-track-hp:
    backgroundColor: "{colors.hp-dim}"
    rounded: "{rounded.sm}"
    height: "14px"
  progress-fill-hp:
    backgroundColor: "{colors.hp}"
    rounded: "{rounded.sm}"
  progress-track-xp:
    backgroundColor: "{colors.xp-dim}"
    rounded: "{rounded.sm}"
    height: "14px"
  progress-fill-xp:
    backgroundColor: "{colors.xp}"
    rounded: "{rounded.sm}"
  task-row:
    backgroundColor: "{colors.surface}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
  nav-item-active:
    textColor: "{colors.ink}"
    typography: "{typography.data}"
  nav-item:
    textColor: "{colors.faint}"
    typography: "{typography.data}"
---

# Design System: Dodojo

## 1. Overview

**Creative North Star: "Le Démon Intérieur"**

Ce qui traîne dans ta tête, rendu visible et combattable — la discipline d'un HUD lisible et d'un feedback net rencontre l'énergie brute d'un combat d'arcade façon Street Fighter II. Le système est bâti sur une palette pleine et fonctionnelle (rouge combat, indigo néon, or), une police pixel-art pour l'impact et une police monospace pour la lisibilité opérationnelle, et un fond sombre de cabinet d'arcade en toute occasion. Le motion est chorégraphié par coup porté (flash, secousse, texte flottant), jamais une simple transition d'état.

Ce système rejette explicitement l'esthétique SaaS/outil de productivité épuré (Notion, Linear) : Dodojo n'est pas un tableur déguisé, c'est un écran de combat.

**Key Characteristics:**
- Palette pleine, chaque couleur porte une fonction de jeu précise (HP, XP, or, alerte) — aucune décorative.
- Fond arcade sombre teinté rouge chaud (`oklch(0.14 0.015 25)`) en toute circonstance, jamais de light mode.
- HUD pixel (BoldPixels) pour l'impact, monospace pour l'opérationnel — jamais de police corporate neutre.
- Depth par superposition de surfaces sombres et d'overlays assombris, jamais par ombre portée.
- Motion chorégraphié sur chaque interaction de combat (ajout/validation/abandon de tâche).

## 2. Colors

**The Full Palette Rule.** Chaque couleur du système porte une fonction de jeu précise et nommée — HP, XP, or, alerte. Aucune couleur n'est là pour "faire joli" ; si une nouvelle couleur ne mappe à aucun de ces rôles, elle ne rentre pas dans la palette.

### Primary
- **Rouge Combat** (`oklch(0.55 0.19 25)`, token `hp`) : jauge de HP Héros/Boss, flash de dégâts (`hit-flash`), secousse d'écran (`is-hit`), CTA principal ("Ajouter"), point actif de la nav. Réservé aux fonds pleins/bordures — sur `bg`/`surface`/`surface-2`, `ink` est le texte de contraste. Sa variante sourde `hp-dim` (`oklch(0.3 0.08 25)`) sert de piste (track) sous la jauge. **`hp-text`** (`oklch(0.64 0.19 25)`) est la variante dédiée quand le rouge combat sert lui-même de *couleur de texte* sur un fond neutre (messages d'erreur, liens, badges) — `hp` brut y tombe sous 4.5:1 (WCAG AA).

### Secondary
- **Indigo Néon** (`oklch(0.54 0.17 275)`, token `xp`) : jauge d'XP, bordure du héros/tenue actuellement équipé (Marché Noir). Variante sourde `xp-dim` (`oklch(0.28 0.08 275)`) en piste de jauge. **`xp-text`** (`oklch(0.625 0.17 275)`) : même rôle que `hp-text`, pour l'indigo utilisé comme couleur de texte.

### Tertiary
- **Or** (`oklch(0.85 0.13 85)`, token `gold`) : solde de monnaie, CTA « Terminer la journée », bordure de sélection dans Le Marché Noir, flammes de série, en-tête "PERFECT". `gold-ink` (`oklch(0.22 0.03 85)`) est le texte prévu sur fond or plein.

### Neutral
- **Fond Arcade** (`oklch(0.14 0.015 25)`, token `bg`) : fond par défaut de l'app.
- **Stage** (`oklch(0.11 0.014 25)`, token `stage`) : le plus sombre de la rampe, base du décor de combat (`.combat-scene`) derrière le dégradé steampunk.
- **Surface** (`oklch(0.2 0.02 25)`) / **Surface 2** (`oklch(0.17 0.018 25)`) : cartes, formulaires, lignes de tâches, panneaux de confirmation ; `surface-2` sert de deuxième teinte pour le dégradé du skeleton de chargement.
- **Ink** (`oklch(0.96 0.01 25)`) : texte primaire sur fond sombre.
- **Muted** (`oklch(0.66 0.02 25)`) : texte secondaire (méta-données, sous-titres).
- **Faint** (`oklch(0.6 0.02 25)`) : texte tertiaire, désactivé, item de nav inactif. Doit rester lisible (texte réellement actionnable, pas purement décoratif) — ne jamais redescendre sous cette valeur (une valeur plus sombre est déjà passée sous 4.5:1 sur `surface`, cf. Do's and Don'ts).
- **Border** (`oklch(0.32 0.02 25)`) : bordures de cartes, boutons outline, séparateurs.

### Semantic
- **Alert** (`oklch(0.62 0.17 55)`, orange) : uniquement les états d'alarme fonctionnels — clignotement de la jauge Héros sur deadline ratée (`hero-alarm`), messages d'erreur, bouton "abandonner" au survol. Jamais utilisé comme décoration. `alert-dim` (`oklch(0.28 0.06 55)`) en usage de fond/piste. `alert-ink` (`oklch(0.15 0.02 55)`) : texte lisible sur un fond `alert` plein (même rôle que `gold-ink` sur `gold`).

### Named Rules (optional, powerful)
**La règle du fond teinté.** Tous les neutres (`bg`/`stage`/`surface`/`surface-2`/`border`) partagent la même teinte de hue 25 (rouge chaud) — jamais un gris neutre pur. C'est ce qui fait que même les écrans HUD "plats" (Le Vestiaire, Le Marché Noir) restent dans l'univers combat, sans dépendre du décor `.combat-scene`.

**La règle texte-vs-fond.** `hp`/`xp` bruts sont réservés aux fonds pleins (`bg-hp`, `bg-xp`) et aux bordures (`border-hp`, `border-xp`) — jamais comme couleur de texte sur un fond neutre (`bg`/`surface`/`surface-2`), où ils tombent sous 4.5:1. Toute utilisation en couleur de texte passe par `hp-text`/`xp-text`, calculés pour rester lisibles sur les trois fonds neutres.

## 3. Typography

**Display Font:** BoldPixels (pixel-art, avec repli `Courier New, monospace`)
**Body / HUD Font:** monospace système (`ui-monospace, SFMono-Regular, Consolas, Liberation Mono, Menlo, monospace`)

**Character:** Le pixel porte l'impact (titres d'écran, dégâts flottants, KO/PERFECT, noms de héros/boss, libellés de bouton) — toujours en majuscules avec tracking élargi (`tracking-wide` à `tracking-widest`). Le monospace porte la lisibilité opérationnelle : titres de tâches, corps de texte, compteurs HP/XP/or en chiffres tabulaires (`tabular-nums`).

### Hierarchy
- **Display** (BoldPixels, `text-2xl` à `text-4xl`, tracking large) : titres de célébration plein écran — "PERFECT"/K.O. (`ko-burst`), passage de niveau, flammes de série.
- **Headline** (BoldPixels, `text-sm`, uppercase, tracking-wide) : noms de héros/Boss au-dessus des jauges HP, titres de section HUD (Arène, Le Vestiaire, Le Marché Noir).
- **Body** (monospace, `text-sm`) : titres et description de tâche, texte de dialogue La Voix/Boss (max ~28ch dans les overlays).
- **Label** (BoldPixels, `text-xs`, uppercase, tracking-wide) : libellés de bouton ("Ajouter", "Équiper", "Confirmer"), nav du bas.
- **Data** (monospace, `text-xs`, `tabular-nums`) : compteurs HP/XP/or, timestamps, métadonnées de tâche.

### Named Rules (optional)
**La règle du pixel-majuscule.** Toute occurrence de BoldPixels est systématiquement en majuscules avec tracking élargi — jamais en casse mixte. C'est la police du HUD/impact, pas de la prose ; elle ne porte jamais un texte français long ou accentué (cf. contrainte Satori de la carte de partage, US-20).

## 4. Elevation

Layered à plat, jamais d'ombre portée : aucune valeur `box-shadow` décorative dans le système. La profondeur vient de deux mécanismes seulement : (1) une rampe de surfaces de plus en plus claires (`stage` → `bg` → `surface-2` → `surface`) qui hiérarchise fond de combat / HUD / cartes ; (2) des overlays de transition posés en `position: absolute`/`fixed` sur un fond noir semi-transparent (`oklch(0.08 0 0 / 72-92%)` ou `bg-black/40`–`bg-black/60`), jamais un flou (`backdrop-filter`) — les overlays non-bloquants (PERFECT/K.O., passage de niveau) restent dans le bas de la plage (72-78%), les overlays bloquants qui exigent une résolution avant de continuer (Le Réveil, « Terminer la journée ») montent plus haut (88-92%) pour marquer davantage la coupure.

### Named Rules (optional)
**La règle du noir-plat.** Un overlay bloquant s'obtient en assombrissant (noir à 40–78% d'opacité), jamais en floutant. Aucun `blur()`/`backdrop-filter` dans le système à ce jour.

## 5. Components

### Buttons
- **Shape:** coins arrondis 6px (`rounded-md`) pour tous les boutons.
- **Primary** (`bg-hp`, texte `ink`, BoldPixels `text-xs` uppercase, `px-3 py-1.5`) : action principale d'un écran ("Ajouter" une tâche). Désactivé à `opacity-40`.
- **Ghost / bordé** (fond transparent ou `surface`, bordure `border`, texte `ink` ou `muted`, `px-4 py-2`) : actions secondaires ("Continuer", "Équiper", "Annuler").
- **Or (bordé)** (fond `surface`, bordure `gold`, texte `gold`) : CTA à forte valeur émotionnelle — « Terminer la journée », confirmation d'achat.
- **Icône seule** (bordure `border`, fond `surface`, `p-1.5` à `p-2`, icône SVG 16px `currentColor`) : micro (dictée), poignée de drag (`⠿`), abandon (`×`, devient `alert` au survol).

### Cards / Containers
- **Corner Style:** `rounded-md` (6px) pour lignes de tâche, formulaires, panneaux de confirmation ; `rounded-lg` (8px) pour les grands panneaux (stage de sélection de héros, overlays plein écran).
- **Background:** `surface` sur fond `bg`/`stage`, ou `bg-black/40`–`bg-black/60` pour un panneau posé sur le décor de combat.
- **Shadow Strategy:** aucune — cf. Elevation.
- **Border:** 1px `border` par défaut ; `border-hp` en surbrillance de zone de drop, `border-gold`/`border-xp` en sélection/équipement (Le Marché Noir).
- **Internal Padding:** `px-3 py-2` (lignes de tâche, formulaire d'ajout) à `p-4` (panneaux, stage héros).

### Inputs / Fields
- **Style:** fond transparent sur conteneur `surface` bordé, pas de bordure propre à l'input, `text-sm` monospace, placeholder en `faint`.
- **Focus:** anneau `focus-visible:outline` (2px, `xp`, offset 2px) sur les champs de saisie (ajout de tâche/sous-tâche) ; les boutons/liens utilisent `focus-visible:text-*` (changement de couleur de texte, pas d'anneau). Tout overlay bloquant (Le Réveil, confirmations, popovers) piège le focus clavier (Tab/Shift+Tab confinés) via le hook `useFocusTrap` et restaure le focus au déclencheur à la fermeture.
- **Error / Disabled:** erreur en texte `alert` avec `role="alert"` ; disabled à `opacity-40`/`opacity-50` avec `cursor-wait`/curseur par défaut.

### Progress Bars (Signature Component)
Élément le plus caractéristique du système — la jauge de vie (Héros et Boss) est littéralement la mécanique de jeu, pas une décoration de chargement.
- **Track:** `h-3.5` (14px), `rounded-sm`, fond `hp-dim` (Héros/Boss) ou `xp-dim` (XP), `role="progressbar"` avec `aria-valuenow/min/max`.
- **Fill:** fond `hp`/`xp` plein, `transition-[width] duration-300 ease-out` — jamais de saut instantané, toujours une glissade de 300ms.
- **Label:** nom (BoldPixels, uppercase) + compteur `xx/yy HP` (monospace, `tabular-nums`, `muted`) au-dessus de la jauge, avec un `drop-shadow` léger pour rester lisible sur le décor de combat.
- **État d'alarme:** clignotement `hero-alarm` (halo `alert` par à-coups, 3 répétitions) sur deadline ratée non résolue.

### Navigation
- **Style:** barre basse (`BottomNav`), 3 items égaux (`justify-around`), séparée par une bordure haute `border-border`. À partir de 1024px (desktop, issue #112), devient un rail fixe à gauche (`position: fixed`, `w-20`, items empilés verticalement, bordure droite au lieu de bordure haute).
- **Typography:** BoldPixels `text-[0.65rem]` uppercase tracking-wide.
- **États:** actif = texte `ink` + poids semi-gras + point plein `bg-hp` ; inactif = texte `faint` + point `bg-faint`, `hover`/`focus-visible` passent à `text-ink` (même convention que les boutons icône, cf. `TaskRow`) — pertinent à partir du rail desktop, piloté à la souris/clavier.

## 6. Do's and Don'ts

### Do:
- **Do** garder tous les neutres teintés hue 25 (jamais de gris neutre pur) — cf. La règle du fond teinté.
- **Do** réserver BoldPixels aux libellés courts en majuscules ; tout texte français long/accentué reste en monospace (contrainte Satori documentée dans CLAUDE.md).
- **Do** faire glisser toute jauge HP/XP sur 300ms `ease-out`, jamais un saut instantané.
- **Do** construire la profondeur par superposition de surfaces et overlays noirs semi-transparents, jamais par `box-shadow` ou flou.
- **Do** chorégraphier chaque interaction de combat (flash + secousse + texte flottant), jamais une simple transition d'état.
- **Do** piéger le focus clavier (`useFocusTrap`) sur tout overlay bloquant, et restaurer le focus au déclencheur à la fermeture.

### Don't:
- **Don't** ressembler à un outil de productivité épuré façon Notion ou Linear — pas de fond blanc/crème minimaliste, pas de gris neutre dominant.
- **Don't** traiter le pixel-art comme une simple décoration en surface d'une UI SaaS classique.
- **Don't** utiliser des transitions d'état plates sur les moments de combat (ajout/validation/échec de tâche) — chaque coup doit se sentir.
- **Don't** introduire de `box-shadow` décoratif ou de `backdrop-filter`/glassmorphism — la profondeur de ce système est plate, jamais floutée.
- **Don't** mettre du texte français long ou accentué en police BoldPixels — elle ne rend que les majuscules courtes (chiffres, "DODOJO", "VS").
- **Don't** utiliser `hp`/`xp` bruts comme couleur de texte sur un fond neutre — sous 4.5:1, utiliser `hp-text`/`xp-text`.
