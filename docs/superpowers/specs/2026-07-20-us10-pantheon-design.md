# Spec — US-10 : Le Panthéon (Écran des statistiques de combat)

> Date : 2026-07-20 · Statut : validé (brainstorming) · Sprint 2
> Lecture seule sur `day_results` + `profiles`. Dépend de US-12 (best_streak, titres) et US-18 (or all-time).

## 1. Contexte & problème

`day_results` accumule l'historique (issues, dégâts, XP, tâches, or) mais **aucun écran ne le contemple**. Le Panthéon est l'écran « faits d'armes » : célébration + stats, style salle des trophées arcade. Aucune écriture — pur affichage dérivé.

## 2. Décisions de cadrage (tranchées)

| # | Décision |
|---|----------|
| D1 | **Layout « Salle des trophées » enrichi** (base C validée), blocs empilés mobile-first. |
| D2 | **Ordre des blocs** : Héros → Trophées → Trésor → Titres → Journal. |
| D3 | **Accès via le QG** (nav = QG hub), pas d'onglet direct. Route `app/pantheon/page.tsx`. |
| D4 | **Lecture seule**, dérivée. Aucune mutation. |
| D5 | **Journal paginé** (`day_results` par pages, plus récent d'abord, « charger plus »). |

### Blocs (D2)

1. **Héros** — pseudo, **Niveau** + `current_title`, **barre XP** (`xp` / `xpThresholdForLevel`).
2. **Trophées** — **record série** (`best_streak`), **Boss KO** (count `outcome=victory`), **dégâts all-time** (`SUM(damage_dealt)`).
3. **Trésor** — **or en cours** (solde dérivé, US-18) + **or all-time** (`SUM(gold_earned)`).
4. **Titres** — débloqués (jalons streak/niveau, US-12 A2) + verrouillés (prochain palier).
5. **Journal de combat** — jours récents : date, issue (✓/↩/✗), dégâts, or gagné ; « charger plus ».

### Améliorations retenues

| # | Amélioration |
|---|--------------|
| A1 | **Sparkline dégâts** (7-30 derniers jours) + **win-rate ring** (victoires / jours joués) — viz cheap, fort effet « faits d'armes ». |
| A2 | **Meilleur jour mis en avant** : « Record : N dégâts le JJ/MM » (max `damage_dealt`). |

### Baselines techniques

- **B1 — Zéro écriture.** Le Panthéon ne mute rien ; agrégats calculés côté serveur/pur.
- **B2 — Agrégats testables.** Les calculs (win-rate, totaux, meilleur jour, séries pour sparkline) sont purs (`game-engine`), pas noyés dans le composant.
- **B3 — Pagination.** Ne jamais charger tout l'historique d'un coup ; pages de `day_results`.

## 3. Agrégats (purs)

```ts
pantheonStats(dayResults): {
  totalVictories, totalDays, winRate,      // ratio Boss vaincus (BDD)
  totalDamage, goldAllTime,
  bestDay: { day_date, damage } | null,    // A2
  damageSeries: number[],                  // A1 (N derniers jours)
}
```

`goldBalance` (solde en cours) vient d'US-18. `best_streak`, niveau, titre, XP viennent de `profiles`.

## 4. États UI (règle projet n°3)

- **Loading** : squelettes des 5 blocs.
- **Error** : échec fetch → message + retry, retour QG possible.
- **Empty** : nouvel utilisateur, 0 `day_results` → état vide dédié (« Aucun combat à ton palmarès. Va terrasser ton premier Boss. » + CTA Arène). Blocs Trophées/Trésor/Journal en zéro, pas de sparkline.

## 5. Modèle de données

Aucune nouvelle table/colonne propre à US-10. Consomme : `day_results` (Cycle + `gold_earned` d'US-18), `profiles.best_streak`/`current_title`/`level`/`xp` (US-12), solde dérivé (US-18).

## 6. Découpage technique

### `lib/game-engine.ts` (pur, Vitest)
- `pantheonStats(dayResults)` (§3).

### `app/pantheon/page.tsx`
- Fetch profil + page 1 de `day_results` (tri desc) + agrégats.
- 3 états UI. Bouton retour QG.

### Composants (`components/pantheon/`)
- `TrophyGrid.tsx`, `TreasureBlock.tsx`, `TitlesBlock.tsx`, `CombatJournal.tsx` (pagination « charger plus »), `DamageSparkline.tsx` + `WinRateRing.tsx` (A1, SVG inline, reduced-motion friendly).

### QG (nav)
- `app/qg/page.tsx` : lien vers Panthéon (et Échoppe).

### Docs (même commit)
- `CLAUDE.md` : écran Panthéon (lecture seule, agrégats dérivés, nav QG hub).
- `CHANGELOG.md` : ligne US-10.
- `SPECS_FONCTIONNELLES.md` : préciser la BDD US-10 (blocs + accès QG).

## 7. Tests

### Vitest (pur)
- `pantheonStats` : win-rate (0 jour → pas de division par 0), totaux, meilleur jour (égalités → plus récent ou déterministe), série de dégâts, dataset vide.

### Playwright e2e (série, prod)
- `pantheon.spec.ts` : depuis QG → Panthéon affiche stats cohérentes avec les `day_results` semés ; « charger plus » pagine ; état Empty pour compte sans historique.
- ⚠️ Compte unique : semer des `day_results` déterministes en fixture.

## 8. Hors scope

- Filtres/plages de dates du Journal → future.
- Export/partage (US-20).
- Graphes avancés au-delà de la sparkline + ring.

## 9. Vérification

1. Vitest vert (agrégats).
2. `build` + `lint` propres.
3. e2e série vert en local.
4. Manuel : QG → Panthéon ; blocs cohérents ; sparkline + ring ; meilleur jour exact ; pagination ; état Empty sur compte neuf.
