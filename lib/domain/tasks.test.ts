import { describe, expect, test, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dayKey, nextDayKey } from "@/lib/game-engine";
import { FakeSupabaseClient } from "./fake-supabase";
import {
  addSubtaskForUser,
  addTaskForUser,
  addTomorrowTaskForUser,
  bringToTodayForUser,
  completeTaskForUser,
  deferOverdueTaskForUser,
  listTasksForUser,
  rageQuitTaskForUser,
  reorderSiblingsForUser,
  reportToTomorrowForUser,
  setTaskDeadlineForUser,
  undoRageQuitForUser,
  userToday,
} from "./tasks";

// Le profil de test a `timezone: "UTC"` (cf. client() ci-dessous) — userToday()
// calcule donc "aujourd'hui" via dayKey(new Date(), "UTC"). Les fixtures qui
// doivent matcher un filtre `.eq("day_date", today)" du domaine dérivent cette
// valeur en direct plutôt que de figer une date en dur (qui ne matcherait plus
// dès que ce fichier tourne un autre jour).
const TODAY = dayKey(new Date(), "UTC");

const cancelCalls: string[] = [];
const scheduleCalls: Array<{ taskId: string; offsetMinutes: number }> = [];

vi.mock("@/lib/inngest/deadline-reminder", () => ({
  cancelDeadlineReminder: async (taskId: string) => {
    cancelCalls.push(taskId);
  },
  scheduleDeadlineReminder: async (p: { taskId: string; offsetMinutes: number }) => {
    scheduleCalls.push(p);
  },
}));

function client(tasks: Record<string, unknown>[]): FakeSupabaseClient {
  return new FakeSupabaseClient({
    profiles: [{ id: "u1", level: 1, xp: 0, timezone: "UTC", combo_count: 0, last_combo_completed_at: null }],
    tasks,
    unlocked_achievements: [],
  });
}

describe("completeTaskForUser", () => {
  test("refuse un id non-UUID sans emettre la moindre requete", async () => {
    const c = client([]);
    const res = await completeTaskForUser(c as unknown as SupabaseClient, "u1", "optimistic-1", true);
    expect(res.error).toBe("invalid_task_id");
    expect(c.calls).toBe(0);
  });

  test("accorde de l'XP a la premiere completion", async () => {
    const c = client([
      { id: "11111111-1111-1111-1111-111111111111", user_id: "u1", is_completed: false, is_abandoned: false, xp_awarded: null, deadline_at: null, deferred_at: null },
    ]);
    const res = await completeTaskForUser(
      c as unknown as SupabaseClient,
      "u1",
      "11111111-1111-1111-1111-111111111111",
      true,
    );
    expect(res.error).toBeNull();
    expect(res.xp).toBeGreaterThan(0);
  });

  test("ne renvoie jamais un message francais, seulement un code", async () => {
    const c = client([]);
    const res = await completeTaskForUser(c as unknown as SupabaseClient, "u1", "optimistic-1", true);
    expect(res.error).not.toMatch(/[éèêàùç]/);
  });
});

describe("addTaskForUser", () => {
  test("refuse un titre vide", async () => {
    const c = client([]);
    const res = await addTaskForUser(c as unknown as SupabaseClient, "u1", "   ");
    expect(res.error).toBe("invalid_title");
    expect(c.calls).toBe(0);
  });

  test("cree la tache et renvoie son id", async () => {
    const c = client([]);
    const res = await addTaskForUser(c as unknown as SupabaseClient, "u1", "Ranger le bureau");
    expect(res.error).toBeNull();
    expect(res.id).toBeTruthy();
  });
});

