# Design — Arène Versus (challenger street-fighter)

> Date : 2026-07-19
> Branche : `feat/arena-street-fighter-challenger` (forkée de `feat/arena-classic-polish`, elle-même préservée intacte pour comparaison)

## Contexte

L'écran Arène actuel (branche `feat/arena-classic-polish`) fonctionne bien mais l'utilisateur veut challenger une variante visuelle façon écran versus de jeu de combat : héros et boss face à face, une jauge de HP chacun, plutôt que le seul boss actuellement affiché.

## Objectif

Redesigner l'écran Arène de cette branche en layout versus (MC vs Boss), sans toucher à la logique de tâches (add/toggle/abandon) ni aux VFX déjà validés (slash impact, floating text, overlay victoire).

## Sprites

- Héros : **Fire Knight** (`assets/MC/Elementals_fire_knight_FREE_v1.1/`), frame idle statique trim (même traitement `sharp-cli trim` que Frost Guardian).
- Boss : **Frost Guardian** (déjà en place, réutilisé tel quel).
- Choix validé par l'utilisateur : cohérence avec le reste de l'appli plutôt que le pack CC0 "Streets of Fight".

## Nouvelle mécanique : HP du héros (pénalité procrastination)

Le moteur de jeu actuel (`lib/game-engine.ts`) ne calcule que les HP du Boss. On ajoute une jauge HP côté héros qui reflète les tâches laissées en retard (non résolues d'un jour précédent) — préfigure le futur "Rituel du Réveil" (US-08) sans l'implémenter en entier.

```ts
export const HERO_MAX_HP = 100;
export const HERO_DAMAGE_PER_OVERDUE_TASK = 20;

export type OverdueTask = Pick<Task, "is_abandoned" | "is_completed">;

export function calculateHeroHp(overdueTasks: OverdueTask[]): number {
  const activeOverdue = overdueTasks.filter(
    (task) => !task.is_abandoned && !task.is_completed,
  );
  return Math.max(0, HERO_MAX_HP - activeOverdue.length * HERO_DAMAGE_PER_OVERDUE_TASK);
}
```

- `HERO_MAX_HP` fixe à 100 (pas lié au barème RG-01 du Boss, jauge indépendante).
- Dégâts fixes de 20 HP par tâche en retard, plancher à 0 (pas de HP négatif).
- Pas d'action utilisateur sur ces tâches en retard depuis cet écran (pas de "Annihiler"/"Reporter" — ce sera le scope du futur US-08, hors périmètre ici). Affichage en lecture seule.

## Data fetching (`app/page.tsx`)

Requête additionnelle en lecture seule : tâches de l'utilisateur où `day_date < today`, `is_completed = false`, `is_abandoned = false`. Résultat passé en prop à `Arena` pour calcul de `calculateHeroHp`.

## Composants

- **`components/combat/HeroBar.tsx`** — nouveau, miroir de `BossBar.tsx` : même structure ARIA (`role="progressbar"`), jauge remplie de droite à gauche (visuellement face à la jauge du Boss).
- **`components/combat/VersusScene.tsx`** — remplace `CombatScene.tsx` dans cette branche : même background (steampunk cityscape), Fire Knight positionné bas-gauche, Frost Guardian bas-droite, face à face. Même traitement `[image-rendering:pixelated]` et `drop-shadow`.
- **`components/combat/Arena.tsx`** — réécrit : rangée versus en haut (`HeroBar` — libellé "VS" central — `BossBar`), `VersusScene` en dessous, puis task list / add form / bottom nav inchangés. VFX (`ImpactVfx`, `FloatingText`, `PerfectOverlay`) réutilisés sans modification — ils s'appliquent toujours côté Boss uniquement (pas de pulse côté héros dans cette itération).

## Hors scope (explicitement exclu)

- Pas de vrai "Rituel du Réveil" (overlay bloquant, choix Annihiler/Reporter) — juste l'affichage passif de la jauge héros.
- Pas d'animation de dégâts/hit côté héros.
- Pas de changement sur la branche `feat/arena-classic-polish` (préservée telle quelle pour comparaison).

## Tests

- `lib/game-engine.test.ts` : cas pour `calculateHeroHp` (0 tâche en retard → 100 HP ; N tâches en retard → 100 - 20N, plancher 0 ; tâches abandonnées/complétées ignorées).
