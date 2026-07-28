import { describe, expect, it, test } from "vitest";
import {
  applyXpDelta,
  calculateBossCurrentHp,
  calculateBossMaxHp,
  calculateHeroHp,
  overdueHpPenalties,
  missedDeadlineTasks,
  upcomingDeadlineCount,
  deadlineHpPenalties,
  deferredRestHpPenalties,
  HERO_DAMAGE_PER_OVERDUE_TASK,
  deadlineIso,
  localTimeFromIso,
  computeGoldEarned,
  computeToggleCascade,
  currentStreak,
  goldBalance,
  koOutcome,
  tableauChasseStats,
  applyRageQuitPenalty,
  collectAbandonCascade,
  RAGE_QUIT_XP_PENALTY,
  weekdayOf,
  shouldGenerate,
  planRecurringGeneration,
  comboLabel,
  comboIntensity,
  titleForStreak,
  weekKey,
  dayKey,
  isNestableParent,
  isOptimisticId,
  isOptimisticTask,
  nextSiblingPosition,
  planReorder,
  planWakeUp,
  sortTasksHierarchically,
  summarizeDay,
  taskHpValue,
  xpThresholdForLevel,
  XP_PER_TASK,
  XP_THRESHOLD_PER_LEVEL,
} from "./game-engine";
import type { Task } from "../types";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    user_id: "u1",
    parent_id: null,
    title: "Tâche",
    is_completed: false,
    is_abandoned: false,
    abandon_reason: null,
    is_recurring: false,
    recurring_template_id: null,
    deadline_at: null,
    deferred_at: null,
    day_date: "2026-07-16",
    position: 0,
    created_at: "2026-07-16T00:00:00.000Z",
    ...overrides,
  };
}

describe("computeGoldEarned", () => {
  it("victoire sans dégât ni streak = base 50", () => {
    expect(computeGoldEarned("victory", 0, 0)).toBe(50);
  });
  it("retreat = base 10, defeat = 0", () => {
    expect(computeGoldEarned("retreat", 0, 0)).toBe(10);
    expect(computeGoldEarned("defeat", 0, 0)).toBe(0);
  });
  it("ajoute +1 or par tranche de 20 dégâts", () => {
    expect(computeGoldEarned("victory", 120, 0)).toBe(50 + 6);
  });
  it("ajoute le bonus streak (+5 par jour de série)", () => {
    expect(computeGoldEarned("victory", 0, 3)).toBe(50 + 15);
  });
  it("plafonne le bonus streak à GOLD_STREAK_BONUS_CAP", () => {
    expect(computeGoldEarned("victory", 0, 100)).toBe(50 + 50);
  });
});

describe("goldBalance", () => {
  it("goldBalance = gains cumulés - achats cumulés (héros + tenues)", () => {
    expect(
      goldBalance(
        [{ gold_earned: 50 }, { gold_earned: 60 }],
        [{ price_paid: 40 }],
        [{ price_paid: 20 }],
      ),
    ).toBe(50);
  });

  it("goldBalance = 0 sans historique", () => {
    expect(goldBalance([], [], [])).toBe(0);
  });

  it("goldBalance ignore les achats à 0 (héros/tenue par défaut)", () => {
    expect(
      goldBalance([{ gold_earned: 50 }], [{ price_paid: 0 }], [{ price_paid: 0 }]),
    ).toBe(50);
  });

  it("goldBalance a besoin de TOUT l'historique — un appelant qui tronque fausse le résultat (audit #67, PR4)", () => {
    // Documente le contrat : goldBalance() elle-même est correcte sur ses
    // entrées, mais elle n'a aucun moyen de savoir si le tableau qu'on lui
    // passe est le vrai historique complet ou une page tronquée. Le bug
    // réel (app/pantheon/page.tsx réutilisant un fetch borné à 90 jours)
    // est donc un bug d'appelant, verrouillé ici par contraste explicite.
    const fullHistory = Array.from({ length: 120 }, () => ({ gold_earned: 10 }));
    const truncatedTo90 = fullHistory.slice(0, 90);
    expect(goldBalance(fullHistory, [], [])).toBe(1200);
    expect(goldBalance(truncatedTo90, [], [])).toBe(900);
  });
});

describe("taskHpValue (RG-01)", () => {
  test("une tâche principale vaut 20 HP", () => {
    const task = makeTask({ parent_id: null });
    expect(taskHpValue(task)).toBe(20);
  });

  test("une sous-tâche vaut 10 HP", () => {
    const task = makeTask({ parent_id: "parent-1" });
    expect(taskHpValue(task)).toBe(10);
  });
});

describe("calculateBossMaxHp (RG-01)", () => {
  test("somme les points de toutes les tâches non abandonnées", () => {
    const tasks = [
      makeTask({ id: "1", parent_id: null }),
      makeTask({ id: "2", parent_id: null }),
      makeTask({ id: "3", parent_id: "1" }),
    ];
    expect(calculateBossMaxHp(tasks)).toBe(50);
  });

  test("exclut les tâches abandonnées de la somme", () => {
    const tasks = [
      makeTask({ id: "1", parent_id: null }),
      makeTask({ id: "2", parent_id: null, is_abandoned: true }),
    ];
    expect(calculateBossMaxHp(tasks)).toBe(20);
  });

  test("retourne 0 pour une journée sans tâche", () => {
    expect(calculateBossMaxHp([])).toBe(0);
  });
});

