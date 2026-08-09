# Issue #183 — bugs part7 : design

> Date : 2026-08-09
> Issue GitHub : #183 ("bugs part7")
> Convention : 1 PR unique pour les 7 points (décision utilisateur, contrairement au découpage en sub-issues des parts précédentes #136/#156).

## Contexte

7 points remontés par l'utilisateur, sans lien fonctionnel entre eux. Triés en 3 groupes par niveau de confiance de la cause racine (établi en brainstorming, lecture statique du code) :

- **Groupe A — cause confirmée, fix direct.**
- **Groupe B — hypothèse forte (raisonnement CSS/layout), à valider par capture d'écran avant merge (même patron que les issues #145/#167).**
- **Groupe C — cause non confirmée par lecture statique, debug live requis en implémentation.**

## Groupe A — fixes directs

### A1. Renommer le succès "Ensemble on est plus fort"

`lib/achievements.ts:72` — champ `title` du succès `ALL_HEROES` (rareté or, `displayMode: "progress"`).
Fix : `"Ensemble on est plus fort"` → `"Attrapez les tous !"`. Aucun autre champ affecté (le `code` interne reste inchangé, pas de migration de données — c'est un libellé statique, jamais persisté en base).

### A2. Bouton "Redétecter" (fuseau horaire) déborde sur mobile

`components/qg/TimezoneSection.tsx:44-56` — `<select className="flex-1 ...">` dans un conteneur `flex items-center gap-2`. Cause confirmée : un `<select>` natif a une largeur minimale intrinsèque égale à celle de son option la plus longue (les identifiants IANA type `America/Argentina/ComodRivadavia`), et `flex-1` seul ne la fait pas rétrécir — `min-width: auto` par défaut sur un flex item l'emporte sur `flex-shrink`.
Fix : ajouter `min-w-0` au `<select>`. Une ligne, aucun changement de comportement fonctionnel.

### A3. Badge "équipé" du Marché Noir — cropé + hors design system

`components/shop/SkinCarousel.tsx:161-169`. Deux causes distinctes confirmées :

1. **Crop** : le badge (`absolute -right-1 -top-1`, un cercle qui dépasse de 4px au-dessus/à droite de son conteneur) est cropé par l'ancêtre Embla `<div ref={emblaRef} className="w-full overflow-hidden" ...>` (ligne 121-123), le viewport du carrousel. Tout élément positionné en négatif à l'intérieur de ce conteneur est rogné dès qu'il dépasse.
2. **Design system** : `border-radius: rounded-full` (cercle parfait) contredit DESIGN.md §5 ("Shape : coins arrondis 6px (`rounded-md`) pour tous les boutons") — c'est la seule forme parfaitement circulaire de l'app, elle lit comme un badge générique de style SaaS plutôt que le langage visuel 16-bit/blocky du reste de l'UI. La couleur `bg-xp` en revanche est **correcte et volontaire** (DESIGN.md §Secondary : "Indigo Néon... bordure du héros/tenue actuellement équipé (Marché Noir)" — déjà réutilisé identiquement pour `border-xp` sur la matrice de héros juste en dessous dans le même composant) : ne pas la changer.

Fix :
- Déplacer le badge hors du conteneur `overflow-hidden` d'Embla — il doit vivre dans le wrapper externe `.relative flex flex-col items-center` (ligne 146-159) mais positionné de façon à ne jamais dépasser dans la zone rognée, ou passer ce conteneur spécifique en `overflow-visible` s'il n'a pas d'autre rôle de clipping fonctionnel (à vérifier : Embla utilise ce `overflow-hidden` pour masquer les slides hors-champ horizontalement — le passer en `visible` casserait l'effet "peek" du coverflow). Solution retenue : garder `overflow-hidden` sur le viewport Embla (nécessaire à l'effet coverflow) et repositionner le badge en `-right-0.5 -top-0.5` avec une taille légèrement réduite (`h-4 w-4` au lieu de `h-5 w-5`) pour rester dans les bornes du slide plutôt que déborder du viewport — évite de toucher au comportement du carrousel.
- `rounded-full` → `rounded` (6px, cohérent avec le reste de l'app).

### A4. Icône des routines (🔁) hors design system

Ajouté par l'utilisateur en cours de session (édition de l'issue #183). Carte blanche sur la solution.

4 usages de l'emoji 🔁 dans le code (`grep`, hors `node_modules`) :
- `components/combat/TaskRow.tsx:135` (badge inline "Quête récurrente" sur une tâche)
- `components/combat/TomorrowTaskRow.tsx:59` (même badge, section Demain)
- `components/combat/RecurringManager.tsx:133` (liste des templates, écran Mes Routines)
- `app/vestiaire/page.tsx:18` (icône de la carte de nav "Mes Routines" dans le hub Le Vestiaire)

DESIGN.md §5 documente le seul précédent d'icône existant : `MicButton.tsx` (bouton dictée), un SVG inline `viewBox="0 0 16 16"`, `fill="currentColor"`, dessiné à la main (pas de dépendance externe type Lucide/Heroicons — cohérent avec ADR.md, aucune lib d'icônes n'est listée).

Fix : nouveau composant `components/ui/RecurringIcon.tsx`, SVG 16×16 (icône "repeat"/cycle à deux flèches, trait `stroke="currentColor"` — contrairement à `MicButton` qui est en `fill` parce que son glyphe s'y prête naturellement, un pictogramme de cycle/boucle se lit mieux en contour), réutilisé aux 4 emplacements :
- `TaskRow.tsx`/`TomorrowTaskRow.tsx` : `<RecurringIcon className="inline h-3.5 w-3.5 align-[-2px]" />` à la place de `🔁`, dans le même `<span aria-label="Quête récurrente" title="Quête récurrente">` existant (l'accessibilité ne change pas, seul le glyphe visuel change — `aria-hidden` posé sur le `<svg>` lui-même pour ne pas dupliquer l'annonce).
- `RecurringManager.tsx` : même remplacement inline.
- `app/vestiaire/page.tsx` : le tableau `SECTIONS` type son champ `icon` en `string` (rendu tel quel dans un `<span aria-hidden>`). Élargir le type à `ReactNode` (une chaîne reste un `ReactNode` valide, aucune régression sur les 6 autres entrées) et injecter `<RecurringIcon className="h-4 w-4" />` uniquement sur l'entrée "Mes Routines" — les autres émojis du hub (👤🏆🎨🛒📖⚖️) sont hors scope de ce point de l'issue, ne pas les toucher (éviter le scope creep).

## Groupe B — hypothèse forte, à valider visuellement

### B1. Position du BottomNav incohérente entre écrans

`components/ui/BottomNav.tsx` est identique et monté à l'identique sur tous les écrans (`sticky bottom-0`) — la différence ne vient pas de ce composant. Cause : le conteneur parent diffère entre l'Arène et les écrans HUD plats.
- `Arena.tsx:1725` : `<main className="arena-shell relative z-10 h-dvh gap-3 overflow-hidden px-4 py-4">` — `h-dvh` force le `<main>` à occuper exactement la hauteur du viewport, `overflow-hidden` empêche tout scroll de page ; le `BottomNav` (dernier enfant du flex-col) se retrouve donc toujours plaqué au bord réel du viewport.
- `app/vestiaire/page.tsx:46` (et tous les écrans `.screen-main` : Tableau de Chasse, Le Guide, Mes Routines...) : `<main className="screen-main gap-4 px-4 py-8">` — pas de `h-dvh`, la page scrolle normalement (hauteur = contenu). Quand le contenu est plus court que le viewport, le `BottomNav` sticky reste en position de flux normal (pas de scroll pour l'activer), juste avant le `padding-bottom` de 2rem (`py-8`) du `<main>` — il apparaît donc "plus haut" que le vrai bord d'écran, l'écart correspondant visuellement à ce padding de fin.

Fix proposé : aligner les écrans `.screen-main` sur le même patron de hauteur pleine que l'Arène pour que `BottomNav` colle toujours au bord réel — `<main>` en `h-dvh` avec un conteneur de contenu interne en `overflow-y-auto flex-1` (le contenu scrolle, le nav reste fixé en bas), plutôt que de faire scroller `<main>` lui-même. Ne concerne que la classe/les classes des balises `<main>` des écrans plats, pas `.screen-main`/`.arena-shell` eux-mêmes (déjà identiques en mobile, cf. commentaire ligne 80-82 du CSS).

**Vérification obligatoire avant merge** : capture d'écran mobile des deux écrans (Arène + Vestiaire, contenu court ET contenu long qui dépasse le viewport) — même méthode que les issues #145/#167 (bounding box réelle, pas seulement l'aperçu).

## Groupe C — cause non confirmée, debug live requis

### C1. Bouton "équiper" un héros sans effet

`app/actions/shop.ts:72-101` (`equipHero`) et `components/shop/CharacterSelect.tsx:50-61` (`onAction`) : lecture statique ne révèle aucun bug logique — policy RLS `profiles_update_own` en place, `revalidatePath` posé sur les deux routes concernées, garde `disabled={pending || equipped || (!owned && !affordable)}` correcte.

Hypothèses à vérifier en priorité en session d'implémentation (navigateur réel, pas de correctif à l'aveugle) :
1. Un overlay (modale de confirmation tenue `confirmSkin`, `AchievementToast`, ou le carrousel `SkinCarousel` lui-même) intercepte le clic sans le signaler visuellement — pattern déjà rencontré dans ce projet (dnd-kit capture de pointeur résiduelle, cf. CLAUDE.md).
2. Le bouton fonctionne réellement (DB mise à jour) mais l'UI ne reflète jamais le changement — vérifier si `revalidatePath("/marche-noir")` déclenche bien un re-render effectif de `EchoppePage` après un appel initié depuis un Client Component (`startTransition`), ou si un cache RSC intermédiaire retient l'ancienne valeur.
3. Repro minimale : ouvrir `/marche-noir` avec le compte e2e (2 héros possédés au moins), cliquer "Équiper" sur un héros non équipé, observer réseau + state React + valeur DB `profiles.equipped_hero_id` après coup.

### C2. Notifications — deux sous-bugs distincts

**C2a. Rappel de deadline par tâche (US-05/issue #114) jamais reçu.**
`lib/inngest/functions/schedule-deadline-reminder.ts` : logique de `sleepUntil`/`cancelOn`/re-check DB lue et jugée correcte statiquement. CLAUDE.md documente un piège récurrent et déjà vécu : la sync des fonctions Inngest vers l'app n'est pas fiable à chaque déploiement ("No functions found" côté dashboard). **Première étape de debug, avant tout code** : vérifier le dashboard Inngest (section Apps) — si la fonction n'y apparaît pas, resynchroniser manuellement ("Sync new app", URL `https://dodojo.vercel.app/api/inngest`) avant de suspecter le code.

**C2b. Rappel quotidien 17h30 arrive à 18h30 (+1h systématique).**
`lib/push-eligibility.ts` : fenêtre calculée via `Intl.DateTimeFormat` avec le fuseau IANA du profil (DST-safe, ne dépend d'aucun offset figé). Lecture statique ne révèle aucune cause plausible dans cette fonction. Un décalage systématique et constant de +1h suggère un problème en amont (lag de queue Inngest, fréquence de fan-out effective différente de `*/15` en pratique, ou fuseau `profiles.timezone` du compte concerné qui ne correspond pas à ce qui est supposé) plutôt qu'une erreur de calcul.

Debug requis : comparer l'horodatage réel d'exécution du run Inngest `reminder-fanout` (dashboard, historique des runs) avec l'heure de réception effective de la notif, et vérifier la valeur de `profiles.timezone` du compte concerné.

## Hors scope

- Aucune migration de données.
- Aucun changement de policy RLS.
- Les autres icônes emoji du hub Le Vestiaire (`app/vestiaire/page.tsx`, SECTIONS) restent inchangées — seule "Mes Routines" est concernée par le point A4 de l'issue.
- Pas de refonte du composant `BottomNav.tsx` lui-même (B1) — uniquement son conteneur parent sur les écrans `.screen-main`.

## Plan de vérification (avant PR)

- `npx tsc --noEmit`
- `npm run lint`
- `npm run test` (Vitest) — nouveau test pour `RecurringIcon` non nécessaire (composant purement présentationnel, pas de logique), mais vérifier qu'aucun test existant n'assert sur le texte `🔁` littéral (`grep` avant de merger).
- `npm run build`
- e2e Playwright ciblés : tout spec qui asserte sur le texte `🔁` ou la position du `BottomNav` doit être identifié et mis à jour si besoin.
- Capture d'écran manuelle mobile pour B1 (bordure BottomNav) et A3 (badge non cropé).
- C1/C2a/C2b : vérification manuelle en navigateur/dashboard Inngest documentée dans la PR, pas de fix appliqué sans confirmation de la cause réelle (cf. leçon générale déjà tirée sur ce projet : ne jamais implémenter un correctif sur une hypothèse non vérifiée en exécution live).
