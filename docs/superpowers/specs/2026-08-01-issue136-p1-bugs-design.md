# Issue #136 (bugs part3) — les 3 sub-issues P1 : design & plan d'investigation

> Date : 2026-08-01
> Issue parente : #136
> Sub-issues couvertes : #144 (ordre des tâches), #145 (positionnement héros/boss), #146 (animations combat)

---

## Contexte

Issue #136 a été découpée en 8 sub-issues (#139-146, cf. commentaire de suivi sur #136). Les 3 marquées `P1` touchent le cœur de la boucle de jeu (combat + gestion des tâches) et sont traitées en premier, dans l'ordre où elles apparaissent ci-dessous — en série, pas en parallèle, car #144 et #146 partagent tous les deux `components/combat/Arena.tsx` (fichier volumineux, risque de conflit de merge si travaillés en parallèle).

Aucune des 3 n'a de cause racine confirmée par reproduction en live au moment de l'écriture de ce spec — seulement par lecture de code + réponses de l'utilisateur sur le comportement observé. Ce document fixe la piste principale à vérifier pour chacune, pas un fix déjà validé par du code qui tourne.

---

## #144 — Régression de l'ordre des tâches

### Comportement observé (confirmé par l'utilisateur)
- **Cochage d'une tâche racine** : elle descend dans la liste, mais **pas nécessairement jusqu'en bas** — comportement variable, aucun pattern évident identifié à l'usage.
- **Ajout d'une nouvelle tâche** alors que des tâches racines sont déjà cochées : la nouvelle tâche **atterrit toujours en toute dernière position** (aucun mouvement vers le haut, jamais insérée juste au-dessus des tâches terminées comme attendu depuis l'issue #111).
- Les deux comportements sont **reproductibles à 100 %**, ce n'est pas intermittent.

### Cause probable (hypothèse principale, pas encore confirmée en dev)
Le code client (`lib/game-engine.ts` : `planCompletionReorder`, `reorderAfterCompletionToggle`, `insertNewActiveTaskId`) n'a été modifié qu'une seule fois dans tout l'historique du repo (introduit avec l'issue #111, jamais retouché depuis) — peu probable qu'une régression vienne de cette logique pure elle-même.

En revanche, `components/combat/Arena.tsx` (`handleToggle` ligne ~1289, `handleAdd` ligne ~814) envoie la persistance de l'ordre via `reorderSiblingsAction` en **fire-and-forget** (`void reorderSiblingsAction(...)`), **sans aucune sérialisation par `parentId`**. Le serveur (`app/actions/tasks.ts:518-528`) écrit `position = index` séquentiellement pour tout le groupe de fratrie à chaque appel.

Si deux actions touchant le même groupe de fratrie (`parentId`) partent à quelques instants d'intervalle — ce que le mécanisme de Combo (issue #115, fenêtre de 15 min) encourage activement — rien ne garantit que leurs requêtes HTTP arrivent au serveur dans l'ordre où elles ont été déclenchées. Si la plus ancienne arrive en dernier (aléa réseau), elle écrase silencieusement les positions pourtant plus à jour de la plus récente. Aucune erreur n'est remontée (`revalidatePath` seul ne pousse rien vers un state client déjà hydraté — même piège que documenté sur `WakeUpRitual`, bug prod #70). Résultat : un ordre final imprévisible selon la latence du moment — cohérent avec "descend mais pas de façon fiable, aucun pattern clair" côté cochage, et avec "toujours en bas" côté ajout si l'écriture de l'ajout se fait systématiquement écraser par une écriture de cochage concurrente ou antérieure encore en vol.

### Plan de vérification et fix
1. **Vérifier en premier**, avant tout code : ajouter un log temporaire sur `completedRootIds.size` dans `handleAdd` juste avant le branchement de reorder — si ce guard ne se déclenche jamais dans le scénario de repro de l'utilisateur, la cause de "toujours en bas" est ailleurs (bug de guard, pas une race) et ce point doit être ré-investigué avant d'implémenter le fix ci-dessous.
2. **Fix principal** : introduire une file de sérialisation par `parentId` côté client (`Arena.tsx`), par exemple un `useRef<Map<string | null, Promise<unknown>>>` — chaque nouvel appel `reorderSiblingsAction` pour un groupe donné chaîne sur la promesse précédente de ce même groupe, garantissant que les écritures serveur arrivent strictement dans l'ordre de déclenchement. S'applique aux deux call-sites (`handleToggle` et `handleAdd`).
3. Pas de changement attendu côté fonctions pures (`lib/game-engine.ts`) sauf si l'étape 1 révèle un bug de guard distinct.