describe("calculateBossCurrentHp (RG-02)", () => {
  test("égale les HP max quand rien n'est validé", () => {
    const tasks = [makeTask({ id: "1" }), makeTask({ id: "2" })];
    expect(calculateBossCurrentHp(tasks)).toBe(40);
  });

  test("retire les points des tâches validées (US-21)", () => {
    const tasks = [
      makeTask({ id: "1", is_completed: true }),
      makeTask({ id: "2" }),
    ];
    expect(calculateBossCurrentHp(tasks)).toBe(20);
  });

  test("une tâche abandonnée ne compte ni dans le max ni dans le solde", () => {
    const tasks = [
      makeTask({ id: "1", is_completed: true }),
      makeTask({ id: "2", is_abandoned: true }),
    ];
    expect(calculateBossCurrentHp(tasks)).toBe(0);
  });
});

describe("calculateHeroHp (pool HP Héros pondéré, US-05)", () => {
  test("100 HP quand aucune pénalité", () => {
    expect(calculateHeroHp([])).toBe(100);
  });

  test("retire le poids de chaque pénalité non résolue", () => {
    const penalties = [
      { ...makeTask({ id: "1" }), weight: 20 },
      { ...makeTask({ id: "2" }), weight: 10 },
    ];
    expect(calculateHeroHp(penalties)).toBe(70);
  });

  test("ignore les pénalités déjà complétées ou abandonnées", () => {
    const penalties = [
      { ...makeTask({ id: "1", is_completed: true }), weight: 20 },
      { ...makeTask({ id: "2", is_abandoned: true }), weight: 10 },
      { ...makeTask({ id: "3" }), weight: 20 },
    ];
    expect(calculateHeroHp(penalties)).toBe(80);
  });

  test("plafonne à 0, jamais négatif", () => {
    const penalties = Array.from({ length: 10 }, (_, i) => ({
      ...makeTask({ id: `t${i}` }),
      weight: 20,
    }));
    expect(calculateHeroHp(penalties)).toBe(0);
  });

  test("combine un poids -20 (retard reporté) et un poids -10 (deadline ratée) sur deux tâches distinctes", () => {
    const penalties = [
      { ...makeTask({ id: "overdue-1" }), weight: 20 },
      { ...makeTask({ id: "deadline-1" }), weight: 10 },
    ];
    expect(calculateHeroHp(penalties)).toBe(70);
  });

  test("une pénalité résolue (cochée) libère son poids immédiatement", () => {
    const penalties = [
      { ...makeTask({ id: "1" }), weight: 10 },
      { ...makeTask({ id: "1", is_completed: true }), weight: 10 },
    ];
    // Cocher la tâche (2e entrée) doit faire remonter le HP à 100.
    expect(calculateHeroHp([penalties[1]])).toBe(100);
  });
});

describe("overdueHpPenalties (US-05)", () => {
  test("attribue le poids -20 à chaque tâche en retard, en conservant ses champs", () => {
    const tasks = [makeTask({ id: "1" }), makeTask({ id: "2", is_completed: true })];
    expect(overdueHpPenalties(tasks)).toEqual([
      { ...tasks[0], weight: 20 },
      { ...tasks[1], weight: 20 },
    ]);
  });
});

describe("deferredRestHpPenalties (by-pass A4-overdue, issue #101)", () => {
  test("0 tâche → []", () => {
    expect(deferredRestHpPenalties([])).toEqual([]);
  });

  test("1 tâche deferred_at non-null active → poids -20", () => {
    const tasks = [
      makeTask({ id: "1", deferred_at: "2026-07-28T00:00:00.000Z" }),
    ];
    expect(deferredRestHpPenalties(tasks)).toEqual([
      { ...tasks[0], weight: HERO_DAMAGE_PER_OVERDUE_TASK },
    ]);
  });

  test("1 tâche deferred_at null → [] (tâche normale sans reste reporté)", () => {
    const tasks = [makeTask({ id: "1", deferred_at: null })];
    expect(deferredRestHpPenalties(tasks)).toEqual([]);
  });

  test("1 tâche deferred_at non-null mais is_completed → [] (résolue)", () => {
    const tasks = [
      makeTask({
        id: "1",
        deferred_at: "2026-07-28T00:00:00.000Z",
        is_completed: true,
      }),
    ];
    expect(deferredRestHpPenalties(tasks)).toEqual([]);
  });

  test("1 tâche deferred_at non-null mais is_abandoned → [] (annihilée/rage quit)", () => {
    const tasks = [
      makeTask({
        id: "1",
        deferred_at: "2026-07-28T00:00:00.000Z",
        is_abandoned: true,
      }),
    ];
    expect(deferredRestHpPenalties(tasks)).toEqual([]);
  });

  test("mélange : seules les tâches deferred_at non-null et actives sortent", () => {
    const tasks = [
      makeTask({ id: "active", deferred_at: "2026-07-28T00:00:00.000Z" }),
      makeTask({ id: "normal", deferred_at: null }),
      makeTask({
        id: "done",
        deferred_at: "2026-07-28T00:00:00.000Z",
        is_completed: true,
      }),
      makeTask({
        id: "abandoned",
        deferred_at: "2026-07-28T00:00:00.000Z",
        is_abandoned: true,
      }),
    ];
    expect(deferredRestHpPenalties(tasks)).toEqual([
      { ...tasks[0], weight: HERO_DAMAGE_PER_OVERDUE_TASK },
    ]);
  });
});

