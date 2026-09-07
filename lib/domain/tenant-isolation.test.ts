import { describe, expect, test, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FakeSupabaseClient } from "./fake-supabase";
import { completeTaskForUser, setTaskDeadlineForUser } from "./tasks";
import { readProgression } from "./progression";
import { readDailyBoss } from "./boss";
import { assembleAchievementContext, applyNewAchievements } from "./achievements";

type Row = Record<string, unknown>;

const cancelCalls: string[] = [];
const scheduleCalls: Array<{ taskId: string }> = [];

vi.mock("@/lib/inngest/deadline-reminder", () => ({
  cancelDeadlineReminder: async (taskId: string) => {
    cancelCalls.push(taskId);
  },
  scheduleDeadlineReminder: async (p: { taskId: string }) => {
    scheduleCalls.push(p);
  },
}));

// Ces tests sont la raison d'etre du correctif des filtres du faux client
// (lot 3, Task 1). Avant lui, ils auraient tous passe meme sans le moindre
// .eq("user_id", ...) dans le code de production. Le serveur MCP appelle le
// domaine avec un client service-role qui CONTOURNE RLS : ces filtres
// applicatifs sont la seule frontiere de tenant qui reste.
describe("isolation de tenant — le domaine ne voit jamais les lignes d'autrui", () => {
  test("completeTaskForUser refuse une tache appartenant a un autre utilisateur", async () => {
    const c = new FakeSupabaseClient({
      profiles: [{ id: "u1", level: 1, xp: 0, combo_count: 0, last_combo_completed_at: null, timezone: "UTC" }],
      tasks: [
        {
          id: "11111111-1111-1111-1111-111111111111",
          user_id: "victime",
          is_completed: false,
          is_abandoned: false,
          xp_awarded: null,
          deadline_at: null,
          deferred_at: null,
        },
      ],
      unlocked_achievements: [],
    });

    const res = await completeTaskForUser(
      c as unknown as SupabaseClient,
      "u1",
      "11111111-1111-1111-1111-111111111111",
      true,
    );

    expect(res.error).toBe("task_not_found");
  });

  // Revue lot 3 (Important #2) : `setTaskDeadlineForUser` lisait auparavant
  // `reminder_enabled`/`reminder_offset_minutes` via un `.select()` sans
  // `.eq("user_id", ...)`, et appelait `cancelDeadlineReminder(taskId)`
  // inconditionnellement dans la branche `deadlineAt === null`, même quand
  // l'update n'avait matché aucune ligne pour cet utilisateur. Verrouille le
  // correctif : ni lecture, ni annulation du rappel d'un autre utilisateur.
  test("setTaskDeadlineForUser ne lit ni n'annule le rappel d'une tache d'autrui", async () => {
    cancelCalls.length = 0;
    scheduleCalls.length = 0;
    const c = new FakeSupabaseClient({
      profiles: [{ id: "u1", level: 1, xp: 0, timezone: "UTC" }],
      tasks: [
        {
          id: "22222222-2222-2222-2222-222222222222",
          user_id: "victime",
          reminder_enabled: true,
          reminder_offset_minutes: null,
        },
      ],
    });

    const res = await setTaskDeadlineForUser(
      c as unknown as SupabaseClient,
      "u1",
      "22222222-2222-2222-2222-222222222222",
      null,
    );

    expect(res.error).toBe("task_not_found");
    expect(cancelCalls).toEqual([]);
    expect(scheduleCalls).toEqual([]);
  });

  test("readProgression ne lit pas le profil d'un autre utilisateur", async () => {
    const c = new FakeSupabaseClient({
      profiles: [{ id: "victime", level: 99, xp: 5000, equipped_hero_id: "x", equipped_skin_id: null }],
      day_results: [],
      unlocked_heroes: [],
      unlocked_skins: [],
    });

    const res = await readProgression(c as unknown as SupabaseClient, "u1");
    expect(res).toBeNull();
  });

  test("readDailyBoss ne lit pas le boss d'un autre utilisateur", async () => {
    const c = new FakeSupabaseClient({
      daily_boss: [
        { user_id: "victime", day_date: "2026-09-06", boss_id: "minotaur", background_id: "forest-1" },
      ],
    });

    const res = await readDailyBoss(c as unknown as SupabaseClient, "u1", "2026-09-06");
    expect(res).toBeNull();
  });

  // Issue #201 (lot 4) : assembleAchievementContext a emmenage dans lib/domain/
  // avec la Task 2, donc elle est desormais appelee par le serveur MCP via
  // completeTaskForUser -> applyNewAchievements, avec un client service-role.
  // Ses 11 requetes n'avaient jamais ete verrouillees ici. Une seule d'entre
  // elles perdant son `.eq("user_id", ...)` donnerait a un agent la progression
  // d'un autre joueur — et debloquerait chez lui des succes qu'il n'a pas
  // gagnes, puisque applyNewAchievements ecrit sur la base de ce contexte.
  test("assembleAchievementContext ne voit aucune donnee d'un autre utilisateur", async () => {
    const c = new FakeSupabaseClient({
      profiles: [
        { id: "victime", level: 99, best_streak: 42, aggressivity_level: "brut", title_manually_set: false },
      ],
      unlocked_heroes: [{ user_id: "victime", hero_id: "metal_bladekeeper" }],
      unlocked_skins: [{ user_id: "victime", skin_id: "metal_bladekeeper_gold" }],
      daily_boss: [{ user_id: "victime", boss_id: "minotaur", background_id: "forest-1" }],
      day_results: [
        { user_id: "victime", outcome: "victory", tasks_completed: 9, tasks_abandoned: 0, gold_earned: 500, boss_max_hp: 200 },
      ],
      tasks: [{ user_id: "victime", abandon_reason: "rage_quit" }],
      recurring_templates: [{ user_id: "victime" }],
      share_events: [{ user_id: "victime", event: "share_succeeded" }],
      unlocked_achievements: [],
    });

    const ctx = await assembleAchievementContext(c as unknown as SupabaseClient, "u1");

    // Chaque champ retombe sur son defaut : u1 n'existe dans aucune table.
    expect(ctx.level).toBe(1);
    expect(ctx.bestStreak).toBe(0);
    expect(ctx.aggressivityLevel).toBe("direct");
    expect(ctx.unlockedHeroIds).toEqual([]);
    expect(ctx.unlockedSkinIds).toEqual([]);
    expect(ctx.seenBossIds).toEqual([]);
    expect(ctx.seenBackgroundIds).toEqual([]);
    expect(ctx.dayResults).toEqual([]);
    // Les trois comptages : sans le support de `{ count }` ajoute au faux
    // client dans ce meme lot, ils valaient `undefined` -> 0 quoi qu'il arrive,
    // et ces trois assertions auraient passe meme sans filtre `user_id`.
    expect(ctx.rageQuitCount).toBe(0);
    expect(ctx.routineCount).toBe(0);
    expect(ctx.shareSuccessCount).toBe(0);
  });

  test("applyNewAchievements ne debloque rien depuis les succes d'autrui", async () => {
    const unlocked: Row[] = [{ user_id: "victime", code: "FIRST_VICTORY", unlocked_at: "2026-01-01T00:00:00.000Z" }];
    const c = new FakeSupabaseClient({
      profiles: [{ id: "u1", title_manually_set: false }],
      unlocked_achievements: unlocked,
    });

    // Contexte neutre : rien n'est gagne, donc rien ne doit etre ecrit.
    const codes = await applyNewAchievements(c as unknown as SupabaseClient, "u1", {
      level: 1,
      bestStreak: 0,
      aggressivityLevel: "direct",
      unlockedHeroIds: [],
      unlockedSkinIds: [],
      seenBossIds: [],
      seenBackgroundIds: [],
      dayResults: [],
      rageQuitCount: 0,
      routineCount: 0,
      shareSuccessCount: 0,
    });

    expect(codes).toEqual([]);
    // La ligne de la victime est intacte : aucun upsert ne l'a touchee.
    expect(unlocked).toEqual([
      { user_id: "victime", code: "FIRST_VICTORY", unlocked_at: "2026-01-01T00:00:00.000Z" },
    ]);
  });
});
