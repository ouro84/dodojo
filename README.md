# Dodojo

Une application de productivité mobile-first de style RPG/Arcade 16-bits où chaque tâche créée soigne le Boss de la journée (+20 HP) et chaque tâche complétée lui inflige des dégâts — une gratification immédiate pour vaincre la procrastination.

**Production : [dodojo.vercel.app](https://dodojo.vercel.app)**

## Stack

Next.js 16 (App Router) · Supabase (PostgreSQL/Auth) · Tailwind CSS v4 · Vercel · Vitest · Playwright

## Fonctionnalités

- **L'Arène** — boucle de combat quotidienne : tâches/sous-tâches, dictée vocale, drag & drop, deadlines horaires, combo, animations façon versus (héros vs boss)
- **Progression** — XP & niveaux, streaks, succès, roster de 27 boss, tenues de héros
- **Le Marché Noir** — héros déblocables à l'or gagné en combat
- **Le Vestiaire** — profil, réglage du ton (Volume Intérieur), Mode Entraînement (tâches récurrentes), Le Guide
- **Intégrations** — PWA installable, notifications push, Siri (iOS Shortcuts), Gemini (serveur MCP)

Voir le [CHANGELOG](CHANGELOG.md) pour le détail complet.

## Développement

```bash
npm install
npm run dev
```

Ouvrir [http://localhost:3000](http://localhost:3000).

```bash
npm run test   # Vitest
npm run e2e    # Playwright (build + serveur de prod requis)
npm run lint
```

Variables d'environnement : voir `.env.example`.

## Documentation

| Fichier | Rôle |
|---------|------|
| `CLAUDE.md` | Contexte projet, conventions, pièges connus |
| `SPECS_FONCTIONNELLES.md` | User Stories et règles métier |
| `ADR.md` | Choix technologiques |
| `PRODUCT.md` | Contexte produit (users, ton, principes de design) |
| `DESIGN.md` | Système de design |
| `PARCOURS_UTILISATEURS.md` | Cartographie des écrans et parcours e2e |
| `CONTRIBUTING.md` | Procédure de contribution |
