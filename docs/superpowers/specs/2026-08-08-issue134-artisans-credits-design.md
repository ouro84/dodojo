# Spec — Les Artisans, crédits des créateurs d'assets (issue #134, sous-sujet 1/2)

> Statut : validé en brainstorming, prêt pour plan d'implémentation.
> Issue #134 mélange 3 sujets indépendants (crédits, mentions légales/RGPD, cookies). Cette spec couvre **uniquement** le crédit des créateurs. Le second sous-sujet est traité par `2026-08-08-issue134-pages-legales-design.md`. Proposer de scinder #134 en deux sous-issues au moment du PR (même patron que #136→#139-146).

## Contexte

Le jeu s'appuie sur ~15 800 fichiers de packs tiers (`ASSETS.md`) : CraftPix, Ansimuz (CC0), unTied Games (Gigapack VFX, **attribution obligatoire**), YukiPixels (police BoldPixels, **CC BY-SA 4.0, attribution requise**), Raven Fantasy Icons, série Elementals (héros), etc. Aucun écran ne crédite ces créateurs aujourd'hui. Le brief produit : pas un "bête écran de crédits" — cohérent avec l'univers arcade/16-bit et le lore "Le Démon Intérieur" (`PRODUCT.md`).

**Contrainte non négociable** : l'attribution obligatoire (Gigapack, BoldPixels) doit rester **accessible sans condition**. Une piste écartée en brainstorming — masquer chaque crédit jusqu'à ce que l'asset correspondant soit "rencontré" en jeu façon bestiaire — violerait cet impératif : gater une mention légale derrière une progression de jeu n'est pas défendable. Toute mécanique de "découverte" reste donc **cosmétique** (un badge en plus), jamais un verrou d'accès à l'information.

## Architecture

Nouvelle route `app/vestiaire/artisans/page.tsx` (Server Component), même patron que `app/vestiaire/entrainement/page.tsx` :
- Garde : `!user` → `redirect("/login")` ; `!profile` → `redirect("/onboarding")`.
- `BottomNav active="vestiaire"` (pas d'onglet dédié — convention de l'audit UX 2026-07-24, cf. `CLAUDE.md`).
- `BackLink` vers `/vestiaire`.
- Entrée ajoutée à `SECTIONS` dans `app/vestiaire/page.tsx` : `{ href: "/vestiaire/artisans", icon: "🎨", label: "Les Artisans" }`.

### Contexte "rencontré en jeu"

Réutilise les mêmes données que le catalogue de succès (`lib/achievements.ts`, `assembleAchievementContext`) : `seenBossIds: string[]`, `seenBackgroundIds: string[]`, `unlockedHeroIds: string[]`. Si `assembleAchievementContext` est trop coûteux à appeler juste pour cet écran (il assemble un contexte complet côté `resolveDailyBoss`), extraire une fonction plus légère qui ne calcule que ces 3 listes — **à trancher en implémentation**, pas un point de design. Aucune nouvelle table, aucune nouvelle requête structurante.

## Modèle de données

`lib/credits.ts` (pur, testable — même famille que `lib/heroes.ts`/`lib/bosses.ts`) :

```ts
export type ArtisanCategory = "heros" | "boss" | "decors" | "effets" | "icones" | "police";

export interface ArtisanEntry {
  id: string;                // slug unique, ex. "elementals-series"
  creator: string;           // nom affiché, ex. "Will Tice / unTied Games"
  packName: string;          // nom du pack source
  category: ArtisanCategory;
  lore: string;              // 1 ligne, même patron que Boss.lore / Skin.lore
  license?: string;          // affiché seulement si renseigné, ex. "CC BY-SA 4.0"
  sourceUrl?: string;        // lien vers la page d'origine (itch.io/CraftPix), si disponible
  spriteRef:
    | { kind: "hero"; heroSlug: string }
    | { kind: "boss"; bossSlug: string }
    | { kind: "background"; backgroundId: string }
    | { kind: "static"; imagePath: string }; // icônes/police : pas d'entité jouable à référencer
}

export const ARTISANS: ArtisanEntry[] = [ /* … */ ];
```

`spriteRef` sert à deux choses : résoudre l'image représentative dans le carrousel, et calculer le badge "Rencontré en combat" (`kind: "hero"` → `unlockedHeroIds.includes(heroSlug)`, `"boss"` → `seenBossIds`, `"background"` → `seenBackgroundIds`, `"static"` → jamais de badge, l'entrée est de toute façon toujours visible en UI donc "rencontrée" par construction).