describe("missedDeadlineTasks (US-05)", () => {
  const now = new Date("2026-07-22T14:00:00.000Z");

  test("retient une tâche dont la deadline est dépassée et non résolue", () => {
    const tasks = [makeTask({ id: "1", deadline_at: "2026-07-22T13:00:00.000Z" })];
    expect(missedDeadlineTasks(tasks, now)).toEqual(tasks);
  });

  test("ignore une deadline pas encore atteinte", () => {
    const tasks = [makeTask({ id: "1", deadline_at: "2026-07-22T15:00:00.000Z" })];
    expect(missedDeadlineTasks(tasks, now)).toEqual([]);
  });

  test("ignore une tâche sans deadline", () => {
    expect(missedDeadlineTasks([makeTask({ id: "1", deadline_at: null })], now)).toEqual([]);
  });

  test("ignore une deadline dépassée mais déjà complétée ou abandonnée", () => {
    const tasks = [
      makeTask({ id: "1", deadline_at: "2026-07-22T13:00:00.000Z", is_completed: true }),
      makeTask({ id: "2", deadline_at: "2026-07-22T13:00:00.000Z", is_abandoned: true }),
    ];
    expect(missedDeadlineTasks(tasks, now)).toEqual([]);
  });

  test("une deadline pile égale à l'heure courante compte comme ratée", () => {
    const tasks = [makeTask({ id: "1", deadline_at: "2026-07-22T14:00:00.000Z" })];
    expect(missedDeadlineTasks(tasks, now)).toEqual(tasks);
  });
});

describe("upcomingDeadlineCount (US-05)", () => {
  const now = new Date("2026-07-22T14:00:00.000Z");

  test("compte les deadlines actives pas encore dépassées", () => {
    const tasks = [
      makeTask({ id: "1", deadline_at: "2026-07-22T15:00:00.000Z" }),
      makeTask({ id: "2", deadline_at: "2026-07-22T16:00:00.000Z" }),
      makeTask({ id: "3", deadline_at: "2026-07-22T13:00:00.000Z" }), // déjà ratée
      makeTask({ id: "4", deadline_at: null }),
    ];
    expect(upcomingDeadlineCount(tasks, now)).toBe(2);
  });

  test("0 quand aucune tâche n'a de deadline", () => {
    expect(upcomingDeadlineCount([makeTask({ id: "1" })], now)).toBe(0);
  });
});

describe("deadlineHpPenalties (US-05)", () => {
  test("attribue le poids -10 à chaque deadline ratée", () => {
    const tasks = [makeTask({ id: "1" })];
    expect(deadlineHpPenalties(tasks)).toEqual([{ ...tasks[0], weight: 10 }]);
  });
});

describe("deadlineIso / localTimeFromIso (US-05, conversion heure locale <-> ISO)", () => {
  test("construit l'ISO UTC d'une heure locale Europe/Paris (UTC+2 en été)", () => {
    expect(deadlineIso("2026-07-22", "14:00", "Europe/Paris")).toBe(
      "2026-07-22T12:00:00.000Z",
    );
  });

  test("construit l'ISO UTC d'une heure locale déjà en UTC", () => {
    expect(deadlineIso("2026-07-22", "09:30", "UTC")).toBe("2026-07-22T09:30:00.000Z");
  });

  test("round-trip : localTimeFromIso restitue la même heure locale (Europe/Paris)", () => {
    const iso = deadlineIso("2026-07-22", "14:00", "Europe/Paris");
    expect(localTimeFromIso(iso, "Europe/Paris")).toBe("14:00");
  });

  test("round-trip sur un fuseau à décalage négatif (America/New_York)", () => {
    const iso = deadlineIso("2026-07-22", "08:15", "America/New_York");
    expect(localTimeFromIso(iso, "America/New_York")).toBe("08:15");
  });

  test("round-trip sur minuit pile", () => {
    const iso = deadlineIso("2026-07-22", "00:00", "Europe/Paris");
    expect(localTimeFromIso(iso, "Europe/Paris")).toBe("00:00");
  });

  test("passage à l'heure d'été Europe/Paris : 01:30 (pré-transition, CET +1) reste correct", () => {
    // 2026-03-29 : Europe/Paris passe de CET (+1) à CEST (+2) à 02h00 locale
    // (01h00 UTC). 01:30 locale est une heure valide PRE-transition (+1) ;
    // un offset probé au mauvais instant (naïf, déjà post-transition à +2)
    // renverrait à tort 23:30 UTC la veille au lieu de 00:30.
    const iso = deadlineIso("2026-03-29", "01:30", "Europe/Paris");
    expect(iso).toBe("2026-03-29T00:30:00.000Z");
    expect(localTimeFromIso(iso, "Europe/Paris")).toBe("01:30");
  });
});

describe("koOutcome (US-16, palier PERFECT/K.O.)", () => {
  test("transition → 0 avec Héro plein = perfect", () => {
    expect(koOutcome(20, 0, 100, 100)).toBe("perfect");
  });

  test("transition → 0 avec Héro entamé = ko", () => {
    expect(koOutcome(20, 0, 100, 80)).toBe("ko");
  });

  test("nextBossHp > 0 = null (pas terrassé)", () => {
    expect(koOutcome(40, 20, 100, 100)).toBeNull();
  });

  test("jour vide (bossMaxHp 0) = null", () => {
    expect(koOutcome(0, 0, 0, 100)).toBeNull();
  });

  test("déjà à 0 sans renaissance (prevBossHp 0) = null", () => {
    expect(koOutcome(0, 0, 100, 100)).toBeNull();
  });

  test("renaissance puis re-KO re-déclenche", () => {
    // Boss ressuscité à 20 (prev), retombe à 0 → nouvelle transition valide.
    expect(koOutcome(20, 0, 100, 100)).toBe("perfect");
  });
});

describe("comboLabel / comboIntensity (juice combo)", () => {
  test("pas de combo sous 2 coups", () => {
    expect(comboLabel(0)).toBeNull();
    expect(comboLabel(1)).toBeNull();
    expect(comboIntensity(1)).toBe(0);
  });

  test("paliers escaladés avec compteur", () => {
    expect(comboLabel(2)).toBe("DOUBLE COUP !");
    expect(comboLabel(3)).toBe("COMBO ×3");
    expect(comboLabel(5)).toBe("SÉRIE BRUTALE ×5");
    expect(comboLabel(7)).toBe("COMBO DÉVASTATEUR ×7");
    expect(comboLabel(12)).toBe("M-M-MONSTER COMBO ×12 !!");
  });

  test("intensité croissante", () => {
    expect(comboIntensity(2)).toBe(0);
    expect(comboIntensity(3)).toBe(1);
    expect(comboIntensity(5)).toBe(2);
    expect(comboIntensity(8)).toBe(3);
    expect(comboIntensity(10)).toBe(4);
  });
});

