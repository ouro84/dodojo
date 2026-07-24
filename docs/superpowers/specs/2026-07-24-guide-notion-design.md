# Spec — Refonte doc utilisateur : Notion multi-articles (issue #68)

> Date : 2026-07-24 · Statut : validé (brainstorming)
> Objectif : remplacer le Manuel du Dojo mono-bloc (`content/guide.json`, une seule page Notion) par une doc articulée autour de plusieurs articles Notion, groupés par catégorie, avec sync automatique au build. Inspiré du modèle « B » déjà en prod sur `webapp-repas` (issue #97 de ce repo).

## 1. Contexte & problème

Le Manuel du Dojo actuel (`app/guide/page.tsx`, US-28) rend une seule longue page à partir d'un unique `content/guide.json`, lui-même généré depuis une **page** Notion (pas une base) via `scripts/sync-guide.mjs` — sync **manuelle** (`npm run sync:guide`), jamais lancée au build. Problèmes remontés (issue #68) :
- Contenu illisible en une seule page (19 sections à la suite), aucune navigation par sujet.
- Schéma de blocs interne minimal (`h`/`p`/`ul`) : pas de tables, images, code, callouts.
- Sync manuelle : éditer sur Notion ne se répercute pas tant qu'un dev ne relance pas le script et ne committe pas.
- Le QG (hors scope ici, cf. §8) accumule les liens vers cette doc plate sans hiérarchie.

`webapp-repas` a déjà résolu ce problème (issue #97, « modèle B ») : base Notion + articles Markdown individuels + sync automatique tolérante au build + sommaire par section + pages statiques par article. Ce spec adapte ce modèle à Dodojo.

## 2. Décisions de cadrage (tranchées)

| # | Décision |
|---|----------|
| D1 | **Périmètre** : uniquement la refonte doc/Notion. La réorganisation du QG (« fourre-tout ») est **hors scope**, traitée dans une US séparée. Seuls 2 liens deep-link du QG/StreakBadge sont mis à jour ici (cf. §6). |
| D2 | **Notion : base de données**, pas une page. Colonnes : `Titre` (title), `Slug` (rich_text), `Section` (select), `Ordre` (number), `Résumé` (rich_text), `Mots-clés` (multi_select), `Statut` (select : Brouillon/Publié). Seules les pages `Statut = Publié` sont tirées. |
| D3 | **Sync via fetch brut**, pas de `@notionhq/client`. `webapp-repas` n'a aucune dépendance SDK Notion : tout passe par `fetch` + Bearer token vers l'API REST Notion directement. Simplifie et supprime le piège d'import dynamique tolérant de l'actuel `sync-guide.mjs`. |
| D4 | **Sync automatique au build** (`prebuild`, comme OMQ) : `NOTION_TOKEN` dans les env Vercel (Production + Preview). Mode tolérant : token absent ou panne réseau ⇒ garde le contenu committé, ne casse jamais le build. Un mode manuel (`npm run pull:guide`) reste disponible, lui strict (échoue fort). |
| D5 | **`NOTION_DATABASE_ID` a un défaut hardcodé** dans le script (comme OMQ) : `577dc545-1f8a-4c42-9821-d16e3568a6ec` (la base « Guide Dodojo », déjà créée — cf. §3). Override possible via env, jamais requis. Seul `NOTION_TOKEN` est une variable d'env obligatoire à fournir. |
| D6 | **Contenu = Markdown pur** par article (pas le schéma `h`/`p`/`ul` actuel). Rendu via `react-markdown` + `remark-gfm`, sans `rehype-raw` (le script ne produit jamais de HTML brut). |
| D7 | **Route conservée `/guide`** (« Manuel du Dojo »), pas de renommage en `/aide`. Structure : `/guide` (sommaire par catégorie) + `/guide/[slug]` (article, SSG via `generateStaticParams`). Reste **protégée** (auth requise) — contrairement à `/aide` chez OMQ qui est publique. |
| D8 | **Migration du contenu** : faite directement par Claude via le MCP Notion connecté (pas par copier-coller manuel de l'utilisateur). Cf. §3 pour l'état actuel (déjà fait). |

### Hors scope
- Réorganisation du QG (nouvelle hiérarchie, regroupement de sections) → issue séparée.
- Recherche plein-texte, multilingue, versionnage de la doc.
- Édition live en prod / webhooks Notion.
- Accès public à `/guide` (reste protégé, cohérent avec l'existant).

## 3. Notion : état réel (déjà réalisé)

Base **Guide Dodojo** créée dans la page existante « Guide utilisation - Dodojo » (page top-level du workspace, jusque-là vide) :
- URL : https://app.notion.com/p/577dc5451f8a4c429821d16e3568a6ec
- Database ID (pour l'API v1, `NOTION_VERSION: "2022-06-28"`) : `577dc545-1f8a-4c42-9821-d16e3568a6ec`
- Data source ID (interne Notion, non utilisé par le script REST) : `935ebd38-c617-4a70-b714-d0c6ad65078f`

**Schéma** : `Titre` (title) · `Slug` (rich_text) · `Section` (select : Démarrage/Combat/Rituels/Progression/Réglages/Intégrations) · `Ordre` (number) · `Résumé` (rich_text) · `Mots-clés` (multi_select : combat/rituel/progression/installation/integration/reglage/partage) · `Statut` (select : Brouillon/Publié).

**19 articles créés et publiés** (`Statut = Publié`), contenu repris tel quel de `content/guide.json` (aucune réécriture de ton) :

| Section | Ordre | Slug | Titre |
|---|---|---|---|
| Démarrage | 10 | `principe` | Le principe |
| Démarrage | 20 | `installation` | Installer Dodojo |
| Combat | 10 | `hp` | Le barème de combat |
| Combat | 20 | `xp` | Force & niveaux |
| Combat | 30 | `deadlines` | Les Deadlines & Attaques Surprises |
| Combat | 40 | `rage` | Le Rage Quit |
| Combat | 50 | `combo` | Les combos |
| Rituels | 10 | `reveil` | Le Rituel du Réveil |
| Rituels | 20 | `crepuscule` | Le Rituel du Crépuscule |
| Progression | 10 | `streak` | Séries & jokers |
| Progression | 20 | `or` | Or & Échoppe |
| Progression | 30 | `tenues` | Tenues |
| Progression | 40 | `pantheon` | Le Panthéon |
| Progression | 50 | `roster` | Le Boss du jour |
| Progression | 60 | `partage` | Partager sa victoire |
| Réglages | 10 | `agressivite` | Régler le ton du Dojo |
| Intégrations | 10 | `rappels` | Le rappel du soir |
| Intégrations | 20 | `siri` | Ajouter une tâche à la voix (Siri) |
| Intégrations | 30 | `gemini` | Ajouter une tâche à la voix (Gemini / Android) |

**Reste à faire côté utilisateur (hors Claude, action UI Notion uniquement)** :
1. Créer une intégration interne Notion (`notion.so/my-integrations`), capacité lecture seule, copier le secret → `NOTION_TOKEN`.
2. Partager la base « Guide Dodojo » avec cette intégration (`•••` → Connexions).
3. Renseigner `NOTION_TOKEN` en local (`.env.local`) et sur Vercel (Production + Preview).

## 4. Sync Notion → build

`scripts/pull-guide.mjs` (remplace `scripts/sync-guide.mjs`) :
1. `fetch` brut vers `https://api.notion.com/v1/databases/${DATABASE_ID}/query`, filtre `Statut = Publié`, pagination (`has_more`/`next_cursor`).
2. Pour chaque page : lit les propriétés (`Titre`, `Slug`, `Section`, `Ordre`, `Résumé`, `Mots-clés`, dernière édition), résout récursivement les blocs enfants (`/blocks/{id}/children`).
3. Convertit les blocs Notion → Markdown : `heading_2/3` → `##`/`###`, `paragraph` → texte, `bulleted_list_item`/`numbered_list_item` → liste (récursif pour les enfants), `quote`/`callout` → blockquote, `code` → bloc code, `divider` → `---`, `table` → table Markdown, `image` → rapatriée en local puis `![alt](chemin)`.
4. Images téléchargées en mémoire, écrites dans `public/guide/<slug>/img-N.<ext>` **après** succès complet du fetch (écriture différée — jamais de contenu partiel sur erreur).
5. Écrit `content/guide/<slug>.md` (un fichier par article, Markdown pur) + `content/guide/index.json` (métadonnées triées par Section canonique puis Ordre).
6. Deux modes : `npm run pull:guide` (manuel, strict — plante sur erreur) et `--prebuild` (hook `prebuild` de `package.json`, tolérant — token absent/erreur réseau ⇒ log + conserve le contenu committé + sort en succès).
7. Ordre canonique des sections **figé dans le code** (miroir script ↔ `lib/guide.ts`) : `["Démarrage", "Combat", "Rituels", "Progression", "Réglages", "Intégrations"]`. Une catégorie ou un slug inconnu dans Notion ⇒ erreur explicite (comme OMQ), pas d'ignorance silencieuse.

## 5. Rendu in-app

### `lib/guide.ts` (réécrit)
- `chargerIndexGuide()` : lit `content/guide/index.json`.
- `chargerCorpsArticle(slug)` : lit `content/guide/<slug>.md`, `null` si absent.
- `grouperParCategorie(articles)` : regroupe selon `ORDRE_SECTIONS`, filtre les catégories vides.
- L'ancien mapper `mapNotionBlocks` (blocs Notion → schéma `h`/`p`/`ul`) et son test Vitest disparaissent.

### `app/guide/page.tsx` (sommaire, réécrit)
- Server Component, lit l'index, affiche une liste de liens groupés par catégorie (titre + résumé), état vide si aucun article publié (« Manuel en préparation »).

### `app/guide/[slug]/page.tsx` (nouveau)
- `generateStaticParams` sur l'index (SSG, une page par slug publié).
- `notFound()` si le slug n'existe pas.
- Affiche titre, catégorie, date de mise à jour, corps rendu via `ArticleMarkdown`.

### `components/guide/ArticleMarkdown.tsx` (nouveau, remplace `GuideSections.tsx`)
- `react-markdown` + `remark-gfm`, composants stylés aux tokens Dodojo (h2/h3/p/ul/ol/blockquote/code/pre/table/img/a). Liens internes (`/guide/...`) via `next/link`, externes en `<a target="_blank">`.

### Points d'accès (mis à jour, slugs identiques aux ids actuels)
- QG : lien « 📖 Manuel du Dojo » → `/guide` (inchangé).
- QG, lien « Comment gagner de l'or ? » : `/guide#or` → **`/guide/or`**.
- `StreakBadge.tsx` : `/guide#streak` → **`/guide/streak`**.
- `Arena.tsx`, icône `?` : reste `/guide` (sommaire), inchangé.

## 6. Nouvelles dépendances

- `react-markdown`, `remark-gfm` → **dependencies** (runtime du build SSG, pas devDependencies).
- Aucune dépendance Notion (ni `@notionhq/client` ni équivalent) : le script utilise `fetch` natif Node.

## 7. Erreurs / états UI (règle projet n°3)

- Sommaire sans aucun article publié : état vide (« Manuel en préparation »), déjà couvert par le pattern existant.
- Article dont le slug ne correspond à aucun fichier `.md` : `notFound()` → 404 Next standard.
- Pas d'état de chargement ni d'erreur réseau runtime : tout est résolu au build (SSG), comme l'existant.
- Script `pull-guide.mjs` : catégorie/slug inconnu ⇒ erreur bloquante (mode manuel) ; en mode `--prebuild`, toute erreur (y compris ce cas) ⇒ conserve le contenu committé.

## 8. Hors scope — QG

Rappel explicite (D1) : ce spec ne touche **pas** à la structure du QG (`app/qg/page.tsx`), à l'exception des 2 liens deep-link (§5). La réorganisation du QG (« fourre-tout ») nécessite son propre spec, à ouvrir séparément.

## 9. Découpage technique

- Suppression : `scripts/sync-guide.mjs`, `content/guide.json`, `lib/guide.ts` (mapper actuel + test), `components/guide/GuideSections.tsx`, `e2e/guide.spec.ts` (ancienne version).
- Ajout : `scripts/pull-guide.mjs`, `content/guide/*.md` + `content/guide/index.json` (seed = résultat du premier pull réussi), `lib/guide.ts` (réécrit), `app/guide/page.tsx` (réécrit), `app/guide/[slug]/page.tsx`, `components/guide/ArticleMarkdown.tsx`.
- `package.json` : script `pull:guide`, hook `prebuild` ; ajout `react-markdown`/`remark-gfm` en dependencies.
- `.env.example` : `NOTION_TOKEN` (remplace `NOTION_GUIDE_PAGE_ID`), `NOTION_DATABASE_ID` documenté comme override optionnel (défaut hardcodé dans le script).
- Mise à jour : `StreakBadge.tsx`, `app/qg/page.tsx` (2 liens deep-link).
- Docs à mettre à jour dans la même PR : `CHANGELOG.md`, `CLAUDE.md` (entrée « Manuel du Dojo » à réécrire pour refléter le modèle base Notion + prebuild auto), commentaire de suivi sur l'issue #68.

## 10. Tests

### Vitest (pur)
- `lib/guide.ts` : `grouperParCategorie` (tri par catégorie canonique puis ordre, catégories vides filtrées).
- Conversion blocs Notion → Markdown : si extractible en fonction pure testable hors réseau (miroir de l'actuel `mapNotionBlocks`), sinon testé uniquement via le mode manuel en vérification humaine (le script fait un vrai appel réseau, difficile à unit-tester proprement — à trancher en plan d'implémentation selon la forme finale du code).

### Playwright e2e (série, prod)
- `guide.spec.ts` réécrit : depuis le QG → `/guide` affiche le sommaire par catégorie ; clic sur un article → contenu affiché ; slug inconnu → 404 ; retour QG OK.

## 11. Vérification

1. Vitest vert.
2. `build` + `lint` propres. Le `prebuild` doit réussir même sans `NOTION_TOKEN` en local (mode tolérant) — vérifier explicitement ce cas.
3. e2e série vert.
4. Manuel, une fois `NOTION_TOKEN` fourni par l'utilisateur : `npm run pull:guide` régénère bien `content/guide/*.md` + `index.json` depuis la base réelle ; comparer avec le contenu attendu (19 articles, 6 catégories).
5. Grep : aucun import Notion (SDK ou `NOTION_TOKEN`) hors `scripts/pull-guide.mjs`.
