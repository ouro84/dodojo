import { describe, expect, test, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { findTool, toolsForScope, TOOL_REGISTRY, type McpContext } from "./mcp-tools";
import { FakeSupabaseClient } from "./domain/fake-supabase";
import { dayKey, nextDayKey } from "./game-engine";
import { HEROES } from "./heroes";

// Task 3 (lot 4) : complete_task/set_deadline delegent a
// completeTaskForUser/setTaskDeadlineForUser, qui emettent tous deux des
// evenements Inngest best-effort (cancelDeadlineReminder/scheduleDeadlineReminder).
// Meme mock que lib/domain/tasks.test.ts - sans lui, un `inngest.send` reel
// tenterait un appel reseau a chaque test set_deadline.
vi.mock("@/lib/inngest/deadline-reminder", () => ({
  cancelDeadlineReminder: async () => {},
  scheduleDeadlineReminder: async () => {},
}));

describe("TOOL_REGISTRY", () => {
  test("add_task requiert tasks:write", () => {
    const def = findTool("add_task");
    expect(def?.requiredScope).toBe("tasks:write");
  });
});

describe("findTool", () => {
  test("renvoie undefined pour un tool inconnu", () => {
    expect(findTool("delete_everything")).toBeUndefined();
  });
});

describe("toolsForScope", () => {
  test("filtre les tools selon le scope accorde - add_task visible avec tasks:write", () => {
    const tools = toolsForScope("tasks:read tasks:write");
    expect(tools.map((t) => t.name)).toContain("add_task");
  });

  test("add_task invisible sans tasks:write", () => {
    const tools = toolsForScope("tasks:read");
    expect(tools.map((t) => t.name)).not.toContain("add_task");
  });
});

describe("add_task parseArgs", () => {
  // Revue #201 (lot 4, tache 3 - fixes) finding 6 : ce site emettait un
  // message d'erreur nu, sans le prefixe "invalid_args : " que portent deja
  // tous les parseurs issus de ce lot - la convention n'etait donc pas
  // vraiment unifiee malgre le commentaire au sommet du fichier.
  test("refuse un titre absent", () => {
    const def = findTool("add_task")!;
    const res = def.parseArgs({});
    expect(res).toEqual({ ok: false, error: "invalid_args : title est requis (string)." });
  });

  test("refuse un titre non-string", () => {
    const def = findTool("add_task")!;
    const res = def.parseArgs({ title: 42 });
    expect(res).toEqual({ ok: false, error: "invalid_args : title est requis (string)." });
  });
});

// Revue #201 (lot 4, tache 3 - fixes) finding 5 : insertTaskForUser
// (lib/task-insertion.ts) leve deux erreurs distinctes -
// "insert_task_fetch_failed" (lecture des taches du jour) et
// "insert_task_failed" (l'insertion elle-meme) - toutes deux surfacaient
// identiquement en "insert_failed : echec de creation en base", ce qui cache
// a l'agent qu'une simple LECTURE a echoue avant meme la tentative
// d'ecriture. FakeSupabaseClient (lib/domain/fake-supabase.ts) ne peut pas
// injecter d'erreur (son `.then()` renvoie toujours `error: null`) - des
// mini-clients dedies, tailles sur la forme exacte des deux appels
// `.from("tasks")` d'insertTaskForUser, remplacent le fake standard ici.
function fetchFailingSupabase(): SupabaseClient {
  const secondEq = () => Promise.resolve({ data: null, error: { message: "boom" } });
  const firstEq = () => ({ eq: secondEq });
  const select = () => ({ eq: firstEq });
  return { from: () => ({ select }) } as unknown as SupabaseClient;
}

function insertFailingSupabase(): SupabaseClient {
  const secondEq = () => Promise.resolve({ data: [], error: null });
  const firstEq = () => ({ eq: secondEq });
  const select = () => ({ eq: firstEq });
  const single = () => Promise.resolve({ data: null, error: { message: "boom" } });
  const insertSelect = () => ({ single });
  const insert = () => ({ select: insertSelect });
  return { from: () => ({ select, insert }) } as unknown as SupabaseClient;
}

describe("add_task handler (lot 4, tache 3 - fixes) finding 5", () => {
  test("une lecture qui echoue renvoie fetch_failed, jamais insert_failed", async () => {
    const def = findTool("add_task")!;
    const parsed = def.parseArgs({ title: "Rappeler le client" });
    if (!parsed.ok) throw new Error(parsed.error);
    const res = await def.handler(
      { supabase: fetchFailingSupabase(), userId: "u1", timezone: "UTC" },
      parsed.args,
    );
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toBe("fetch_failed : échec de lecture en base");
  });

  test("une ecriture qui echoue (lecture ok) renvoie insert_failed", async () => {
    const def = findTool("add_task")!;
    const parsed = def.parseArgs({ title: "Rappeler le client" });
    if (!parsed.ok) throw new Error(parsed.error);
    const res = await def.handler(
      { supabase: insertFailingSupabase(), userId: "u1", timezone: "UTC" },
      parsed.args,
    );
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toBe("insert_failed : échec de création en base");
  });
});

describe("catalogue (lot 3 lecture + lot 4 ecriture complete)", () => {
  test("les 10 tools attendus sont enregistres", () => {
    expect(TOOL_REGISTRY.map((t) => t.tool.name).sort()).toEqual(
      [
        "add_task",
        "complete_task",
        "equip_hero",
        "get_boss_status",
        "get_progression",
        "get_streak",
        "list_heroes",
        "list_tasks",
        "move_task",
        "set_deadline",
      ].sort(),
    );
  });

  test("les scopes requis sont corrects", () => {
    const scopeOf = (name: string) => findTool(name)?.requiredScope;
    expect(scopeOf("list_tasks")).toBe("tasks:read");
    expect(scopeOf("get_boss_status")).toBe("tasks:read");
    expect(scopeOf("get_streak")).toBe("tasks:read");
    expect(scopeOf("get_progression")).toBe("profile:read");
    expect(scopeOf("list_heroes")).toBe("profile:read");
    expect(scopeOf("add_task")).toBe("tasks:write");
    expect(scopeOf("complete_task")).toBe("tasks:write");
    expect(scopeOf("set_deadline")).toBe("tasks:write");
    expect(scopeOf("move_task")).toBe("tasks:write");
    expect(scopeOf("equip_hero")).toBe("profile:write");
  });

  // Lot 4, tache 4 : un agent ne doit voir QUE ce que son token peut appeler -
  // un test exhaustif par famille de scope, pas seulement "contient"/"ne
  // contient pas" (cf. brief : les tests precedents ne couvraient qu'add_task).
  test("un token tasks:read seul ne voit que les 3 lectures tasks", () => {
    const names = toolsForScope("tasks:read").map((t) => t.name).sort();
    expect(names).toEqual(["get_boss_status", "get_streak", "list_tasks"].sort());
  });

  test("un token tasks:write seul ne voit que les 4 ecritures tasks", () => {
    const names = toolsForScope("tasks:write").map((t) => t.name).sort();
    expect(names).toEqual(["add_task", "complete_task", "move_task", "set_deadline"].sort());
  });

  test("un token profile:read seul ne voit que les tools de profil", () => {
    const names = toolsForScope("profile:read").map((t) => t.name).sort();
    expect(names).toEqual(["get_progression", "list_heroes"]);
  });

  test("un token profile:write seul ne voit que equip_hero", () => {
    const names = toolsForScope("profile:write").map((t) => t.name);
    expect(names).toEqual(["equip_hero"]);
  });

  // Revue #201 (lot 4, tache 3 - fixes) finding 6 : meme prefixe manquant
  // que add_task, sur ce site-ci antérieur au lot.
  test("list_tasks refuse un argument day invalide", () => {
    const parsed = findTool("list_tasks")!.parseArgs({ day: "hier" });
    expect(parsed.ok).toBe(false);
    expect(parsed.ok === false && parsed.error).toBe(
      "invalid_args : day doit valoir 'today' ou 'tomorrow'.",
    );
  });

  test("list_tasks accepte l'absence d'arguments", () => {
    const parsed = findTool("list_tasks")!.parseArgs({});
    expect(parsed.ok).toBe(true);
  });

  // Revue #201 (lot 6, finding 5) : `args.day ?? "today"` collapsait
  // `day: null` sur le defaut exactement comme une absence d'argument - un
  // type incorrect (pas seulement une chaine invalide comme "hier" ci-dessus)
  // passait donc silencieusement. Doit desormais etre refuse, comme
  // parseAddTaskArgs le fait deja pour ce meme cas.
  test("list_tasks refuse day: null plutot que de le collapser sur le defaut", () => {
    const parsed = findTool("list_tasks")!.parseArgs({ day: null });
    expect(parsed.ok).toBe(false);
    expect(parsed.ok === false && parsed.error).toBe(
      "invalid_args : day doit valoir 'today' ou 'tomorrow'.",
    );
  });

  // Revue #201 (lot 6, finding 5) : meme pattern outlawed par
  // parseCompleteTaskArgs (lot 4) mais laisse en place ici - `include_completed:
  // 0`/`"no"`/`{}` retombaient tous silencieusement sur `false`, la branche
  // qui filtre les taches completees (jamais neutre pour un agent).
  test("list_tasks refuse un include_completed de type incorrect plutot que de decocher silencieusement", () => {
    for (const bad of [0, 1, "no", "yes", {}]) {
      const parsed = findTool("list_tasks")!.parseArgs({ include_completed: bad });
      expect(parsed).toEqual({
        ok: false,
        error: "invalid_args : include_completed doit etre un booleen.",
      });
    }
  });

  test("list_tasks accepte include_completed en booleen et en chaine 'true'/'false'", () => {
    for (const [raw, expected] of [
      [true, true],
      [false, false],
      ["true", true],
      ["false", false],
    ] as const) {
      const parsed = findTool("list_tasks")!.parseArgs({ include_completed: raw });
      expect(parsed).toEqual({ ok: true, args: { day: "today", includeCompleted: expected } });
    }
  });

  test("les tools sans argument acceptent un objet vide", () => {
    for (const name of ["get_boss_status", "get_streak", "get_progression", "list_heroes"]) {
      expect(findTool(name)!.parseArgs({}).ok).toBe(true);
    }
  });
});

// Revue #201 (fix round 1) : les tests ci-dessus n'assertaient que
// l'appartenance au registry, les scopes et parseArgs — rien n'assertait ce
// que les handlers PRODUISENT. C'est justement la couture ou la correction
// est la chaine de caracteres emise (ex. un renommage de cle entre le
// parseur et le handler degraderait silencieusement en "n'inclut jamais les
// taches cochees", suite entiere au vert). Les tests ci-dessous passent par
// parseArgs PUIS handler (jamais un objet d'arguments construit a la main),
// pour justement exercer ce cablage bout en bout.
const TODAY = dayKey(new Date(), "UTC");
const TOMORROW = nextDayKey(TODAY);

function makeCtx(supabase: FakeSupabaseClient, timezone = "UTC"): McpContext {
  return { supabase: supabase as unknown as SupabaseClient, userId: "u1", timezone };
}

async function callTool(name: string, rawArgs: Record<string, unknown>, ctx: McpContext) {
  const def = findTool(name)!;
  const parsed = def.parseArgs(rawArgs);
  if (!parsed.ok) throw new Error(parsed.error);
  return def.handler(ctx, parsed.args);
}

describe("handlers (lot 3, revue - comportement)", () => {
  test("list_tasks : jour vide -> message explicite, jamais confondu avec 'tout est fait'", async () => {
    const supabase = new FakeSupabaseClient({ profiles: [{ id: "u1", timezone: "UTC" }], tasks: [] });
    const res = await callTool("list_tasks", {}, makeCtx(supabase));
    expect(res.isError).toBe(false);
    expect(res.content[0].text).toBe(`Aucune tâche pour le ${TODAY}.`);
  });

  test("list_tasks : jour avec taches -> l'id et le titre apparaissent dans le texte", async () => {
    const supabase = new FakeSupabaseClient({
      profiles: [{ id: "u1", timezone: "UTC" }],
      tasks: [
        {
          id: "task-1",
          user_id: "u1",
          day_date: TODAY,
          title: "Rappeler le client",
          parent_id: null,
          is_completed: false,
          is_abandoned: false,
          deadline_at: null,
          position: 0,
        },
      ],
    });
    const res = await callTool("list_tasks", {}, makeCtx(supabase));
    expect(res.isError).toBe(false);
    expect(res.content[0].text).toContain("task-1");
    expect(res.content[0].text).toContain("Rappeler le client");
  });

  test("list_tasks : include_completed transmis du parseur au handler (le filtre est reellement applique)", async () => {
    const supabase = new FakeSupabaseClient({
      profiles: [{ id: "u1", timezone: "UTC" }],
      tasks: [
        { id: "active", user_id: "u1", day_date: TODAY, title: "active", parent_id: null, is_completed: false, is_abandoned: false, deadline_at: null, position: 0 },
        { id: "faite", user_id: "u1", day_date: TODAY, title: "faite", parent_id: null, is_completed: true, is_abandoned: false, deadline_at: null, position: 1 },
      ],
    });
    const ctx = makeCtx(supabase);

    const withCompleted = await callTool("list_tasks", {}, ctx);
    expect(withCompleted.content[0].text).toContain("faite");
    expect(withCompleted.content[0].text).toContain("active");

    const withoutCompleted = await callTool("list_tasks", { include_completed: false }, ctx);
    expect(withoutCompleted.content[0].text).not.toContain("faite");
    expect(withoutCompleted.content[0].text).toContain("active");
  });

  test("list_tasks : day='tomorrow' passe par nextDayKey, jamais les taches d'aujourd'hui", async () => {
    const supabase = new FakeSupabaseClient({
      profiles: [{ id: "u1", timezone: "UTC" }],
      tasks: [
        { id: "today-task", user_id: "u1", day_date: TODAY, title: "aujourd hui", parent_id: null, is_completed: false, is_abandoned: false, deadline_at: null, position: 0 },
        { id: "tomorrow-task", user_id: "u1", day_date: TOMORROW, title: "demain", parent_id: null, is_completed: false, is_abandoned: false, deadline_at: null, position: 0 },
      ],
    });
    const res = await callTool("list_tasks", { day: "tomorrow" }, makeCtx(supabase));
    expect(res.content[0].text).toContain(TOMORROW);
    expect(res.content[0].text).toContain("demain");
    expect(res.content[0].text).not.toContain("aujourd hui");
  });

  test("list_tasks : parent filtre (complete, include_completed=false) -> la sous-tache active n'est jamais indentee", async () => {
    const supabase = new FakeSupabaseClient({
      profiles: [{ id: "u1", timezone: "UTC" }],
      tasks: [
        { id: "parent", user_id: "u1", day_date: TODAY, title: "parent fait", parent_id: null, is_completed: true, is_abandoned: false, deadline_at: null, position: 0 },
        { id: "enfant", user_id: "u1", day_date: TODAY, title: "sous-tache active", parent_id: "parent", is_completed: false, is_abandoned: false, deadline_at: null, position: 0 },
      ],
    });
    const res = await callTool("list_tasks", { include_completed: false }, makeCtx(supabase));
    const line = res.content[0].text.split("\n").find((l) => l.includes("enfant"));
    expect(line).toBeDefined();
    expect(line?.startsWith(" ")).toBe(false);
  });

  test("list_tasks : toutes les taches faites + include_completed=false -> message distinct d'un jour vide", async () => {
    const supabase = new FakeSupabaseClient({
      profiles: [{ id: "u1", timezone: "UTC" }],
      tasks: [
        { id: "faite", user_id: "u1", day_date: TODAY, title: "faite", parent_id: null, is_completed: true, is_abandoned: false, deadline_at: null, position: 0 },
      ],
    });
    const res = await callTool("list_tasks", { include_completed: false }, makeCtx(supabase));
    expect(res.isError).toBe(false);
    expect(res.content[0].text).toBe(`Aucune tâche active pour le ${TODAY} — tout est déjà fait !`);
    expect(res.content[0].text).not.toBe(`Aucune tâche pour le ${TODAY}.`);
  });

  test("list_tasks : deadline affichee en heure locale (ctx.timezone), jamais l'ISO UTC brut", async () => {
    const todayParis = dayKey(new Date(), "Europe/Paris");
    const supabase = new FakeSupabaseClient({
      profiles: [{ id: "u1", timezone: "Europe/Paris" }],
      tasks: [
        {
          id: "task-deadline",
          user_id: "u1",
          day_date: todayParis,
          title: "avec deadline",
          parent_id: null,
          is_completed: false,
          is_abandoned: false,
          // Janvier : Paris en CET (UTC+1), hors ambiguite DST — 16:00 UTC == 17:00 locale.
          // Date fixe volontairement decouplee de todayParis (le fake ne lie
          // jamais deadline_at a day_date) pour rester deterministe quel que
          // soit le jour reel d'execution du test.
          deadline_at: "2026-01-15T16:00:00.000Z",
          position: 0,
        },
      ],
    });
    const res = await callTool("list_tasks", {}, makeCtx(supabase, "Europe/Paris"));
    expect(res.content[0].text).toContain("deadline 17:00");
    expect(res.content[0].text).not.toContain("2026-01-15T16:00:00.000Z");
  });

  test("get_boss_status : aucun boss tire -> message explicatif, isError false", async () => {
    const supabase = new FakeSupabaseClient({ profiles: [{ id: "u1", timezone: "UTC" }] });
    const res = await callTool("get_boss_status", {}, makeCtx(supabase));
    expect(res.isError).toBe(false);
    expect(res.content[0].text).toContain("n'a pas encore été tiré");
  });

  // Revue #201 (lot 4, tache 3) : convention unifiee `<code> : <phrase>` -
  // ce site emettait un code nu avant ce lot (cf. brief tache 3).
  test("get_progression : profil introuvable -> isError true, format <code> : <phrase>", async () => {
    const supabase = new FakeSupabaseClient({ profiles: [] });
    const res = await callTool("get_progression", {}, makeCtx(supabase));
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toBe("profile_not_found : profil introuvable");
  });

  test("get_progression : combattant equipe affiche par nom d'affichage, slug garde entre parentheses", async () => {
    const supabase = new FakeSupabaseClient({
      profiles: [{ id: "u1", level: 3, xp: 40, equipped_hero_id: "water_priestess", equipped_skin_id: null }],
    });
    const res = await callTool("get_progression", {}, makeCtx(supabase));
    expect(res.isError).toBe(false);
    expect(res.content[0].text).toContain("Combattant équipé : Prêtresse de l'Eau (water_priestess).");
    expect(res.content[0].text).not.toContain("Combattant équipé : water_priestess.");
  });

  test("list_heroes : compte possedes/total et marquage equipe/verrouille", async () => {
    const supabase = new FakeSupabaseClient({
      profiles: [{ id: "u1", equipped_hero_id: "fire_knight" }],
      unlocked_heroes: [
        { user_id: "u1", hero_id: "fire_knight" },
        { user_id: "u1", hero_id: "water_priestess" },
      ],
    });
    const res = await callTool("list_heroes", {}, makeCtx(supabase));
    expect(res.content[0].text).toContain(`${2} combattant(s) débloqué(s) sur ${HEROES.length} :`);
    expect(res.content[0].text).toContain("- fire_knight — Chevalier de Feu (équipé)");
    const lockedHero = HEROES.find((h) => h.id !== "fire_knight" && h.id !== "water_priestess")!;
    expect(res.content[0].text).toContain(`- ${lockedHero.id} — ${lockedHero.name} (verrouillé)`);
  });
});

// Lot 4, tache 3 : complete_task / set_deadline. Vrais UUID exiges (UUID_RE
// du domaine rejette tout le reste, y compris un id "foreign-task" en clair).
const OWN_TASK_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const FOREIGN_TASK_ID = "99999999-9999-9999-9999-999999999999";

function ownTaskFixture(overrides: Record<string, unknown> = {}) {
  return {
    profiles: [{ id: "u1", level: 1, xp: 0, combo_count: 0, last_combo_completed_at: null, timezone: "UTC" }],
    tasks: [
      {
        id: OWN_TASK_ID,
        user_id: "u1",
        parent_id: null,
        is_completed: false,
        is_abandoned: false,
        xp_awarded: null,
        deadline_at: null,
        deferred_at: null,
        reminder_enabled: null,
        reminder_offset_minutes: null,
        ...overrides,
      },
    ],
    unlocked_achievements: [],
  };
}

// Etend callTool (lot 3) : construit le FakeSupabaseClient a partir d'un jeu
// de tables brut, plutot que d'exiger un McpContext deja assemble - permet
// aux tests "tache d'un autre utilisateur" de passer des fixtures minimales
// sans dupliquer makeCtx partout.
function runTool(
  name: string,
  rawArgs: Record<string, unknown>,
  tables: Record<string, Record<string, unknown>[]>,
  timezone = "UTC",
) {
  const supabase = new FakeSupabaseClient(tables);
  return callTool(name, rawArgs, makeCtx(supabase, timezone));
}

describe("complete_task (lot 4, tache 3)", () => {
  test("refuse un task_id absent", () => {
    const parsed = findTool("complete_task")!.parseArgs({});
    expect(parsed.ok).toBe(false);
  });

  test("une tache d'un autre utilisateur renvoie une erreur metier, pas un throw", async () => {
    const res = await runTool("complete_task", { task_id: FOREIGN_TASK_ID }, {
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

  // Revue #201 (lot 6, finding 2) : `'Tâche décochée.'.includes('cochée')`
  // vaut `true` (le mot "décochée" contient "cochée" comme sous-chaîne) — donc
  // `toContain("cochée")` seul ne prouve rien sur la BRANCHE réellement prise,
  // et rien n'assertait `is_completed` sur la ligne. Un défaut `completed`
  // flippé silencieusement à `false` (lit "décoche") aurait laissé ce test au
  // vert. Sous-chaîne non-ambiguë (`"Tâche cochée."`, avec l'espace qui
  // précède, absent de "Tâche décochée.") + assertion sur la ligne elle-même.
  test("coche une tache et renvoie l'issue (cochee)", async () => {
    const tables = ownTaskFixture();
    const supabase = new FakeSupabaseClient(tables);
    const res = await callTool("complete_task", { task_id: OWN_TASK_ID }, makeCtx(supabase));
    expect(res.isError).toBe(false);
    expect(res.content[0].text).toContain("Tâche cochée.");
    expect(res.content[0].text).not.toContain("décochée");
    expect(tables.tasks[0].is_completed).toBe(true);
  });

  test("completed: false decoche", async () => {
    const tables = ownTaskFixture({ is_completed: true, xp_awarded: 10 });
    const supabase = new FakeSupabaseClient(tables);
    const res = await callTool(
      "complete_task",
      { task_id: OWN_TASK_ID, completed: false },
      makeCtx(supabase),
    );
    expect(res.isError).toBe(false);
    expect(res.content[0].text).toContain("Tâche décochée.");
    expect(tables.tasks[0].is_completed).toBe(false);
  });

  test("erreur au format <code> : <phrase>, jamais un code nu", async () => {
    const res = await runTool("complete_task", { task_id: "optimistic-1" }, ownTaskFixture());
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toBe("invalid_task_id : identifiant de tâche invalide");
  });

  // Revue #201 (lot 4, tache 3 - fixes) finding 4 : `raw === true || raw ===
  // "true"` est un test d'EGALITE, jamais une coercition — donc tout ce qui
  // n'est ni `true` ni `"true"` (y compris `1`, `"yes"`, `"TRUE"`) devenait
  // silencieusement `false` = "decocher", la branche qui rembourse l'XP et
  // remet le combo a zero. Doit desormais etre refuse, jamais reinterprete.
  test("completed refuse un type incorrect (nombre) plutot que de decocher silencieusement", () => {
    const parsed = findTool("complete_task")!.parseArgs({ task_id: OWN_TASK_ID, completed: 1 });
    expect(parsed).toEqual({
      ok: false,
      error: "invalid_args : completed doit etre un booleen.",
    });
  });

  test("completed refuse une chaine non-booleenne ('yes')", () => {
    const parsed = findTool("complete_task")!.parseArgs({ task_id: OWN_TASK_ID, completed: "yes" });
    expect(parsed.ok).toBe(false);
  });

  test("completed accepte toujours false (booleen) - decoche reellement", () => {
    const parsed = findTool("complete_task")!.parseArgs({ task_id: OWN_TASK_ID, completed: false });
    expect(parsed).toEqual({ ok: true, args: { taskId: OWN_TASK_ID, completed: false } });
  });
});

describe("set_deadline (lot 4, tache 3)", () => {
  test("refuse un task_id absent", () => {
    expect(findTool("set_deadline")!.parseArgs({}).ok).toBe(false);
  });

  test("refuse un deadline_at absent (ni string ni null)", () => {
    const parsed = findTool("set_deadline")!.parseArgs({ task_id: OWN_TASK_ID });
    expect(parsed.ok).toBe(false);
  });

  test("une tache d'un autre utilisateur renvoie une erreur metier", async () => {
    const res = await runTool(
      "set_deadline",
      { task_id: FOREIGN_TASK_ID, deadline_at: "2026-09-08T16:00:00.000Z" },
      { tasks: [{ id: FOREIGN_TASK_ID, user_id: "victime", reminder_enabled: true, reminder_offset_minutes: null }] },
    );
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("task_not_found");
  });

  test("deadline_at: null efface et le confirme", async () => {
    const res = await runTool(
      "set_deadline",
      { task_id: OWN_TASK_ID, deadline_at: null },
      { tasks: [{ id: OWN_TASK_ID, user_id: "u1", reminder_enabled: true, reminder_offset_minutes: null }] },
    );
    expect(res.isError).toBe(false);
    expect(res.content[0].text).toContain("effacée");
  });

  test("deadline_at fixee -> heure locale (ctx.timezone) dans le texte", async () => {
    const res = await runTool(
      "set_deadline",
      { task_id: OWN_TASK_ID, deadline_at: "2026-01-15T16:00:00.000Z" },
      { tasks: [{ id: OWN_TASK_ID, user_id: "u1", reminder_enabled: null, reminder_offset_minutes: null }] },
      "Europe/Paris",
    );
    expect(res.isError).toBe(false);
    // Janvier : Paris en CET (UTC+1), hors ambiguite DST - 16:00 UTC == 17:00 locale.
    expect(res.content[0].text).toContain("17:00");
  });

  // *** Le test qui verrouille le piege undefined-propagation (brief tache 3) ***
  test("task_id + deadline_at seuls -> reminder_enabled et reminder_offset_minutes INTACTS sur la ligne", async () => {
    const tasksTable: Record<string, unknown>[] = [
      {
        id: OWN_TASK_ID,
        user_id: "u1",
        reminder_enabled: true,
        reminder_offset_minutes: 45,
      },
    ];
    const supabase = new FakeSupabaseClient({
      profiles: [{ id: "u1", timezone: "UTC", reminder_offset_minutes: 30 }],
      tasks: tasksTable,
    });
    const res = await callTool(
      "set_deadline",
      { task_id: OWN_TASK_ID, deadline_at: "2026-01-16T09:00:00.000Z" },
      makeCtx(supabase),
    );
    expect(res.isError).toBe(false);

    // Assertion sur la LIGNE en base, jamais sur la valeur de retour (cf. brief) :
    // un parseur naif (`args.reminder_enabled === true`) ecraserait ces deux
    // colonnes malgre leur absence des arguments recus.
    const row = tasksTable.find((t) => t.id === OWN_TASK_ID);
    expect(row?.reminder_enabled).toBe(true);
    expect(row?.reminder_offset_minutes).toBe(45);
  });

  // Revue #201 (lot 4, tache 3 - fixes) finding 2 : un client MCP qui valide
  // les arguments contre inputSchema AVANT l'appel rejetterait
  // `deadline_at: null` si le schema n'annonce que `type: "string"` — "effacer
  // la deadline" deviendrait inatteignable via ce tool alors meme que le
  // parseur l'accepte.
  test("le schema de set_deadline annonce deadline_at comme string OU null", () => {
    const schema = findTool("set_deadline")!.tool.inputSchema.properties.deadline_at;
    expect(schema.type).toEqual(["string", "null"]);
  });

  // Revue #201 (lot 4, tache 3 - fixes) finding 1 : le parametre domaine est
  // `number | null`, et `null` signifie "herite du reglage du profil" —
  // distinct de l'absence d'argument (`undefined`, "ne touche pas la
  // colonne"). `Number(null)` vaut 0 ("notifier a la deadline elle-meme", un
  // reglage DIFFERENT), et `Number("soon")` vaut NaN (serialise en `null` par
  // supabase-js, donc un reset silencieux vers l'heritage profil).
  test("reminder_offset_minutes: null explicite atteint le domaine en tant que null, jamais 0", async () => {
    const tasksTable: Record<string, unknown>[] = [
      { id: OWN_TASK_ID, user_id: "u1", reminder_enabled: true, reminder_offset_minutes: 45 },
    ];
    const supabase = new FakeSupabaseClient({
      profiles: [{ id: "u1", timezone: "UTC", reminder_offset_minutes: 30 }],
      tasks: tasksTable,
    });
    const res = await callTool(
      "set_deadline",
      { task_id: OWN_TASK_ID, deadline_at: "2026-01-16T09:00:00.000Z", reminder_offset_minutes: null },
      makeCtx(supabase),
    );
    expect(res.isError).toBe(false);
    const row = tasksTable.find((t) => t.id === OWN_TASK_ID);
    expect(row?.reminder_offset_minutes).toBeNull();
    expect(row?.reminder_offset_minutes).not.toBe(0);
  });

  test("reminder_offset_minutes non-numerique est refuse, jamais reinterprete en NaN/null", () => {
    const parsed = findTool("set_deadline")!.parseArgs({
      task_id: OWN_TASK_ID,
      deadline_at: "2026-01-16T09:00:00.000Z",
      reminder_offset_minutes: "soon",
    });
    expect(parsed).toEqual({
      ok: false,
      error: "invalid_args : reminder_offset_minutes doit etre un nombre ou null.",
    });
  });

  // Revue #201 (lot 4, tache 3 - fixes) finding 3 : le code produit
  // `args.reminder_enabled === true` qui vaut bien `false` pour un `false`
  // explicite — mais aucun test ne verrouillait cette direction avant ce
  // correctif. L'erreur symetrique (collapse `false` -> `undefined`, "ne
  // touche pas la colonne") echouerait silencieusement : un agent ne pourrait
  // jamais desactiver un rappel, et le texte de retour dirait quand meme
  // "Deadline fixee a...". Assertion sur la LIGNE (jamais la valeur de
  // retour), meme raison que le test finding-1 undefined-propagation.
  test("reminder_enabled: false explicite desactive reellement le rappel (assertion sur la ligne)", async () => {
    const tasksTable: Record<string, unknown>[] = [
      { id: OWN_TASK_ID, user_id: "u1", reminder_enabled: true, reminder_offset_minutes: null },
    ];
    const supabase = new FakeSupabaseClient({
      profiles: [{ id: "u1", timezone: "UTC" }],
      tasks: tasksTable,
    });
    const res = await callTool(
      "set_deadline",
      {
        task_id: OWN_TASK_ID,
        deadline_at: "2026-01-16T09:00:00.000Z",
        reminder_enabled: false,
      },
      makeCtx(supabase),
    );
    expect(res.isError).toBe(false);
    const row = tasksTable.find((t) => t.id === OWN_TASK_ID);
    expect(row?.reminder_enabled).toBe(false);
  });
});

// Lot 4, tache 4 : add_task etendu (parent_id, day), move_task, equip_hero.
// TOOL_REGISTRY passe de 8 a 10 entrees - aucune nouvelle logique metier,
// tout delegue a lib/domain/ deja ecrit aux taches precedentes (cf. brief).
const PARENT_TASK_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const NESTED_GRANDPARENT_ID = "dddddddd-dddd-dddd-dddd-dddddddddddd";
const NESTED_PARENT_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc"; // deja une sous-tache

describe("add_task parseArgs — extension parent_id/day (lot 4, tache 4)", () => {
  test("parent_id absent et day absent -> day par defaut 'today', parentId undefined", () => {
    const parsed = findTool("add_task")!.parseArgs({ title: "Rappeler" });
    expect(parsed).toEqual({ ok: true, args: { title: "Rappeler", parentId: undefined, day: "today" } });
  });

  test("refuse un parent_id non-string", () => {
    const parsed = findTool("add_task")!.parseArgs({ title: "Rappeler", parent_id: 42 });
    expect(parsed).toEqual({ ok: false, error: "invalid_args : parent_id doit etre une chaine." });
  });

  test("refuse un day invalide", () => {
    const parsed = findTool("add_task")!.parseArgs({ title: "Rappeler", day: "hier" });
    expect(parsed).toEqual({ ok: false, error: "invalid_args : day doit valoir 'today' ou 'tomorrow'." });
  });

  test("day='tomorrow' seul (pas de parent_id) est accepte", () => {
    const parsed = findTool("add_task")!.parseArgs({ title: "Rappeler", day: "tomorrow" });
    expect(parsed).toEqual({ ok: true, args: { title: "Rappeler", parentId: undefined, day: "tomorrow" } });
  });

  test("parent_id seul (pas de day) est accepte", () => {
    const parsed = findTool("add_task")!.parseArgs({ title: "Sous-tache", parent_id: PARENT_TASK_ID });
    expect(parsed).toEqual({ ok: true, args: { title: "Sous-tache", parentId: PARENT_TASK_ID, day: "today" } });
  });

  // *** Le refus explicite demande par le brief - jamais un succes silencieux
  // avec une tache datee autrement que demande, cf. purchaseHero #192 /
  // setTaskDeadlineForUser lot 3 ***
  test("parent_id + day ensemble : REFUSE, jamais ignore silencieusement", () => {
    const parsed = findTool("add_task")!.parseArgs({
      title: "Sous-tache",
      parent_id: PARENT_TASK_ID,
      day: "tomorrow",
    });
    expect(parsed).toEqual({
      ok: false,
      error:
        "invalid_args : day ne s'applique pas a une sous-tache : elle herite du jour de sa tache parente.",
    });
  });

  test("parent_id + day='today' (valeur qui coinciderait avec le defaut) est quand meme refuse", () => {
    // Le brief est explicite : refuser la combinaison plutot que de deviner si
    // la valeur demandee coinciderait avec le jour reel du parent (couterait
    // une lecture supplementaire pour une ergonomie marginale).
    const parsed = findTool("add_task")!.parseArgs({
      title: "Sous-tache",
      parent_id: PARENT_TASK_ID,
      day: "today",
    });
    expect(parsed.ok).toBe(false);
  });
});

describe("add_task handler — sous-tache (parent_id, lot 4 tache 4)", () => {
  test("herite le day_date du parent (issue #116), jamais 'aujourd'hui' force", async () => {
    const tasksTable: Record<string, unknown>[] = [
      { id: PARENT_TASK_ID, user_id: "u1", parent_id: null, is_abandoned: false, day_date: TOMORROW, position: 0 },
    ];
    const res = await runTool(
      "add_task",
      { title: "Sous-tache", parent_id: PARENT_TASK_ID },
      { tasks: tasksTable, profiles: [{ id: "u1", timezone: "UTC" }] },
    );
    expect(res.isError).toBe(false);
    const created = tasksTable.find((t) => t.parent_id === PARENT_TASK_ID);
    expect(created).toBeDefined();
    expect(created?.day_date).toBe(TOMORROW);
    expect(created?.day_date).not.toBe(TODAY);
  });

  test("un parent qui est deja une sous-tache -> depth_limit (RG-01)", async () => {
    const res = await runTool(
      "add_task",
      { title: "Trop profond", parent_id: NESTED_PARENT_ID },
      {
        tasks: [
          { id: NESTED_GRANDPARENT_ID, user_id: "u1", parent_id: null, is_abandoned: false, day_date: TODAY, position: 0 },
          { id: NESTED_PARENT_ID, user_id: "u1", parent_id: NESTED_GRANDPARENT_ID, is_abandoned: false, day_date: TODAY, position: 0 },
        ],
        profiles: [{ id: "u1", timezone: "UTC" }],
      },
    );
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toBe("depth_limit : une sous-tâche ne peut pas avoir de sous-tâches");
  });

  test("un parent d'un autre utilisateur -> task_not_found (pas un throw)", async () => {
    const res = await runTool(
      "add_task",
      { title: "Sous-tache", parent_id: FOREIGN_TASK_ID },
      {
        tasks: [{ id: FOREIGN_TASK_ID, user_id: "victime", parent_id: null, is_abandoned: false, day_date: TODAY, position: 0 }],
        profiles: [{ id: "u1", timezone: "UTC" }],
      },
    );
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("task_not_found");
  });

  test("succes : message distinct de buildAddTaskToolResult (pas de HP de Boss sur cette forme de retour)", async () => {
    const tasksTable: Record<string, unknown>[] = [
      { id: PARENT_TASK_ID, user_id: "u1", parent_id: null, is_abandoned: false, day_date: TODAY, position: 0 },
    ];
    const res = await runTool(
      "add_task",
      { title: "Sous-tache", parent_id: PARENT_TASK_ID },
      { tasks: tasksTable, profiles: [{ id: "u1", timezone: "UTC" }] },
    );
    expect(res.isError).toBe(false);
    expect(res.content[0].text).not.toContain("Boss");
  });
});

describe("add_task handler — day (lot 4 tache 4)", () => {
  test("day='tomorrow' : la tache atterrit sur nextDayKey(today), jamais aujourd'hui", async () => {
    const tasksTable: Record<string, unknown>[] = [];
    const res = await runTool(
      "add_task",
      { title: "Pour demain", day: "tomorrow" },
      { tasks: tasksTable, profiles: [{ id: "u1", timezone: "UTC" }] },
    );
    expect(res.isError).toBe(false);
    expect(res.content[0].text).toContain(TOMORROW);
    const created = tasksTable.find((t) => t.title === "Pour demain");
    expect(created?.day_date).toBe(TOMORROW);
  });

  // BLOCKING 2 (issue #201, lot 5) : le Boss renvoye par un add_task
  // day="tomorrow" est celui de DEMAIN (insertTaskForUser le calcule sur les
  // taches de dayDate=demain) — jamais un texte "Boss a X/Y HP" non qualifie
  // qu'un agent relaierait a tort comme l'etat du Boss d'aujourd'hui.
  test("day='tomorrow' : le Boss annonce est explicitement celui de demain, jamais une lecture non qualifiee", async () => {
    const tasksTable: Record<string, unknown>[] = [];
    const res = await runTool(
      "add_task",
      { title: "Pour demain", day: "tomorrow" },
      { tasks: tasksTable, profiles: [{ id: "u1", timezone: "UTC" }] },
    );
    expect(res.isError).toBe(false);
    expect(res.content[0].text).toContain("Boss de demain a");
    expect(res.content[0].text).not.toContain("Boss a ");
  });

  // Retro-compatibilite absolue (brief) : title seul doit se comporter
  // EXACTEMENT comme avant ce lot.
  test("titre seul (comportement pre-existant, inchange) : la tache reste sur aujourd'hui", async () => {
    const tasksTable: Record<string, unknown>[] = [];
    const res = await runTool(
      "add_task",
      { title: "Sans day precise" },
      { tasks: tasksTable, profiles: [{ id: "u1", timezone: "UTC" }] },
    );
    expect(res.isError).toBe(false);
    expect(res.content[0].text).toContain(TODAY);
    const created = tasksTable.find((t) => t.title === "Sans day precise");
    expect(created?.day_date).toBe(TODAY);
  });
});

describe("move_task parseArgs (lot 4, tache 4)", () => {
  test("refuse un task_id absent", () => {
    const parsed = findTool("move_task")!.parseArgs({ to: "tomorrow" });
    expect(parsed.ok).toBe(false);
  });

  test("refuse un task_id non-string", () => {
    const parsed = findTool("move_task")!.parseArgs({ task_id: 42, to: "tomorrow" });
    expect(parsed.ok).toBe(false);
  });

  test("refuse un to absent", () => {
    const parsed = findTool("move_task")!.parseArgs({ task_id: OWN_TASK_ID });
    expect(parsed.ok).toBe(false);
  });

  test("refuse toute valeur de to autre que today/tomorrow", () => {
    const parsed = findTool("move_task")!.parseArgs({ task_id: OWN_TASK_ID, to: "yesterday" });
    expect(parsed).toEqual({
      ok: false,
      error: "invalid_args : to doit valoir 'today' ou 'tomorrow'.",
    });
  });

  test("accepte task_id + to='today'", () => {
    const parsed = findTool("move_task")!.parseArgs({ task_id: OWN_TASK_ID, to: "today" });
    expect(parsed).toEqual({ ok: true, args: { taskId: OWN_TASK_ID, to: "today" } });
  });
});

const MOVE_ROOT_ID = "11111111-1111-1111-1111-111111111111";
const MOVE_CHILD_ID = "22222222-2222-2222-2222-222222222222";
const MOVE_NEIGHBOUR_ID = "33333333-3333-3333-3333-333333333333";

describe("move_task handler (lot 4, tache 4)", () => {
  test("refuse un task_id non-UUID (erreur metier, jamais un throw)", async () => {
    const res = await runTool(
      "move_task",
      { task_id: "optimistic-1", to: "tomorrow" },
      { tasks: [], profiles: [{ id: "u1", timezone: "UTC" }] },
    );
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toBe("invalid_task_id : identifiant de tâche invalide");
  });

  test("une tache d'un autre utilisateur renvoie une erreur metier, jamais un succes a 0 ligne", async () => {
    const res = await runTool(
      "move_task",
      { task_id: FOREIGN_TASK_ID, to: "tomorrow" },
      {
        tasks: [
          { id: FOREIGN_TASK_ID, user_id: "victime", parent_id: null, day_date: TODAY, is_completed: false, is_abandoned: false, deadline_at: null, deferred_at: null, position: 0 },
        ],
        profiles: [{ id: "u1", timezone: "UTC" }],
      },
    );
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("task_not_found");
  });

  test("to='tomorrow' route vers reportToTomorrowForUser et confirme le compte deplace", async () => {
    const tasksTable: Record<string, unknown>[] = [
      { id: OWN_TASK_ID, user_id: "u1", parent_id: null, day_date: TODAY, is_completed: false, is_abandoned: false, deadline_at: null, deferred_at: null, position: 0 },
    ];
    const res = await runTool(
      "move_task",
      { task_id: OWN_TASK_ID, to: "tomorrow" },
      { tasks: tasksTable, profiles: [{ id: "u1", timezone: "UTC" }] },
    );
    expect(res.isError).toBe(false);
    expect(res.content[0].text).toContain("1 tâche(s)");
    const row = tasksTable.find((t) => t.id === OWN_TASK_ID);
    expect(row?.day_date).toBe(TOMORROW);
  });

  test("to='today' route vers bringToTodayForUser et confirme le compte ramene", async () => {
    const tasksTable: Record<string, unknown>[] = [
      { id: OWN_TASK_ID, user_id: "u1", parent_id: null, day_date: TOMORROW, is_completed: false, is_abandoned: false, deadline_at: null, deferred_at: null, position: 0 },
    ];
    const res = await runTool(
      "move_task",
      { task_id: OWN_TASK_ID, to: "today" },
      { tasks: tasksTable, profiles: [{ id: "u1", timezone: "UTC" }] },
    );
    expect(res.isError).toBe(false);
    expect(res.content[0].text).toContain("1 tâche(s)");
    const row = tasksTable.find((t) => t.id === OWN_TASK_ID);
    expect(row?.day_date).toBe(TODAY);
  });

  // *** Le test qui n'existait pas avant Task 1 de ce lot : sans un faux
  // client qui parse reellement `.or()`, une voisine satisfaisant tous les
  // AUTRES filtres (meme utilisateur, meme jour, active) aurait ete deplacee
  // a tort — cf. rapport de tache pour la preuve (or() force en no-op). ***
  test("cascade : ne deplace que la tache visee et ses enfants, jamais une racine voisine", async () => {
    const tasksTable: Record<string, unknown>[] = [
      { id: MOVE_ROOT_ID, user_id: "u1", parent_id: null, day_date: TODAY, is_completed: false, is_abandoned: false, deadline_at: null, deferred_at: null, position: 0 },
      { id: MOVE_CHILD_ID, user_id: "u1", parent_id: MOVE_ROOT_ID, day_date: TODAY, is_completed: false, is_abandoned: false, deadline_at: null, deferred_at: null, position: 0 },
      { id: MOVE_NEIGHBOUR_ID, user_id: "u1", parent_id: null, day_date: TODAY, is_completed: false, is_abandoned: false, deadline_at: null, deferred_at: null, position: 1 },
    ];
    const res = await runTool(
      "move_task",
      { task_id: MOVE_ROOT_ID, to: "tomorrow" },
      { tasks: tasksTable, profiles: [{ id: "u1", timezone: "UTC" }] },
    );
    expect(res.isError).toBe(false);
    expect(res.content[0].text).toContain("2 tâche(s)");

    const neighbour = tasksTable.find((t) => t.id === MOVE_NEIGHBOUR_ID);
    expect(neighbour?.day_date).toBe(TODAY);

    const movedIds = tasksTable.filter((t) => t.day_date === TOMORROW).map((t) => t.id).sort();
    expect(movedIds).toEqual([MOVE_ROOT_ID, MOVE_CHILD_ID].sort());
  });

  // Revue #201 (lot 4, fix) : la 2e requete sur 0 ligne mise a jour n'est PAS
  // forcement "introuvable" — reportToTomorrowForUser/bringToTodayForUser
  // distinguent desormais ce cas au niveau domaine (relecture ciblee).
  test("deplacer deux fois vers demain : la 2e fois est un succes 'deja la-bas', jamais task_not_found", async () => {
    const tables = {
      tasks: [
        { id: OWN_TASK_ID, user_id: "u1", parent_id: null, day_date: TODAY, is_completed: false, is_abandoned: false, deadline_at: null, deferred_at: null, position: 0 },
      ],
      profiles: [{ id: "u1", timezone: "UTC" }],
    };

    const first = await runTool("move_task", { task_id: OWN_TASK_ID, to: "tomorrow" }, tables);
    expect(first.isError).toBe(false);

    const second = await runTool("move_task", { task_id: OWN_TASK_ID, to: "tomorrow" }, tables);
    expect(second.isError).toBe(false);
    expect(second.content[0].text).not.toContain("task_not_found");
    expect(second.content[0].text).toContain("déjà sur demain");
  });

  test("deplacer une tache deja terminee : task_completed, jamais task_not_found", async () => {
    const res = await runTool(
      "move_task",
      { task_id: OWN_TASK_ID, to: "tomorrow" },
      {
        tasks: [
          { id: OWN_TASK_ID, user_id: "u1", parent_id: null, day_date: TODAY, is_completed: true, is_abandoned: false, deadline_at: null, deferred_at: null, position: 0 },
        ],
        profiles: [{ id: "u1", timezone: "UTC" }],
      },
    );
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("task_completed");
    expect(res.content[0].text).not.toContain("task_not_found");
  });

  test("deplacer une tache abandonnee : task_abandoned, jamais task_not_found", async () => {
    const res = await runTool(
      "move_task",
      { task_id: OWN_TASK_ID, to: "tomorrow" },
      {
        tasks: [
          { id: OWN_TASK_ID, user_id: "u1", parent_id: null, day_date: TODAY, is_completed: false, is_abandoned: true, deadline_at: null, deferred_at: null, position: 0 },
        ],
        profiles: [{ id: "u1", timezone: "UTC" }],
      },
    );
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("task_abandoned");
    expect(res.content[0].text).not.toContain("task_not_found");
  });
});

describe("equip_hero parseArgs (lot 4, tache 4)", () => {
  test("refuse un hero_id absent", () => {
    const parsed = findTool("equip_hero")!.parseArgs({});
    expect(parsed.ok).toBe(false);
  });

  test("refuse un hero_id non-string", () => {
    const parsed = findTool("equip_hero")!.parseArgs({ hero_id: 42 });
    expect(parsed).toEqual({ ok: false, error: "invalid_args : hero_id est requis (string)." });
  });

  test("accepte un hero_id string", () => {
    const parsed = findTool("equip_hero")!.parseArgs({ hero_id: "water_priestess" });
    expect(parsed).toEqual({ ok: true, args: { heroId: "water_priestess" } });
  });
});

describe("equip_hero handler (lot 4, tache 4)", () => {
  test("un heros non debloque renvoie hero_not_owned", async () => {
    const lockedHero = HEROES.find((h) => h.id !== "fire_knight")!;
    const res = await runTool("equip_hero", { hero_id: lockedHero.id }, {
      profiles: [{ id: "u1", equipped_hero_id: "fire_knight", equipped_skin_id: null }],
      unlocked_heroes: [{ user_id: "u1", hero_id: "fire_knight" }],
      unlocked_skins: [],
    });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toBe("hero_not_owned : héros non débloqué");
  });

  test("un heros inconnu du catalogue renvoie hero_not_found", async () => {
    const res = await runTool("equip_hero", { hero_id: "does_not_exist" }, {
      profiles: [{ id: "u1", equipped_hero_id: "fire_knight", equipped_skin_id: null }],
      unlocked_heroes: [{ user_id: "u1", hero_id: "fire_knight" }],
      unlocked_skins: [],
    });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toBe("hero_not_found : héros introuvable au catalogue");
  });

  test("un heros debloque s'equipe, avec sa tenue par defaut (defaultSkinIdFor, jamais fabrique a la main)", async () => {
    const profilesTable: Record<string, unknown>[] = [
      { id: "u1", equipped_hero_id: "fire_knight", equipped_skin_id: null },
    ];
    const res = await runTool("equip_hero", { hero_id: "water_priestess" }, {
      profiles: profilesTable,
      unlocked_heroes: [
        { user_id: "u1", hero_id: "fire_knight" },
        { user_id: "u1", hero_id: "water_priestess" },
      ],
      unlocked_skins: [],
    });
    expect(res.isError).toBe(false);
    expect(res.content[0].text).toContain("Prêtresse de l'Eau");
    const profile = profilesTable.find((p) => p.id === "u1");
    expect(profile?.equipped_hero_id).toBe("water_priestess");
    // Tenue "default" -> jamais une ligne unlocked_skins, equipped_skin_id
    // reste null (cf. equipHeroForUser / skin.isDefault, US-53 D4).
    expect(profile?.equipped_skin_id).toBeNull();
  });
});