describe("weekdayOf (US-17)", () => {
  test("lundi=0 … dimanche=6 (ancre : 2021-01-04 est un lundi)", () => {
    expect(weekdayOf("2021-01-04")).toBe(0); // lundi
    expect(weekdayOf("2021-01-05")).toBe(1); // mardi
    expect(weekdayOf("2021-01-10")).toBe(6); // dimanche
  });
});

describe("shouldGenerate (US-17)", () => {
  const tpl = { id: "A", weekdays: [0, 2, 4], is_active: true };

  test("jour inclus dans la règle → true", () => {
    expect(shouldGenerate(tpl, "2021-01-04")).toBe(true); // lundi (0)
  });

  test("jour exclu → false", () => {
    expect(shouldGenerate(tpl, "2021-01-05")).toBe(false); // mardi (1)
  });

  test("template inactif → false", () => {
    expect(shouldGenerate({ ...tpl, is_active: false }, "2021-01-04")).toBe(false);
  });

  test("jour de repos → false", () => {
    expect(shouldGenerate(tpl, "2021-01-04", new Set(["A"]))).toBe(false);
  });
});

describe("planRecurringGeneration (US-17)", () => {
  const monday = "2021-01-04"; // weekday 0
  const templates = [
    { id: "A", weekdays: [0], is_active: true }, // matche lundi
    { id: "B", weekdays: [1], is_active: true }, // mardi, pas aujourd'hui
    { id: "C", weekdays: [0], is_active: false }, // inactif
  ];

  test("génère pour les templates du jour (exclut hors-jour et inactifs)", () => {
    expect(planRecurringGeneration(templates, monday, new Set())).toEqual(["A"]);
  });

  test("saute si une instance existe déjà pour aujourd'hui (D5)", () => {
    expect(planRecurringGeneration(templates, monday, new Set(["A"]))).toEqual([]);
  });

  test("saute si jour de repos (A2)", () => {
    expect(
      planRecurringGeneration(templates, monday, new Set(), new Set(["A"])),
    ).toEqual([]);
  });
});

describe("tableauChasseStats (US-10)", () => {
  const days: Array<{ day_date: string; outcome: "victory" | "defeat" | "retreat"; damage_dealt: number; gold_earned: number }> = [
    { day_date: "2026-07-14", outcome: "victory", damage_dealt: 60, gold_earned: 40 },
    { day_date: "2026-07-15", outcome: "defeat", damage_dealt: 40, gold_earned: 25 },
    { day_date: "2026-07-16", outcome: "victory", damage_dealt: 100, gold_earned: 72 },
    { day_date: "2026-07-17", outcome: "retreat", damage_dealt: 0, gold_earned: 0 },
  ];

  test("totaux, victoires et win-rate", () => {
    const s = tableauChasseStats(days);
    expect(s.totalDays).toBe(4);
    expect(s.totalVictories).toBe(2);
    expect(s.winRate).toBeCloseTo(0.5);
    expect(s.totalDamage).toBe(200);
    expect(s.goldAllTime).toBe(137);
  });

  test("meilleur jour = dégâts max", () => {
    expect(tableauChasseStats(days).bestDay).toEqual({ day_date: "2026-07-16", damage: 100 });
  });

  test("dataset vide : pas de division par zéro, bestDay null", () => {
    const s = tableauChasseStats([]);
    expect(s.winRate).toBe(0);
    expect(s.totalDays).toBe(0);
    expect(s.bestDay).toBeNull();
    expect(s.damageSeries).toEqual([]);
  });

  test("égalité de dégâts départagée par la date la plus récente", () => {
    const tie = [
      { day_date: "2026-07-10", outcome: "victory" as const, damage_dealt: 80, gold_earned: 0 },
      { day_date: "2026-07-12", outcome: "victory" as const, damage_dealt: 80, gold_earned: 0 },
    ];
    expect(tableauChasseStats(tie).bestDay?.day_date).toBe("2026-07-12");
  });

  test("damageSeries chronologique, borné à seriesLength", () => {
    expect(tableauChasseStats(days).damageSeries).toEqual([60, 40, 100, 0]);
    expect(tableauChasseStats(days, 2).damageSeries).toEqual([100, 0]);
  });

  test("bestDay null si tous à 0 dégât", () => {
    const zeros = [
      { day_date: "2026-07-10", outcome: "defeat" as const, damage_dealt: 0, gold_earned: 0 },
    ];
    expect(tableauChasseStats(zeros).bestDay).toBeNull();
  });
});

describe("applyRageQuitPenalty (US-15)", () => {
  test("retire 5 XP quand xp ≥ 5", () => {
    expect(applyRageQuitPenalty({ level: 2, xp: 40 })).toEqual({ level: 2, xp: 35 });
    expect(RAGE_QUIT_XP_PENALTY).toBe(5);
  });

  test("clampe à 0 sans de-level quand xp < 5", () => {
    expect(applyRageQuitPenalty({ level: 3, xp: 3 })).toEqual({ level: 3, xp: 0 });
  });

  test("xp=0 niveau>1 : reste au même niveau, xp 0 (pas de de-level)", () => {
    expect(applyRageQuitPenalty({ level: 2, xp: 0 })).toEqual({ level: 2, xp: 0 });
  });
});