**Portée du catalogue** : un entry par pack/créateur, pas par sprite individuel. Rempli en implémentation à partir de ce qui est **réellement livré dans `public/`** (pas tout `assets/` — cf. règle `ASSETS.md` "ne jamais faire pointer le code vers `assets/`"). La vérification des auteurs/licences réels pour les packs marqués "aucune licence documentée localement" (`MC/`, 5 packs "vrais boss", `VFX/Hit Effect 01`, `Autres/Lively NPC blacksmith`, `Icons/Raven Fantasy Icons`) est une tâche de recherche à part, distincte de cette UI — un placeholder générique ("Pack CraftPix", "Auteur non identifié — pack vérifié auprès de la source avant prod monétisée") est acceptable tant que l'auteur individuel reste introuvable. Ne pas bloquer l'implémentation de l'écran sur cette recherche.

## Composant

`components/vestiaire/ArtisansCarousel.tsx` (client), copie du patron `SkinCarousel.tsx` (embla coverflow, `carousel3DTransform` de `lib/carousel-3d.ts`, `flex-[0_0_60%]`) mais **sans** logique d'équipement/achat/CTA — navigation + affichage seulement :

- Tabs de catégorie au-dessus du carrousel (`ArtisanCategory`, 6 valeurs) — cliquer une tab recale `emblaApi.scrollTo(index, true)` sur le premier entry de la catégorie, pas un carrousel séparé par tab (un seul `useEmblaCarousel`, plus simple que 6 instances).
- Sprite représentatif : `kind: "hero"` → réutilise `HeroIdle` (comme `SkinCarousel`) ; `kind: "boss"` → équivalent boss de `HeroIdle` si un composant existe déjà pour un idle statique de boss hors combat (sinon `<Image>` sur `still.png`) ; `kind: "background"` → `<Image>` sur `public/backgrounds/<id>.png` ; `kind: "static"` → `<Image>` sur un chemin fixe (ex. capture de la police, planche d'icônes).
- Badge "Rencontré en combat" (`text-[10px] text-faint`, jamais un style de verrou/lock) si le contexte serveur confirme l'id vu — absent sinon, sans autre traitement (pas de flou/désaturation, ça resterait une forme de verrou visuel sur une info qui doit rester pleinement lisible).
- Sous le sprite : `creator`, `packName`, `license` (si renseigné), `lore`, `sourceUrl` (si renseigné, lien externe `target="_blank" rel="noopener noreferrer"`).
- `aria-live="polite"` sur le nom+lore à chaque changement (même patron que `SkinCarousel`).
- Navigation clavier ArrowLeft/ArrowRight (même patron).

## États UI (règle projet n°3)

- **Loading** : `app/vestiaire/artisans/loading.tsx`, squelette simple — le catalogue est statique donc quasi instantané, seul le fetch du contexte "rencontré" est asynchrone.
- **Error** : si le fetch du contexte "rencontré" échoue, la page s'affiche **quand même**, sans aucun badge — dégradation silencieuse. Une information légale ne doit jamais dépendre de la réussite d'une requête annexe.
- **Empty** : non applicable au global (catalogue jamais vide) ; si un filtre de catégorie retombe sur zéro résultat (ne devrait pas arriver avec les 6 catégories définies), afficher un message neutre plutôt qu'un carrousel cassé — garde de cohérence, pas un vrai cas produit attendu.

## Découpage pour délégation (tickets indépendants)

1. `lib/credits.ts` — types + catalogue (peut démarrer avec un sous-ensemble de packs déjà bien documentés : Gigapack, BoldPixels, Raven Fantasy Icons, Ansimuz CC0 — étendre ensuite).
2. Fonction d'extraction du contexte "rencontré" (légère, dérivée de `assembleAchievementContext` ou nouvelle fonction dédiée dans `lib/achievements.ts`/`app/actions/boss.ts`).
3. `ArtisansCarousel.tsx` (consomme 1 et 2 via props, peut être développé avec des données mock en attendant que 1 soit complet).
4. Assemblage `app/vestiaire/artisans/page.tsx` + `loading.tsx`.
5. Ajout de l'entrée dans `SECTIONS` (`app/vestiaire/page.tsx`) — en dernier, une fois 4 mergé.

## Documentation

- Le Guide (Notion) : nouvel article présentant l'écran aux joueurs curieux — cohérent avec la convention "toute feature visible → article Guide", pas obligatoire légalement (l'écran lui-même suffit comme mention) mais bon pour la découvrabilité.
- `CLAUDE.md` : entrée "Piège" si un comportement non-évident est découvert en implémentant (ex. si le contexte "rencontré" s'avère trop coûteux à dériver et nécessite une vraie nouvelle requête).
- `CHANGELOG.md` : ligne sous `[Unreleased]` dans le commit de livraison.
- `ASSETS.md` : pas de mise à jour requise par cette spec elle-même (aucun nouveau pack ajouté), sauf si le travail de vérification des licences/auteurs (hors scope ici) est fait en même temps.
