# Contexte projet — Boss de la Journée (Projet Arcade To-Do)

> Dernière mise à jour : 2026-07-08
> Stack : Next.js 16 (App Router) + Supabase + Tailwind CSS v4 + Vercel (Hobby)

---

## Règle de mise à jour de ce fichier

Ce fichier est un critère de merge. Toute PR ou modification qui introduit un nouveau piège, modifie une convention, ou solde une dette documentée ici doit obligatoirement mettre ce fichier à jour dans le même commit.

Cas déclencheurs :
- Nouveau comportement non-évident découvert avec l'API Web Speech ou l'UI de combat.
- Modification de la structure de la table `tasks` ou `profiles` dans Supabase.
- Changement dans le comportement des calculs de HP ou d'XP.

---

## Ce projet en une phrase

Une application de productivité mobile-first de style RPG/Arcade 16-bits où chaque tâche créée soigne le Boss de la journée (+20 HP) et chaque tâche complétée lui inflige des dégâts, offrant une gratification immédiate pour vaincre la procrastination.

---

## Documents de référence — à lire avant tout code

| Fichier | Rôle |
|---------|------|
| `SPECS_FONCTIONNELLES.md` | Registre des 21 User Stories (Sprint 0 à 3), règles métier (RG-01 à RG-04) et modèle de données. |
| `ADR.md` | Choix technologiques validés (Next.js, Supabase, Tailwind v4, Vitest/Playwright). |
| `PRODUCT.md` | Contexte produit (impeccable) : users, purpose, brand personality, anti-références, principes de design, a11y. |
| `DESIGN.md` | Système de design (impeccable, actuellement en seed) : palette, typographie, motion, do's/don'ts visuels. |

**Ne jamais improviser un choix ou une modification de règles que ces documents ont déjà tranché.**

---

## Stack technique

| Rôle | Techno | Version |
|------|--------|---------|
| Framework full-stack | Next.js (App Router) | 16.x |
| Base de données + Auth | Supabase (PostgreSQL) | — |
| Hébergement | Vercel (Hobby Tier) | — |
| CSS & Animations | Tailwind CSS v4 | — |
| Typage | TypeScript strict | — |
| Tests unitaires | Vitest | Phase MVP |
| Tests e2e | Playwright | Phase MVP (Compte fixe) |

---

## Structure de dossiers cible
boss-de-la-journee/
├── app/                        # Écrans de l'application (App Router)
│   ├── layout.tsx              # Configuration globale (font pixel, thèmes)
│   ├── page.tsx                # L'Arène (Écran principal du combat / To-Do)
│   ├── qg/page.tsx             # Le QG du Héros (Profil, Titres, Stats)
│   └── echoppe/page.tsx        # Le Shop (Sprint 2 - Skins de Boss)
├── components/
│   ├── ui/                     # Composants UI de base (Boutons pixel-art, jauges)
│   └── combat/                 # Composants interactifs de l'Arène (Animations flash, Boss)
├── lib/                        # Logique métier PURE (Sans UI, 100% testable de manière isolée)
│   ├── game-engine.ts          # Calculs des HP, XP, niveaux et dégâts (RG-01/02)
│   └── supabase/               # Clients d'API (Client.ts / Server.ts)
├── types/
│   └── index.ts                # Types TypeScript partagés (Task, Profile, Boss)
├── public/                     # Sprites pixel-art, effets sonores et polices
├── .env.local                  # Secrets (Exclus de Git)
├── .env.example                # Template des variables d'environnement
└── CLAUDE.md
---

## Outils disponibles

| Outil | Usage |
|-------|-------|
| `gh` (GitHub CLI) | Gestion des issues du backlog, création et validation de Pull Requests. |
| `supabase CLI` | Gestion des migrations locales PostgreSQL. |

---

## Conventions — non négociables

### Commits (Conventional Commits)
Format strict : `type: description courte`
- `feat:` Nouvelle fonctionnalité (ex: `feat: add screen shake animation on damage`)
- `fix:` Correction de bug (ex: `fix: prevent negative gold balance`)
- `chore:` Tâches de maintenance (ex: `chore: setup vitest config`)
- `docs:` Documentation technique uniquement.

### Workflow Git
- `main` est protégée. Aucun commit direct. Déploiement automatique sur Vercel.
- Une branche par fonctionnalité : `feat/us-XX-nom-feature`.
- **Zéro merge si la CI est rouge.** Tous les tests Vitest et l'application doivent build sans erreur.

---

## Règles de code

1. **TypeScript Strict :** Interdiction d'utiliser `any`. Tout type doit être explicitement déclaré (notamment les états de tâches et profils).
2. **Logique isolée dans `lib/` :** Tout algorithme de calcul de jeu (formule d'XP, calcul dynamique des HP maximum du Boss) doit résider dans `lib/game-engine.ts` pour être testé sans dépendances de rendu UI.
3. **Gestion des 3 états UI :** Tout écran (Arène, QG) doit obligatoirement implémenter un état de chargement (Loading), un état d'erreur (Error), et un état vide (Empty - ex: quand le Boss est K.O.).
4. **Pas de suppression destructive :** Les tâches ne doivent jamais être supprimées via un `DELETE` SQL. Utiliser exclusivement la colonne `is_abandoned` ou `is_completed` pour maintenir l'historique et la jauge du Boss (RG-04).

---

## Pièges et décisions non-évidentes

**Décalage horaire et Étanchéité du jour** — Le Boss est calculé uniquement sur les tâches du jour J. Lors du changement de fuseau horaire ou à minuit pile, les calculs ne doivent pas planter. Toute tâche historique non validée doit passer par le processus bloquant du "Rituel du Réveil" avant toute nouvelle action.

**Pas de policy DELETE en RLS** — Les tables `profiles` et `tasks` n'ont volontairement aucune policy Supabase RLS pour `DELETE`. Ceci applique RG-04 au niveau base de données, en plus de la convention côté application (colonnes `is_abandoned` / `is_completed`).

**Pas de trigger d'auto-création de profil** — Aucun trigger sur `auth.users` ne crée automatiquement une ligne `profiles` à l'inscription. Le pseudo doit être défini explicitement par l'utilisateur (voir tone of voice : pas de fallback générique type "Héros"), donc la création de la ligne `profiles` fait partie du flow d'onboarding applicatif (US-14), pas de la migration SQL.

---

## URL de production

*En attente du premier déploiement Vercel.*

---

@AGENTS.md