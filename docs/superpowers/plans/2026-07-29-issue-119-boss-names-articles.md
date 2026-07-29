# Issue #119 — Retirer les articles des noms de boss — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retirer l'article en tête des noms de boss ("le", "la") dans le catalogue statique `lib/bosses.ts`, pour que "le Gardien de Glace" devienne "Gardien de Glace", etc.

**Architecture:** Édition de données pure — 12 chaînes de caractères dans un seul fichier. Aucune logique, aucun schéma, aucune migration. Un test d'intégrité empêche la régression (plus aucun nom ne doit commencer par un article).

**Tech Stack:** TypeScript, Vitest.

## Global Constraints

- Convention Commits : `fix: description courte`.
- Toute PR livrant un changement visible utilisateur ajoute une ligne sous `## [Unreleased]` de `CHANGELOG.md` dans le même commit (cf. `CLAUDE.md`).
- Aucun test ne référence les noms de boss avec article (vérifié) — aucune autre modification de fichier requise.

---

### Task 1 : Retirer l'article des 12 noms de boss

**Files:**
- Modify: `lib/bosses.ts:47-84`
- Test: `lib/bosses.test.ts`
- Modify: `CHANGELOG.md` (section `## [Unreleased]`)

**Interfaces:**
- Consumes: `Boss.name` (déjà défini dans `lib/bosses.ts:14-25`), aucune dépendance externe.
- Produces: aucune nouvelle fonction ; `BOSSES[i].name` change de valeur uniquement.

- [ ] **Step 1: Écrire le test qui échoue (garde-fou anti-régression)**

Ajouter dans `lib/bosses.test.ts`, dans le `describe("catalogue boss (intégrité)", ...)` existant :

```ts
  test("aucun nom de boss ne commence par un article (issue #119)", () => {
    const leadingArticles = ["le ", "la ", "les ", "un ", "une "];
    for (const boss of BOSSES) {
      const lower = boss.name.toLowerCase();
      const startsWithArticle = leadingArticles.some((article) =>
        lower.startsWith(article),
      );
      expect(startsWithArticle, `"${boss.name}" (${boss.id})`).toBe(false);
    }
  });
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npm test -- lib/bosses.test.ts`
Expected: FAIL sur au moins "le Gardien de Glace", "le Démon de Feu Mineur", etc.

- [ ] **Step 3: Retirer l'article en tête de chaque nom**

Dans `lib/bosses.ts`, remplacer le tableau `BOSSES` (lignes 47-84) :

```ts
export const BOSSES: Boss[] = [
  boss("frost-guardian", "Gardien de Glace", 6,
    "Colosse de givre gardien des cimes gelées.",
    ["crystal-cave", "mountain-peak"]),
  boss("demon-slime", "Démon de Feu Mineur", 6,
    "Créature démoniaque des donjons, née des braises.",
    ["ancient-temple", "castle-interior"]),
  boss("cthulhu", "Cthulhu l'Abyssal", 15,
    "Horreur cosmique remontée des abysses.",
    ["underwater-world", "ancient-temple", "crystal-cave"], true),
  boss("minotaur", "Minotaure Ancestral", 16,
    "Bête cornue rôdant dans les labyrinthes de pierre.",
    ["ancient-temple", "castle-interior", "desert-oasis"]),
  boss("satyr", "Satyre Sylvestre", 7,
    "Créature mi-homme mi-bouc des mythes anciens.",
    ["ancient-temple", "mountain-peak"], true),
  boss("urban-zombie", "Zombie des Rues", 6,
    "Mort-vivant errant dans les ruelles industrielles.",
    ["steampunk-cityscape"], true),
  boss("mushroom", "Champignon Corrompu", 7,
    "Spore géante née dans les cavernes humides.",
    ["crystal-cave", "ancient-temple"]),
  boss("gorgon", "Gorgone", 7,
    "Femme-serpent au regard pétrifiant des cités perdues.",
    ["ancient-temple", "desert-oasis", "underwater-world"], true),
  boss("fire-wizard", "Mage de Feu", 7,
    "Sorcier retranché dans sa tour, maître des flammes.",
    ["castle-interior", "crystal-cave"], true),
  boss("lightning-mage", "Mage de Foudre", 7,
    "Invocateur d'orages perché sur les hauteurs.",
    ["mountain-peak", "castle-interior"], true),
  boss("gangster", "Caïd", 6,
    "Truand qui règne sur les bas-fonds de la ville.",
    ["steampunk-cityscape"], true),
  boss("knight", "Chevalier Déchu", 4,
    "Ancien champion corrompu, hantant sa forteresse.",
    ["castle-interior", "mountain-peak"], true),
];
```

Seuls les noms changent (2ᵉ argument de chaque appel `boss(...)`) — id, lore, thèmes, flip, frame counts restent identiques.

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `npm test -- lib/bosses.test.ts`
Expected: PASS (tous les tests, y compris le nouveau).

Puis lancer la suite complète pour vérifier l'absence de régression ailleurs (les templates de copy dans `lib/copy/combat.ts`/`lib/copy/rituals.ts` interpolent `bossName` tel quel, sans dépendance à l'article — déjà vérifié, `Cthulhu l'Abyssal` fonctionne déjà sans article) :

Run: `npm test`
Expected: PASS, 0 échec.

- [ ] **Step 5: Changelog**

Ajouter dans `CHANGELOG.md` sous `## [Unreleased]` :

```markdown
- fix: retire l'article ("le"/"la") du nom des boss affiché en jeu (issue #119)
```

- [ ] **Step 6: Commit**

```bash
git add lib/bosses.ts lib/bosses.test.ts CHANGELOG.md
git commit -m "fix: retire l'article des noms de boss (issue #119)"
```

---

## Self-Review

**Spec coverage :** l'issue demande uniquement le retrait de l'article des noms de boss, avec un exemple ("le Démon de Feu Mineur" → "Démon de Feu Mineur"). Task 1 couvre les 12 boss du catalogue, y compris ceux non cités explicitement dans l'issue.

**Placeholder scan :** aucun — tout le code est fourni intégralement.

**Type consistency :** aucune signature de fonction modifiée, seule une valeur de données change ; pas de risque de dérive de type.