describe("collectAbandonCascade (US-15)", () => {
  const tasks = [
    makeTask({ id: "root", parent_id: null }),
    makeTask({ id: "c1", parent_id: "root" }),
    makeTask({ id: "c2", parent_id: "root", is_completed: true }),
    makeTask({ id: "c3", parent_id: "root", is_abandoned: true }),
    makeTask({ id: "solo", parent_id: null }),
  ];

  test("racine → elle + ses sous-tâches actives (exclut complétées/abandonnées)", () => {
    expect(collectAbandonCascade("root", tasks).sort()).toEqual(["c1", "root"]);
  });

  test("sous-tâche seule ne cascade pas", () => {
    expect(collectAbandonCascade("c1", tasks)).toEqual(["c1"]);
  });

  test("cible déjà complétée ou abandonnée = aucune", () => {
    expect(collectAbandonCascade("c2", tasks)).toEqual([]);
    expect(collectAbandonCascade("c3", tasks)).toEqual([]);
  });

  test("cible inconnue = aucune", () => {
    expect(collectAbandonCascade("ghost", tasks)).toEqual([]);
  });
});

describe("isNestableParent (US-04, RG-01)", () => {
  test("une tâche racine est nestable", () => {
    expect(isNestableParent(makeTask({ parent_id: null }))).toBe(true);
  });

  test("une sous-tâche n'est pas nestable (2 niveaux max)", () => {
    expect(isNestableParent(makeTask({ parent_id: "parent-1" }))).toBe(false);
  });
});

describe("isOptimisticTask (US-04/US-19)", () => {
  test("id client provisoire (optimistic-N) détecté", () => {
    expect(isOptimisticTask(makeTask({ id: "optimistic-3" }))).toBe(true);
  });

  test("vrai UUID serveur non détecté comme optimiste", () => {
    expect(isOptimisticTask(makeTask({ id: "9f6d9ad2-28a2-4e94-aa58-b73ca74641b5" }))).toBe(
      false,
    );
  });
});

// Fix #95/#96 : variante par id nu — utilisée par handlers Arena et server
// actions pour filtrer tôt les ids optimistic avant d'appeler Supabase.
describe("isOptimisticId (issues #95/#96)", () => {
  test("id client provisoire quelconque détecté", () => {
    expect(isOptimisticId("optimistic-1")).toBe(true);
    expect(isOptimisticId("optimistic-42")).toBe(true);
  });

  test("vrai UUID serveur non détecté comme optimiste", () => {
    expect(isOptimisticId("9f6d9ad2-28a2-4e94-aa58-b73ca74641b5")).toBe(false);
    expect(isOptimisticId("")).toBe(false);
  });
});

describe("nextSiblingPosition (US-04/US-19)", () => {
  test("0 pour une fratrie vide", () => {
    expect(nextSiblingPosition([])).toBe(0);
  });

  test("max + 1 pour une fratrie non vide", () => {
    const siblings = [makeTask({ position: 0 }), makeTask({ position: 3 })];
    expect(nextSiblingPosition(siblings)).toBe(4);
  });
});

describe("sortTasksHierarchically (US-04)", () => {
  test("tableau vide", () => {
    expect(sortTasksHierarchically([])).toEqual([]);
  });

  test("racines triées par position, entremêlées en entrée", () => {
    const tasks = [
      makeTask({ id: "b", parent_id: null, position: 1 }),
      makeTask({ id: "a", parent_id: null, position: 0 }),
    ];
    expect(sortTasksHierarchically(tasks).map((t) => t.id)).toEqual(["a", "b"]);
  });

  test("chaque racine est suivie de ses enfants triés par position", () => {
    const tasks = [
      makeTask({ id: "a", parent_id: null, position: 0 }),
      makeTask({ id: "b", parent_id: null, position: 1 }),
      makeTask({ id: "a2", parent_id: "a", position: 1 }),
      makeTask({ id: "a1", parent_id: "a", position: 0 }),
    ];
    expect(sortTasksHierarchically(tasks).map((t) => t.id)).toEqual([
      "a",
      "a1",
      "a2",
      "b",
    ]);
  });

  test("une tâche orpheline (parent absent du tableau) est traitée comme racine", () => {
    const tasks = [makeTask({ id: "orphan", parent_id: "ghost", position: 0 })];
    expect(sortTasksHierarchically(tasks).map((t) => t.id)).toEqual(["orphan"]);
  });
});

