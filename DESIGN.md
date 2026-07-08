<!-- SEED: re-run /impeccable document once there's code to capture the actual tokens and components. -->

---
name: Dodojo
description: Combat de boss d'arcade quotidien contre la procrastination
---

# Design System: Dodojo

## 1. Overview

**Creative North Star: "Le Dojo de Rue"**

Un élève de dojo d'arts martiaux qui porte son entraînement dans la rue — la discipline et la précision du dojo (HUD lisible, hiérarchie claire, feedback net) rencontrent l'énergie brute d'un combat de rue façon Street Fighter II / Scott Pilgrim vs the World. La palette est pleine et fonctionnelle (rouge combat, indigo néon, or), la typographie mêle pixel-art et monospace pour un HUD qui se lit comme un jeu de combat, et le motion est chorégraphié : chaque coup porté déclenche une séquence (flash, secousse, texte flottant), pas une simple transition d'état.

Ce système rejette explicitement l'esthétique SaaS/outil de productivité épuré (Notion, Linear) : Dodojo n'est pas un tableur déguisé, c'est un écran de combat.

**Key Characteristics:**
- Palette pleine et fonctionnelle, pas minimaliste
- HUD pixel/mono, jamais une police corporate neutre
- Motion chorégraphié sur chaque interaction de combat (ajout/validation de tâche)
- Fond sombre arcade par défaut

## 2. Colors

**The Full Palette Rule.** Chaque rôle de couleur porte une fonction de jeu précise (HP, XP, or, danger) — aucune couleur n'est décorative. `[valeurs hex/OKLCH à résoudre à l'implémentation]`

### Primary
- **Rouge Combat** `[to be resolved during implementation]` : jauge de HP du Boss, flash de dégâts, accents de danger/urgence.

### Secondary
- **Indigo Néon** `[to be resolved during implementation]` : jauge d'XP, éléments de progression, accents magiques/cabinet d'arcade.

### Tertiary
- **Or** `[to be resolved during implementation]` : monnaie (pièces d'or), récompenses, éléments de l'Échoppe (Sprint 2).

### Neutral
- **Fond Arcade Sombre** `[to be resolved during implementation]` : fond par défaut, façon cabinet d'arcade dans une salle sombre.
- **Texte / bordures** `[to be resolved during implementation]` : hiérarchie de texte et séparateurs sur fond sombre.

## 3. Typography

**Display Font:** Police pixel-art `[à choisir à l'implémentation]`
**Body / HUD Font:** Monospace `[à choisir à l'implémentation]`

**Character:** Le pixel porte l'impact (titres, dégâts flottants, écrans de transition K.O.) ; le monospace porte la lisibilité opérationnelle (HP/XP/compteurs, corps de texte des tâches) — direction "Pixel display + mono body" retenue pour renforcer le côté terminal/HUD de combat rétro.

### Hierarchy
- **Display** (pixel, grand, tassé) : titres d'écran, "LEVEL UP", "PERFECT", nom du Boss.
- **Headline** (pixel, moyen) : sous-titres d'écran, noms de section (Arène, QG, Échoppe).
- **Body** (mono, lisible) : titres de tâches, description, corps de texte général.
- **Label** (mono, petit) : compteurs HP/XP/or, timestamps, métadonnées de tâche.

## 4. Elevation

Layered, pas flat : le motion chorégraphié (flashs, secousses, textes flottants superposés) implique une hiérarchie de profondeur explicite entre le fond de combat, les éléments HUD, et les overlays de transition (Rituel du Réveil, Rituel Obi-Wan, écrans K.O.). `[valeurs d'ombre/glow à résoudre à l'implémentation]`

## 6. Do's and Don'ts

### Do:
- **Do** utiliser une palette pleine avec des rôles de couleur nommés et fonctionnels (HP, XP, or, danger).
- **Do** chorégraphier chaque interaction de combat (flash + secousse + texte flottant), jamais une simple transition d'état.
- **Do** garder le pixel-art pour l'impact (display) et le monospace pour la lisibilité opérationnelle (HUD/body).

### Don't:
- **Don't** ressembler à un outil de productivité épuré façon Notion ou Linear — pas de fond blanc/crème minimaliste, pas de gris neutre dominant.
- **Don't** traiter le pixel-art comme une simple décoration en surface d'une UI SaaS classique.
- **Don't** utiliser des transitions d'état plates sur les moments de combat (ajout/validation/échec de tâche) — chaque coup doit se sentir.
