import { describe, expect, test, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FakeSupabaseClient } from "./fake-supabase";
import { completeTaskForUser, setTaskDeadlineForUser } from "./tasks";
import { readProgression } from "./progression";
import { readDailyBoss } from "./boss";
import { assembleAchievementContext, applyNewAchievements } from "./achievements";
import { equipHeroForUser } from "./shop";

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
  // Ses 8 requetes n'avaient jamais ete verrouillees ici. Une seule d'entre
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

  // SECURITY 2 (issue #201, lot 4 revue) : `shop.ts` n'a aucun fichier de test —
  // les seuls tests existants (lib/mcp-tools.test.ts) utilisent des fixtures
  // mono-tenant, donc supprimer `.eq("user_id", userId)` a la ligne 23 de
  // shop.ts les laisserait tous verts. Ce test verrouille que le domaine
  // n'equipe jamais un heros possede seulement par un autre utilisateur —
  // charge, PREUVE EMPIRIQUE fournie dans le rapport de vague, d'avoir
  // vraiment retire le filtre et observe l'echec avant de le restaurer.
  test("equipHeroForUser refuse un heros possede seulement par un autre utilisateur", async () => {
    const profilesTable: Row[] = [{ id: "u1", equipped_hero_id: "fire_knight", equipped_skin_id: null }];
    const c = new FakeSupabaseClient({
      profiles: profilesTable,
      unlocked_heroes: [{ user_id: "victime", hero_id: "water_priestess" }],
      unlocked_skins: [],
    });

    const res = await equipHeroForUser(
      c as unknown as SupabaseClient,
      "u1",
      "water_priestess",
      "water_priestess_default",
    );

    expect(res.error).toBe("hero_not_owned");
    // Aucune mutation : le profil de u1 reste sur son equipement d'origine.
    expect(profilesTable[0].equipped_hero_id).toBe("fire_knight");
  });

  // SECURITY 2 (issue #201, lot 4 revue) : l'UPDATE `profiles` de equipHeroForUser
  // n'avait aucun garde sur le nombre de lignes mises a jour — un userId sans
  // ligne `profiles` (profil jamais cree, ou fuite tenant type
  // setTaskDeadlineForUser du lot 3) recevait un succes silencieux pour une
  // ecriture qui n'a rien change. Meme forme de faux succes que le bug deja
  // corrige sur setTaskDeadlineForUser.
  test("equipHeroForUser renvoie profile_not_found plutot qu'un faux succes sans ligne profiles", async () => {
    const c = new FakeSupabaseClient({
      profiles: [{ id: "victime", equipped_hero_id: "fire_knight", equipped_skin_id: null }],
      unlocked_heroes: [{ user_id: "u1", hero_id: "fire_knight" }],
      unlocked_skins: [],
    });

    const res = await equipHeroForUser(c as unknown as SupabaseClient, "u1", "fire_knight", "fire_knight_default");

    expect(res.error).toBe("profile_not_found");
  });

  // Issue #201 (lot 4 revue finale) : reecrit apres l'ajout d'un vrai `upsert` au faux
  // client. L'ancienne version de ce test passait un contexte neutre (rien de
  // debloque) — `evaluateAchievements` renvoyait alors `[]` quel que soit le
  // contenu d'`alreadyUnlocked`, donc `applyNewAchievements` (lib/domain/achievements.ts:91)
  // retournait AVANT que l'upsert ne s'execute jamais. Retirer le
  // `.eq("user_id", userId)` de la lecture des succes deja debloques
  // (achievements.ts:86) laissait donc ce test au vert — la ligne de la
  // victime restait "intacte" trivialement, puisqu'aucune ecriture n'avait
  // lieu. Ce test-ci force `ctx.level` a 10 (debloque LEVEL_10, seule
  // condition vraie pour ce niveau — verifie en lisant lib/achievements.ts :
  // tous les autres seuils/compteurs sont a 0/false/vide) : l'upsert s'execute
  // reellement, et la victime possede DEJA le meme code ("LEVEL_10") sous un
  // user_id different — le cas exact ou un onConflict mal scope fusionnerait
  // a tort sur sa ligne au lieu d'en creer une nouvelle pour u1.
  test("applyNewAchievements ecrit un succes reellement debloque sans jamais toucher la ligne d'un autre utilisateur qui partage le meme code", async () => {
    const victimRow: Row = { user_id: "victime", code: "LEVEL_10", unlocked_at: "2026-01-01T00:00:00.000Z" };
    const unlocked: Row[] = [victimRow];
    const c = new FakeSupabaseClient({
      profiles: [{ id: "u1", title_manually_set: false }],
      unlocked_achievements: unlocked,
    });

    const codes = await applyNewAchievements(c as unknown as SupabaseClient, "u1", {
      level: 10,
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

    // L'upsert a bien tourne : u1 debloque reellement LEVEL_10 (si la lecture
    // des succes deja debloques (achievements.ts:86) perdait son filtre
    // user_id, la ligne de la victime contaminerait `alreadyUnlocked` et
    // LEVEL_10 serait a tort suppose deja acquis pour u1 -> `codes` vaudrait
    // `[]` et cette assertion echouerait).
    expect(codes).toEqual(["LEVEL_10"]);
    // La ligne de la victime est intacte : l'upsert (onConflict user_id,code)
    // ne l'a jamais reutilisee comme cible malgre le meme `code`.
    expect(victimRow).toEqual({
      user_id: "victime",
      code: "LEVEL_10",
      unlocked_at: "2026-01-01T00:00:00.000Z",
    });
    // Une ligne DISTINCTE existe desormais pour u1.
    const u1Row = unlocked.find((r) => r.user_id === "u1" && r.code === "LEVEL_10");
    expect(u1Row).toBeDefined();
    expect(u1Row?.unlocked_at).not.toBe(victimRow.unlocked_at);
    expect(unlocked).toHaveLength(2);
  });
});