describe("planReorder (US-19, RG-01)", () => {
  test("moitié basse d'une tâche racine nestable : imbrique (append)", () => {
    const a = makeTask({ id: "a", parent_id: null, position: 0 });
    const b = makeTask({ id: "b", parent_id: null, position: 1 });
    const plan = planReorder("b", { overTaskId: "a", isTopHalf: false }, [a, b]);
    expect(plan).toEqual({ parentId: "a", orderedTaskIds: ["b"] });
  });

  test("moitié basse d'une tâche racine ayant déjà un enfant : ajoute à la fin", () => {
    const a = makeTask({ id: "a", parent_id: null, position: 0 });
    const a1 = makeTask({ id: "a1", parent_id: "a", position: 0 });
    const b = makeTask({ id: "b", parent_id: null, position: 1 });
    const plan = planReorder("b", { overTaskId: "a", isTopHalf: false }, [a, a1, b]);
    expect(plan).toEqual({ parentId: "a", orderedTaskIds: ["a1", "b"] });
  });

  test("moitié haute d'une tâche racine : réordonne avant elle, pas d'imbrication", () => {
    const a = makeTask({ id: "a", parent_id: null, position: 0 });
    const b = makeTask({ id: "b", parent_id: null, position: 1 });
    const plan = planReorder("b", { overTaskId: "a", isTopHalf: true }, [a, b]);
    expect(plan).toEqual({ parentId: null, orderedTaskIds: ["b", "a"] });
  });

  test("moitié haute d'une tâche racine promeut une sous-tâche en tâche (dé-nesting)", () => {
    const a = makeTask({ id: "a", parent_id: null, position: 0 });
    const a1 = makeTask({ id: "a1", parent_id: "a", position: 0 });
    const c = makeTask({ id: "c", parent_id: null, position: 1 });
    const plan = planReorder("a1", { overTaskId: "c", isTopHalf: true }, [a, a1, c]);
    expect(plan).toEqual({ parentId: null, orderedTaskIds: ["a", "a1", "c"] });
  });

  test("moitié haute d'une sous-tâche : réordonne avant elle, même parent", () => {
    const a = makeTask({ id: "a", parent_id: null, position: 0 });
    const a1 = makeTask({ id: "a1", parent_id: "a", position: 0 });
    const a2 = makeTask({ id: "a2", parent_id: "a", position: 1 });
    const plan = planReorder("a2", { overTaskId: "a1", isTopHalf: true }, [a, a1, a2]);
    expect(plan).toEqual({ parentId: "a", orderedTaskIds: ["a2", "a1"] });
  });

  test("moitié basse d'une sous-tâche : réordonne après elle (pas d'imbrication à 3 niveaux)", () => {
    const a = makeTask({ id: "a", parent_id: null, position: 0 });
    const a1 = makeTask({ id: "a1", parent_id: "a", position: 0 });
    const a2 = makeTask({ id: "a2", parent_id: "a", position: 1 });
    const plan = planReorder("a2", { overTaskId: "a1", isTopHalf: false }, [a, a1, a2]);
    expect(plan).toEqual({ parentId: "a", orderedTaskIds: ["a1", "a2"] });
  });

  test("refuse d'imbriquer une tâche qui a déjà des enfants", () => {
    const a = makeTask({ id: "a", parent_id: null, position: 0 });
    const a1 = makeTask({ id: "a1", parent_id: "a", position: 0 });
    const b = makeTask({ id: "b", parent_id: null, position: 1 });
    const plan = planReorder("a", { overTaskId: "b", isTopHalf: false }, [a, a1, b]);
    expect(plan).toBeNull();
  });

  test("dépose sur soi-même : aucun plan", () => {
    const a = makeTask({ id: "a", parent_id: null, position: 0 });
    expect(planReorder("a", { overTaskId: "a", isTopHalf: false }, [a])).toBeNull();
  });
});

describe("computeToggleCascade (sous-tâches — cocher en cascade)", () => {
  test("cocher une tâche racine sans sous-tâche : aucune cascade", () => {
    const a = makeTask({ id: "a", parent_id: null });
    expect(computeToggleCascade("a", true, [a])).toEqual([
      { taskId: "a", isCompleted: true },
    ]);
  });

  test("cocher une tâche racine coche toutes ses sous-tâches actives", () => {
    const a = makeTask({ id: "a", parent_id: null });
    const a1 = makeTask({ id: "a1", parent_id: "a" });
    const a2 = makeTask({ id: "a2", parent_id: "a" });
    const cascade = computeToggleCascade("a", true, [a, a1, a2]);
    expect(cascade).toEqual(
      expect.arrayContaining([
        { taskId: "a", isCompleted: true },
        { taskId: "a1", isCompleted: true },
        { taskId: "a2", isCompleted: true },
      ]),
    );
    expect(cascade).toHaveLength(3);
  });

  test("cocher une tâche racine ignore les sous-tâches abandonnées", () => {
    const a = makeTask({ id: "a", parent_id: null });
    const a1 = makeTask({ id: "a1", parent_id: "a", is_abandoned: true });
    expect(computeToggleCascade("a", true, [a, a1])).toEqual([
      { taskId: "a", isCompleted: true },
    ]);
  });

  test("décocher une tâche racine décoche toutes ses sous-tâches", () => {
    const a = makeTask({ id: "a", parent_id: null, is_completed: true });
    const a1 = makeTask({ id: "a1", parent_id: "a", is_completed: true });
    const cascade = computeToggleCascade("a", false, [a, a1]);
    expect(cascade).toEqual(
      expect.arrayContaining([
        { taskId: "a", isCompleted: false },
        { taskId: "a1", isCompleted: false },
      ]),
    );
    expect(cascade).toHaveLength(2);
  });

  test("cocher la dernière sous-tâche incomplète coche automatiquement le parent", () => {
    const a = makeTask({ id: "a", parent_id: null });
    const a1 = makeTask({ id: "a1", parent_id: "a", is_completed: true });
    const a2 = makeTask({ id: "a2", parent_id: "a", is_completed: false });
    const cascade = computeToggleCascade("a2", true, [a, a1, a2]);
    expect(cascade).toEqual(
      expect.arrayContaining([
        { taskId: "a2", isCompleted: true },
        { taskId: "a", isCompleted: true },
      ]),
    );
    expect(cascade).toHaveLength(2);
  });

  test("cocher une sous-tâche sans compléter toutes les autres ne touche pas le parent", () => {
    const a = makeTask({ id: "a", parent_id: null });
    const a1 = makeTask({ id: "a1", parent_id: "a", is_completed: false });
    const a2 = makeTask({ id: "a2", parent_id: "a", is_completed: false });
    expect(computeToggleCascade("a1", true, [a, a1, a2])).toEqual([
      { taskId: "a1", isCompleted: true },
    ]);
  });

  test("décocher une sous-tâche décoche automatiquement un parent déjà complété", () => {
    const a = makeTask({ id: "a", parent_id: null, is_completed: true });
    const a1 = makeTask({ id: "a1", parent_id: "a", is_completed: true });
    const a2 = makeTask({ id: "a2", parent_id: "a", is_completed: true });
    const cascade = computeToggleCascade("a1", false, [a, a1, a2]);
    expect(cascade).toEqual(
      expect.arrayContaining([
        { taskId: "a1", isCompleted: false },
        { taskId: "a", isCompleted: false },
      ]),
    );
    expect(cascade).toHaveLength(2);
  });

  test("déjà dans l'état demandé : aucune cascade", () => {
    const a = makeTask({ id: "a", parent_id: null, is_completed: true });
    expect(computeToggleCascade("a", true, [a])).toEqual([]);
  });

  test("tâche introuvable : aucune cascade", () => {
    expect(computeToggleCascade("ghost", true, [])).toEqual([]);
  });
});

