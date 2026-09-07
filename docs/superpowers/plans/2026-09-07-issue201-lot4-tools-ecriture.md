# Lot 4 — 5 tools MCP d'écriture + soldes de dette (issue #201)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compléter le catalogue MCP avec les 5 tools d'écriture (`add_task` étendu, `complete_task`, `set_deadline`, `move_task`, `equip_hero`) — et solder d'abord les deux dettes que les lots 2 et 3 ont reportées jusqu'ici, dont une qui **bloque** `move_task`.

**Architecture:** Chaque tool délègue à une fonction de `lib/domain/` qui existe déjà (aucune nouvelle logique métier n'est écrite dans ce lot). Le travail est le câblage, les gardes, et le filet de test qui manque encore.

**Tech Stack:** TypeScript strict, Next.js 16 Route Handlers, Supabase, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-05-mcp-catalogue-tools-design.md` — section **D6** (catalogue), **D6.3** (contrat d'erreur).

**Branche :** `feat/issue-201-mcp-tools-ecriture`, créée depuis `main` après merge du lot 3 (`b034b50`).

## Global Constraints

- **TypeScript strict :** interdiction d'`any`.
- **Aucune nouvelle logique métier.** Les 5 tools câblent des fonctions domaine existantes : `addTaskForUser`/`addSubtaskForUser`, `completeTaskForUser`, `setTaskDeadlineForUser`, `reportToTomorrowForUser`/`bringToTodayForUser`, `equipHeroForUser`. Si un tool semble exiger une nouvelle fonction domaine, s'arrêter et le signaler — c'est le signe que le périmètre a glissé.
- **`lib/domain/` reste sans framework :** pas de `"use server"`, pas de `revalidatePath`, pas de `supabase.auth.getUser()`. Task 2 renforce précisément cette frontière.
- **Scopes :** `add_task`/`complete_task`/`set_deadline`/`move_task` → `tasks:write`. `equip_hero` → `profile:write`.
- **Contrat d'erreur (D6.3)** : erreur métier → enveloppe JSON-RPC **succès** avec `isError: true`. Jamais un `-326xx` de transport. Le `try/catch` de `handleToolsCall` (posé au lot 3) couvre déjà les throws non gérés de tout nouveau tool — ne pas le dupliquer par handler.
- **Retours en texte seul** (D6.2), en français, compacts.
- **Commits :** Conventional Commits, message en français.
- **Jamais de commit direct sur `main`.**
- **`CHANGELOG.md` / `CLAUDE.md` :** mis à jour dans la dernière tâche.

### État hérité (vérifié dans le code avant d'écrire ce plan)

- `TOOL_REGISTRY` (`lib/mcp-tools.ts`) porte 6 entrées : `add_task` + les 5 lectures du lot 3. `McpToolDef.parseArgs` renvoie l'union discriminée `ParsedArgs<T>` (`{ ok: true; args } | { ok: false; error }`).
- `handleToolsCall` (`app/api/mcp/route.ts`) enveloppe déjà `def.handler(...)` dans un `try/catch` renvoyant `buildToolErrorResult("internal_error")` — acquis du lot 3, vaut pour les tools de ce lot sans rien ajouter.
- `defaultSkinIdFor(heroId)` existe (`lib/hero-skins.ts:55`) — `equip_hero` n'a pas à fabriquer l'id de tenue par défaut.
- `equipHeroForUser(supabase, userId, heroId, skinId)` (`lib/domain/shop.ts:11`) exige un `skinId` ; l'utilisateur a demandé « tenue de base uniquement » pour ce tool.
- `addTaskForUser(supabase, userId, title, dayDate?)` accepte déjà un `dayDate` optionnel, non utilisé jusqu'ici — c'est la préparation posée au lot 1 pour l'argument `day` de ce lot.
- Les **six** écritures `.or()` de `lib/domain/tasks.ts` (lignes 304, 643, 696, 726, 884, 929) ont toutes exactement la même forme : `` `id.eq.${taskId},parent_id.eq.${taskId}` ``. Parser cette forme précise couvre donc 100 % de l'usage réel du repo.
- `app/actions/achievements.ts` est `"use server"` et importe `revalidatePath` + `createClient`. Ces deux imports ne servent qu'à `equipTitle` (ligne 127) ; `assembleAchievementContext` et `applyNewAchievements` n'en utilisent aucun.

⚠️ **Correction : ils ont 7 consommateurs de production, pas 5.** Une première version de ce plan en listait cinq — les deux pages RSC avaient été manquées. Inventaire complet, relevé à `c868848` :

| Fichier | Importe |
|---|---|
| `app/actions/boss.ts:13` | les deux |
| `app/actions/day.ts:12` | les deux |
| `app/actions/shop.ts:8` | les deux |
| `app/onboarding/actions.ts:6` | les deux |
| `lib/domain/tasks.ts:20` | les deux ← **c'est la violation que cette tâche solde** |
| `app/tableau-de-chasse/succes/page.tsx:12` | `assembleAchievementContext` seul |
| `app/vestiaire/artisans/page.tsx:4` | `assembleAchievementContext` seul |

⚠️ **Et deux `vi.mock` visent le chemin qui va bouger** — c'est le vrai piège de cette tâche :

- `app/actions/boss.test.ts:56` — `vi.mock("@/app/actions/achievements", …)`
- `app/actions/shop.test.ts:42` — idem

`vi.mock` intercepte un **spécificateur de module**, pas une fonction. Si le source part vers `@/lib/domain/achievements` et que ces deux mocks continuent de viser `@/app/actions/achievements`, ils cessent d'intercepter quoi que ce soit : `boss.ts`/`shop.ts` appelleraient la **vraie** `assembleAchievementContext`, qui lance ~8 requêtes sur le faux client. Selon les fixtures, ça donne soit un échec au diagnostic obscur, soit — bien pire — un test **toujours vert pour une raison différente de celle qu'il annonce**. Les deux mocks doivent être re-pointés dans le même commit.

`components/pantheon/TitleSelector.test.tsx:13` mocke aussi ce chemin, mais pour `equipTitle`, qui **reste** dans `app/actions/achievements.ts` — ne pas y toucher.

Aucun fichier de test ne couvre `app/actions/achievements.ts` aujourd'hui (`app/actions/achievements.test.ts` n'existe pas).

---

## Task 1 : PRIORITÉ 1 — faire parser `or()` dans le faux client

**Cette tâche bloque `move_task` (Task 4) et doit passer en premier.**

Depuis que le lot 3 a fait filtrer `eq`/`in`/`lt`/`is`, `or()` est le **seul** no-op restant du faux client. Conséquence concrète : les six écritures `.or("id.eq.X,parent_id.eq.X")` matchent, en test, **toute** ligne de l'utilisateur satisfaisant les autres filtres. L'isolation de tenant tient (les six portent `.eq("user_id", userId)`), mais la propriété « cette écriture ne touche que cette tâche et ses enfants » n'est **pas prouvable par test** aujourd'hui.

Or `move_task` (Task 4) route vers `reportToTomorrowForUser`/`bringToTodayForUser` — deux de ces six écritures. Les exposer à un client MCP sans ce filet, c'est répéter exactement l'erreur que le lot 3 a corrigée.

**Files:**
- Modify: `lib/domain/fake-supabase.ts`
- Modify: `lib/domain/fake-supabase.test.ts`
- Modify: `lib/domain/tasks.test.ts`

- [ ] **Step 1 : Écrire les tests (RED)**

Ajouter à `lib/domain/fake-supabase.test.ts` :

```ts
describe("FakeQueryBuilder.or — forme PostgREST etroite (issue #201, lot 4)", () => {
  test("matche la ligne cible et ses enfants, jamais les autres", async () => {
    const c = new FakeSupabaseClient({
      tasks: [
        { id: "cible", parent_id: null, user_id: "u1" },
        { id: "enfant", parent_id: "cible", user_id: "u1" },
        { id: "voisine", parent_id: null, user_id: "u1" },
        { id: "enfant-voisine", parent_id: "voisine", user_id: "u1" },
      ],
    });
    const { data } = await c
      .from("tasks")
      .select()
      .or("id.eq.cible,parent_id.eq.cible")
      .eq("user_id", "u1");
    expect(data.map((r) => r.id).sort()).toEqual(["cible", "enfant"]);
  });

  test("se combine en AND avec les autres filtres", async () => {
    const c = new FakeSupabaseClient({
      tasks: [
        { id: "cible", parent_id: null, user_id: "u1" },
        { id: "cible-autrui", parent_id: null, user_id: "autre" },
      ],
    });
    const { data } = await c
      .from("tasks")
      .select()
      .or("id.eq.cible,parent_id.eq.cible")
      .eq("user_id", "u1");
    expect(data.map((r) => r.id)).toEqual(["cible"]);
  });

  test("un update .or() ne touche que la cible et ses enfants", async () => {
    const rows = [
      { id: "cible", parent_id: null, user_id: "u1", day_date: "J" },
      { id: "enfant", parent_id: "cible", user_id: "u1", day_date: "J" },
      { id: "voisine", parent_id: null, user_id: "u1", day_date: "J" },
    ];
    const c = new FakeSupabaseClient({ tasks: rows });
    await c
      .from("tasks")
      .update({ day_date: "J+1" })
      .or("id.eq.cible,parent_id.eq.cible")
      .eq("user_id", "u1");
    expect(rows.find((r) => r.id === "cible")?.day_date).toBe("J+1");
    expect(rows.find((r) => r.id === "enfant")?.day_date).toBe("J+1");
    expect(rows.find((r) => r.id === "voisine")?.day_date).toBe("J");
  });

  test("une forme non reconnue leve plutot que de filtrer silencieusement faux", () => {
    const c = new FakeSupabaseClient({ tasks: [] });
    expect(() => c.from("tasks").select().or("id.gt.5,title.like.*x*")).toThrow();
  });
});
```

⚠️ Le dernier test est le plus important du lot sur ce point. Un parseur qui **retombe silencieusement sur un no-op** face à une forme qu'il ne comprend pas recrée exactement le problème qu'on corrige, en pire : il aurait l'air de filtrer. Lever bruyamment force quiconque introduit une nouvelle forme `.or()` à étendre le parseur plutôt qu'à hériter d'un faux vert.

- [ ] **Step 2 : Lancer, confirmer que ça échoue**

Run : `npx vitest run lib/domain/fake-supabase.test.ts`
Attendu : les 4 nouveaux tests échouent (`or()` ne filtre pas ; le 4ᵉ ne lève pas).

- [ ] **Step 3 : Implémenter**

Remplacer le no-op `or()` de `lib/domain/fake-supabase.ts` :

```ts
  // Parse la forme etroite que ce repo emet reellement :
  // `col.eq.valeur,col.eq.valeur` (cf. les six ecritures de
  // lib/domain/tasks.ts, toutes identiques). Les conditions sont OR entre
  // elles, et l'ensemble est AND avec les autres filtres — comme PostgREST.
  //
  // Toute autre forme LEVE, volontairement : un parseur qui retomberait sur
  // un no-op face a une syntaxe inconnue recreerait le faux-vert que ce
  // correctif supprime (issue #201, lot 4), en pire — il aurait l'air de
  // filtrer. Ajouter une forme ici est un geste conscient.
  or(filters: string): this {
    const conditions = filters.split(",").map((raw) => {
      const parts = raw.split(".");
      if (parts.length !== 3 || parts[1] !== "eq") {
        throw new Error(
          `FakeQueryBuilder.or : forme non supportee "${raw}". ` +
            `Seul "colonne.eq.valeur" est parse (cf. commentaire). Etendre le parseur si besoin.`,
        );
      }
      const [column, , value] = parts;
      return (row: Row) => String(row[column]) === value;
    });
    this.filters.push((row) => conditions.some((c) => c(row)));
    return this;
  }
```

⚠️ `String(row[column]) === value` : la valeur issue de la chaîne PostgREST est toujours du texte, alors que la ligne porte le type réel. Comparer sans normaliser ferait échouer tout id non-string. Ne pas « simplifier » en `row[column] === value`.

- [ ] **Step 4 : Lancer, confirmer GREEN**

```bash
npx vitest run lib/domain/fake-supabase.test.ts
npx vitest run lib/domain/
```

⚠️ **Des tests existants de `lib/domain/tasks.test.ts` vont probablement échouer**, et c'est le résultat attendu : ils s'exécutaient jusqu'ici contre un `or()` qui ne filtrait rien. Même règle que les lots précédents, non négociable : **réparer la fixture, jamais l'assertion.** Si un test ne peut être sauvé qu'en affaiblissant ce qu'il vérifie, s'arrêter et le signaler — ce serait un vrai défaut de production que le no-op masquait.

- [ ] **Step 5 : Ajouter la preuve de portée sur une écriture réelle**

Ajouter à `lib/domain/tasks.test.ts` un test qui verrouille la propriété que ce lot rend enfin testable :

```ts
test("reportToTomorrowForUser ne deplace que la tache visee et ses enfants", async () => {
  const c = client([
    { id: "11111111-1111-1111-1111-111111111111", user_id: "u1", parent_id: null, day_date: TODAY, is_completed: false, is_abandoned: false, deadline_at: null, deferred_at: null, position: 0 },
    { id: "22222222-2222-2222-2222-222222222222", user_id: "u1", parent_id: "11111111-1111-1111-1111-111111111111", day_date: TODAY, is_completed: false, is_abandoned: false, deadline_at: null, deferred_at: null, position: 0 },
    { id: "33333333-3333-3333-3333-333333333333", user_id: "u1", parent_id: null, day_date: TODAY, is_completed: false, is_abandoned: false, deadline_at: null, deferred_at: null, position: 1 },
  ]);

  const res = await reportToTomorrowForUser(
    c as unknown as SupabaseClient,
    "u1",
    "11111111-1111-1111-1111-111111111111",
  );

  expect(res.error).toBeNull();
  const moved = (res.reportedTasks ?? []).map((t) => t.id).sort();
  expect(moved).toEqual([
    "11111111-1111-1111-1111-111111111111",
    "22222222-2222-2222-2222-222222222222",
  ]);
});
```

Adapter aux helpers réellement présents dans le fichier (`client(...)`, `TODAY`) — les lire avant d'écrire.

- [ ] **Step 6 : Vérifier**

```bash
npm run test
npx tsc --noEmit
```

- [ ] **Step 7 : Commit**

```bash
git add lib/domain/fake-supabase.ts lib/domain/fake-supabase.test.ts lib/domain/tasks.test.ts
git commit -m "test: faire parser or() dans le faux client et verrouiller la portee des ecritures en cascade (issue #201)"
```

---

## Task 2 : Sortir les succès du fichier `"use server"`

Dette reportée du lot 2 puis du lot 3. `lib/domain/tasks.ts` importe `assembleAchievementContext`/`applyNewAchievements` depuis `app/actions/achievements.ts`, qui est `"use server"` — la couche domaine dépend donc transitivement de `next/cache` et `next/headers`. Aucun impact fonctionnel (une Route Handler peut légalement les importer), mais ça mine la frontière que `lib/domain/` existe pour établir, et ce lot est le dernier moment raisonnable pour le solder.

**Files:**
- Create: `lib/domain/achievements.ts`
- Modify: `app/actions/achievements.ts`
- Modify: `app/actions/boss.ts`, `app/actions/day.ts`, `app/actions/shop.ts`, `app/onboarding/actions.ts`, `lib/domain/tasks.ts`, `app/tableau-de-chasse/succes/page.tsx`, `app/vestiaire/artisans/page.tsx`
- Modify (mocks): `app/actions/boss.test.ts`, `app/actions/shop.test.ts`

- [ ] **Step 1 : Déplacer les deux fonctions**

Créer `lib/domain/achievements.ts` et y déplacer **le corps exact** de `assembleAchievementContext` et `applyNewAchievements` depuis `app/actions/achievements.ts`. Elles prennent déjà `(supabase: SupabaseClient, userId: string, …)` depuis le lot 1 — aucune adaptation de signature n'est nécessaire, c'est un déplacement pur.

Vérifier avant de déplacer : ni l'une ni l'autre n'utilise `revalidatePath` ou `createClient` (ces deux imports ne servent qu'à `equipTitle`, qui **reste** dans le fichier `"use server"`). Si ce n'est pas le cas, s'arrêter et le signaler.

- [ ] **Step 2 : Re-pointer les sept consommateurs — et les deux mocks**

Chacun passe de `@/app/actions/achievements` à `@/lib/domain/achievements` :

```
app/actions/boss.ts:13                        (les deux fonctions)
app/actions/day.ts:12                         (les deux)
app/actions/shop.ts:8                         (les deux)
app/onboarding/actions.ts:6                   (les deux)
lib/domain/tasks.ts:20                        (les deux)
app/tableau-de-chasse/succes/page.tsx:12      (assembleAchievementContext seul)
app/vestiaire/artisans/page.tsx:4             (assembleAchievementContext seul)
```

⚠️ **Puis les deux `vi.mock`, dans le même commit :**

```
app/actions/boss.test.ts:56
app/actions/shop.test.ts:42
```

`vi.mock` intercepte un spécificateur de module. Laissés sur l'ancien chemin, ils n'interceptent plus rien et `boss.ts`/`shop.ts` appellent la vraie `assembleAchievementContext` (~8 requêtes sur le faux client) — au mieux un échec obscur, au pire un vert obtenu pour une raison différente de celle annoncée. C'est le seul vrai risque de cette tâche : les imports de production, eux, cassent bruyamment à la compilation.

**Ne pas toucher** `components/pantheon/TitleSelector.test.tsx:13`, qui mocke le même chemin pour `equipTitle` — celle-ci reste sur place.

Vérifier après coup qu'il ne reste aucune référence aux deux fonctions déplacées via l'ancien chemin :

```bash
grep -rn "actions/achievements" --include=*.ts --include=*.tsx . | grep -v node_modules
```

Attendu : uniquement les lignes concernant `equipTitle` (`TitleSelector.tsx` + son test) et les commentaires de `lib/achievements.ts` — que cette tâche doit d'ailleurs corriger, ils citent l'ancien emplacement (lignes 4 et 17).

- [ ] **Step 3 : Nettoyer `app/actions/achievements.ts`**

Il ne doit plus contenir que `equipTitle`, avec ses seuls imports encore utilisés. Si `revalidatePath`/`createClient` deviennent inutilisés, les retirer — sinon le lint les signalera.

- [ ] **Step 4 : Vérifier que la frontière est réellement établie**

```bash
npm run test
npx tsc --noEmit
npm run lint
```

Puis vérifier explicitement qu'aucun fichier de `lib/domain/` n'importe plus quoi que ce soit de `app/` :

```bash
grep -rn "from \"@/app/" lib/domain/
```

Attendu : **aucune sortie**. Si une autre dépendance vers `app/` existe encore, la signaler dans le rapport (ne pas la déplacer sans instruction — c'est hors périmètre de cette tâche).

- [ ] **Step 5 : Commit**

```bash
git add lib/domain/achievements.ts app/actions/achievements.ts \
  app/actions/boss.ts app/actions/day.ts app/actions/shop.ts \
  app/onboarding/actions.ts lib/domain/tasks.ts \
  app/tableau-de-chasse/succes/page.tsx app/vestiaire/artisans/page.tsx \
  app/actions/boss.test.ts app/actions/shop.test.ts lib/achievements.ts
git commit -m "refactor: sortir les succes du fichier use server vers la couche domaine (issue #201)"
```

---

## Task 3 : `complete_task` et `set_deadline`

**Files:**
- Modify: `lib/mcp-tools.ts`, `lib/mcp-tools.test.ts`

**Interfaces:**
- Consumes: `completeTaskForUser`, `setTaskDeadlineForUser` (`lib/domain/tasks.ts`), `ParsedArgs`/`McpContext`/`McpToolDef` (déjà en place)

- [ ] **Step 1 : Trancher la forme d'erreur, une fois**

La revue finale du lot 3 a relevé que D6.3 est appliqué de trois façons différentes aujourd'hui : un code machine nu (`profile_not_found`), de la prose française sans code, et un mélange. Ce lot ajoute cinq tools producteurs d'erreurs — c'est le moment de fixer la forme, pas après.

Convention retenue pour **tout** nouveau message d'erreur de tool dans ce lot : `<code_machine> : <phrase courte en français>`. Exemple : `task_not_found : Cette tâche est introuvable.` L'agent a un code stable à brancher, l'humain qui lit la trace a une phrase.

Ne **pas** réécrire les messages existants des lots 2/3 dans cette tâche — les toucher élargirait le diff sans nécessité. Noter la divergence dans le rapport ; l'uniformisation rétroactive est un candidat de suite.

- [ ] **Step 2 : Écrire les tests (RED)**

Ajouter à `lib/mcp-tools.test.ts`, dans le style des tests de handler du lot 3 (helper `callTool`, qui passe par le vrai `parseArgs` du registry) :

```ts
describe("complete_task", () => {
  test("refuse un task_id absent", () => {
    const parsed = findTool("complete_task")!.parseArgs({});
    expect(parsed.ok).toBe(false);
  });

  test("une tache d'un autre utilisateur renvoie une erreur metier, pas un throw", async () => {
    const res = await callTool("complete_task", { task_id: FOREIGN_TASK_ID }, {
      profiles: [{ id: "u1", level: 1, xp: 0, combo_count: 0, last_combo_completed_at: null, timezone: "UTC" }],
      tasks: [
        {
          id: FOREIGN_TASK_ID,
          user_id: "victime",
          parent_id: null,
          is_completed: false,
          is_abandoned: false,
          xp_awarded: null,
          deadline_at: null,
          deferred_at: null,
        },
      ],
      unlocked_achievements: [],
    });

    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("task_not_found");
  });

  test("coche une tache et renvoie l'XP gagnee", async () => {
    const res = await callTool("complete_task", { task_id: OWN_TASK_ID }, ownTaskFixture());
    expect(res.isError).toBe(false);
    expect(res.content[0].text).toContain("cochée");
  });

  test("completed: false decoche", async () => {
    const res = await callTool(
      "complete_task",
      { task_id: OWN_TASK_ID, completed: false },
      ownTaskFixture({ is_completed: true, xp_awarded: 10 }),
    );
    expect(res.isError).toBe(false);
    expect(res.content[0].text).toContain("décochée");
  });
});

describe("set_deadline", () => {
  test("refuse un task_id absent", () => {
    expect(findTool("set_deadline")!.parseArgs({}).ok).toBe(false);
  });

  test("une tache d'un autre utilisateur renvoie une erreur metier", async () => {
    const res = await callTool(
      "set_deadline",
      { task_id: FOREIGN_TASK_ID, deadline_at: "2026-09-08T16:00:00.000Z" },
      { tasks: [{ id: FOREIGN_TASK_ID, user_id: "victime", reminder_enabled: true, reminder_offset_minutes: null }] },
    );
    expect(res.isError).toBe(true);
  });

  test("deadline_at: null efface et le confirme", async () => {
    const res = await callTool(
      "set_deadline",
      { task_id: OWN_TASK_ID, deadline_at: null },
      { tasks: [{ id: OWN_TASK_ID, user_id: "u1", reminder_enabled: true, reminder_offset_minutes: null }] },
    );
    expect(res.isError).toBe(false);
  });
});
```

⚠️ `callTool`, `FOREIGN_TASK_ID`, `OWN_TASK_ID` et `ownTaskFixture` : le helper `callTool` existe déjà (lot 3, il passe par le vrai `parseArgs` du registry) — **le lire avant d'écrire** et vérifier s'il accepte un jeu de tables en paramètre. S'il ne le fait pas, l'étendre plutôt que d'appeler les handlers directement : passer par le parseur réel est précisément ce qui donne leur valeur à ces tests. Définir les constantes d'id et le petit factory de fixture en tête du `describe`, avec de vrais UUID (les gardes `UUID_RE` du domaine rejettent tout le reste).

**Le test « tâche d'un autre utilisateur » de chaque tool est le plus important du lot** : c'est la première fois que des écritures MCP ciblent des lignes par id, et c'est exactement la classe de défaut trouvée en production au lot 3.

- [ ] **Step 3 : Déclarer les deux tools**

```ts
const COMPLETE_TASK_TOOL: McpTool = {
  name: "complete_task",
  description: "Coche (ou décoche) une tâche Dodojo et inflige les dégâts au Boss du jour.",
  inputSchema: {
    type: "object",
    properties: {
      task_id: { type: "string", description: "Identifiant de la tâche (UUID, donné par list_tasks)" },
      completed: { type: "boolean", description: "true pour cocher (défaut), false pour décocher" },
    },
    required: ["task_id"],
  },
};

const SET_DEADLINE_TOOL: McpTool = {
  name: "set_deadline",
  description: "Fixe, modifie ou efface l'heure limite d'une tâche.",
  inputSchema: {
    type: "object",
    properties: {
      task_id: { type: "string", description: "Identifiant de la tâche (UUID)" },
      deadline_at: { type: "string", description: "Instant ISO 8601 (UTC), ou null pour effacer" },
      reminder_enabled: { type: "boolean", description: "Activer le rappel push pour cette tâche" },
      reminder_offset_minutes: { type: "number", description: "Minutes avant la deadline (défaut : réglage du profil)" },
    },
    required: ["task_id"],
  },
};
```

- [ ] **Step 4 : Parseurs et handlers**

```ts
function parseCompleteTaskArgs(args: Record<string, unknown>): ParsedArgs<Record<string, unknown>> {
  const taskId = args.task_id;
  if (typeof taskId !== "string") {
    return { ok: false, error: "invalid_args : task_id est requis (string)." };
  }
  const raw = args.completed;
  const completed = raw === undefined ? true : raw === true || raw === "true";
  return { ok: true, args: { taskId, completed } };
}

async function handleCompleteTask(ctx: McpContext, args: Record<string, unknown>): Promise<McpToolResult> {
  const outcome = await completeTaskForUser(
    ctx.supabase,
    ctx.userId,
    args.taskId as string,
    args.completed === true,
  );
  if (outcome.error !== null) {
    return buildToolErrorResult(`${outcome.error} : l'action n'a pas pu être appliquée.`);
  }

  const verbe = args.completed === true ? "cochée" : "décochée";
  const xp = outcome.xp !== undefined ? ` XP : ${outcome.xp}.` : "";
  const combo = outcome.comboCount && outcome.comboCount > 1 ? ` Combo ×${outcome.comboCount} !` : "";
  return {
    content: [{ type: "text", text: `Tâche ${verbe}.${xp}${combo}` }],
    isError: false,
  };
}
```

✅ **Vérifié** avant écriture de ce plan — `CompleteTaskOutcome` (`lib/domain/tasks.ts:33`) est exactement :

```ts
{ error: DomainErrorCode | null; level?: number; xp?: number; leveledUp?: boolean; comboCount?: number; newAchievements?: string[] }
```

Tous les champs hors `error` sont optionnels : une complétion sans transition réelle (re-cocher une tâche déjà cochée) n'en renvoie aucun. Le handler ci-dessus les garde derrière un test d'existence — ne pas les lire inconditionnellement.

### `set_deadline` — un piège de signature à ne pas manquer

✅ **Signature vérifiée** (`lib/domain/tasks.ts:521`), l'ordre est bien :

```ts
setTaskDeadlineForUser(supabase, userId, taskId, deadlineAt, reminderOffsetMinutes?, reminderEnabled?)
```

Noter que `reminderOffsetMinutes` précède `reminderEnabled`, contre-intuitivement. Les inverser serait une erreur de type (`number | null` vs `boolean`), donc `tsc` l'attrape — mais autant l'écrire juste du premier coup.

⚠️ **Le vrai piège est ailleurs.** Dans le corps de la fonction :

```ts
if (reminderOffsetMinutes !== undefined) updates.reminder_offset_minutes = reminderOffsetMinutes;
if (reminderEnabled !== undefined) updates.reminder_enabled = reminderEnabled;
```

`undefined` signifie **« ne pas toucher cette colonne »**. Un parseur écrit naïvement comme celui de `complete_task` —

```ts
const reminderEnabled = args.reminder_enabled === true;   // ❌ FAUX ICI
```

— transformerait « argument non fourni » en « désactive explicitement le rappel », donc un agent qui repousse simplement une deadline effacerait le rappel push de l'utilisateur au passage. Le parseur doit propager `undefined` tel quel :

```ts
const reminderEnabled = args.reminder_enabled === undefined ? undefined : args.reminder_enabled === true;
const reminderOffsetMinutes =
  args.reminder_offset_minutes === undefined ? undefined : Number(args.reminder_offset_minutes);
```

Ajouter un test qui verrouille ça : `set_deadline` avec `task_id` + `deadline_at` seuls ne doit modifier **ni** `reminder_enabled` **ni** `reminder_offset_minutes` sur la ligne.

Sur succès, renvoyer l'heure locale via `localTimeFromIso(deadlineAt, ctx.timezone)` quand `deadline_at` n'est pas nul, sinon confirmer l'effacement.

- [ ] **Step 5 : Enregistrer, tester, committer**

Ajouter les deux entrées à `TOOL_REGISTRY` avec `requiredScope: "tasks:write"`.

```bash
npx vitest run lib/mcp-tools.test.ts app/api/mcp/route.test.ts
npm run test
npx tsc --noEmit
git add lib/mcp-tools.ts lib/mcp-tools.test.ts
git commit -m "feat: tools MCP complete_task et set_deadline (issue #201)"
```

---

## Task 4 : `add_task` étendu, `move_task`, `equip_hero`

**Files:**
- Modify: `lib/mcp-tools.ts`, `lib/mcp-tools.test.ts`

- [ ] **Step 1 : Écrire les tests (RED)**

Couvrir au minimum :
- `add_task` avec `parent_id` → passe par `addSubtaskForUser`, et la garde RG-01 (profondeur 2) remonte bien en erreur métier
- `add_task` avec `day: "tomorrow"` → la tâche atterrit sur `nextDayKey(today)`
- `move_task` `to: "tomorrow"` puis `to: "today"`
- `move_task` sur une tâche d'un autre utilisateur → erreur métier
- **`move_task` ne déplace que la tâche visée et ses enfants** (c'est Task 1 qui rend ce test possible ; sans elle il passerait à vide)
- `equip_hero` sur un héros non possédé → erreur métier
- `equip_hero` sur un héros possédé → succès, et la tenue par défaut est utilisée

- [ ] **Step 2 : Étendre `add_task`**

Le tool existe depuis le lot 2 avec `title` seul. Ajouter deux propriétés optionnelles à son `inputSchema` :

```ts
      parent_id: { type: "string", description: "Pour créer une sous-tâche : identifiant de la tâche parente" },
      day: { type: "string", description: "'today' (défaut) ou 'tomorrow'" },
```

Le parseur valide `day` comme `list_tasks` le fait déjà (`"today"`/`"tomorrow"`, défaut `"today"`), et `parent_id` comme string optionnelle.

✅ **Signatures vérifiées** (`lib/domain/tasks.ts`) — les deux cibles du dispatch :

```ts
addTaskForUser(supabase, userId, title, dayDate?)      // L419
addSubtaskForUser(supabase, userId, parentId, title)   // L451 — PAS de dayDate
```

Le handler dispatche : `parent_id` fourni → `addSubtaskForUser` ; sinon → `addTaskForUser` avec `dayDate` calculé depuis `userToday`/`nextDayKey`.

⚠️ **`parent_id` + `day` ensemble : refuser, ne pas ignorer.** `addSubtaskForUser` n'a volontairement pas de paramètre `dayDate` — une sous-tâche hérite du `day_date` de son parent (correctif issue #116 : avant, elle était toujours datée « aujourd'hui », ce qui datait mal toute sous-tâche ajoutée à une tâche de la section Demain). Le tool ne peut donc structurellement pas honorer `day` sur une sous-tâche.

La version précédente de ce plan disait de l'ignorer en le documentant dans le schéma. C'est le mauvais choix : un agent qui demande « sous-tâche X sous P, pour demain » recevrait un succès et une tâche datée autrement, sans rien dans la réponse qui le signale — exactement le mode d'échec silencieux que ce projet paie déjà cher ailleurs (cf. `purchaseHero`, issue #192). Le parseur rejette donc explicitement la combinaison :

```
day ne s'applique pas a une sous-tache : elle herite du jour de sa tache parente.
```

L'agent apprend la règle et rejoue sans `day`. Coût : zéro requête supplémentaire. (L'alternative — accepter `day` quand il coïncide avec le jour réel du parent — exigerait de lire le parent avant de dispatcher, pour une ergonomie marginale.)

⚠️ Ne pas casser le comportement actuel : `add_task` avec le seul `title` doit se comporter exactement comme avant.


- [ ] **Step 3 : `move_task`**

```ts
const MOVE_TASK_TOOL: McpTool = {
  name: "move_task",
  description: "Déplace une tâche entre aujourd'hui et demain.",
  inputSchema: {
    type: "object",
    properties: {
      task_id: { type: "string", description: "Identifiant de la tâche (UUID)" },
      to: { type: "string", description: "'today' ou 'tomorrow'" },
    },
    required: ["task_id", "to"],
  },
};
```

Handler : `to === "tomorrow"` → `reportToTomorrowForUser`, `to === "today"` → `bringToTodayForUser`. Le parseur rejette toute autre valeur de `to`. Le texte de retour indique combien de lignes ont bougé (`reportedTasks`/`broughtBackTasks`), ce qui rend la cascade visible à l'agent.

- [ ] **Step 4 : `equip_hero`**

```ts
const EQUIP_HERO_TOOL: McpTool = {
  name: "equip_hero",
  description: "Équipe un combattant déjà débloqué (tenue par défaut).",
  inputSchema: {
    type: "object",
    properties: {
      hero_id: { type: "string", description: "Identifiant du combattant (donné par list_heroes)" },
    },
    required: ["hero_id"],
  },
};
```

Handler : `equipHeroForUser(ctx.supabase, ctx.userId, heroId, defaultSkinIdFor(heroId))` — `defaultSkinIdFor` existe déjà dans `lib/hero-skins.ts`, ne pas fabriquer l'id à la main. Scope : **`profile:write`**, pas `tasks:write`.

Ce tool n'expose délibérément pas le choix de tenue : l'utilisateur a demandé « tenue de base uniquement ». Un agent qui voudrait changer de tenue passe par l'app.

- [ ] **Step 5 : Enregistrer, tester, committer**

`TOOL_REGISTRY` doit finir à **10 entrées**. Scopes : `add_task`/`complete_task`/`set_deadline`/`move_task` → `tasks:write` ; `equip_hero` → `profile:write` ; les 5 lectures inchangées.

Ajouter un test qui asserte la liste exhaustive des 10 noms triés, et un test de filtrage par scope pour chaque famille (`tasks:read` seul, `tasks:write` seul, `profile:read` seul, `profile:write` seul).

```bash
npm run test
npx tsc --noEmit
npm run lint
git add lib/mcp-tools.ts lib/mcp-tools.test.ts
git commit -m "feat: tools MCP add_task etendu, move_task et equip_hero (issue #201)"
```

---

## Task 5 : e2e, article du Guide, documentation, PR

**Files:**
- Modify: `e2e/mcp-oauth.spec.ts`, `CHANGELOG.md`, `CLAUDE.md`
- Modify: `content/guide/*` (via Notion, cf. Step 2)

- [ ] **Step 1 : Étendre l'e2e**

Dans le test à scope complet, après les appels de lecture existants, enchaîner un aller-retour d'écriture réel : `add_task` → `list_tasks` (la tâche apparaît) → `complete_task` → `list_tasks` avec `include_completed: false` (elle a disparu de la liste active). C'est le premier test qui prouve qu'un agent peut **faire avancer le combat**, pas seulement le consulter.

Dans le test à scope restreint (`tasks:read` seul), ajouter que `complete_task` est refusé — il exige `tasks:write`.

- [ ] **Step 2 : Article du Guide (Notion)**

Reporté du lot 3 précisément pour être écrit une seule fois, sur le catalogue complet.

L'article existant dit encore qu'un assistant peut seulement « ajouter des tâches » et cite la ligne de consentement remplacée au lot 2. Le mettre à jour dans Notion (**`Slug` inchangé** — le renommer casserait les liens), `Statut = Publié`, puis `npm run pull:guide` pour régénérer `content/guide/`.

⚠️ Deux pièges documentés dans `CLAUDE.md`, à relire avant de commencer : (1) éditer `content/guide/*` à la main est inutile — le `prebuild` écrase depuis Notion ; (2) chaque pull peut rapporter une dérive préexistante sans rapport sur d'autres articles — ne committer que les fichiers de cet article, et restaurer les autres (`git checkout HEAD -- <fichiers>`).

Si `NOTION_TOKEN` est absent ou Notion inaccessible, **ne pas contourner** en éditant les fichiers à la main : le signaler et laisser la case non cochée sur l'issue.

- [ ] **Step 3 : Vérification complète**

```bash
npm run lint
npx tsc --noEmit
npm run test
npm run build
npm run e2e
```

Flake préexistant connu et sans rapport : `echoppe-skins.spec.ts` (timing du carrousel Embla). S'il est le seul échec, ce n'est pas un blocage.

- [ ] **Step 4 : `CHANGELOG.md`**

```markdown
- Serveur MCP : 5 tools d'écriture (créer une tâche ou une sous-tâche, cocher, poser une deadline, déplacer entre aujourd'hui et demain, équiper un combattant) — un assistant IA peut désormais faire avancer le combat, pas seulement le consulter (issue #201).
```

- [ ] **Step 5 : `CLAUDE.md`**

Ajouter sous « Pièges et décisions non-évidentes » une entrée couvrant : le catalogue complet à 10 tools et leurs scopes ; le fait que `or()` parse désormais la forme étroite et **lève** sur toute autre (avec le pourquoi : un no-op silencieux recréerait le faux-vert que le lot 3 a supprimé) ; et que `lib/domain/` n'importe plus rien de `app/`, frontière désormais vérifiable par un `grep`.

- [ ] **Step 6 : Commit, push, PR**

```bash
git push -u origin feat/issue-201-mcp-tools-ecriture
gh pr create --title "feat: 5 tools MCP d'écriture (issue #201, lot 4)" --body "Lot 4 de l'issue #201 — dernier lot, le catalogue MCP est complet.

Ajoute les 5 tools d'écriture : \`add_task\` étendu (\`parent_id\` pour une sous-tâche, \`day\` pour demain), \`complete_task\`, \`set_deadline\`, \`move_task\`, \`equip_hero\`. Aucune nouvelle logique métier — tous délèguent à des fonctions de \`lib/domain/\` écrites aux lots 1 à 3. \`TOOL_REGISTRY\` passe de 6 à 10 entrées.

## Deux dettes soldées, dans cet ordre

**Priorité 1 — \`or()\` parse enfin.** Depuis que le lot 3 a fait filtrer \`eq\`/\`in\`/\`lt\`/\`is\`, \`or()\` était le dernier no-op : les six écritures \`.or(\"id.eq.X,parent_id.eq.X\")\` matchaient donc, en test, toute ligne de l'utilisateur satisfaisant les autres filtres. L'isolation de tenant tenait, mais « cette écriture ne touche que cette tâche et ses enfants » n'était pas prouvable. Or \`move_task\` route vers deux de ces six. Le parseur couvre la forme étroite que le repo émet réellement et **lève** sur toute autre — un repli silencieux sur un no-op recréerait le faux-vert que le lot 3 a supprimé, en pire, puisqu'il aurait l'air de filtrer.

**\`lib/domain/\` n'importe plus rien de \`app/\`.** \`assembleAchievementContext\`/\`applyNewAchievements\` quittent le fichier \`\"use server\"\` pour \`lib/domain/achievements.ts\`. La couche domaine ne dépend plus transitivement de \`next/cache\`/\`next/headers\` — frontière désormais vérifiable par un simple \`grep -rn 'from \"@/app/' lib/domain/\`.

## Garde systématique

Chaque tool d'écriture a un test « ligne d'un autre utilisateur → erreur métier ». C'est la première fois que des écritures MCP ciblent des lignes par id, et c'est la classe de défaut que le lot 3 a trouvée en production.

Design : \`docs/superpowers/specs/2026-09-05-mcp-catalogue-tools-design.md\` (section D6).

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

Cocher **PR4** et ses sous-cases réellement faites sur l'issue #201. ⚠️ Ne cocher que ce qui est fait — si l'article du Guide n'a pas pu être mis à jour (Notion inaccessible), laisser la case et le dire.

⚠️ **Ne pas merger.**

---

## Notes pour l'exécutant

- **Task 1 bloque Task 4.** `move_task` route vers deux des six écritures `.or()` ; les exposer sans que le faux client sache filtrer ces clauses, c'est répéter l'erreur que le lot 3 a corrigée.
- Ce lot n'écrit **aucune** nouvelle logique métier. Si un tool semble en exiger une, le périmètre a glissé — s'arrêter et le signaler.
- Chaque tool d'écriture doit avoir un test « ligne d'un autre utilisateur → erreur métier ». C'est la première fois que des écritures MCP ciblent des lignes par id, et c'est la classe de défaut que le lot 3 a trouvée en production.
- Un test existant qui casse au Step 4 de Task 1 est une bonne nouvelle : il passait pour une mauvaise raison. Réparer la fixture, jamais l'assertion.
