# Spec — Pages légales : mentions légales, confidentialité, CGU (issue #134, sous-sujet 2/2)

> Statut : validé en brainstorming, prêt pour plan d'implémentation.
> Issue #134 mélange 3 sujets indépendants (crédits, mentions légales/RGPD, cookies). Cette spec couvre le sous-sujet légal. Le crédit des créateurs est traité par `2026-08-08-issue134-artisans-credits-design.md`. Proposer de scinder #134 en deux sous-issues au moment du PR.

## Contexte

Aucune page légale n'existe aujourd'hui. Deux obligations distinctes et indépendantes des cookies :
1. **LCEN** : toute appli/site édité depuis la France doit publier des mentions légales identifiant l'éditeur et l'hébergeur.
2. **RGPD** : Dodojo traite des données personnelles (email, pseudo, timezone, `aggressivity_level`, `push_subscriptions`, `webhook_token_hash`) dès la création de compte — une politique de confidentialité est obligatoire, indépendamment de toute question de cookies.

**Constat fait en brainstorming, à vérifier avant rédaction finale du contenu** : `app/layout.tsx` ne charge aucun script d'analytics/tracking tiers ; le seul cookie posé est le cookie de session Supabase (strictement nécessaire au fonctionnement du service, donc **exempté de consentement** par l'ePrivacy/RGPD). **Conclusion actuelle : aucun bandeau de consentement cookies n'est nécessaire aujourd'hui.** Si un outil d'analytics/tracking est ajouté un jour (y compris un outil "léger" comme Vercel Web Analytics selon sa configuration), ce point doit être revu et un vrai bandeau de consentement implémenté à ce moment-là — ne pas l'oublier.

**Tension identifiée avec RG-04** : RG-04 ("pas de suppression destructive", `is_abandoned`/`is_completed`, aucune policy `DELETE` sur `tasks`/`profiles`/`day_results`) protège l'intégrité de l'historique de jeu. Le droit à l'effacement RGPD (art. 17) est un droit distinct de l'utilisateur sur ses **données personnelles**, qui ne peut pas être refusé au motif que RG-04 interdit les suppressions en base. **Décision de cette spec (dette assumée MVP)** : pas de flow de suppression en self-service pour l'instant — toute demande est traitée **manuellement** par l'éditeur suite à un email envoyé à l'adresse de contact publiée dans la politique de confidentialité. La page l'indique explicitement, ce n'est pas un silence sur le sujet. Une automatisation (probablement une anonymisation plutôt qu'un vrai `DELETE`, pour rester dans l'esprit RG-04 sur les lignes `tasks`/`day_results` tout en supprimant réellement ce qui est personnel) reste une amélioration future, hors scope ici.

**Statut de l'éditeur** : particulier non-déclaré (pas d'auto-entreprise/société). Sous LCEN, un éditeur non-professionnel peut ne pas publier son adresse postale complète, à condition que son identité complète ait été communiquée à l'hébergeur (Vercel) — c'est le cas via le compte Vercel du projet. Les mentions légales publient donc : nom/pseudonyme + email de contact, mention explicite que l'identité complète est communicable aux autorités judiciaires compétentes via l'hébergeur, + identité de l'hébergeur (Vercel Inc., adresse standard publiée par Vercel).

## Pages (contenu statique en repo, pas via Notion/Le Guide)

Ces 3 pages portent un texte à portée légale — versionné en dur dans le repo (git = source de vérité, historique de modification traçable), **pas** via le pipeline Notion/Le Guide (`content/guide/`) qui est pensé pour du contenu produit édité par un non-technique, pas pour du texte juridique engageant.

### 1. `app/mentions-legales/page.tsx`
- Identité éditeur (nom/pseudonyme, email de contact, statut particulier non-déclaré, mention "identité complète communicable aux autorités compétentes sur demande, via l'hébergeur").
- Identité hébergeur : Vercel Inc. (adresse à reprendre depuis la page légale publique de Vercel au moment de la rédaction — ne pas inventer une adresse, aller la chercher).
- Mention du sous-traitant base de données/auth (Supabase) — utile ici même si détaillé surtout dans la politique de confidentialité.