describe("xpThresholdForLevel (US-09)", () => {
  test("le seuil du niveau 1 est 100 XP", () => {
    expect(xpThresholdForLevel(1)).toBe(100);
  });

  test("le seuil croît avec le niveau (niveau × 100)", () => {
    expect(xpThresholdForLevel(2)).toBe(200);
    expect(xpThresholdForLevel(3)).toBe(300);
  });
});

describe("applyXpDelta (US-09)", () => {
  test("gain simple, sans franchissement de seuil", () => {
    const result = applyXpDelta({ level: 1, xp: 0 }, XP_PER_TASK);
    expect(result).toEqual({ level: 1, xp: 30 });
  });

  test("gain qui franchit exactement un seuil (exemple du spec : 80 + 30 → niveau 2, xp 10)", () => {
    const result = applyXpDelta({ level: 1, xp: 80 }, XP_PER_TASK);
    expect(result).toEqual({ level: 2, xp: 10 });
  });

  test("gain qui franchit plusieurs seuils en cascade", () => {
    const result = applyXpDelta({ level: 1, xp: 0 }, 350);
    expect(result).toEqual({ level: 3, xp: 50 });
  });

  test("perte simple, sans passage sous 0", () => {
    const result = applyXpDelta({ level: 2, xp: 50 }, -XP_PER_TASK);
    expect(result).toEqual({ level: 2, xp: 20 });
  });

  test("perte qui fait redescendre un niveau (symétrique au gain qui l'a franchi)", () => {
    const result = applyXpDelta({ level: 2, xp: 10 }, -XP_PER_TASK);
    expect(result).toEqual({ level: 1, xp: 80 });
  });

  test("perte qui fait redescendre plusieurs niveaux en cascade", () => {
    const result = applyXpDelta({ level: 3, xp: 50 }, -350);
    expect(result).toEqual({ level: 1, xp: 0 });
  });

  test("plancher : niveau 1 / xp 0, jamais négatif", () => {
    const result = applyXpDelta({ level: 1, xp: 10 }, -50);
    expect(result).toEqual({ level: 1, xp: 0 });
  });

  test("symétrie stricte : gagner puis perdre le même montant restitue l'état de départ", () => {
    const initial = { level: 1, xp: 80 };
    const afterGain = applyXpDelta(initial, XP_PER_TASK);
    const afterLoss = applyXpDelta(afterGain, -XP_PER_TASK);
    expect(afterLoss).toEqual(initial);
  });

  test("XP_THRESHOLD_PER_LEVEL vaut 100", () => {
    expect(XP_THRESHOLD_PER_LEVEL).toBe(100);
  });
});

describe("dayKey", () => {
  it("retourne la date calendaire locale, pas UTC", () => {
    const instant = new Date("2026-07-20T23:30:00Z");
    expect(dayKey(instant, "Europe/Paris")).toBe("2026-07-21");
    expect(dayKey(instant, "UTC")).toBe("2026-07-20");
  });

  it("gère le passage de minuit dans l'autre sens", () => {
    const instant = new Date("2026-07-20T02:00:00Z");
    expect(dayKey(instant, "America/New_York")).toBe("2026-07-19");
  });
});

describe("summarizeDay", () => {
  const t = (
    over: Partial<{ parent_id: string | null; is_completed: boolean; is_abandoned: boolean }>,
  ) => ({ parent_id: null, is_completed: false, is_abandoned: false, ...over });

  it("victoire : toutes les tâches complétées, Boss à 0", () => {
    const s = summarizeDay([t({ is_completed: true }), t({ is_completed: true })], "manual");
    expect(s.outcome).toBe("victory");
    expect(s.bossMaxHp).toBe(40);
    expect(s.damageDealt).toBe(40);
    expect(s.tasksCompleted).toBe(2);
    expect(s.xpEarned).toBe(60);
  });

  it("retraite : clôture manuelle Boss vivant", () => {
    const s = summarizeDay([t({ is_completed: true }), t({})], "manual");
    expect(s.outcome).toBe("retreat");
    expect(s.damageDealt).toBe(20);
  });

  it("défaite : backfill Boss vivant", () => {
    const s = summarizeDay([t({ is_completed: true }), t({})], "backfill");
    expect(s.outcome).toBe("defeat");
  });

  it("sous-tâche vaut 10 HP, tâches abandonnées comptées à part", () => {
    const s = summarizeDay(
      [
        t({ is_completed: true }),
        t({ parent_id: "p", is_completed: true }),
        t({ is_abandoned: true }),
      ],
      "manual",
    );
    expect(s.bossMaxHp).toBe(30);
    expect(s.tasksAbandoned).toBe(1);
  });
});

