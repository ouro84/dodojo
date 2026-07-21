# Spec — US-28 : Guide utilisateur (« Manuel du Dojo »), contenu sync Notion → build

> Date : 2026-07-21 · Statut : validé (brainstorming) · Hors sprint (dette d'adoption, cf. AUDIT-2026-07-21)
> Objectif : un écran de règles in-app clair, dont le contenu est **éditable dans Notion** puis figé au build (flexibilité Notion, zéro fragilité runtime).

## 1. Contexte & problème

Aucune référence des règles in-app : barème HP, budget de jokers, issues du jour, combos… restent implicites. On veut une doc utilisateur maintenable sans redéploiement lourd, mais sans dépendre de Notion en production.

## 2. Décisions de cadrage (tranchées)

| # | Décision |
|---|----------|
| D1 | **Contenu statique versionné** `content/guide.json`, servi par l'app. Un contenu initial est **rédigé et committé** (le guide marche sans Notion). |
| D2 | **Sync Notion → build** : script `scripts/sync-guide.mjs` tire les pages Notion et **écrase** `content/guide.json`. Lancé à la demande (`npm run sync:guide`), **pas** dans le build prod (pas de token requis en CI). |
| D3 | `@notionhq/client` en **devDependency** : utilisé uniquement par le script, **jamais** chargé au runtime → aucune dépendance/latence/panne Notion en prod. |
| D4 | **Rendu** depuis le JSON statique : écran `/guide` (« Manuel du Dojo »). Liens depuis le **QG**, la **fin d'onboarding** (US-29) et un `?` discret dans l'Arène. |

### Hors scope
- Édition live en prod / webhooks Notion.
- Recherche plein-texte, multilingue, versionnage du guide.

## 3. Forme du contenu

`content/guide.json` :
```json
{
  "updatedAt": "2026-07-21",
  "sections": [
    { "id": "hp", "title": "Le barème de combat",
      "blocks": [
        { "type": "p", "text": "Chaque tâche vaut 20 HP…" },
        { "type": "ul", "items": ["Tâche : 20 HP", "Sous-tâche : 10 HP"] }
      ] }
  ]
}
```
Types de blocs : `h` (sous-titre), `p` (paragraphe), `ul` (liste). Volontairement minimal → rendu direct en React, **aucune lib markdown** (évite une dépendance runtime et des soucis de sécurité HTML).

## 4. Sync Notion → build

`scripts/sync-guide.mjs` (Node ESM) :
1. Env requis : `NOTION_TOKEN` (intégration), `NOTION_GUIDE_PAGE_ID` (page racine partagée à l'intégration).
2. Récupère les blocs enfants de la page via `@notionhq/client`.
3. Mappe les blocs Notion → schéma interne : `heading_2/3` → `h` (nouvelle section si `heading_1`/`heading_2`), `paragraph` → `p`, `bulleted_list_item` → `ul` (regroupés), en ignorant les types non gérés (avec un warn).
4. Écrit `content/guide.json` (+ `updatedAt`).
- Robustesse : si env absent → message clair et sortie sans écraser (le contenu committé reste). Ignore les blocs vides.
- `package.json` : script `"sync:guide": "node scripts/sync-guide.mjs"`.

## 5. Rendu

### `app/guide/page.tsx` (serveur)
- Importe `content/guide.json` (import statique) et rend les sections (titre + blocs). Lecture seule.
- Bouton retour QG. Affiche `updatedAt` discret.
- États : contenu toujours présent (seed committé) → pas d'état vide/chargement/erreur réel ; garde défensive si le JSON est vide (« Manuel en préparation »).

### Points d'accès
- QG : lien « 📖 Manuel du Dojo ».
- Fin d'onboarding (US-29) : lien optionnel « Consulter les règles ».
- Arène : icône `?` discrète (coin) → `/guide`.

## 6. Contenu initial (sections rédigées)

Barème HP (20/10) & heal du Boss · XP & niveaux · Rituel du Réveil (restes : Terminé/Reporter/Annihiler) · Rituel du Crépuscule (issues victory/retreat/defeat) · Streaks & budget de 2 jokers/semaine · Rage Quit (−5 XP, undo) · Combos · Or & Échoppe (débloquer des combattants) · Panthéon · Roster de boss quotidien. Ton dojo + rue (tone-of-voice).

## 7. Découpage technique
- `content/guide.json` (seed committé).
- `scripts/sync-guide.mjs` + script npm `sync:guide` + `@notionhq/client` en devDependency.
- `app/guide/page.tsx` + petit composant de rendu de blocs (`components/guide/GuideSections.tsx`).
- Liens QG / Arène / onboarding.
- Docs : CHANGELOG, CLAUDE.md (guide statique + procédure sync Notion), `.env.example` (`NOTION_TOKEN`, `NOTION_GUIDE_PAGE_ID`).

## 8. Tests
### Vitest (pur)
- Mapper de blocs Notion → schéma interne (fonction pure extraite du script, ex. `lib/guide.ts` `mapNotionBlocks`) : heading → section, paragraphe, liste groupée, type inconnu ignoré, page vide → sections vides.
- Validation de forme de `guide.json` (chaque bloc a un `type` géré).

### Playwright e2e (série, prod)
- `guide.spec.ts` : depuis le QG → `/guide` affiche des sections ; retour QG OK.

## 9. Vérification
1. Vitest vert (mapper + forme).
2. `build` + `lint` propres (script non lancé au build).
3. e2e série vert.
4. Manuel : `/guide` rend le contenu seed ; `npm run sync:guide` avec un token de test écrase bien `guide.json` ; l'app ne référence jamais Notion au runtime (grep : aucun import `@notionhq/client` hors `scripts/`).
