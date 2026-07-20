# Spec — US-16 : Animation du « Perfect » (Boss terrassé à 0 HP)

> Date : 2026-07-20 · Statut : validé (brainstorming) · Sprint 2
> Réutilise / précise le `PerfectOverlay` déjà référencé par le Cycle de la Journée (US-07).

## 1. Contexte & problème

Terrasser le Boss (0 HP) doit produire une **célébration majeure** style K.O. Street Fighter. Le Cycle mentionne déjà un `PerfectOverlay` réutilisé par le Crépuscule victoire, mais son **déclenchement en direct** (au moment où la dernière tâche vide la jauge) et le **palier PERFECT vs K.O.** ne sont pas spécifiés. Ce spec les définit.

## 2. Décisions de cadrage (tranchées)

| # | Décision |
|---|----------|
| D1 | **Déclencheur** : transition de `bossCurrentHp` **vers 0** (avec `bossMaxHp > 0`) suite à la complétion d'une tâche. Sur la **transition**, pas à chaque render. |
| D2 | **Palier PERFECT vs K.O.** : **PERFECT** si Boss à 0 **ET** Héros à **100 HP** (aucun reste non résolu ayant entamé la jauge) ; sinon **« K.O. ! / VICTOIRE »** (même explosion, texte différent). Donne du sens à la jauge Héro et au mot PERFECT. |
| D3 | **Après l'anim : CTA Crépuscule**, non-automatique. L'explosion joue, puis un bouton proéminent propose le Rituel du Crépuscule. La clôture reste **manuelle / non-bloquante** (D3 du Cycle). |
| D4 | **Renaissance du Boss** : ajouter une tâche après KO re-heal le Boss (RG-02) ; si le Boss retombe à 0 plus tard, l'overlay **re-déclenche** (nouvelle transition → 0). |
| D5 | **Jour vide ≠ KO** : `bossMaxHp == 0` (aucune tâche) ne déclenche jamais (garde `bossMaxHp > 0`, cohérent avec `summarizeDay`). |

### Améliorations retenues

| # | Amélioration |
|---|--------------|
| A1 | **Variante `prefers-reduced-motion`** : PERFECT statique (pas de secousse/flash violent), respecte l'a11y (PRODUCT.md, A7 du Cycle). |
| A2 | **Super-variante jalon** : si ce KO clôt un **palier de streak** (US-12 : 7/30/100), animation renforcée (flammes A3 d'US-12 + texte spécial) — dopamine en couches. |

### Baselines techniques

- **B1 — Détection pure de transition.** La décision « faut-il déclencher, et à quel palier » est pure (`game-engine`), pilotée par les HP avant/après + HP Héro, testée Vitest.
- **B2 — Un déclenchement par transition.** Pas de re-jeu tant que le Boss n'est pas repassé > 0 puis re-tombé à 0 (D4). Anti-spam de render.
- **B3 — Assets.** `explosion-1-e` (22 frames, KO) + `Symbols/symbol_you_won_text` (ASSETS §4). VFX en CSS `steps()`.

## 3. Logique de déclenchement (pur)

```ts
type KoTier = 'perfect' | 'ko' | null;

koOutcome(prevBossHp, nextBossHp, bossMaxHp, heroHp): KoTier
// null si nextBossHp !== 0 || bossMaxHp === 0 || prevBossHp === 0 (déjà à 0)
// 'perfect' si transition→0 && heroHp === HERO_MAX_HP
// 'ko' sinon (transition→0 mais Héros entamé)
```

- `prevBossHp === 0` garde contre le re-déclenchement sans renaissance (B2 / D4).
- `heroHp` = `calculateHeroHp(overdueTasks)` — 100 si aucun reste non résolu (typiquement après un Réveil propre).

## 4. Flow

1. Complétion de la dernière tâche active → recalcul HP.
2. `koOutcome` renvoie `perfect` / `ko` → monter l'overlay (explosion + texte + récap dégâts/XP/or du jour).
3. Overlay affiche **CTA « 🌙 Rituel du Crépuscule »** (D3) + option « continuer » (ajouter des tâches).
4. Si palier streak franchi → super-variante (A2).
5. Fermer / CTA → retour Arène ou ouverture du récap Crépuscule (US-07).

## 5. États UI

Overlay transitoire (pas un écran). Loading/Error non applicables (purement visuel client) ; l'écriture éventuelle (Crépuscule) porte ses propres états (US-07). `prefers-reduced-motion` obligatoire (A1).

## 6. Modèle de données

Aucun changement de schéma. Consomme HP (dérivés des `tasks`), `heroHp`, et l'état streak (US-12) pour la super-variante.

## 7. Découpage technique

### `lib/game-engine.ts` (pur, Vitest)
- `koOutcome(prevBossHp, nextBossHp, bossMaxHp, heroHp)` (§3).
- Réutilise `calculateBossCurrentHp`, `calculateHeroHp`, `HERO_MAX_HP`.

### Composants (`components/combat/`)
- `PerfectOverlay.tsx` (existant/à préciser) : props `tier: 'perfect' | 'ko'`, `milestone?`, récap, CTA Crépuscule.
- VFX explosion (`explosion-1-e`) + texte (`symbol_you_won_text`) en CSS `steps()`.
- Variante reduced-motion (A1), super-variante jalon (A2).
- Câblage `Arena.tsx` : après complétion, comparer HP avant/après → `koOutcome` → monter l'overlay ; mémoriser le dernier `prevBossHp` pour la garde de transition.

### Docs (même commit)
- `CLAUDE.md` : déclenchement KO/PERFECT (transition, palier Héro plein, renaissance, reduced-motion).
- `CHANGELOG.md` : ligne US-16.
- `SPECS_FONCTIONNELLES.md` : préciser la BDD US-16 (PERFECT vs KO, CTA Crépuscule).

## 8. Tests

### Vitest (pur)
- `koOutcome` : transition→0 Héros plein → `perfect` ; transition→0 Héros entamé → `ko` ; `nextBossHp>0` → null ; `bossMaxHp==0` (jour vide) → null ; `prevBossHp==0` (déjà mort, pas de renaissance) → null ; renaissance puis re-KO → re-déclenche.

### Playwright e2e (série, prod)
- `perfect-ko.spec.ts` : compléter la dernière tâche → overlay affiché + CTA Crépuscule ; ajouter une tâche après KO → Boss renaît, overlay reparti ; (si faisable) Héros entamé → texte K.O. et non PERFECT.
- ⚠️ Compte unique : contrôler l'état des restes (Héros plein/entamé) via fixture.

## 9. Hors scope

- Sons (KO audio) → future (assets .ogg CC0 dispo, non câblés ici).
- Partage PNG du PERFECT (US-20).

## 10. Vérification

1. Vitest vert (matrice de transitions).
2. `build` + `lint` propres.
3. e2e série vert en local.
4. Manuel : dernier check → explosion + PERFECT (Héros plein) ; avec restes non résolus → K.O. ; CTA Crépuscule ; renaissance + re-KO ; `prefers-reduced-motion` = variante douce ; jalon streak = super-variante.