describe("planWakeUp", () => {
  const w = (
    over: Partial<{
      id: string;
      parent_id: string | null;
      title: string;
      day_date: string;
      position: number;
      is_completed: boolean;
      is_abandoned: boolean;
    }>,
  ) => ({
    id: "x",
    parent_id: null,
    title: "t",
    day_date: "2026-07-19",
    position: 0,
    is_completed: false,
    is_abandoned: false,
    ...over,
  });

  it("groupe par jour (plus ancien d'abord) et niche les sous-tâches", () => {
    const groups = planWakeUp([
      w({ id: "a", day_date: "2026-07-19", position: 0 }),
      w({ id: "a1", parent_id: "a", day_date: "2026-07-19", position: 0 }),
      w({ id: "b", day_date: "2026-07-18", position: 0 }),
    ]);
    expect(groups.map((g) => g.dayDate)).toEqual(["2026-07-18", "2026-07-19"]);
    const dayA = groups.find((g) => g.dayDate === "2026-07-19");
    expect(dayA?.roots).toHaveLength(1);
    expect(dayA?.roots[0].children.map((c) => c.id)).toEqual(["a1"]);
  });

  it("exclut les tâches complétées ou abandonnées", () => {
    const groups = planWakeUp([
      w({ id: "done", is_completed: true }),
      w({ id: "gone", is_abandoned: true }),
      w({ id: "live" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].roots[0].task.id).toBe("live");
  });

  it("promeut une sous-tâche orpheline en racine standalone", () => {
    const groups = planWakeUp([
      w({ id: "orphan", parent_id: "completed-parent", day_date: "2026-07-19" }),
    ]);
    expect(groups[0].roots[0].task.id).toBe("orphan");
  });
});

describe("weekKey", () => {
  it("lundi et dimanche de la même semaine ISO partagent la clé", () => {
    // 2026-07-13 = lundi, 2026-07-19 = dimanche
    expect(weekKey("2026-07-13")).toBe(weekKey("2026-07-19"));
  });
  it("lundi suivant change de semaine", () => {
    expect(weekKey("2026-07-19")).not.toBe(weekKey("2026-07-20"));
  });
});

describe("currentStreak", () => {
  it("compte les victoires consécutives depuis aujourd'hui", () => {
    const rows = [
      { day_date: "2026-07-20", outcome: "victory" as const },
      { day_date: "2026-07-19", outcome: "victory" as const },
    ];
    expect(currentStreak(rows, "2026-07-20").length).toBe(2);
  });

  it("démarre la veille si aujourd'hui n'a pas encore de résultat", () => {
    const rows = [{ day_date: "2026-07-19", outcome: "victory" as const }];
    expect(currentStreak(rows, "2026-07-20").length).toBe(1);
  });

  it("un trou isolé est toléré (joker), ne casse pas", () => {
    const rows = [
      { day_date: "2026-07-20", outcome: "victory" as const },
      { day_date: "2026-07-18", outcome: "victory" as const },
    ];
    expect(currentStreak(rows, "2026-07-20").length).toBe(2);
  });

  it("une 3e non-victoire dans la même semaine casse la série", () => {
    const rows = [
      { day_date: "2026-07-17", outcome: "victory" as const }, // vendredi
      { day_date: "2026-07-16", outcome: "retreat" as const },
      { day_date: "2026-07-15", outcome: "defeat" as const },
      { day_date: "2026-07-14", outcome: "retreat" as const }, // 3e non-victoire
      { day_date: "2026-07-13", outcome: "victory" as const },
    ];
    expect(currentStreak(rows, "2026-07-17").length).toBe(1);
  });

  it("2 non-victoires par semaine sur 2 semaines : toléré", () => {
    const rows = [
      { day_date: "2026-07-20", outcome: "victory" as const }, // lundi (sem. B)
      { day_date: "2026-07-19", outcome: "retreat" as const }, // sem. A
      { day_date: "2026-07-18", outcome: "retreat" as const }, // sem. A (2/2)
      { day_date: "2026-07-17", outcome: "victory" as const }, // sem. A
    ];
    expect(currentStreak(rows, "2026-07-20").length).toBe(2);
  });

  it("atRisk quand 2 jokers consommés dans la semaine courante", () => {
    const rows = [
      { day_date: "2026-07-22", outcome: "retreat" as const },
      { day_date: "2026-07-21", outcome: "retreat" as const },
      { day_date: "2026-07-20", outcome: "victory" as const },
    ];
    const s = currentStreak(rows, "2026-07-22");
    expect(s.jokersUsedThisWeek).toBe(2);
    expect(s.atRisk).toBe(true);
  });

  it("aucun résultat = série 0, pas à risque", () => {
    expect(currentStreak([], "2026-07-20")).toEqual({
      length: 0,
      jokersUsedThisWeek: 0,
      atRisk: false,
    });
  });

  it("détecte une série de 100 jours quand l'historique fourni couvre au moins 100 jours (audit #67, PR4)", () => {
    // Verrouille le bug : un appelant qui borne sa requête à 60 jours (comme
    // app/page.tsx avant fix) ne peut structurellement jamais faire détecter
    // le palier 100 (titre "Esprit Vide") par cette fonction, même avec 100+ jours
    // de victoires réelles en base — la fonction s'arrête à `earliest`, la
    // date la plus ancienne du tableau REÇU, pas de l'historique réel.
    const today = "2026-07-24";
    const rows = Array.from({ length: 120 }, (_, i) => {
      const d = new Date(`${today}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() - i);
      return { day_date: d.toISOString().slice(0, 10), outcome: "victory" as const };
    });
    expect(currentStreak(rows, today).length).toBeGreaterThanOrEqual(100);
    // Avec seulement 60 jours fournis (le bug), le palier 100 est hors de portée.
    expect(currentStreak(rows.slice(0, 60), today).length).toBeLessThan(100);
  });
});

describe("titleForStreak", () => {
  it("renvoie null sous le premier palier", () => {
    expect(titleForStreak(0)).toBeNull();
    expect(titleForStreak(6)).toBeNull();
  });
  it("paliers 7 / 30 / 100", () => {
    expect(titleForStreak(7)).toBe("Calme");
    expect(titleForStreak(30)).toBe("Silence");
    expect(titleForStreak(100)).toBe("Esprit Vide");
  });
});
