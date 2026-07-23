import { describe, expect, test } from "vitest";
import {
  isReminderEligible,
  isWithinReminderWindow,
  selectReminderEligibleProfiles,
  type ReminderCandidate,
} from "./push-eligibility";
import type { HpTask } from "./game-engine";

function makeTask(overrides: Partial<HpTask> = {}): HpTask {
  return { parent_id: null, is_abandoned: false, is_completed: false, ...overrides };
}

function makeCandidate(overrides: Partial<ReminderCandidate> = {}): ReminderCandidate {
  return {
    profileId: "u1",
    timezone: "Europe/Paris",
    lastReminderSentOn: null,
    hasSubscription: true,
    todayTasks: [makeTask()], // Boss vivant par défaut (1 tâche non complétée)
    dayResultExists: false,
    ...overrides,
  };
}

// 2026-07-22T15:30:00Z = 17h30 à Paris (CEST, UTC+2 en juillet).
const NOW_1730_PARIS = new Date("2026-07-22T15:30:00.000Z");

describe("isWithinReminderWindow", () => {
  test("vrai pile à 17h30 heure locale", () => {
    expect(isWithinReminderWindow(NOW_1730_PARIS, "Europe/Paris")).toBe(true);
  });

  test("vrai à la borne -10 min (17h20)", () => {
    expect(isWithinReminderWindow(new Date("2026-07-22T15:20:00.000Z"), "Europe/Paris")).toBe(true);
  });

  test("vrai à la borne +10 min (17h40)", () => {
    expect(isWithinReminderWindow(new Date("2026-07-22T15:40:00.000Z"), "Europe/Paris")).toBe(true);
  });

  test("faux à 17h19 (hors fenêtre)", () => {
    expect(isWithinReminderWindow(new Date("2026-07-22T15:19:00.000Z"), "Europe/Paris")).toBe(false);
  });

  test("faux à 17h41 (hors fenêtre)", () => {
    expect(isWithinReminderWindow(new Date("2026-07-22T15:41:00.000Z"), "Europe/Paris")).toBe(false);
  });

  test("fuseaux différents évalués indépendamment au même instant", () => {
    // Au même instant, il est 17h30 à Paris (UTC+2) mais 0h30 à Tokyo (UTC+9).
    expect(isWithinReminderWindow(NOW_1730_PARIS, "Europe/Paris")).toBe(true);
    expect(isWithinReminderWindow(NOW_1730_PARIS, "Asia/Tokyo")).toBe(false);
  });
});

describe("isReminderEligible (les 5 conditions du design)", () => {
  test("éligible quand les 5 conditions sont réunies", () => {
    expect(isReminderEligible(makeCandidate(), NOW_1730_PARIS)).toBe(true);
  });

  test("(1) inéligible sans souscription push", () => {
    expect(isReminderEligible(makeCandidate({ hasSubscription: false }), NOW_1730_PARIS)).toBe(false);
  });

  test("(2) inéligible hors de la fenêtre 17h30 locale", () => {
    const outsideWindow = new Date("2026-07-22T10:00:00.000Z"); // 12h à Paris
    expect(isReminderEligible(makeCandidate(), outsideWindow)).toBe(false);
  });

  test("(3) inéligible si déjà envoyé aujourd'hui (jour local)", () => {
    expect(
      isReminderEligible(makeCandidate({ lastReminderSentOn: "2026-07-22" }), NOW_1730_PARIS),
    ).toBe(false);
  });

  test("(4) inéligible si le Boss du jour est déjà terrassé (0 HP)", () => {
    const koCandidate = makeCandidate({ todayTasks: [makeTask({ is_completed: true })] });
    expect(isReminderEligible(koCandidate, NOW_1730_PARIS)).toBe(false);
  });

  test("(5) inéligible si le jour est déjà clôturé (day_results existe)", () => {
    expect(isReminderEligible(makeCandidate({ dayResultExists: true }), NOW_1730_PARIS)).toBe(false);
  });
});

describe("selectReminderEligibleProfiles", () => {
  test("ne retient que les profils éligibles, dans l'ordre d'entrée", () => {
    const candidates = [
      makeCandidate({ profileId: "eligible-1" }),
      makeCandidate({ profileId: "not-subscribed", hasSubscription: false }),
      makeCandidate({ profileId: "eligible-2" }),
      makeCandidate({ profileId: "already-sent", lastReminderSentOn: "2026-07-22" }),
    ];
    expect(selectReminderEligibleProfiles(candidates, NOW_1730_PARIS)).toEqual([
      "eligible-1",
      "eligible-2",
    ]);
  });
});
