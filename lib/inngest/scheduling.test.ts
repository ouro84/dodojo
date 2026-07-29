import { describe, expect, test } from "vitest";
import { buildCandidatesFromDb } from "./scheduling";
import type { HpTask } from "@/lib/game-engine";

// 2026-07-22T15:30:00Z = 17h30 à Paris (CEST, UTC+2 en juillet).
const NOW_1730_PARIS = new Date("2026-07-22T15:30:00.000Z");

interface SubscriptionRow {
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}
interface ProfileRow {
  id: string;
  timezone: string;
  last_reminder_sent_on: string | null;
  aggressivity_level: "doux" | "direct" | "brut";
}
interface TaskRow extends HpTask {
  user_id: string;
  day_date: string;
}
interface DayResultRow {
  user_id: string;
  day_date: string;
}

function makeTask(overrides: Partial<TaskRow> = {}): TaskRow {
  return {
    user_id: "u1",
    day_date: "2026-07-22",
    parent_id: null,
    is_abandoned: false,
    is_completed: false,
    ...overrides,
  };
}

describe("buildCandidatesFromDb", () => {
  test("(a) 1 user 1 sub éligible → 1 candidat complet", () => {
    const subs: SubscriptionRow[] = [
      { user_id: "u1", endpoint: "https://push.example/u1", p256dh: "p", auth: "a" },
    ];
    const profiles: ProfileRow[] = [
      { id: "u1", timezone: "Europe/Paris", last_reminder_sent_on: null, aggressivity_level: "direct" },
    ];
    const tasks: TaskRow[] = [makeTask()];
    const dayResults: DayResultRow[] = [];

    const candidates = buildCandidatesFromDb(subs, profiles, tasks, dayResults, NOW_1730_PARIS);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toEqual({
      profileId: "u1",
      timezone: "Europe/Paris",
      lastReminderSentOn: null,
      hasSubscription: true,
      todayTasks: [tasks[0]],
      dayResultExists: false,
    });
  });

  test("(b) user sans sub → hasSubscription=false (candidat tout de même produit)", () => {
    const subs: SubscriptionRow[] = [];
    const profiles: ProfileRow[] = [
      { id: "u2", timezone: "Europe/Paris", last_reminder_sent_on: null, aggressivity_level: "direct" },
    ];
    const tasks: TaskRow[] = [makeTask({ user_id: "u2" })];
    const dayResults: DayResultRow[] = [];

    const candidates = buildCandidatesFromDb(subs, profiles, tasks, dayResults, NOW_1730_PARIS);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.hasSubscription).toBe(false);
  });

  test("(c) user Boss KO (toutes tâches complétées) → candidat produit avec todayTasks filtrées sur le jour", () => {
    const subs: SubscriptionRow[] = [
      { user_id: "u3", endpoint: "https://push.example/u3", p256dh: "p", auth: "a" },
    ];
    const profiles: ProfileRow[] = [
      { id: "u3", timezone: "Europe/Paris", last_reminder_sent_on: null, aggressivity_level: "direct" },
    ];
    const tasks: TaskRow[] = [
      makeTask({ user_id: "u3", is_completed: true }),
      // tâche d'un autre jour (filtre day_date) — ne doit pas apparaître dans todayTasks
      makeTask({ user_id: "u3", day_date: "2026-07-21" }),
    ];
    const dayResults: DayResultRow[] = [];

    const candidates = buildCandidatesFromDb(subs, profiles, tasks, dayResults, NOW_1730_PARIS);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.todayTasks).toHaveLength(1);
    // todayTasks est typed HpTask[] (le ReminderCandidate perd day_date),
    // mais on a passé des TaskRow en entrée — on vérifie l'unicité du filtre
    // via le head length (1 au lieu de 2) suffit. Inspection day_date via cast.
    expect((candidates[0]?.todayTasks[0] as TaskRow | undefined)?.day_date).toBe("2026-07-22");
  });

  test("(d) user avec day_results existant pour le jour courant → dayResultExists=true", () => {
    const subs: SubscriptionRow[] = [
      { user_id: "u4", endpoint: "https://push.example/u4", p256dh: "p", auth: "a" },
    ];
    const profiles: ProfileRow[] = [
      { id: "u4", timezone: "Europe/Paris", last_reminder_sent_on: null, aggressivity_level: "direct" },
    ];
    const tasks: TaskRow[] = [makeTask({ user_id: "u4" })];
    const dayResults: DayResultRow[] = [{ user_id: "u4", day_date: "2026-07-22" }];

    const candidates = buildCandidatesFromDb(subs, profiles, tasks, dayResults, NOW_1730_PARIS);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.dayResultExists).toBe(true);
  });
});

describe("buildDailyReminderCron", () => {
  test('renvoie "30 17 * * *" quel que soit le fuseau (TZ résolu par Inngest)', async () => {
    const { buildDailyReminderCron } = await import("./scheduling");
    expect(buildDailyReminderCron()).toBe("30 17 * * *");
    expect(buildDailyReminderCron("Asia/Tokyo")).toBe("30 17 * * *");
  });
});
