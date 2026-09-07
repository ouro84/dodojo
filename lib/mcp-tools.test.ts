import { describe, expect, test } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { findTool, toolsForScope, TOOL_REGISTRY, type McpContext } from "./mcp-tools";
import { FakeSupabaseClient } from "./domain/fake-supabase";
import { dayKey, nextDayKey } from "./game-engine";
import { HEROES } from "./heroes";

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
  test("refuse un titre absent", () => {
    const def = findTool("add_task")!;
    const res = def.parseArgs({});
    expect(res).toEqual({ ok: false, error: "title est requis (string)." });
  });

  test("refuse un titre non-string", () => {
    const def = findTool("add_task")!;
    const res = def.parseArgs({ title: 42 });
    expect(res).toEqual({ ok: false, error: "title est requis (string)." });
  });
});

describe("catalogue de lecture (lot 3)", () => {
  test("les 6 tools attendus sont enregistres", () => {
    expect(TOOL_REGISTRY.map((t) => t.tool.name).sort()).toEqual(
      ["add_task", "get_boss_status", "get_progression", "get_streak", "list_heroes", "list_tasks"].sort(),
    );
  });

  test("les scopes requis sont corrects", () => {
    const scopeOf = (name: string) => findTool(name)?.requiredScope;
    expect(scopeOf("list_tasks")).toBe("tasks:read");
    expect(scopeOf("get_boss_status")).toBe("tasks:read");
    expect(scopeOf("get_streak")).toBe("tasks:read");
    expect(scopeOf("get_progression")).toBe("profile:read");
    expect(scopeOf("list_heroes")).toBe("profile:read");
  });

  test("un token tasks:read seul ne voit aucun tool d'ecriture", () => {
    const names = toolsForScope("tasks:read").map((t) => t.name);
    expect(names).toContain("list_tasks");
    expect(names).not.toContain("add_task");
  });

  test("un token profile:read seul ne voit que les tools de profil", () => {
    const names = toolsForScope("profile:read").map((t) => t.name).sort();
    expect(names).toEqual(["get_progression", "list_heroes"]);
  });

  test("list_tasks refuse un argument day invalide", () => {
    const parsed = findTool("list_tasks")!.parseArgs({ day: "hier" });
    expect(parsed.ok).toBe(false);
  });

  test("list_tasks accepte l'absence d'arguments", () => {
    const parsed = findTool("list_tasks")!.parseArgs({});
    expect(parsed.ok).toBe(true);
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

  test("get_progression : profil introuvable -> isError true, code profile_not_found", async () => {
    const supabase = new FakeSupabaseClient({ profiles: [] });
    const res = await callTool("get_progression", {}, makeCtx(supabase));
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toBe("profile_not_found");
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
