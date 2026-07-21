# Journal de session autonome — 2026-07-21

> Agent : Claude (Opus 4.8, 1M context). Mandat : autonomie totale, carte blanche pour finir le Sprint 2 puis apporter de la valeur (audit, features, IHM) dans l'esprit Street Fighter old-school.
> Branche : `session/autonomous-2026-07-21` (isolée, machine arrière possible).
> Autorisations exceptionnelles de session : migrations Supabase, merges bypass CI (plus de crédit GitHub Actions). Ne s'appliquent qu'à cette session.

Ce fichier trace **chaque décision et action** avec le *pourquoi*. Il est le livrable de traçabilité demandé.

---

## 0. Orientation (état constaté)

- Sprint 0 & 1 livrés (Arène, QG, cycle Réveil/Crépuscule, voix, sous-tâches, drag&drop).
- Sprint 2 partiellement livré : **US-12 (streaks)** et **US-18 (échoppe héros)** mergés (#45, #46) mais issues #14/#15 restées ouvertes.
- **Reste Sprint 2** :
  - **US-16 Perfect KO** — overlay `PerfectOverlay` existe mais non conforme : pas de fonction pure `koOutcome`, pas de palier PERFECT vs K.O., overlay sans tier/récap/CTA Crépuscule/reduced-motion/super-variante jalon.
  - **US-15 Rage Quit** — `abandonTask` générique câblé, mais **sans** malus −5 XP, `abandon_reason`, undo, ni confirmation/punchline.
  - **US-10 Panthéon** — aucun écran (agrégats `day_results` non contemplés).
  - **US-17 Mode Entraînement** — `tasks.is_recurring` existe mais aucune logique de génération ; tables `recurring_templates`/`recurring_rest_days` absentes.
- Specs détaillées validées présentes dans `docs/superpowers/specs/2026-07-20-us*.md` → je les suis sans réinventer.
- Moteur pur `lib/game-engine.ts` complet (HP, XP, streak, gold, summarize, wakeup, dayKey). Supabase lié (`DoDoJo`, `supabase db push`).

## 1. Stratégie d'exécution (décision)

Ordre : **US-16 → US-15 → US-10 → US-17**, du moins risqué/plus dopaminergique au plus intégrant (US-17 touche le Réveil). Chaque US : (1) logique pure + tests Vitest, (2) câblage UI, (3) migration si besoin, (4) `build`+`lint`+`test` locaux, (5) commit conventionnel + MAJ `CHANGELOG.md`/`CLAUDE.md`/`SPECS`/issue. Puis audit + features surprise. Rapport final en fin de session.

*Pourquoi cet ordre* : US-16 réutilise l'acquis (overlay déjà là) → victoire rapide et gros gain ressenti. US-15 introduit une migration simple (1 colonne). US-10 est lecture seule (zéro risque de régression sur la boucle de combat). US-17 en dernier car il modifie le chemin critique du Réveil et ajoute 3 objets de schéma.

---

## 2. Déroulé (rempli au fil de l'eau)

### US-16 — Perfect / K.O. (fait)
- **Moteur** : ajout `koOutcome(prev, next, max, heroHp): KoTier` (pur), 6 tests Vitest (matrice de transitions du spec §8). Décision : garde `prevBossHp===0` = anti-re-déclenchement sans renaissance (D4).
- **Overlay** : `PerfectOverlay` réécrit — props `tier`/`username`/`damageDealt`/`monstersDefeated`/`milestone` + CTA Crépuscule + « continuer » + super-variante flammes (jalon streak). Ancien overlay ne montrait qu'un « Victory ! » statique.
- **Câblage** : `Arena` mémorise `previousHp`, calcule `koOutcome` sur la transition, détecte le palier de série en forçant l'issue du jour à `victory`. CTA Crépuscule branché sur `handleCrepuscule`.
- **CSS** : keyframe `ko-burst` (pop d'arcade) + reduced-motion. **Décision assumée** : easing overshoot signalé "bounce-easing" par le hook impeccable = choix de design (juice Street Fighter, `PRODUCT.md`), conservé volontairement.
- **Vérif** : `tsc` propre (hors erreurs e2e préexistantes sur `main`), `build` vert, 93/93 Vitest.
- **Docs** : CHANGELOG + CLAUDE.md (piège) + ce journal.
- **Commit** : `0773c68`.

### US-15 — Rage Quit (fait)
- **Migration** `20260721090000_add_task_abandon_reason.sql` : colonne `abandon_reason` nullable + check `('rage_quit','annihilated')`. **Appliquée sur remote** (`supabase db push` → confirmé via `migration list`).
- **Moteur** : `applyRageQuitPenalty` (−5 clampé, **sans de-level**, ≠ `applyXpDelta`), `RAGE_QUIT_XP_PENALTY=5`, `collectAbandonCascade` (racine + sous-tâches actives, exclut complétées/abandonnées) + 7 tests.
- **Actions** : `rageQuitTask` (cascade + malus unique), `undoRageQuit` (restaure lignes `rage_quit` + refund +5) ; `annihilateOverdue*` posent désormais `abandon_reason='annihilated'`. Ancien `abandonTask` **supprimé**.
- **UI** : modale de confirmation (action punitive, D5), malus XP optimiste, toast d'undo avec punchline « le Boss ricane », `types/Task.abandon_reason` ajouté (+ objets optimistes de l'Arène).
- **Décision** : refund via `applyXpDelta(+5)` (garde un profil XP valide) ; asymétrie mineure assumée quand xp<5 au moment du malus (clamp à 0 → refund donne 5). Documenté.
- **Vérif** : 100/100 Vitest, lint propre, `build` vert, migration remote OK.
- **Commit** : `d59ac47`.

### US-10 — Le Panthéon (fait)
- **Moteur** : `pantheonStats(dayResults, seriesLength=14)` (pur) → victoires, win-rate (garde /0), dégâts & or all-time, meilleur jour (égalité → date récente, null si 0 dégât), série de dégâts. 6 tests.
- **Écran** : `app/pantheon/page.tsx` (serveur, lecture seule) + `loading.tsx` (squelettes) + états Error/Empty. 5 blocs (Héros/Trophées/Trésor/Titres/Journal).
- **Composants** : `components/pantheon/DamageSparkline` + `WinRateRing` (SVG purs, statiques) + `CombatJournal` (client, pagination « charger plus » sur lot borné, pas de re-fetch).
- **Nav** : lien 🏆 ajouté au QG (hub).
- **Décision** : fetch borné à 90 jours + pagination client (respecte B3 sans over-engineering une pagination serveur pour un MVP).
- **Vérif** : 106/106 Vitest, lint propre, `build` vert (route `/pantheon` générée).
- **Commit** : (ci-dessous).

