# Audit complet — Dodojo (24 juillet 2026)

> Périmètre : repo complet, branche `main`, état du 24 juillet 2026. Fond (logique métier, architecture, sécurité) et forme (accessibilité, performance, theming, responsive, anti-patterns). 7 axes, vérifications objectives (typecheck, lint, tests, migrations) + lecture directe du code, aucun finding non vérifié dans un fichier réel.
>
> Rapport source (artefact interactif) : voir conversation associée à l'issue #67.

## Sommaire

- [Checks objectifs](#checks-objectifs-avant-lecture-de-code)
- [Tableau de bord des scores](#tableau-de-bord-des-scores)
- [Verdict anti-patterns](#verdict-anti-patterns--ce-projet-ressemble-t-il-à-du--ai-slop-)
- [Plan d'action priorisé](#plan-daction-priorisé)
- [Détail par axe](#détail-par-axe) : [A11y](#a11y) · [Performance](#performance) · [Theming](#theming) · [Responsive](#responsive) · [Anti-patterns](#anti-patterns--ai-slop) · [Fond](#fond-architecture--dette-technique) · [Sécurité](#sécurité)
- [Points positifs](#points-positifs-à-préserver)
- [Ordre de commandes recommandé](#ordre-de-commandes-recommandé)

---

## Checks objectifs (avant lecture de code)

| Check | Résultat | Détail |
|---|---|---|
| `tsc --noEmit` | ✅ OK | Aucune erreur de typage. |
| `eslint .` | ⚠️ 1 erreur | `Arena.tsx:272` — `setState` synchrone dans un effet (`react-hooks/set-state-in-effect`) + 2 warnings mineurs (dep manquante, variable inutilisée en e2e). |
| `vitest run` | ✅ 378/378 | 42 fichiers de test, tous verts, 6.25s. |
| `supabase migration list --linked` | ✅ Synchronisé | 19/19 migrations locales = distantes. Le bug de dérive documenté dans `CLAUDE.md` (issue #70) est bien résolu et ne traîne pas. |

## Tableau de bord des scores

| Dimension | Score | Registre |
|---|---|---|
| Accessibilité (A11y) | **2/4** | Partiel |
| Performance | **2/4** | Partiel |
| Theming | **3/4** | Bon |
| Responsive | **1/4** | Problèmes majeurs |
| Anti-patterns (AI slop) | **3/4** | Globalement propre |
| Fond / architecture | **3/4** | Bien respecté |
| Sécurité | **3/4** | Bon |

**Total (5 dimensions standard) : 11/20 — Acceptable, travail significatif nécessaire.**

Somme des 5 dimensions standard (A11y + Perf + Theming + Responsive + Anti-patterns). Fond (3/4) et Sécurité (3/4) sont deux axes additionnels, non inclus dans ce total, et confirment des fondations métier saines — le poids du travail restant est concentré sur l'ergonomie mobile et l'accessibilité clavier.

## Verdict anti-patterns — ce projet ressemble-t-il à du « AI slop » ?

**Non.** Le système de design (palette pleine oklch, fond arcade sombre exclusif, pixel-art assumé, motion chorégraphié) est appliqué avec discipline sur la quasi-totalité du code, y compris les écrans ajoutés récemment (Panthéon, Entraînement, Guide). Aucun gradient text, aucun glassmorphism, aucun gris Tailwind neutre, aucune grille de cards générique. Les seules poches d'incohérence trouvées sont ponctuelles : 4 occurrences de `shadow-lg` (banni explicitement par `DESIGN.md`) et quelques usages de la police pixel BoldPixels hors de sa liste d'usages autorisés (texte long/accentué). C'est un système cohérent avec des dérives localisées à corriger, pas une esthétique générique.

---

## Plan d'action priorisé

Tous les findings des 7 axes, dédupliqués et reclassés par impact réel (un même problème remonté par deux agents sous deux angles compte une fois, à la sévérité la plus haute justifiée). P0 d'abord.

### P0 — Bloquant

1. **Cibles tactiles trop petites sur toute la boucle de combat quotidienne**
   Checkbox de tâche (16×16px), poignée de drag ⠿ (~20px), bouton abandon × (~20px), icône deadline ⏰ (sans padding), les 3 boutons du Rituel du Réveil (~24px de haut). Ce sont les actions les plus fréquentes de l'app ("mobile-first, une main" est un principe produit documenté) — sous le seuil de 44×44px partout.
   → `components/combat/TaskRow.tsx`, `DeadlineControl.tsx`, `WakeUpRitual.tsx` · commande suggérée : `/impeccable adapt`

2. **La liste de tâches ne scrolle jamais en interne — c'est toute la page qui défile**
   Aucun ancêtre de `TaskList` (`Arena.tsx`, `layout.tsx`) ne fixe une hauteur bornée (`h-dvh`/`min-h-0`). Le HUD (jauges) et la `BottomNav` ne restent jamais visibles pendant qu'on scrolle une longue liste — contraire au pattern de navigation documenté. `ArenaCoach` (`bottom-24` fixe) suppose en plus une nav fixe qui n'existe pas et peut se superposer au formulaire d'ajout.
   → `components/combat/Arena.tsx`, `TaskList.tsx`, `ArenaCoach.tsx` · commande suggérée : `/impeccable layout`

3. **Aucun focus trap sur les overlays — le Rituel du Réveil "bloquant" est contournable au clavier**
   Zéro `aria-modal`, zéro gestion d'Échap, zéro déplacement de focus à l'ouverture sur les 8 overlays de l'app. Pour `WakeUpRitual` — documenté comme mécanisme **bloquant** (US-08) — un utilisateur clavier peut Tab à travers l'overlay et activer l'Arène sous-jacente pendant que le Rituel est censé forcer une résolution des restes. Contournement complet d'une règle métier, au clavier uniquement.
   → `components/combat/WakeUpRitual.tsx` et les 7 autres overlays · commande suggérée : `/impeccable harden`

4. **Deux jauges de progression sans sémantique ARIA**
   La jauge XP du Panthéon (`app/pantheon/page.tsx:115-117`) et la jauge HP du Rituel du Réveil (`WakeUpRitual.tsx:116-121`) n'ont ni `role="progressbar"` ni `aria-valuenow/min/max` — contrairement à `HeroBar`/`BossBar` qui l'implémentent correctement. La jauge du Réveil cumule en plus une piste grise non teintée (viole la règle du fond teinté) et une transition sans easing/durée définie.
   → `app/pantheon/page.tsx`, `components/combat/WakeUpRitual.tsx` · commande suggérée : `/impeccable harden`

5. **Bug de données : le solde d'or diverge entre Panthéon et Échoppe au-delà de 90 jours d'historique**
   `goldBalance()` a besoin de tout l'historique `day_results` pour être exact. `app/pantheon/page.tsx` borne la requête à 90 jours puis réutilise ce même tableau tronqué pour `goldBalance`, alors que `app/echoppe/page.tsx` ne borne rien pour le même calcul. Pour tout compte de plus de 90 jours, l'or affiché diverge entre les deux écrans.
   → `lib/game-engine.ts:359-368`, `app/pantheon/page.tsx:33-38,70` · commande suggérée : `/impeccable optimize` (+ fix de requête)

6. **Bug de données : le palier de série "100 jours / Sensei" ne peut jamais se déclencher depuis l'Arène**
   `app/page.tsx` borne `day_results` à 60 lignes avant de les passer à `currentStreak()` pour détecter les paliers [7, 30, 100]. Avec seulement 60 jours d'historique fournis, le palier 100 ne peut structurellement jamais être atteint depuis l'Arène — alors que le QG calcule la série correctement sur les mêmes données non bornées. Incohérence directe entre écrans sur une fonctionnalité de célébration.
   → `app/page.tsx:66-71`, `lib/game-engine.ts:571-611` · commande suggérée : `/impeccable optimize`

### P1 — Majeur

7. **`text-hp`/`text-xp` comme couleur de texte : contraste 3.4–3.9:1, sous le seuil AA, y compris sur des messages d'erreur**
   ~15 occurrences (CharacterSelect, WebhookTokenSection, PushReminderToggle, GeminiConnectionSection, RecurringManager, CrepusculeRecap, Pantheon, Arena). Le fix WCAG du 24/07 n'a corrigé que `ink`-sur-`hp`/`xp` (boutons pleins) ; l'usage inverse (hp/xp comme texte sur fond neutre) n'a jamais été traité.
   → `/impeccable polish`

8. **Focus clavier invisible sur les 2 champs les plus utilisés de l'app**
   `AddTaskForm.tsx:38` et `SubtaskForm.tsx:59` ont `outline-none` sans remplacement `focus-visible:*`, contrairement aux inputs d'auth qui ont bien `focus-visible:ring-2`. L'interaction la plus fréquente de l'app (ajouter une tâche) n'a aucun indicateur de focus clavier.
   → `/impeccable harden`

9. **`shadow-lg` — ban explicite de `DESIGN.md` violé à 4 endroits**
   UpdateToast, DeadlineControl (popover), ArenaCoach (bulle), Arena (DragOverlay). Le système documente précisément comment obtenir de la profondeur sans ombre (surfaces + overlays noir-plat) — ces 4 endroits réintroduisent le réflexe Tailwind par défaut que la marque rejette explicitement.
   → `/impeccable polish`

10. **Règle des 3 états UI non respectée sur QG, Entraînement et Guide**
    Règle non-négociable du `CLAUDE.md`. Aucun `loading.tsx`, aucune gestion d'erreur sur `app/qg/page.tsx`, `app/qg/entrainement/page.tsx`, `app/guide/page.tsx`, `app/guide/[slug]/page.tsx`. Aucun `error.tsx` n'existe nulle part dans `app/` — pas de filet de secours Next.js non plus. Un échec Supabase sur ces routes dégrade silencieusement au lieu de montrer un message cohérent avec le reste de l'app.
    → `/impeccable harden`

11. **Arène (page la plus utilisée) : 4 `getUser()` en cascade + fetches non parallélisés**
    Chaîne strictement séquentielle (middleware → page → generateRecurringInstances → resolveDailyBoss), chacune re-fetchant `profiles.timezone`. Puis `tasks`/`overdueTasks`/`dayResults` enchaînés en série alors qu'ils sont indépendants entre eux. QG et Panthéon ont le même défaut (4 requêtes en série chacun) ; seule l'Échoppe parallélise déjà correctement via `Promise.all` — bon modèle à répliquer.
    → `app/page.tsx`, `app/qg/page.tsx`, `app/pantheon/page.tsx` · `/impeccable optimize`

12. **Le poll deadline (~45s) re-render toute la liste de tâches sans memo**
    `TaskList`/`TaskRow` n'ont aucun `React.memo`, les handlers passés sont recréés à chaque rendu (pas de `useCallback`). À chaque tick de 45s, toutes les lignes de tâches (chacune avec deux hooks dnd-kit) se re-rendent même si rien n'a changé — contraste avec `MidnightTimer` qui isole bien son propre timer.
    → `components/combat/Arena.tsx`, `TaskList.tsx`, `TaskRow.tsx` · `/impeccable optimize`

13. **Enregistrement OAuth ouvert exploitable pour du phishing de consentement**
    `POST /oauth/register` (RFC 7591) n'exige aucune preuve de propriété du `redirect_uri`, et `client_name` est une métadonnée auto-déclarée jamais vérifiée, affichée telle quelle sur l'écran de consentement. Un attaquant peut s'enregistrer avec `client_name: "Gemini"` et un `redirect_uri` à lui, puis piéger une victime déjà connectée pour obtenir un token `tasks:write` sur son compte. Impact borné au scope unique (ajout de tâches), mais le vecteur est réel et directement exploitable.
    → `app/oauth/register/route.ts`, `app/oauth/authorize/route.ts` · fix engineering (hors périmètre impeccable)

14. **`addSubtask` ne valide pas la longueur du titre côté serveur**
    Contrairement à `addTask` qui appelle `validateTaskTitle` (limite 140 caractères, source de vérité documentée dans `lib/task-title.ts`), `addSubtask` ne fait qu'un `title.trim()`. La limite HTML `maxLength=140` côté client est trivialement contournable en appelant la server action directement — remonté indépendamment par l'audit fond ET l'audit sécurité.
    → `app/actions/tasks.ts:82-90` · fix engineering

### P2 — Modéré

15. **BoldPixels appliqué à du texte français long/accentué hors whitelist** — titres d'articles du Guide (CMS variable), pseudo utilisateur au Panthéon, en-têtes du Rituel du Crépuscule, noms de catégorie. → `/impeccable typeset`
16. **Titre de tâche sans protection overflow** — jusqu'à 140 caractères sans espaces garantis, rendu sans `truncate`/`break-words`/`min-w-0`. → `components/combat/TaskRow.tsx` · `/impeccable harden`
17. **`oauth_clients` lisible publiquement sans authentification** — policy RLS `using (true)` sans `to authenticated`. → `supabase/migrations/20260723110000_create_oauth_mcp.sql` · fix engineering
18. **`redirect_uri` OAuth accepté sans restriction de schéma** — accepte `http://`, `javascript:`, `data:` au lieu d'exiger HTTPS/loopback (RFC 8252). → `lib/oauth-client-registration.ts:11-19` · fix engineering
19. **`id` non validé interpolé dans un filtre PostgREST `.or()`** — 4 server actions concatènent `id` sans validation UUID ; contenu par le `user_id` en AND (pas de fuite cross-tenant), mais intégrité de données à risque. → `app/actions/tasks.ts` · fix engineering
20. **`updateAggressivityLevel` sans validation runtime de l'enum** — même classe qu'un crash déjà documenté (`pickVariant(pools[undefined])`). → `app/actions/profile.ts:20-36` · fix engineering
21. **`DESIGN.md` désynchronisé de l'implémentation réelle** — le frontmatter (`faint`/`hp`/`xp`) ne reflète plus `app/globals.css` depuis le fix WCAG PR #77, alors que `CLAUDE.md` impose la mise à jour de la doc dans le même commit. → `/impeccable document`
22. **Cibles tactiles secondaires sous 44px** — bouton "+" SubtaskForm (~20px), swatches de tenue Échoppe (24px), boutons jour de semaine Entraînement (32px), BottomNav (~42.5px), boutons secondaires QG (~24px), bouton "Ajouter" (~28px). → `/impeccable adapt`
23. **Distinction jour actif/inactif par la couleur seule (Entraînement)** — `text-hp` vs `text-faint` sans `aria-label`. → `components/combat/RecurringManager.tsx:136-144` · `/impeccable harden`
24. **Aucun préchargement des frames de sprites — risque de flash réel** — `ImpactVfx` cadence à 45ms/frame avec 4 variantes aléatoires, sans `preload`/`new Image()`. → `/impeccable optimize`
25. **Arène et Échoppe sans conteneur `max-w`** — étirement bord à bord sur grand écran, contrairement à QG/Panthéon/Guide. → `/impeccable adapt`

### P3 — Polish

26. **Divers polish mineurs** : jauges HP/XP animant `width` plutôt que `transform: scaleX()` ; `border-border` sous 3:1 en séparateur pur (impact limité) ; hex hardcodés dans manifest.ts/share-card (justifiés techniquement) ; `gold`/`xp` utilisés hors de leur rôle documenté à 2 endroits ; BoldPixels hors `next/font` (FOUT mineur) ; images du Guide sans `loading="lazy"` ; `: any` résiduel dans 2 fichiers de test (impact nul) ; absence d'en-têtes de sécurité HTTP (CSP, HSTS) ; pas de `SameSite` explicite sur le cookie de session ; `weekdays` non borné côté serveur. → `/impeccable polish`

---

## Détail par axe

### A11y — 2/4

Structure de base saine (ARIA labels systématiques sur les boutons icône, reduced-motion largement couvert, drag-and-drop avec vrai fallback clavier), mais deux failles Level A et un pattern de contraste AA répété sur une quinzaine d'endroits.

**P0**
- Jauge XP du Panthéon sans sémantique ARIA (`app/pantheon/page.tsx:115-117`) — WCAG 4.1.2 (A) + 1.1.1.
- Aucun focus trap sur les 8 overlays (`WakeUpRitual.tsx:104`, `CrepusculeRecap.tsx:49`, `Arena.tsx:890`, `LevelUpOverlay.tsx:21`, `PerfectOverlay.tsx:54`, `CharacterSelect.tsx:228/257`, `DeadlineControl.tsx:71`) — WCAG 2.4.3 (A) + 4.1.2.

**P1**
- `text-hp`/`text-xp` comme texte : 3.4–3.9:1 (CharacterSelect.tsx:129, app/echoppe/page.tsx:39/42, WebhookTokenSection.tsx:85/99/105/107/114, PushReminderToggle.tsx:128, GeminiConnectionSection.tsx:40/53, RecurringManager.tsx:97/109/139, CrepusculeRecap.tsx:85, app/pantheon/page.tsx:60/93/112/138, Arena.tsx:941/958) — WCAG 1.4.3 (AA).
- Focus clavier invisible sur `AddTaskForm.tsx:38`, `SubtaskForm.tsx:59` — WCAG 2.4.7 (AA).

**P2**
- Jour actif/inactif distingué par la couleur seule (`RecurringManager.tsx:136-144`) — WCAG 1.4.1.
- L'Arène est le seul écran sans landmark `<main>` (`Arena.tsx:721`).
- Pas de restauration de focus après fermeture d'un popover (`DeadlineControl.tsx`) — WCAG 2.4.3.

**P3**
- Jauges HP/XP sans garde `motion-reduce` sur la transition (`HeroBar.tsx:22`, `BossBar.tsx:21`).
- `border-border` sous 3:1 comme séparateur (jamais le seul signal d'un contrôle actionnable).

**Conforme :** aria-label systématique sur boutons icône, `KeyboardSensor` fonctionnel, labels de formulaire corrects, `alt` informatif/décoratif bien distingué, reduced-motion large et cohérent, `role="status"`/`aria-live` bien posés.

### Performance — 2/4

Bons réflexes par endroits (cleanup systématique des timers, animations sur `transform`/`opacity`, Échoppe déjà parallélisée), mais le data-fetching des pages les plus visitées est en waterfall pur et deux bugs de cohérence de données en découlent directement.

**P1**
- Poll ~45s re-render toute la liste de tâches (`Arena.tsx:278-313`, `TaskList.tsx`, `TaskRow.tsx`).
- Arène : 4 `getUser()` en cascade + fetches série (`app/page.tsx:11-71`, `app/actions/recurring.ts:38-44`, `app/actions/boss.ts:28-39`).
- QG : 4 requêtes non parallélisées + `day_results` non borné (`app/qg/page.tsx:37-52`).
- Panthéon : 4 requêtes non parallélisées (`app/pantheon/page.tsx:27-48`).
- Bug : solde d'or divergent Panthéon vs Échoppe au-delà de 90 jours (`lib/game-engine.ts:359-368`, `app/pantheon/page.tsx:33-38,70`).
- Bug : palier de série "100 jours" jamais atteignable depuis l'Arène (`app/page.tsx:66-71`, `lib/game-engine.ts:571-611`).

**P2**
- Aucun préchargement des frames de sprites — risque de flash (`ImpactVfx.tsx` 45ms/frame, `IdleSprite.tsx` 120ms/frame).
- Jauges HP animent `width` plutôt que `transform` (`BossBar.tsx:20-23`, `HeroBar.tsx:21-24`).

**P3**
- Police BoldPixels hors `next/font` (`app/globals.css:5-13`).
- `sizes` fixe potentiellement sous-dimensionné sur desktop (`VersusScene.tsx:50-57`).
- Images du Guide sans `loading="lazy"` (`ArticleMarkdown.tsx:55-59`).

**Conforme :** tous les timers nettoyés, animations sur transform/opacity (hors jauges), `IdleSprite` en `<img>` brut justifié, `ArticleMarkdown` reste Server Component, `app/echoppe/page.tsx` seul écran à paralléliser correctement via `Promise.all`.

### Theming — 3/4

Tokens utilisés massivement et correctement (règle du fond teinté respectée à 100%, zéro gris Tailwind neutre), mais deux bans explicites de `DESIGN.md` sont violés de façon concrète et répétée.

**P0**
- `shadow-lg` — ombre décorative bannie (`UpdateToast.tsx:22`, `DeadlineControl.tsx:73`, `ArenaCoach.tsx:17`, `Arena.tsx:1001`).
- Jauge HP du Rituel du Réveil : triple violation — piste grise hardcodée `oklch(0.2 0 0)`, pas de `role="progressbar"`, pas de `duration-300 ease-out` (`WakeUpRitual.tsx:116-121`).

**P1**
- BoldPixels sur texte français long/accentué confirmé sur données réelles (`app/guide/[slug]/page.tsx:50`, `app/guide/page.tsx:21`, `CrepusculeRecap.tsx:55-59,85-90`, `app/qg/entrainement/page.tsx:50-52`, `app/pantheon/page.tsx:54-56,86-88,103-105`, `RecurringManager.tsx:76-78`, `IntegrationsSection.tsx:14`).

**P2**
- `DESIGN.md` désynchronisé du code depuis le fix WCAG PR #77.
- Bouton primaire : padding incohérent onboarding vs Arène (`app/login/page.tsx:89` vs `AddTaskForm.tsx:44`).
- Opacité des overlays hors plage documentée 72-78% (`CrepusculeRecap.tsx:52` = 88%, `WakeUpRitual.tsx:106` = 92%).
- `border-gold` hors de son rôle documenté (`ArenaCoach.tsx:17,26`).
- `bg-xp` comme fond de bouton générique (`UpdateToast.tsx:28`).
- Token informel non nommé (`ArenaError.tsx:22`).

**Conforme :** règle du fond teinté 100% respectée, aucun `rounded-[...]`/`p-[...]` arbitraire hors cas documentés, aucun `backdrop-filter`/gradient text, `BossBar`/`HeroBar` conformes à la lettre, convention `bg-black/40-60` uniforme.

### Responsive — 1/4

Aucun débordement, réduction propre à 320px, mais plusieurs contrôles du cœur de la boucle de jeu quotidienne ont des zones tactiles très en dessous de 44×44px, et un bug flexbox casse le layout HUD-fixe/liste-scrollable prévu. Zéro breakpoint `md:`/`lg:` dans tout le repo.

**P0**
- Checkbox de tâche 16×16px (`TaskRow.tsx:83-91`).
- Poignée de drag "⠿" ~20×20px (`TaskRow.tsx:73-82`).
- Bouton "×" Abandonner ~20×20px (`TaskRow.tsx:120-127`).
- Icône ⏰ DeadlineControl sans padding vertical (`DeadlineControl.tsx:54-68`).
- Boutons Terminé/Reporter/Annihiler ~24px de haut (`WakeUpRitual.tsx:180-212`).
- Bug flexbox : scroll interne de `TaskList` ne s'engage jamais (`TaskList.tsx:29`, `app/layout.tsx:18`, `Arena.tsx:721`).
- `ArenaCoach` suppose une nav fixe qui n'existe pas (`ArenaCoach.tsx:15`).

**P1**
- Bouton "+" SubtaskForm ~20×20px (`SubtaskForm.tsx:30-38`).
- Swatches de tenue Échoppe 24×24px (`CharacterSelect.tsx:174-181`).
- Boutons jour de semaine Entraînement 32×~30px (`RecurringManager.tsx:90-101`).
- `BottomNav` ≈42.5px de haut (`BottomNav.tsx:28`).
- Boutons secondaires QG ~24px de haut (`WebhookTokenSection.tsx:77,91,99`, `PushReminderToggle.tsx:118`, `GeminiConnectionSection.tsx:40`).

**P2**
- Bouton "Ajouter" ~28px de haut (`AddTaskForm.tsx:41-47`).
- Arène et Échoppe sans `max-w` (`Arena.tsx:721`, `app/echoppe/page.tsx:55`).
- `VersusScene` : `sizes="336px"` figé (`VersusScene.tsx:54`).
- Ligne de tâche dense à 320-375px avec tous les contrôles actifs (`TaskRow.tsx:62-129`).
- Zéro breakpoint `md:`/`lg:`/`sm:`/`xl:` dans tout le repo (dette MVP mobile-first assumée).

**Conforme :** drag & drop tactile réellement câblé (`TouchSensor` delay:200/tolerance:8), `MicButton` calibré exactement à 44×44px, matrice de héros `h-11 w-11` = 44×44px, tables du Guide protégées `overflow-x-auto`, profondeur de sous-tâches plafonnée (RG-01).

### Anti-patterns / AI slop — 3/4

**Verdict : non, pas d'AI slop générique.** Système appliqué avec discipline, y compris sur les écrans récents. 3 poches d'incohérence ponctuelles, pas un motif systémique.

- **P2** — Titre de tâche sans protection overflow (`TaskRow.tsx:92-103`, `Arena.tsx:1001-1003`) : le seul vrai "tell" générique confirmé et déclenchable.
- shadow-lg et BoldPixels hors-whitelist déjà comptés dans le plan d'action (theming P0/P1).

**Catégories vérifiées sans finding :** gradient text, glassmorphism, side-stripe borders, hero-metric SaaS, grilles de cards identiques, eyebrow/kicker générique, marqueurs 01/02/03 décoratifs, gris Tailwind neutre, copy générique dans `lib/copy/*` — tous absents.

### Fond, architecture & dette technique — 3/4

Fondations métier saines et fidèles au `CLAUDE.md` : RG-01 à RG-04 respectées, calculs HP/XP/streak non dupliqués, migrations synchronisées. La dette se concentre sur la règle des 3 états UI et deux trous de validation d'input.

**P1**
- 3 états UI (Loading/Error/Empty) non respectés sur QG, Entraînement, Guide (`app/qg/page.tsx`, `app/qg/entrainement/page.tsx`, `app/guide/page.tsx`, `app/guide/[slug]/page.tsx`) — aucun `error.tsx` nulle part dans `app/`.

**P2**
- `addSubtask` réinvente une validation partielle, sans `validateTaskTitle` (`app/actions/tasks.ts:82-90`).
- `updateAggressivityLevel` sans validation runtime de l'enum (`app/actions/profile.ts:20-36`).
- `: any` résiduel dans 2 fichiers de test (`lib/oauth-gemini.test.ts:63`, `lib/task-insertion.test.ts:68`) — impact nul.

**Confirmé conforme au CLAUDE.md, aucune dérive :** RG-01 (garde `isNestableParent` côté UI + server action), RG-04 (aucun DELETE hors les 3 exceptions documentées), `dayKey` utilisé partout, `deadlineIso` DST-aware confirmé, `koOutcome` avec ses 3 gardes, `goldBalance` à 3 paramètres partout, `WakeUpRitual` renvoie bien les tâches différées (fix bug #70 en place), logique de jeu jamais dupliquée, couverture de test réelle sur les US récentes (skins, agressivité, roster de boss).

### Sécurité — 3/4

Base saine : RLS exemplaire, secrets bien gérés, primitives OAuth (PKCE, hash, usage unique) correctement implémentées. Point d'attention élevé sur le flux de consentement OAuth ouvert.

**P1**
- Phishing d'autorisation OAuth via la DCR ouverte (`app/oauth/register/route.ts:50-57`, `lib/oauth-client-registration.ts:29-55`, `app/oauth/authorize/route.ts:102-111`).

**P2**
- `oauth_clients` lisible publiquement sans authentification (`supabase/migrations/20260723110000_create_oauth_mcp.sql`).
- `redirect_uri` accepté sans restriction de schéma (`lib/oauth-client-registration.ts:11-19`).
- `addSubtask` sans limite de longueur côté serveur (doublon avec l'audit fond).
- `id` non validé interpolé dans un filtre `.or()` (`app/actions/tasks.ts:304,419,457,483`).
- Rate limiting best-effort, non distribué (`lib/rate-limit.ts:15-30`) — dette déjà acceptée dans `CLAUDE.md`.

**P3**
- `weekdays` non validé côté serveur (`app/actions/recurring.ts:114-153,156-188`).
- Aucun en-tête de sécurité HTTP (`next.config.ts`) — pas de CSP, HSTS, X-Frame-Options.
- Pas de `SameSite` explicite sur le cookie de session.

**Vérifications qui n'ont rien remonté :** RLS DELETE absent sur les 7 tables protégées RG-04 (19 migrations lues intégralement), SELECT/INSERT/UPDATE scopés `auth.uid()` (sauf `oauth_clients`), aucun secret en dur, PKCE S256 + hash + TTL 60s + `redirect_uri` validé avant redirection + rotation refresh token, webhook Siri en comparaison temps constant, pas de vecteur CORS/CSRF classique (Bearer explicite).

---

## Points positifs à préserver

- **Fondations métier solides** — RG-01 à RG-04 respectées à la lettre, logique de jeu jamais dupliquée hors `lib/game-engine.ts`, migrations synchronisées.
- **378 tests unitaires, tous verts**, couverture réelle sur les fonctionnalités récentes (skins, agressivité, roster de boss) — pas que de l'e2e.
- **Design system appliqué avec discipline** — règle du fond teinté respectée à 100%, zéro gris Tailwind, zéro glassmorphism/gradient text, sur tous les écrans y compris les plus récents.
- **Sécurité OAuth cœur solide** — PKCE S256, hash systématique, tokens à usage unique, aucune policy DELETE sur les données de combat.
- **Drag-and-drop réellement accessible au clavier** (`KeyboardSensor`) et au toucher (`TouchSensor` avec bonne disambiguation scroll/drag) — rare d'avoir les deux.
- **`app/echoppe/page.tsx`** — seul écran à paralléliser correctement ses requêtes Supabase via `Promise.all` ; bon modèle à répliquer sur QG/Panthéon/Arène.
- **Correctif du bug prod #70** (Rituel du Réveil / refetch) toujours en place et vérifié fonctionnel dans le code actuel.
- **Reduced-motion** couvert de façon large et cohérente sur la quasi-totalité des animations de combat.

---

## Ordre de commandes recommandé

1. **`/impeccable adapt`** — Cibles tactiles sur toute la boucle de combat (checkbox, drag, abandon, deadline, Réveil) — le P0 au plus fort volume d'usage quotidien.
2. **`/impeccable layout`** — Bug de scroll de l'Arène (hauteur bornée, `min-h-0`) + repositionnement d'`ArenaCoach`.
3. **`/impeccable harden`** — Focus trap sur les 8 overlays, ARIA manquant sur les 2 jauges, 3 états UI sur QG/Entraînement/Guide, focus-visible sur les champs de saisie.
4. **Fixes engineering (hors périmètre impeccable)** — DCR OAuth (écran de consentement + restriction de schéma), `addSubtask` validation serveur, ids non validés dans `.or()`, `updateAggressivityLevel` validation runtime, policy `oauth_clients`.
5. **`/impeccable optimize`** — Parallélisation des requêtes (Arène/QG/Panthéon), bug solde d'or, bug palier de série 100 jours, memo sur la liste de tâches, préchargement des sprites.
6. **`/impeccable typeset`** — Recadrer les usages de BoldPixels aux libellés courts non accentués.
7. **`/impeccable document`** — Resynchroniser `DESIGN.md` avec les valeurs réelles de `globals.css` post-PR #77.
8. **`/impeccable polish`** — Passe finale : contraste `text-hp`/`text-xp`, suppression des `shadow-lg`, cohérence des paddings de bouton. À relancer en dernier une fois les fixes ci-dessus faits.
