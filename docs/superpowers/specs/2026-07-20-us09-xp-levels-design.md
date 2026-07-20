# US-09 : Progression de base (XP & Niveaux)

> Date : 2026-07-20
> Statut : Validé
> Issue GitHub associée : #6

## 1. Rôle produit — XP/Niveau vs Or

Ces deux compteurs existent déjà dans `profiles` (`level`, `xp`, `gold`) mais servent des besoins différents :

- **XP/Niveau** : score permanent, mesure de progression dans le temps. Sa seule récompense est immédiate et narrative — l'écran "LEVEL UP" (dopamine, cf. Design Principle #1 de `PRODUCT.md`). Il ne se dépense jamais.
- **Or** : monnaie transactionnelle. Se gagne et se dépense pour débloquer des skins de Boss dans l'Échoppe (US-18, Sprint 2). Hors scope de ce lot.

**Dette explicite actée** : `profiles.current_title` reste `'Novice'` pour l'instant. Le mapping niveau → titre (ex. ceintures de dojo : Blanche/Jaune/Orange/Verte/Bleue/Marron/Noire, cohérent avec le brand "élève de dojo qui se bat dans la rue") n'est **pas** traité par US-09. À trancher dans un ticket dédié ou lors d'US-10 (Le Panthéon).

## 2. Règles de calcul

- **XP par tâche** : gain fixe de 30 XP à la validation d'une tâche principale (sous-tâches hors scope, non livrées — US-04).
- **Seuil de niveau croissant** : passer du niveau N au niveau N+1 nécessite `N × 100` XP (niveau 1→2 : 100 XP, niveau 2→3 : 200 XP, etc.).
- **Anti-exploit / cohérence comptable** : décocher une tâche déjà validée retire l'XP symétriquement à ce qui a été gagné, avec possibilité de redescendre de niveau (delevel) en cascade si nécessaire. Décision assumée : la cohérence comptable prime sur le risque (mineur) de casser un moment LEVEL UP en cas de décochage accidentel — préférée à l'alternative "XP acquise définitive" qui aurait été plus simple mais moins stricte.
- **Plancher** : niveau minimum 1, XP minimum 0 (jamais de niveau ou XP négatif).
- **Cascade multi-niveaux** : un seul gain ou une seule perte peut faire franchir plusieurs paliers d'un coup (cas limite à couvrir en test, même si peu probable avec un gain fixe de 30 XP).

## 3. Logique pure — `lib/game-engine.ts`

Nouvelles constantes et fonction, testables en isolation sans dépendance UI :

```ts
export const XP_PER_TASK = 30;
export const XP_THRESHOLD_PER_LEVEL = 100;

export function xpThresholdForLevel(level: number): number {
  return level * XP_THRESHOLD_PER_LEVEL;
}

export interface XpState {
  level: number;
  xp: number;
}

export function applyXpDelta(state: XpState, delta: number): XpState {
  // Cascade montée si xp + delta franchit un ou plusieurs seuils.
  // Cascade descente symétrique si xp + delta devient négatif.
  // Plancher : level >= 1, xp >= 0.
}
```

`applyXpDelta` est la seule fonction à connaître la mécanique de seuils. Elle est utilisée à l'identique pour un gain (`delta > 0`) et une perte (`delta < 0`), garantissant qu'un aller-retour coche/décoche restitue exactement l'état de départ.

## 4. Persistance — `app/actions/tasks.ts`

`setTaskCompleted(id, isCompleted)` évolue :

1. Fetch de la tâche existante (`is_completed`, `is_abandoned`) **avant** update, pour connaître la transition réelle — évite tout double comptage sur un retry ou un appel no-op.
2. Si transition réelle (`previousIsCompleted !== isCompleted`) et tâche non abandonnée :
   - Fetch du profil courant (`level`, `xp`).
   - `delta = isCompleted ? +XP_PER_TASK : -XP_PER_TASK`.
   - `applyXpDelta(profile, delta)` → nouveau `{level, xp}`.
   - Update `profiles(level, xp)`.
3. Update de la tâche (`is_completed`).
4. Retour `{ error, level, xp, leveledUp }` — `leveledUp` = `true` si le niveau a augmenté suite à ce gain (permet au client de déclencher l'overlay).

Le rollback existant (snapshot restauré en cas d'erreur serveur) s'étend au profil, pas seulement aux tâches.

## 5. UI — `components/combat/Arena.tsx` + `LevelUpOverlay.tsx`

- `profile` passe de prop figée à `useState` local, pour permettre une mise à jour optimiste symétrique à celle déjà en place sur `tasks`.
- `handleToggle` calcule le nouveau profil de façon optimiste via `applyXpDelta` (même pattern que le calcul optimiste des HP du Boss), déclenche un pulse XP **indépendant** du pulse HP existant (deux floating text simultanés, couleurs distinctes — HP en rouge/or existant, XP en indigo néon selon `DESIGN.md`).
- Nouveau composant `LevelUpOverlay.tsx`, calqué sur le patron de `PerfectOverlay.tsx` : overlay dismissible plein cadre Arène, "LEVEL UP ! Niveau X" + punchline dojo/rue. Affiché uniquement quand `leveledUp` est vrai en retour serveur (jamais sur un delevel, qui reste silencieux — pas de pénalité visuelle, juste une correction comptable).
- Erreur serveur → rollback `tasks` **et** `profile` au snapshot précédent (extension du pattern déjà en place).

## 6. Tests

`lib/game-engine.test.ts`, cas à couvrir pour `applyXpDelta` :

- Gain simple, sans franchissement de seuil.
- Gain qui franchit exactement un seuil.
- Gain qui franchit plusieurs seuils en cascade (delta artificiellement élevé pour le test).
- Perte simple, sans passage sous 0.
- Perte qui fait redescendre un ou plusieurs niveaux en cascade.
- Plancher : perte qui tenterait de passer sous niveau 1 / xp 0 → clampée.
- Symétrie : `applyXpDelta(applyXpDelta(state, +30), -30)` === `state` (aller-retour coche/décoche = état identique).

Pas de nouveau test e2e Playwright requis pour ce lot — pas de nouveau parcours utilisateur critique, uniquement du feedback visuel additionnel sur un parcours déjà couvert.

## 7. Hors scope (dette explicite)

- XP pour les sous-tâches (US-04, pas encore livré).
- Mapping niveau → titre / ceinture de dojo (`current_title`) — ticket futur ou US-10 (Le Panthéon).
- Panthéon / historique de niveau affiché (US-10).
- Malus XP du Rage Quit (US-15).