### Tests
- [ ] Test simulant 2 appels `reorderSiblingsAction` dont la résolution réseau arrive dans l'ordre inverse du déclenchement (mock avec délais opposés) — vérifier que l'ordre final en base suit l'ordre de **dispatch**, pas l'ordre de **résolution**.
- [ ] e2e : cocher 2 tâches racines rapprochées (< 1s d'intervalle), recharger la page, vérifier que les deux sont bien en bas dans l'ordre attendu.
- [ ] e2e : ajouter une tâche alors que des tâches racines sont déjà cochées, recharger la page, vérifier qu'elle est bien insérée juste au-dessus du bloc "terminé".
- [ ] Non-régression sur les tests Vitest existants de `planCompletionReorder`/`insertNewActiveTaskId`.

---

## #145 — Positionnement héros/boss incohérent mobile vs desktop

### Comportement observé (confirmé par captures jointes à #136)
Mesures faites sur les 2 screenshots : sur mobile, héros à ~43 % de la largeur du conteneur combat et boss à ~79 % ; sur desktop, héros à ~28 % et boss à ~87 %. Sur mobile, les deux personnages semblent "aspirés" vers le centre par rapport au desktop, où ils collent davantage aux bords (jugé correct par l'utilisateur).

### Décision de design (validée par l'utilisateur)
Cible : chacun de son côté (héros à gauche, boss à droite), de façon **cohérente entre mobile et desktop** — pas l'option "centrés sous le timer".

Portée choisie : **refactor du layout horizontal**, pas un simple patch d'offsets CSS, pour un résultat plus robuste structurellement.

### Cause probable
`components/combat/VersusScene.tsx` positionne aujourd'hui les deux sprites en CSS absolu, sans media query : `absolute bottom-2 left-4` (héros) / `absolute bottom-2 right-4` (boss), offsets fixes de 16px. Combiné à une largeur de sprite fixe en pixels (`CharacterSprite` rend à `baseHeight` fixe × `meta.renderScale`, donc une largeur intrinsèque constante quel que soit l'écran), un conteneur plus étroit (mobile) fait occuper à cette largeur fixe + marge fixe une fraction bien plus grande de l'espace disponible — d'où l'effet de resserrement vers le centre.

### Fix
Remplacer les deux wrappers `absolute bottom-2 left-4`/`right-4` par un conteneur `flex justify-between items-end` englobant les deux `CharacterSprite` — même patron déjà utilisé pour la ligne `HeroBar` / `MidnightTimer` / `BossBar` juste au-dessus dans le même composant. Le `key={`hero-wrap-${heroStateKey}`}`/`key={`boss-wrap-${bossStateKey}`}` (remount pour rejouer le knockback) et le style `--knockback-x` restent posés sur chaque wrapper individuel — seul le mode de positionnement du conteneur parent change (absolute → flex item), pas la mécanique de knockback elle-même. z-index et `drop-shadow` existants sont conservés tels quels.

### Tests
- [ ] Vérification manuelle sur un vrai viewport mobile (< 400px) ET desktop : héros à gauche, boss à droite dans les deux cas, proportions cohérentes.
- [ ] Non-régression sur `/roster-preview-8f3a2c9d` (écran de calage boss) et `/skins-preview-4c7a1e9b` si ces écrans réutilisent `VersusScene`.
- [ ] Grep préalable (`left-4`, `right-4`, `absolute bottom-2`) pour vérifier qu'aucun test existant (Vitest composant ou Playwright) n'assert ces classes avant de les retirer.

---

## #146 — Animations combat : jouées 2x, mauvaise anim au décochage, timer overlay trop court

### Comportement observé (confirmé par l'utilisateur)
- Le doublon d'animation (check / decheck / mort du boss) est **systématique, même sur le cas le plus simple** (une tâche racine isolée, un seul coup) — écarte les hypothèses liées aux cascades de sous-tâches ou au Combo.
- Les 3 sous-bugs sont jugés également gênants, pas de priorité entre eux.

### État de l'investigation
Lecture détaillée de `Arena.tsx` (`triggerHeroAttack`, `flushImpact`, `triggerBossAttack`, `onBossImpact`, `onHeroAttackEnd`) et `CharacterSprite.tsx` (dérivation de `rendered` depuis `state`/`stateKey`) n'a trouvé **aucun double-appel évident** dans le code actuel :
- La branche de décochage (`handleToggle`, `hpDelta < 0`) n'appelle aujourd'hui que `triggerPulse(-hpDelta, "heal")` — aucun appel à `triggerHeroAttack`/`triggerBossAttack` sur ce chemin dans le code lu. D'où vient l'anim "attaque héros" perçue au décochage reste à établir : soit un état `heroAnim` résiduel d'un coup précédent rejoué par un mécanisme de re-render non identifié, soit un chemin de code non trouvé à la lecture.
- Aucun double-appel trouvé à `triggerHeroAttack`/`flushImpact` dans `handleToggle` pour une cascade simple (hpDelta/xpDelta déjà agrégés avant un seul appel).

Étant donné qu'aucune cause n'a pu être confirmée par lecture statique seule et que le comportement est 100 % reproductible, la suite passe par une **investigation live** plutôt que par du code écrit à l'aveugle.

### Plan d'investigation
1. Instrumenter des compteurs temporaires (`console.count(...)`) dans `triggerHeroAttack`, `flushImpact`, `onBossImpact`, et dans le callback `onEnd`/`onStateEnd` de `CharacterSprite.tsx`.
2. Reproduire le cas le plus simple (dev server local, une tâche racine sans enfant, un seul cochage) et observer les comptes — identifier l'endroit exact où l'invocation se produit deux fois.
3. Pour le décochage : tracer précisément la valeur de `heroState`/`rendered` passée à `CharacterSprite` au moment du décochage, pour confirmer s'il s'agit d'un état résiduel ou d'un nouvel appel.
4. Pour le timer overlay : mesurer le délai réel actuel entre la fin visuelle de l'anim de mort (`DEATH_DURATION_MS`) et le montage de `PerfectOverlay`.

### Fix (portée déjà tranchée, détail dépendant de l'investigation)
- Pas de réécriture large de la state machine d'animation — zone documentée comme fragile dans CLAUDE.md (hit-stop, coalescing de rafales, contre-attaque en attente, `prefers-reduced-motion`), trop de risque de régression pour un diagnostic pas encore posé. Le fix sera un patch ciblé une fois la cause exacte trouvée à l'étape 2/3.
- Pour le timer overlay, la piste est déjà claire indépendamment du reste : ajouter un délai explicite (~`DEATH_DURATION_MS + 1000`ms) avant l'affichage de `PerfectOverlay`, **désactivé sous `prefers-reduced-motion`** (où le gating est déjà supprimé intégralement, cf. CLAUDE.md).

### Tests
- [ ] Assertion sur `data-anim-state` (ou équivalent) : une seule transition attack/hurt/death par interaction utilisateur.
- [ ] e2e : cocher une tâche → l'animation d'attaque du héros se joue une seule fois.
- [ ] e2e : décocher une tâche → le Boss attaque et le héros encaisse (`hurt`), le héros n'attaque pas.
- [ ] e2e : K.O. du boss → l'animation de mort se joue une seule fois, et `PerfectOverlay` ne s'affiche pas avant la fin visuelle de l'anim (+ marge).
- [ ] Non-régression sous `prefers-reduced-motion` (gating désactivé, tout doit rester instantané).

---

## Risques transverses

- #144 et #146 touchent tous les deux `components/combat/Arena.tsx` — à traiter en série, pas en parallèle, pour éviter les conflits de merge.
- #146 touche une zone déjà documentée comme fragile (CLAUDE.md, section "Sprites de combat") — toute modification doit vérifier explicitement qu'elle ne casse pas le hit-stop, le coalescing de rafales, la contre-attaque en attente (`bossAttackPendingRef`) et le comportement sous `prefers-reduced-motion`.
- #145 : vérifier avant de merger qu'aucun test existant n'était couplé aux classes CSS `absolute`/`left-4`/`right-4` retirées.