describe("addSubtaskForUser", () => {
  test("refuse un parent qui est deja une sous-tache (RG-01, deux niveaux max)", async () => {
    const c = client([
      { id: "22222222-2222-2222-2222-222222222222", user_id: "u1", parent_id: "11111111-1111-1111-1111-111111111111", is_abandoned: false, day_date: "2026-09-05" },
    ]);
    const res = await addSubtaskForUser(
      c as unknown as SupabaseClient,
      "u1",
      "22222222-2222-2222-2222-222222222222",
      "Sous-sous-tache",
    );
    expect(res.error).toBe("depth_limit");
  });

  test("refuse un parent abandonne", async () => {
    const c = client([
      { id: "33333333-3333-3333-3333-333333333333", user_id: "u1", parent_id: null, is_abandoned: true, day_date: "2026-09-05" },
    ]);
    const res = await addSubtaskForUser(
      c as unknown as SupabaseClient,
      "u1",
      "33333333-3333-3333-3333-333333333333",
      "Sous-tache",
    );
    expect(res.error).toBe("task_abandoned");
  });

  // SECURITY 1 (issue #201, lot 4 revue) : la lecture des fratries
  // (`.select("position").eq("parent_id", parentId)`) n'avait aucun filtre
  // `user_id`. Aucune FK ne garantit qu'un enfant partage le `user_id` de son
  // parent (supabase/migrations/20260708134344_init_schema.sql) — une ligne
  // etrangere partageant le meme `parent_id` (improbable via l'app, mais
  // atteignable par un client service-role) faussait donc
  // `nextSiblingPosition` en tenant compte de sa position. Ce test verrouille
  // que seules les fratries APPARTENANT a l'utilisateur comptent.
  const PARENT_ID = "44444444-1111-1111-1111-111111111111";
  test("le calcul de position ignore une fratrie appartenant a un autre utilisateur", async () => {
    const tasksTable: Record<string, unknown>[] = [
      { id: PARENT_ID, user_id: "u1", parent_id: null, is_abandoned: false, day_date: "2026-09-05" },
      { id: "s1", user_id: "u1", parent_id: PARENT_ID, position: 0 },
      // Ligne etrangere, meme parent_id, position tres haute.
      { id: "s2", user_id: "victime", parent_id: PARENT_ID, position: 99 },
    ];
    const c = client(tasksTable);

    const res = await addSubtaskForUser(c as unknown as SupabaseClient, "u1", PARENT_ID, "Nouvelle sous-tache");
    expect(res.error).toBeNull();

    const created = tasksTable.find((t) => t.id === res.id);
    // Sans le filtre user_id, la position etrangere (99) ferait remonter la
    // nouvelle position a 100 — avec le filtre, seule "s1" (position 0, meme
    // utilisateur) compte, donc 1.
    expect(created?.position).toBe(1);
  });
});

describe("setTaskDeadlineForUser", () => {
  test("effacer la deadline annule le rappel sans en reprogrammer", async () => {
    cancelCalls.length = 0;
    scheduleCalls.length = 0;
    const c = client([
      { id: "44444444-4444-4444-4444-444444444444", user_id: "u1", reminder_enabled: true, reminder_offset_minutes: null },
    ]);
    const res = await setTaskDeadlineForUser(
      c as unknown as SupabaseClient,
      "u1",
      "44444444-4444-4444-4444-444444444444",
      null,
    );
    expect(res.error).toBeNull();
    expect(cancelCalls).toContain("44444444-4444-4444-4444-444444444444");
    expect(scheduleCalls).toHaveLength(0);
  });

  test("refuse un id non-UUID sans emettre de requete", async () => {
    const c = client([]);
    const res = await setTaskDeadlineForUser(
      c as unknown as SupabaseClient,
      "u1",
      "optimistic-3",
      "2026-09-06T12:00:00.000Z",
    );
    expect(res.error).toBe("invalid_task_id");
    expect(c.calls).toBe(0);
  });
});