### 2. `app/confidentialite/page.tsx`
- **Données collectées** (liste exhaustive à date) : email, pseudo, timezone, `aggressivity_level`, `push_subscriptions` (endpoint + clés de chiffrement navigateur), `webhook_token_hash` (jamais le token en clair), historique de tâches/combat (`tasks`, `day_results`), et pour les utilisateurs connectant Gemini (US-22) : `oauth_clients`/`oauth_tokens`.
- **Base légale** : exécution du contrat de service (fournir l'application demandée par l'utilisateur) — pas de consentement marketing à gérer, pas de finalité publicitaire.
- **Sous-traitants** : Supabase (hébergement base de données + authentification — préciser la région d'hébergement du projet Supabase, **à vérifier** avant publication, pas supposée dans cette spec), Vercel (hébergement applicatif), Inngest (orchestration des rappels push/cron), service de push du navigateur de l'utilisateur (Google/Mozilla/Apple selon le navigateur — reçoit l'URL d'endpoint de la souscription push, pas le contenu des tâches).
- **Durée de conservation** : tant que le compte existe (pas de purge automatique — cohérent avec RG-04 côté données de jeu ; côté données personnelles, la suppression reste possible sur demande manuelle, cf. section suivante).
- **Droits de l'utilisateur** : accès, rectification, effacement — **effacement traité manuellement par email** (cf. tension RG-04 ci-dessus), la page donne l'adresse de contact et un délai de traitement raisonnable indicatif (ex. "sous 30 jours").
- **Sous-section Cookies** : un seul cookie, celui de la session Supabase, strictement nécessaire au fonctionnement du service (connexion), pas de traçage, pas de cookie tiers, **pas de bandeau de consentement nécessaire** à ce jour — phrase explicite indiquant que ce point sera revu si un outil d'analytics est ajouté.

### 3. `app/cgu/page.tsx`
Courte, quelques paragraphes :
- L'or virtuel (Marché Noir, `lib/game-engine.ts`, `goldBalance`) n'a **aucune valeur réelle, n'est ni remboursable ni convertible** en argent réel.
- Usage personnel du compte — pas de partage/revente de compte.
- Limite de responsabilité basique (l'éditeur ne garantit pas une disponibilité continue du service, projet personnel).
- Droit applicable : droit français.

## Emplacement / découvrabilité

Pas de header/footer dans l'app (uniquement `BottomNav`, cf. audit UX). Deux points d'entrée :
1. Entrée `SECTIONS` dans `app/vestiaire/page.tsx` : `{ href: "/informations-legales", icon: "⚖️", label: "Informations légales" }`, menant à `app/informations-legales/page.tsx` — un mini-sommaire avec 3 liens (`/mentions-legales`, `/confidentialite`, `/cgu`), même patron de sous-hub que `/vestiaire/entrainement`.
2. Sous le formulaire d'inscription (`/welcome`, `WelcomeSignup`) : texte "En créant ton compte, tu acceptes les [CGU](/cgu) et la [politique de confidentialité](/confidentialite)." — l'info doit être accessible **avant** la création de compte, pas seulement après (exigence LCEN/RGPD de transparence préalable), pas une case à cocher bloquante (pas de consentement explicite requis ici puisque la base légale est contractuelle, pas le consentement — juste une obligation d'information).

Ces 4 routes (`/mentions-legales`, `/confidentialite`, `/cgu`, `/informations-legales`) sont **publiques** : à ajouter à `isPublicRoute` (`lib/supabase/middleware.ts`) pour rester consultables sans session (ex. avant inscription, ou par un visiteur non connecté) — même raisonnement que `/login`/`/welcome`, sinon `proxy.ts` redirige un visiteur anonyme vers `/welcome` avant qu'il puisse lire les mentions légales.

## États UI

Pages 100% statiques (texte en dur, aucune requête réseau) — pas de Loading/Error/Empty à gérer, la règle projet n°3 ne s'applique qu'aux écrans qui chargent des données dynamiques. `app/informations-legales/page.tsx` (sommaire) est également statique.

## Hors scope confirmé

- Pas de bandeau de consentement cookies (rien à consentir aujourd'hui — cf. constat ci-dessus).
- Pas de flow de suppression de compte en self-service (dette assumée, traitement manuel).
- Pas d'article Le Guide pour ces pages (contenu légal, pas une feature de gameplay).
- Pas de CGV (conditions générales de **vente**) — aucun paiement réel dans l'app à ce jour ; à ajouter si une monétisation réelle est introduite plus tard.

## Découpage pour délégation (tickets indépendants)

1. `app/mentions-legales/page.tsx` — nécessite d'avoir vérifié l'adresse Vercel à jour avant rédaction finale.
2. `app/confidentialite/page.tsx` — nécessite d'avoir vérifié la région d'hébergement Supabase avant rédaction finale.
3. `app/cgu/page.tsx` — aucune dépendance externe, peut démarrer immédiatement.
4. `app/informations-legales/page.tsx` (sommaire) + entrée `SECTIONS` (`app/vestiaire/page.tsx`) + lien sous `/welcome` — dépend de 1-3 pour les routes cibles, mais peut être scaffoldé en parallèle avec des liens vers des pages pas encore écrites.
5. `isPublicRoute` (`lib/supabase/middleware.ts`) — ajouter les 4 routes, + test dans `lib/supabase/middleware.test.ts`.

## Documentation

- `CHANGELOG.md` : ligne sous `[Unreleased]` dans le commit de livraison.
- `CLAUDE.md` : pas d'entrée "Piège" attendue a priori (pas de comportement non-évident technique) — sauf découverte en implémentation (ex. si `double_confirm_changes`/région Supabase révèle autre chose d'inattendu).
