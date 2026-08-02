# Issue #156 — « le retour des bugs part4 » — design

> Date : 2026-08-02
> Issue : [#156](https://github.com/ouro84/dodojo/issues/156)
> Portée : une seule PR. Les neuf symptômes remontés se ramènent à six causes racines, toutes indépendantes entre elles.

---

## 1. Cadre

L'issue liste neuf bugs « en vrac » avec quatre captures d'écran mobiles. L'analyse les regroupe ainsi :

| # | Symptôme remonté | Cause racine | Section |
|---|---|---|---|
| 1 | Tâches récurrentes en doublon | Génération non idempotente sous concurrence + collision avec Le Réveil | [§5](#5-d--tâches-récurrentes-en-doublon) |
| 2 | Overlay de fin de journée hors cadre | `PerfectOverlay` contraint dans un conteneur de 192 px | [§3.3](#33-a3--overlay-ko-en-modal-plein-écran) |
| 3 | Position du héros mauvaise sur mobile | Ancrage sur la tuile et non sur la silhouette | [§4](#4-b--ancrage-des-sprites) |
| 4 | Barre HP du Boss tronquée | `min-width:auto` de la colonne héros + badge combo superposé | [§3.1](#31-a1--largeurs-de-jauges-égales-par-construction), [§3.2](#32-a2--badge-combo-hors-du-hud) |
| 5 | Position du héros différente d'un héros à l'autre | Idem #3 | [§4](#4-b--ancrage-des-sprites) |
| 6 | Cadre du héros de taille variable au Marché Noir | Idem #3 | [§4](#4-b--ancrage-des-sprites) |
| 7 | Noms de héros incohérents selon les pages | Noms dupliqués en dur dans le catalogue de succès | [§7](#7-f--noms-de-héros-incohérents) |
| 8 | Supprimer les VFX d'impact, essayer un flash blanc | Demande produit | [§4.4](#44-c--flash-blanc-à-limpact) |
| 9 | Animation hurt du héros jouée en double | Non établie — reproduction requise | [§6](#6-e--hurt-du-héros-joué-en-double) |

**Règle transverse imposée pour cette PR : chaque bug corrigé porte au moins un test qui échoue avant le correctif et passe après.** Les tests sont récapitulés en [§8](#8-matrice-de-couverture-de-tests) ; aucun bug ne peut être considéré comme livré sans sa ligne dans cette matrice.

---

## 2. Éléments de diagnostic mesurés

Faits établis avant tout code, à partir des captures et du code source. Ils justifient les choix qui suivent et servent de référence si un correctif ne produit pas l'effet attendu.

**Largeurs de jauges (capture `Screenshot_20260801-235550`, appareil 1080 × 2400, ~393 px CSS).** Jauge héros 433 px affichés, jauge Boss 188 px affichés, soit un rapport 2,3 : 1 pour deux colonnes déclarées `flex-1` — donc censément égales.

**Boîtes de rendu des sprites**, dérivées de `lib/sprite-metadata.generated.json` (`renderedWidth = baseHeight × renderScale × tileW / tileH`) :

| Héros | Tuile | Largeur rendue Arène (base 88) | Largeur rendue boutique (base 112) |
|---|---|---|---|
| wind-hashashin | 209 × 112 | 497 px | 633 px |
| metal-bladekeeper | 189 × 58 | 396 px | 504 px |
| leaf-ranger | 195 × 101 | 389 px | 495 px |
| crystal-mauler | 201 × 92 | 453 px | 577 px |
| fire-knight | 167 × 106 | 334 px | 425 px |
| water-priestess | 138 × 89 | 320 px | 407 px |
| ground-monk | 109 × 61 | 274 px | 348 px |

La zone de rendu d'un côté de la scène fait environ 172 px CSS sur mobile. Toutes ces boîtes débordent largement, et dans des proportions qui varient du simple au double selon le héros.

**`impactFrame` de l'anim `idle`** vaut `null` pour les sept héros et les vingt-sept boss. Le garde-fou posé par l'issue #146 tient : le retour à l'idle en fin d'animation ne rappelle pas `onImpact`. Cette piste est écartée pour le bug #9.

---

## 3. A — HUD de l'Arène

### 3.1 A1 — Largeurs de jauges égales par construction

**Cause.** `VersusScene.tsx` dispose trois colonnes dans un conteneur flex : `HeroBar` en `flex-1`, `MidnightTimer` en largeur automatique, `BossBar` en `flex-1`. Aucune des deux colonnes latérales ne porte `min-w-0`. Leur `min-width` reste donc à `auto`, ce qui la résout sur la largeur de contenu minimale.

Le pied de `HeroBar` affiche « pseudo - titre » dans un `<span>` portant `truncate`, c'est-à-dire `white-space: nowrap`. La largeur minimale de contenu de cette colonne est donc celle du texte **entier non tronqué**, à laquelle s'ajoute le compteur `90/100 HP` marqué `shrink-0`. Ce plancher, mesuré à environ 190 px CSS, dépasse la part équitable (~150 px) : la colonne héros se sert la première, la colonne Boss encaisse le reste.

La régression date de l'ajout du titre équipé à côté du pseudo (issue #139, PR #152) : avant, le seul pseudo restait sous le plancher et l'égalité tenait par accident.

**Correctif.** Passer le HUD de `flex` à `grid grid-cols-[1fr_auto_1fr]` et poser `min-w-0` sur les deux cellules latérales (obligatoire en grid comme en flex : la valeur `auto` de `min-width` s'applique de la même façon aux éléments de grille).

Deux raisons de préférer la grille au simple ajout de `min-w-0` sur le flex existant : les deux `1fr` **déclarent** l'égalité au lieu de la laisser émerger d'un calcul d'espace libre, et aucun contenu futur ne peut plus déséquilibrer la répartition — il se fera tronquer dans sa propre colonne.

Ajouter par ailleurs `min-w-0 truncate` au nom du Boss (`BossBar.tsx:39`) : « MINOTAURE ANCESTRAL » passe en ellipse au lieu de revenir à la ligne puis d'être coupé net au bord du conteneur.

**Asymétrie volontaire à préserver.** Les jauges se remplissent en miroir (héros ancré à droite via `right-0`, Boss ancré à gauche via `left-0`) et les libellés sont inversés (pseudo à gauche et HP à droite côté héros, l'inverse côté Boss). C'est la convention des jeux de combat en versus, ce n'est pas le bug.

### 3.2 A2 — Badge combo hors du HUD

**Cause.** `Arena.tsx:1668-1675` rend le badge `combo ×N` en `absolute right-2 top-2 z-30` par-dessus la scène. Ces coordonnées tombent exactement sur la jauge du Boss, qui disparaît sous le badge dès qu'un combo est actif (visible sur `Screenshot_20260802-091127`).

**Correctif.** Sortir le badge d'`Arena` et le rendre dans la colonne Boss de `VersusScene`, sous la jauge, au même emplacement que le compteur « ⏰ N à venir » qui existe déjà. `Arena` passe une prop `comboCount` ; `VersusScene` affiche le badge quand elle vaut 2 ou plus. Le libellé accessible (`aria-label="Combo en cours : N coups"`) est conservé à l'identique.

### 3.3 A3 — Overlay K.O. en modal plein écran

**Cause.** `PerfectOverlay` est rendu en `absolute inset-0` à l'intérieur du wrapper `relative` de `VersusScene`, dont la hauteur est fixée à `h-48`, soit 192 px. Son contenu — flammes de palier, titre, punchline, ligne de statistiques, trois boutons et un lien — dépasse 330 px. Avec `justify-center`, le débordement se répartit **des deux côtés** : le titre sort par le haut, hors de l'écran, et les boutons débordent par le bas sur la liste de tâches (visible sur `Screenshot_20260801-235532`).

**Correctif.** `PerfectOverlay` devient un modal plein écran : `fixed inset-0 z-50`, fond assombri, contenu centré, `max-h-dvh overflow-y-auto` pour les écrans très courts. Il sort du wrapper de la scène dans `Arena.tsx` et devient un frère de `WakeUpRitual` et `TomorrowSheet`.

`useFocusTrap` et `role="alertdialog"` sont déjà en place et restent posés sur le même nœud, celui qui contient réellement les contrôles focusables — la règle de l'audit #67 est respectée sans changement.

**Interaction avec la sheet « Demain ».** L'overlay porte un CTA « Planifier demain » qui ouvre `TomorrowSheet`. Les deux étant désormais des modaux plein écran de même rang, l'overlay doit se fermer **avant** l'ouverture de la sheet, sinon ils se superposent. C'est la transposition directe du piège documenté pour l'issue #147 : une sheet plein écran occulte physiquement tout ce qui est derrière elle.

---

## 4. B — Ancrage des sprites

### 4.1 Cause racine commune aux bugs #3, #5 et #6

La tuile d'un personnage est l'**union alpha de toutes ses animations**, jamais l'idle seul. C'est une décision délibérée, documentée dans `CLAUDE.md` § Sprites de combat : une boîte par animation ferait changer le personnage de taille et de position au démarrage d'une attaque, l'arme débordant du cadre idle.

Conséquence non traitée jusqu'ici : la silhouette idle occupe une **fraction variable** de cette tuile, et se situe à une **position horizontale variable** à l'intérieur. Le code aligne aujourd'hui la tuile (`justify-start` pour le héros, `justify-end` pour le Boss) et non le personnage. Chaque héros se retrouve donc à un endroit différent, d'autant plus décalé que sa tuile est large — d'où l'écart entre Gardien des Lames et Assassin du Vent relevé dans l'issue, et le cadre démesuré de ce dernier au Marché Noir.

Le tableau de largeurs rendues en [§2](#2-éléments-de-diagnostic-mesurés) chiffre l'ampleur : de 274 px à 497 px de boîte pour une zone d'accueil de 172 px.

L'équivalent **vertical** de ce problème est déjà résolu : `scripts/build-sprite-sheets.mjs` calcule `idleBox` (union alpha des seules frames d'idle) et en dérive `groundOffset`, qui recale les pieds du personnage. Il manque simplement le pendant horizontal.

### 4.2 Métadonnées ajoutées

`scripts/build-sprite-sheets.mjs` dispose déjà de `box` et `idleBox` aux deux endroits utiles (héros ligne ~227, boss ligne ~390). On ajoute deux champs par personnage :

```js
idleAnchorX:    (idleBox.left - box.left + idleBox.width / 2) / box.width,
idleWidthRatio: idleBox.width / box.width,
```

`idleAnchorX` est la position du centre de la silhouette idle, exprimée en fraction de la largeur de tuile. `idleWidthRatio` est la largeur de cette silhouette dans la même unité ; elle sert à dimensionner le cadre du Marché Noir.

Aucune spritesheet n'est retouchée : seules deux clés s'ajoutent au JSON. L'invariant `tileH / renderScale === LEGACY_IDLE_HEIGHTS[slug]`, verrouillé par `lib/sprite-metadata.test.ts`, reste intact — le calibrage de l'issue #74 n'est pas touché.

Le type `CharacterSpriteMeta` (`lib/sprite-metadata.ts`) gagne les deux champs, en obligatoire : un personnage sans ancre doit échouer à la compilation plutôt que se rendre au mauvais endroit.

### 4.3 Application aux trois sites de rendu

**Arène (`VersusScene.tsx`).** Les deux zones `flex-1` du bas de scène laissent place à un positionnement absolu ancré. Le centre de la silhouette idle est posé à **25 %** de la largeur de scène pour le héros et à **75 %** pour le Boss :

```
left: 25%  +  translateX(-idleAnchorX × 100%)
```

Le pourcentage d'un `translateX` se rapporte à la largeur de l'élément, c'est-à-dire à `renderedWidth` — le calcul est donc exact sans connaître cette largeur en JavaScript. Le débordement des animations d'attaque reste libre et se fait couper par l'`overflow-hidden` de la scène, comme aujourd'hui.

Trois niveaux d'imbrication sont nécessaires pour ne pas écraser des `transform` entre eux, chacun en portant déjà un :

```
positionneur absolu   → translateX(-idleAnchorX × 100%)
  wrapper knockback   → animation knockback (recul à l'impact)
    CharacterSprite   → translateY(groundOffset)
```

**Marché Noir (`HeroIdle.tsx`).** Le composant reçoit un cadre de taille fixe (`relative overflow-hidden`), dimensionné à partir du plus grand `idleWidthRatio × renderedWidth` mesuré après régénération des métadonnées, avec une marge. Le sprite y est ancré au centre horizontalement et aligné en bas. Tous les héros présentent alors rigoureusement le même cadre.

**Écrans de calage.** `RosterPreview` (`/roster-preview-8f3a2c9d`) et `SkinsPreview` (`/skins-preview-4c7a1e9b`) adoptent le même ancrage. Sans cela ces écrans mentiraient sur le rendu réel et ne pourraient plus servir à valider un ajout de boss ou de tenue.

### 4.4 C — Flash blanc à l'impact

**Demande produit.** Remplacer les VFX d'impact par un flash blanc, dans l'esprit des Street Fighter de l'époque.

**Suppression.** Disparaissent : `components/combat/HeroVfx.tsx` (composant et `pickVfxVariant`), la prop `vfxVariant` de `VersusScene`, l'état `vfxVariant` d'`Arena`, les helpers `heroVfxVariants` et `vfxMeta` de `lib/sprite-metadata.ts`, le type `VfxMeta`, la clé `vfx` du JSON généré, la section VFX de `scripts/build-sprite-sheets.mjs`, le dossier `public/vfx/`, le préfixe `/vfx/` de `RUNTIME_CACHED_IMAGE_PREFIXES` (`app/sw.ts`) et l'entrée VFX d'`ASSETS.md`.

**Remplacement.** Le personnage qui encaisse clignote en silhouette blanche. `filter: brightness(0) invert(1)` rend blanc tout pixel non transparent en préservant le canal alpha, ce qui donne exactement la silhouette pleine recherchée, sans masque ni asset supplémentaire.

Le filtre est animé en trois clignotements sur une durée calée sur `HURT_DURATION_MS` (`lib/combat-animation.ts`), et posé sur un `<div>` dédié intercalé entre le wrapper de knockback et `CharacterSprite`. Ce niveau supplémentaire est nécessaire : `CharacterSprite` porte déjà un `filter` inline conditionnel pour l'état `danger`, et les déclarations d'une animation CSS l'emporteraient silencieusement sur ce style inline.

Le flash s'applique au Boss quand le héros frappe, et au héros quand le Boss contre-attaque. Il est neutralisé sous `prefers-reduced-motion`, comme le reste du gating décrit dans `CLAUDE.md`.

**Effet de bord souhaitable.** Le cas `fallbackHurtDeath` du minotaure (`mino_v1.1_free`, pack sans animation `hurt` ni `death`) utilise aujourd'hui `hit-flash-overlay`, un voile rouge. Il bascule sur le même flash blanc et devient cohérent avec tous les autres personnages.

---

## 5. D — Tâches récurrentes en doublon

### 5.1 Deux chemins de duplication distincts

**P1 — Course sur le chargement de l'Arène.** `generateRecurringInstances()` est appelée à chaque GET de `/` (`app/page.tsx:39`). Elle lit les instances déjà présentes du jour, puis insère celles qui manquent : une séquence lecture-puis-écriture sans atomicité, sur une table **sans contrainte d'unicité**. Deux exécutions concurrentes lisent toutes deux un ensemble vide et insèrent chacune la leur.

La concurrence n'est pas théorique : `/` est préfetchée par le `<Link href="/">` de `BottomNav`. Un prefetch RSC exécute le composant serveur, donc la mutation. Un prefetch suivi d'une navigation réelle suffit à déclencher la course. C'est le chemin qui correspond au cas rapporté — sur les captures de la veille au soir, les deux routines concernées étaient cochées, donc sans reste le lendemain matin.

**P2 — Collision avec Le Réveil, déterministe.** Au chargement, la génération crée l'instance du jour. Puis « Reporter » dans Le Réveil (`deferOverdueTask`) ramène le reste de la veille **de la même routine** sur `day_date = today`. Deux lignes, sans aucune concurrence.

P2 n'est pas le cas rapporté mais reste une bombe à retardement, et surtout l'index unique de [§5.3](#53-d2--index-unique-et-upsert) ferait échouer « Reporter » au lieu de dédupliquer. Il doit donc être traité dans la même PR.

### 5.2 D1 — La génération cède le pas au Réveil

`planRecurringGeneration` (`lib/game-engine.ts`, fonction pure) reçoit un cinquième argument `overdueTemplateIds: Set<string>` et saute toute routine ayant un reste actif sur un jour antérieur. `app/actions/recurring.ts` alimente ce set depuis une requête `day_date < today AND is_completed = false AND is_abandoned = false AND recurring_template_id IS NOT NULL`.

À la fin du Réveil, la génération est relancée. Les trois issues du rituel retombent alors sur exactement une instance :

| Action au Réveil | Effet sur `day_date` | Résultat |
|---|---|---|
| Reporter | passe à `today` | le reste **est** l'instance du jour |
| Terminé | reste sur le jour passé | une instance fraîche est créée |
| Annihiler | reste sur le jour passé | une instance fraîche est créée |

Vérifié dans `app/actions/tasks.ts` : `completeOverdueTask` et `annihilateOverdueTask` ne touchent pas `day_date`, seul `deferOverdueTask` le déplace. La table ci-dessus est exhaustive.

**Propagation obligatoire vers le client.** `WakeUpRitual` est un overlay client bloquant. Comme établi par le bug #70, `revalidatePath` invalide le cache de route mais ne pousse aucune donnée vers un composant client déjà hydraté, et `Arena` initialise son state `tasks` une seule fois depuis les props serveur.

`generateRecurringInstances` doit donc **renvoyer les lignes créées** (`createdTasks: Task[]`), que le rituel accumule dans un `useRef` et transmet à `onResolved()`, exactement comme `deferredTasks` aujourd'hui. `Arena` les fusionne dans son state. Sans cela, les routines régénérées resteraient invisibles jusqu'au prochain rechargement complet — un effet visuellement indiscernable d'un « Annihiler », précisément le symptôme du bug #70.

### 5.3 D2 — Index unique et upsert

```sql
create unique index tasks_recurring_unique_per_day
  on tasks (user_id, day_date, recurring_template_id)
  where recurring_template_id is not null and is_abandoned = false;
```

L'index est **partiel** sur `is_abandoned = false`, pour deux raisons : les doublons soldés en [§5.4](#54-solde-des-doublons-existants) ne bloquent pas sa création, et une routine annihilée n'empêche jamais une régénération ultérieure.

L'insertion passe en `.upsert(rows, { onConflict: "user_id,day_date,recurring_template_id", ignoreDuplicates: true })` : la course devient un no-op silencieux au lieu de produire un doublon ou de lever une erreur `23505`.

C'est cet index qui apporte la **garantie** de non-duplication. D1 et D3 traitent respectivement la cohérence fonctionnelle avec Le Réveil et le coût des requêtes ; ni l'un ni l'autre n'est le filet de sécurité.

### 5.4 Solde des doublons existants

L'index ne peut être créé tant que des doublons subsistent. La même migration les solde d'abord :

```sql
with ranked as (
  select id, row_number() over (
    partition by user_id, day_date, recurring_template_id
    order by is_completed desc, created_at asc, id asc
  ) as rn
  from tasks
  where recurring_template_id is not null and is_abandoned = false
)
update tasks set is_abandoned = true, abandon_reason = 'annihilated'
where id in (select id from ranked where rn > 1);
```

Règle déterministe : on conserve la ligne cochée s'il en existe une — le travail déjà accompli n'est jamais effacé — sinon la plus ancienne par `created_at`, l'`id` départageant les égalités pour rendre la migration reproductible.

Aucun `DELETE` : RG-04 est respecté, et `abandon_reason` reste contraint aux deux valeurs autorisées par la migration `20260721090000`.

**Contraintes d'application.** Le fichier porte un timestamp strictement postérieur à `20260731200000`, la dernière migration présente sur `main`. `npx supabase migration list --linked` est exécuté avant le merge : la dette documentée dans `CLAUDE.md` sur les migrations hors-ordre a déjà coûté trois bugs de production simultanés (#70).

### 5.5 D3 — Cache de saut

Colonne `profiles.last_recurring_gen_day date`, lue en entrée de `generateRecurringInstances` et écrite **après** un passage réussi. Elle évite d'exécuter les requêtes de génération à chaque GET de `/`, prefetch RSC de `BottomNav` compris.

Ce n'est **pas** un verrou : réserver la journée *avant* le travail ferait qu'un prefetch annulé en cours de route consommerait la réservation sans rien créer, et la routine manquerait jusqu'au lendemain. La correction vient de D2 ; D3 n'est qu'un cache de lecture.

`createRecurringTemplate` et la relance de fin de Réveil passent `force: true` pour l'ignorer — sinon, créer une routine à 14 h ne produirait aucune instance le jour même, le drapeau ayant déjà été posé au premier chargement de la matinée.

---

## 6. E — Hurt du héros joué en double

**Aucune cause racine confirmée à ce stade.** C'est le troisième passage sur cette famille de bugs (#146, #149, maintenant #156) et les deux précédents ont été résolus en reproduisant, pas en lisant. Ce spec ne propose donc pas de correctif spéculatif pour le symptôme lui-même.

**Piste écartée.** L'`impactFrame` de l'anim `idle` vaut `null` pour tous les personnages : le retour à l'idle en fin d'animation ne rappelle pas `onImpact`. Le garde posé par #146 tient.

**Candidats restants**, par ordre de suspicion :

1. **`triggerHeroAttack` ne vérifie pas si le Boss attaque déjà.** Le garde anti-chevauchement n'existe que dans l'autre sens : `triggerBossAttack` consulte `heroAnimRef`, l'inverse n'est pas vrai. Une attaque du héros lancée pendant une attaque du Boss laisse le timer d'impact du Boss aboutir en plein milieu.
2. **Rafale de décochages non coalescée.** `triggerBossAttack("uncheck")` (`Arena.tsx:1252`) n'a pas d'équivalent d'`addPendingHit` / `shouldForceFlush`, qui coalescent les coups du héros. Deux décochages rapprochés produisent deux attaques du Boss qui se chevauchent.
3. **`heroAnim` et `bossAnim` ne retournent jamais à `idle`** après un `hurt` ou une attaque du Boss. L'issue #149 n'a corrigé que le cas « fin d'attaque du héros ». Les gardes qui lisent ces états raisonnent donc sur un état périmé.

**Pourquoi les tests existants ne voient rien.** `e2e/combat-animations.spec.ts` assure déjà que héros et Boss « reviennent à l'idle » après un coup — et il passe. Mais il lit l'attribut `data-anim-state`, qui expose `rendered`, l'état **interne** à `CharacterSprite`, lequel se réinitialise correctement tout seul. L'état `heroAnim` / `bossAnim` d'`Arena`, celui que consultent les gardes anti-chevauchement, reste pour sa part figé sur `hurt` ou `attack`. Le test observe la bonne variable au mauvais niveau : c'est exactement l'angle mort qui a laissé passer #149, et il faut le combler en plus de corriger le symptôme.

**Ce qui est corrigé sans attendre la reproduction.** Le point 3 est un défaut structurel indépendant du symptôme. La transition « fin d'animation » quitte `Arena.tsx` pour devenir une fonction pure de `lib/combat-animation.ts` — conformément à la règle projet n° 2, qui veut que toute logique de jeu soit isolée et testable sans rendu. `onStateEnd` remet alors l'état à `idle` **quel que soit** l'état qui vient de s'achever, des deux côtés, avec mutation directe du ref en plus du `setState` (patron déjà établi par #149).

**Ce qui attend la reproduction.** Les points 1 et 2 passent par `systematic-debugging` avec reproduction live avant écriture de code. Le test de non-régression correspondant sera écrit **à partir du scénario de reproduction établi**, et non deviné à l'avance ; il figure dans la matrice de tests avec cette réserve explicite.

---

## 7. F — Noms de héros incohérents

`lib/achievements.ts:33-41` duplique les noms des héros en dur dans `HERO_TITLES`, désynchronisés du catalogue `lib/heroes.ts` :

| Catalogue (`heroes.ts`) | Succès (`achievements.ts`) |
|---|---|
| Assassin du Vent | Hashashin du Vent |
| Rôdeur des Feuilles | Rôdeu**se** des Feuilles |
| Broyeur de Cristal | Massacreur de Cristal |
| Gardien des Lames | Gardien de Lame |

**Correctif.** La table ne conserve que le **titre** du succès — « Souffle », « Lame Froide », « Facette »… qui sont bien des titres et non des noms de héros — accompagné d'un drapeau `feminine` pour l'accord du participe. La description se compose depuis `hero.name` :

```ts
description: `${hero.name} débloqué${copy.feminine ? "e" : ""}.`
```

C'est l'application directe de la leçon du reframe #51 : toute valeur d'un type partagé dupliquée en dur ailleurs que dans sa source casse silencieusement au prochain renommage.

Un balayage du reste du code cherche les mêmes duplications ailleurs (copy, carte de partage, Guide) ; ce qui est trouvé est ramené à `lib/heroes.ts` dans la même PR.

---

## 8. Matrice de couverture de tests

Chaque bug de l'issue porte au moins un test qui **échoue avant** le correctif et **passe après**. C'est la condition de livraison.

| Bug | Test | Nature | Ce qu'il verrouille |
|---|---|---|---|
| #4 — jauge Boss tronquée | `e2e/arena-hud-layout.spec.ts` | Playwright | Les `boundingBox().width` des deux `role="progressbar"` sont égales à 1 px près, sur un compte au pseudo **et** au titre longs face à un boss au nom long. jsdom ne calculant aucun layout, Vitest ne peut structurellement pas attraper ce bug — c'est le trou par lequel #139 est passé. |
| #4 — badge combo superposé | `e2e/arena-hud-layout.spec.ts` | Playwright | Combo actif : les rectangles du badge et de la jauge Boss ne s'intersectent pas. |
| #2 — overlay hors cadre | `e2e/ko-overlay-viewport.spec.ts` | Playwright | Sur viewport mobile, le titre PERFECT/K.O. et les quatre contrôles ont un `boundingBox` entièrement contenu dans le viewport (`y ≥ 0`, `y + height ≤ viewport.height`). |
| #3, #5 — position du héros | `lib/sprite-metadata.test.ts` | Vitest | `idleAnchorX` et `idleWidthRatio` présents pour les 7 héros et 27 boss, bornés dans `]0, 1[`, et `idleAnchorX` cohérent avec `idleWidthRatio` (la silhouette reste dans la tuile). |
| #3, #5 — position du héros | `components/combat/VersusScene.test.tsx` | Vitest | Pour deux héros aux ancres très différentes (`wind-hashashin` vs `metal-bladekeeper`), le `translateX` calculé place le centre de la silhouette au même pourcentage de scène. Test de la formule, pas du pixel. |
| #3, #5 — position du héros | `e2e/versus-anchoring.spec.ts` | Playwright | Le centre visible du héros est à 25 % ± 3 % de la largeur de scène, le Boss à 75 % ± 3 %, quel que soit le héros équipé (itéré sur au moins trois héros aux tuiles contrastées). |
| #6 — cadre Marché Noir | `components/combat/HeroIdle.test.tsx` | Vitest | Le cadre rendu a des dimensions identiques pour les sept héros — assertion sur les styles du conteneur, indépendante du layout. |
| #8 — flash blanc | `components/combat/CharacterSprite.test.tsx` | Vitest | `state="hurt"` pose la classe de flash ; `prefers-reduced-motion` ne la pose pas ; aucun `HeroVfx` n'est rendu. |
| #8 — flash blanc | `e2e/combat-animations.spec.ts` (cas ajouté) | Playwright | Le spec existant reste valable tel quel — il n'assertait pas sur les VFX. Un cas s'y ajoute : à l'impact, le personnage touché porte la classe de flash, et ne la porte plus une fois l'animation terminée. Tourne déjà en `no-preference`. |
| #8 — suppression VFX | `lib/sprite-metadata.test.ts` | Vitest | La clé `vfx` a disparu du JSON généré et les helpers associés n'existent plus (test de non-régression du nettoyage). |
| #1 — doublons, chemin P2 | `lib/game-engine.test.ts` | Vitest | `planRecurringGeneration` saute une routine ayant un reste actif sur un jour antérieur, et ne la saute pas si le reste est complété ou abandonné. |
| #1 — doublons, chemin P1 | `e2e/recurring-no-duplicate.spec.ts` | Playwright | Deux chargements concurrents de `/` ne produisent qu'une instance par routine. Vérifie le comportement observable, l'upsert étant le mécanisme sous-jacent. |
| #1 — doublons, cycle complet | `e2e/recurring-no-duplicate.spec.ts` | Playwright | Reste de routine de la veille + « Reporter » au Réveil : exactement une instance visible **sans rechargement de page**, ce qui couvre à la fois D1 et la propagation `createdTasks` vers le state client. |
| #1 — solde des doublons | vérification manuelle pré-merge | — | Le `UPDATE` de solde est du SQL ponctuel, non rejouable et non testable en Vitest : prétendre le couvrir par une fonction pure « réutilisée par la migration » serait faux, une migration SQL n'appelle pas de TypeScript. Il est donc validé à la main avant merge, en exécutant d'abord le `SELECT` équivalent de la CTE `ranked` sur la base liée et en vérifiant la liste des lignes qui seront annihilées. La garantie **durable** ne vient pas de ce solde ponctuel mais de l'index unique, lui couvert par les deux tests e2e ci-dessus. |
| #7 — noms de héros | `lib/achievements.test.ts` | Vitest | Pour chaque héros du catalogue, la description de son succès contient **littéralement** `hero.name`. Rend l'invariant impossible à re-casser. |
| #9 — hurt en double (structurel) | `lib/combat-animation.test.ts` | Vitest | La transition « fin d'animation » est extraite d'`Arena.tsx` en fonction pure dans `lib/combat-animation.ts` (règle projet n° 2), puis testée : depuis `attack` **comme** depuis `hurt`, l'état suivant est `idle`, et la clé d'animation est incrémentée. Couvre le candidat 3 indépendamment de la reproduction. |
| #9 — hurt en double (symptôme) | à définir | Playwright | **Écrit après reproduction**, à partir du scénario établi en `systematic-debugging`. Ne pas deviner le scénario à l'avance : c'est ce qui a fait passer #146 et #149 pour résolus alors qu'un cas subsistait. |

Restent verts sans modification, à vérifier explicitement : l'invariant `tileH / renderScale === LEGACY_IDLE_HEIGHTS[slug]` (`lib/sprite-metadata.test.ts`) et les cinq specs e2e qui touchent l'overlay K.O. ou Le Réveil (`crepuscule-recap`, `hero-bar-tooltip`, `journey-full-day`, `overdue-rest-chip`, `wake-up-ritual`).

---

## 9. Documentation et clôture

Dans le même commit que l'implémentation, conformément à la règle de mise à jour de `CLAUDE.md` :

- **`CLAUDE.md`** — § Sprites de combat : l'ancrage par `idleAnchorX` et la raison pour laquelle aligner la tuile est faux. § Mode Entraînement : les trois verrous anti-doublon et leurs rôles respectifs. § Cycle de la Journée : la relance de génération en fin de Réveil et l'obligation de renvoyer les lignes créées.
- **`ASSETS.md`** — retrait de la ligne VFX par héros.
- **`CHANGELOG.md`** — une ligne sous `[Unreleased]`.
- **Issue #156** — clôturée par la PR, avec le détail de ce qui a été corrigé et la mention explicite du bug #9 si sa reproduction n'aboutit pas.

**Pas de documentation utilisateur.** Aucune règle de jeu, aucun barème et aucun écran ne change de comportement du point de vue du joueur : ce sont exclusivement des correctifs. La règle du Guide (issue #68) exclut explicitement ce cas.

---

## 10. Risques assumés

**Régénération des spritesheets.** Relancer `scripts/build-sprite-sheets.mjs` réécrit tous les PNG en plus du JSON. Le diff doit être vérifié : les images doivent être binairement identiques, seul le JSON change. Une différence sur un PNG signalerait un effet de bord non voulu du retrait de la section VFX.

**Changement de contexte d'empilement de l'overlay K.O.** Le passage en `fixed inset-0` modifie le contexte d'empilement et le comportement du focus trap vis-à-vis du reste de la page. Les cinq specs e2e listés en [§8](#8-matrice-de-couverture-de-tests) doivent être rejoués.

**Bug #9 potentiellement non soldé.** Si la reproduction n'aboutit pas, le durcissement structurel du candidat 3 est livré et le symptôme reste ouvert dans l'issue plutôt que déclaré résolu. Ne pas reproduire l'erreur des deux itérations précédentes.

**Volume de la PR.** Six causes racines, une migration, une régénération d'assets et dix-sept tests. Le découpage en commits doit rester lisible : un commit par section (A, B, C, D, E, F), chacun avec ses tests et sa documentation.