describe("userToday", () => {
  test("derive le jour local depuis le fuseau du profil", async () => {
    const c = new FakeSupabaseClient({ profiles: [{ id: "u1", timezone: "Europe/Paris" }] });
    const day = await userToday(c as unknown as SupabaseClient, "u1");
    expect(day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test("retombe sur UTC quand le profil n'a pas de fuseau", async () => {
    const c = new FakeSupabaseClient({ profiles: [{ id: "u1", timezone: null }] });
    const day = await userToday(c as unknown as SupabaseClient, "u1");
    expect(day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("deferOverdueTaskForUser", () => {
  test("efface deadline_at en meme temps qu'il reporte", async () => {
    const c = client([
      { id: "55555555-5555-5555-5555-555555555555", user_id: "u1", is_completed: false, is_abandoned: false, deadline_at: "2026-09-04T10:00:00.000Z", deferred_at: null, day_date: "2026-09-04" },
    ]);
    const res = await deferOverdueTaskForUser(
      c as unknown as SupabaseClient,
      "u1",
      "55555555-5555-5555-5555-555555555555",
    );
    expect(res.error).toBeNull();
    expect(res.deferredTasks?.[0]?.deadline_at).toBeNull();
  });
});

describe("rageQuitTaskForUser", () => {
  test("refuse un id non-UUID sans emettre de requete", async () => {
    const c = client([]);
    const res = await rageQuitTaskForUser(c as unknown as SupabaseClient, "u1", "optimistic-2");
    expect(res.error).toBe("invalid_task_id");
    expect(c.calls).toBe(0);
  });

  test("applique le malus XP une seule fois, pas une par sous-tache cascadee", async () => {
    const c = client([
      { id: "66666666-6666-6666-6666-666666666666", user_id: "u1", parent_id: null, is_completed: false, is_abandoned: false, deadline_at: null, deferred_at: null },
      { id: "77777777-7777-7777-7777-777777777777", user_id: "u1", parent_id: "66666666-6666-6666-6666-666666666666", is_completed: false, is_abandoned: false, deadline_at: null, deferred_at: null },
      { id: "88888888-8888-8888-8888-888888888888", user_id: "u1", parent_id: "66666666-6666-6666-6666-666666666666", is_completed: false, is_abandoned: false, deadline_at: null, deferred_at: null },
    ]);
    const res = await rageQuitTaskForUser(
      c as unknown as SupabaseClient,
      "u1",
      "66666666-6666-6666-6666-666666666666",
    );
    expect(res.error).toBeNull();
    // RAGE_QUIT_XP_PENALTY vaut 5 : une racine à 2 enfants coûte 5 XP, jamais 15.
    expect(res.xp).toBe(0); // profil de départ à 0 XP, clampé sans de-level
  });

  test("no-op idempotent quand la cascade est vide (deja abandonnee/completee/introuvable)", async () => {
    const c = client([
      { id: "66666666-6666-6666-6666-666666666666", user_id: "u1", parent_id: null, is_completed: false, is_abandoned: true, deadline_at: null, deferred_at: null },
    ]);
    const res = await rageQuitTaskForUser(
      c as unknown as SupabaseClient,
      "u1",
      "66666666-6666-6666-6666-666666666666",
    );
    expect(res.error).toBeNull();
    expect(res.xp).toBeUndefined();
  });
});

describe("undoRageQuitForUser", () => {
  test("refuse un id non-UUID sans emettre de requete", async () => {
    const c = client([]);
    const res = await undoRageQuitForUser(c as unknown as SupabaseClient, "u1", "optimistic-6");
    expect(res.error).toBe("invalid_task_id");
    expect(c.calls).toBe(0);
  });

  test("restaure la tache et rembourse l'XP", async () => {
    const c = client([
      {
        id: "99999999-9999-9999-9999-999999999999",
        user_id: "u1",
        parent_id: null,
        is_completed: false,
        is_abandoned: true,
        abandon_reason: "rage_quit",
        deadline_at: null,
        deferred_at: null,
      },
    ]);
    const res = await undoRageQuitForUser(
      c as unknown as SupabaseClient,
      "u1",
      "99999999-9999-9999-9999-999999999999",
    );
    expect(res.error).toBeNull();
    expect(res.xp).toBe(5); // RAGE_QUIT_XP_PENALTY remboursé sur un profil à 0 XP
  });

  test("no-op idempotent quand rien n'est a restaurer", async () => {
    const c = client([]);
    const res = await undoRageQuitForUser(
      c as unknown as SupabaseClient,
      "u1",
      "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    );
    expect(res.error).toBeNull();
    expect(res.xp).toBeUndefined();
  });
});

describe("reorderSiblingsForUser", () => {
  test("refuse un parentId non-UUID sans emettre de requete", async () => {
    const c = client([]);
    const res = await reorderSiblingsForUser(
      c as unknown as SupabaseClient,
      "u1",
      "optimistic-parent",
      ["11111111-1111-1111-1111-111111111111"],
    );
    expect(res.error).toBe("invalid_task_id");
    expect(c.calls).toBe(0);
  });

  test("refuse un id non-UUID dans la liste ordonnee sans emettre de requete", async () => {
    const c = client([]);
    const res = await reorderSiblingsForUser(
      c as unknown as SupabaseClient,
      "u1",
      null,
      ["optimistic-5", "11111111-1111-1111-1111-111111111111"],
    );
    expect(res.error).toBe("invalid_task_id");
    expect(c.calls).toBe(0);
  });

  test("reordonne une fratrie racine valide", async () => {
    const c = client([
      { id: "11111111-1111-1111-1111-111111111111", user_id: "u1", parent_id: null, is_abandoned: false },
      { id: "22222222-2222-2222-2222-222222222222", user_id: "u1", parent_id: null, is_abandoned: false },
    ]);
    const res = await reorderSiblingsForUser(
      c as unknown as SupabaseClient,
      "u1",
      null,
      ["22222222-2222-2222-2222-222222222222", "11111111-1111-1111-1111-111111111111"],
    );
    expect(res.error).toBeNull();
  });

  test("refuse de reparenter une tache qui a deja des sous-taches", async () => {
    const c = client([
      { id: "11111111-1111-1111-1111-111111111111", user_id: "u1", parent_id: null, is_abandoned: false },
      { id: "33333333-3333-3333-3333-333333333333", user_id: "u1", parent_id: null, is_abandoned: false },
      { id: "44444444-4444-4444-4444-444444444444", user_id: "u1", parent_id: "33333333-3333-3333-3333-333333333333", is_abandoned: false },
    ]);
    const res = await reorderSiblingsForUser(
      c as unknown as SupabaseClient,
      "u1",
      "11111111-1111-1111-1111-111111111111",
      ["33333333-3333-3333-3333-333333333333"],
    );
    expect(res.error).toBe("depth_limit");
  });
});

describe("famille Demain", () => {
  test("addTomorrowTask cree une tache et refuse un titre vide", async () => {
    const c = client([]);
    const empty = await addTomorrowTaskForUser(c as unknown as SupabaseClient, "u1", "   ");
    expect(empty.error).toBe("invalid_title");
    expect(c.calls).toBe(0);

    const res = await addTomorrowTaskForUser(c as unknown as SupabaseClient, "u1", "Preparer le sac");
    expect(res.error).toBeNull();
    expect(res.id).toBeTruthy();
  });

  test("reportToTomorrow efface toujours deferred_at", async () => {
    const c = client([
      { id: "99999999-9999-9999-9999-999999999999", user_id: "u1", is_completed: false, is_abandoned: false, deferred_at: "2026-09-05T08:00:00.000Z", deadline_at: null, day_date: TODAY },
    ]);
    const res = await reportToTomorrowForUser(
      c as unknown as SupabaseClient,
      "u1",
      "99999999-9999-9999-9999-999999999999",
    );
    expect(res.error).toBeNull();
    expect(res.reportedTasks?.[0]?.deferred_at).toBeNull();
  });

  // Issue #201 (lot 4) : verrouille la portee de l'ecriture en cascade
  // maintenant que le faux client parse reellement `.or()` — une regression
  // qui ferait `.or()` matcher a nouveau toute ligne ferait echouer cette
  // assertion en incluant "voisine" dans `moved`.
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

  test("bringToToday efface aussi deferred_at", async () => {
    const c = client([
      { id: "aaaaaaaa-9999-9999-9999-999999999999", user_id: "u1", is_completed: false, is_abandoned: false, deferred_at: "2026-09-05T08:00:00.000Z", deadline_at: null, day_date: "2026-09-06" },
    ]);
    const res = await bringToTodayForUser(
      c as unknown as SupabaseClient,
      "u1",
      "aaaaaaaa-9999-9999-9999-999999999999",
    );
    expect(res.error).toBeNull();
    expect(res.broughtBackTasks?.[0]?.deferred_at).toBeNull();
  });

  // Issue #201 (lot 4, fix revue) : l'UPDATE de reportToTomorrowForUser/
  // bringToTodayForUser scope sur 5 (resp. 3) filtres conjonctifs, mais
  // seuls `id`/`user_id` signifient vraiment "etrangere ou inexistante" — les
  // autres (day_date/is_completed/is_abandoned) sont des filtres METIER, pas
  // des filtres de tenant. Zero ligne mise a jour ne veut donc pas
  // automatiquement dire "introuvable" : ce bloc verrouille le diagnostic
  // fin, calcule par une relecture ciblee sur la seule ligne visee.
  describe("reportToTomorrowForUser — diagnostic fin sur 0 ligne (issue #201, fix revue)", () => {
    const ROOT_ID = "55555555-5555-5555-5555-555555555555";

    test("appelee deux fois sur la meme tache : la 2e est un succes no-op, jamais task_not_found", async () => {
      const c = client([
        { id: ROOT_ID, user_id: "u1", parent_id: null, day_date: TODAY, is_completed: false, is_abandoned: false, deadline_at: null, deferred_at: null, position: 0 },
      ]);

      const first = await reportToTomorrowForUser(c as unknown as SupabaseClient, "u1", ROOT_ID);
      expect(first.error).toBeNull();
      expect(first.reportedTasks?.length).toBe(1);

      const second = await reportToTomorrowForUser(c as unknown as SupabaseClient, "u1", ROOT_ID);
      expect(second.error).toBeNull();
      expect(second.reportedTasks).toEqual([]);
    });

    test("tache deja terminee aujourd'hui : task_completed, jamais task_not_found", async () => {
      const c = client([
        { id: ROOT_ID, user_id: "u1", parent_id: null, day_date: TODAY, is_completed: true, is_abandoned: false, deadline_at: null, deferred_at: null, position: 0 },
      ]);
      const res = await reportToTomorrowForUser(c as unknown as SupabaseClient, "u1", ROOT_ID);
      expect(res.error).toBe("task_completed");
    });

    test("tache abandonnee : task_abandoned, jamais task_not_found", async () => {
      const c = client([
        { id: ROOT_ID, user_id: "u1", parent_id: null, day_date: TODAY, is_completed: false, is_abandoned: true, deadline_at: null, deferred_at: null, position: 0 },
      ]);
      const res = await reportToTomorrowForUser(c as unknown as SupabaseClient, "u1", ROOT_ID);
      expect(res.error).toBe("task_abandoned");
    });

    test("tache d'un autre utilisateur : reste task_not_found (pas de regression du cas tenant)", async () => {
      const c = client([
        { id: ROOT_ID, user_id: "victime", parent_id: null, day_date: TODAY, is_completed: false, is_abandoned: false, deadline_at: null, deferred_at: null, position: 0 },
      ]);
      const res = await reportToTomorrowForUser(c as unknown as SupabaseClient, "u1", ROOT_ID);
      expect(res.error).toBe("task_not_found");
    });
  });

  describe("bringToTodayForUser — diagnostic fin sur 0 ligne (issue #201, fix revue)", () => {
    const ROOT_ID = "66666666-6666-6666-6666-666666666666";

    // BLOCKING 1 (issue #201, lot 4 revue) : avant ce fix, bringToTodayForUser
    // n'avait AUCUN filtre day_date — une tache deja sur aujourd'hui
    // rematchait quand meme l'UPDATE, perdait silencieusement sa deadline
    // (deadline_at: null) et repartait en fin de fratrie (nouvelle
    // position), tout en repondant un faux succes ("1 tache ramenee a
    // aujourd'hui"). Le fix ajoute `.neq("day_date", today)` : une tache deja
    // sur aujourd'hui ne matche plus l'UPDATE et ressort par la branche
    // diagnostic ci-dessous en succes no-op — deadline et position intactes.
    test("tache deja sur aujourd'hui avec une deadline posee : succes no-op, la deadline et la position survivent", async () => {
      const tasksTable: Record<string, unknown>[] = [
        {
          id: ROOT_ID,
          user_id: "u1",
          parent_id: null,
          day_date: TODAY,
          is_completed: false,
          is_abandoned: false,
          deadline_at: "2026-09-07T18:00:00.000Z",
          deferred_at: null,
          position: 3,
        },
      ];
      const c = client(tasksTable);

      const res = await bringToTodayForUser(c as unknown as SupabaseClient, "u1", ROOT_ID);
      expect(res.error).toBeNull();
      expect(res.broughtBackTasks).toEqual([]);

      const row = tasksTable.find((t) => t.id === ROOT_ID);
      expect(row?.deadline_at).toBe("2026-09-07T18:00:00.000Z");
      expect(row?.position).toBe(3);
    });

    // Cas reel d'usage (section "Demain" / toast d'annulation ~5s) : une
    // tache sur demain rematche normalement, deadline effacee (comportement
    // voulu, inchange par ce fix) — puis un second appel (retente/undo
    // redondant) tombe sur le nouveau cas no-op ci-dessus.
    test("tache sur demain : rematche et se deplace ; rappelee une 2e fois, succes no-op", async () => {
      const c = client([
        {
          id: ROOT_ID,
          user_id: "u1",
          parent_id: null,
          day_date: nextDayKey(TODAY),
          is_completed: false,
          is_abandoned: false,
          deadline_at: "2026-09-08T09:00:00.000Z",
          deferred_at: null,
          position: 0,
        },
      ]);

      const first = await bringToTodayForUser(c as unknown as SupabaseClient, "u1", ROOT_ID);
      expect(first.error).toBeNull();
      expect(first.broughtBackTasks?.length).toBe(1);
      expect(first.broughtBackTasks?.[0].deadline_at).toBeNull();

      const second = await bringToTodayForUser(c as unknown as SupabaseClient, "u1", ROOT_ID);
      expect(second.error).toBeNull();
      expect(second.broughtBackTasks).toEqual([]);
    });

    test("tache abandonnee : task_abandoned, jamais task_not_found", async () => {
      const c = client([
        { id: ROOT_ID, user_id: "u1", parent_id: null, day_date: "2026-09-06", is_completed: false, is_abandoned: true, deadline_at: null, deferred_at: null, position: 0 },
      ]);
      const res = await bringToTodayForUser(c as unknown as SupabaseClient, "u1", ROOT_ID);
      expect(res.error).toBe("task_abandoned");
    });

    test("tache d'un autre utilisateur : reste task_not_found (pas de regression du cas tenant)", async () => {
      const c = client([
        { id: ROOT_ID, user_id: "victime", parent_id: null, day_date: "2026-09-06", is_completed: false, is_abandoned: false, deadline_at: null, deferred_at: null, position: 0 },
      ]);
      const res = await bringToTodayForUser(c as unknown as SupabaseClient, "u1", ROOT_ID);
      expect(res.error).toBe("task_not_found");
    });
  });
});

describe("listTasksForUser", () => {
  test("ne renvoie que les taches du jour demande et du bon utilisateur", async () => {
    const c = new FakeSupabaseClient({
      tasks: [
        { id: "a", user_id: "u1", day_date: "2026-09-06", title: "aujourd hui", parent_id: null, is_completed: false, is_abandoned: false, deadline_at: null, position: 0 },
        { id: "b", user_id: "u1", day_date: "2026-09-05", title: "hier", parent_id: null, is_completed: false, is_abandoned: false, deadline_at: null, position: 0 },
        { id: "c", user_id: "autre", day_date: "2026-09-06", title: "pas a moi", parent_id: null, is_completed: false, is_abandoned: false, deadline_at: null, position: 0 },
      ],
    });
    const res = await listTasksForUser(c as unknown as SupabaseClient, "u1", "2026-09-06", true);
    expect(res.map((t) => t.title)).toEqual(["aujourd hui"]);
  });

  test("exclut les taches abandonnees", async () => {
    const c = new FakeSupabaseClient({
      tasks: [
        { id: "a", user_id: "u1", day_date: "2026-09-06", title: "active", parent_id: null, is_completed: false, is_abandoned: false, deadline_at: null, position: 0 },
        { id: "b", user_id: "u1", day_date: "2026-09-06", title: "abandonnee", parent_id: null, is_completed: false, is_abandoned: true, deadline_at: null, position: 1 },
      ],
    });
    const res = await listTasksForUser(c as unknown as SupabaseClient, "u1", "2026-09-06", true);
    expect(res.map((t) => t.title)).toEqual(["active"]);
  });

  test("includeCompleted=false retire les taches cochees", async () => {
    const c = new FakeSupabaseClient({
      tasks: [
        { id: "a", user_id: "u1", day_date: "2026-09-06", title: "active", parent_id: null, is_completed: false, is_abandoned: false, deadline_at: null, position: 0 },
        { id: "b", user_id: "u1", day_date: "2026-09-06", title: "faite", parent_id: null, is_completed: true, is_abandoned: false, deadline_at: null, position: 1 },
      ],
    });
    const res = await listTasksForUser(c as unknown as SupabaseClient, "u1", "2026-09-06", false);
    expect(res.map((t) => t.title)).toEqual(["active"]);
  });

  test("marque isOverdue sur une deadline passee et non cochee", async () => {
    const past = new Date(Date.now() - 3600_000).toISOString();
    const c = new FakeSupabaseClient({
      tasks: [
        { id: "a", user_id: "u1", day_date: "2026-09-06", title: "en retard", parent_id: null, is_completed: false, is_abandoned: false, deadline_at: past, position: 0 },
      ],
    });
    const res = await listTasksForUser(c as unknown as SupabaseClient, "u1", "2026-09-06", true);
    expect(res[0].isOverdue).toBe(true);
  });

  test("n'isOverdue jamais une tache cochee, meme deadline passee", async () => {
    const past = new Date(Date.now() - 3600_000).toISOString();
    const c = new FakeSupabaseClient({
      tasks: [
        { id: "a", user_id: "u1", day_date: "2026-09-06", title: "faite en retard", parent_id: null, is_completed: true, is_abandoned: false, deadline_at: past, position: 0 },
      ],
    });
    const res = await listTasksForUser(c as unknown as SupabaseClient, "u1", "2026-09-06", true);
    expect(res[0].isOverdue).toBe(false);
  });

  test("includeCompleted=false : parent coche exclu, sous-tache active gardee avec parentId neutralise", async () => {
    const c = new FakeSupabaseClient({
      tasks: [
        { id: "parent", user_id: "u1", day_date: "2026-09-06", title: "parent fait", parent_id: null, is_completed: true, is_abandoned: false, deadline_at: null, position: 0 },
        { id: "enfant", user_id: "u1", day_date: "2026-09-06", title: "sous-tache active", parent_id: "parent", is_completed: false, is_abandoned: false, deadline_at: null, position: 0 },
      ],
    });
    const res = await listTasksForUser(c as unknown as SupabaseClient, "u1", "2026-09-06", false);
    expect(res.map((t) => t.title)).toEqual(["sous-tache active"]);
    expect(res[0].parentId).toBeNull();
  });

  test("includeCompleted=true : la meme fratrie garde le parentId reel de la sous-tache", async () => {
    const c = new FakeSupabaseClient({
      tasks: [
        { id: "parent", user_id: "u1", day_date: "2026-09-06", title: "parent fait", parent_id: null, is_completed: true, is_abandoned: false, deadline_at: null, position: 0 },
        { id: "enfant", user_id: "u1", day_date: "2026-09-06", title: "sous-tache active", parent_id: "parent", is_completed: false, is_abandoned: false, deadline_at: null, position: 0 },
      ],
    });
    const res = await listTasksForUser(c as unknown as SupabaseClient, "u1", "2026-09-06", true);
    const enfant = res.find((t) => t.title === "sous-tache active");
    expect(enfant?.parentId).toBe("parent");
    expect(res.map((t) => t.title)).toContain("parent fait");
  });
});
