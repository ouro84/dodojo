import { describe, expect, it, test } from "vitest";
import {
  applyXpDelta,
  calculateBossCurrentHp,
  calculateBossMaxHp,
  calculateHeroHp,
  computeGoldEarned,
  computeToggleCascade,
  currentStreak,
  goldBalance,
  titleForStreak,
  weekKey,
  dayKey,
  isNestableParent,
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
    is_recurring: false,
    deadline_at: null,
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
  it("solde = somme des gains moins somme des achats", () => {
    expect(
      goldBalance([{ gold_earned: 50 }, { gold_earned: 60 }], [{ price_paid: 40 }]),
    ).toBe(70);
  });
  it("nouvel utilisateur = 0", () => {
    expect(goldBalance([], [])).toBe(0);
  });
  it("héros par défaut price_paid 0 n'affecte pas le solde", () => {
    expect(goldBalance([{ gold_earned: 50 }], [{ price_paid: 0 }])).toBe(50);
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

describe("calculateHeroHp (pénalité procrastination)", () => {
  test("100 HP quand aucune tâche n'est en retard", () => {
    expect(calculateHeroHp([])).toBe(100);
  });

  test("retire 20 HP par tâche en retard non résolue", () => {
    const tasks = [
      makeTask({ id: "1" }),
      makeTask({ id: "2" }),
    ];
    expect(calculateHeroHp(tasks)).toBe(60);
  });

  test("ignore les tâches en retard déjà complétées ou abandonnées", () => {
    const tasks = [
      makeTask({ id: "1", is_completed: true }),
      makeTask({ id: "2", is_abandoned: true }),
      makeTask({ id: "3" }),
    ];
    expect(calculateHeroHp(tasks)).toBe(80);
  });

  test("plafonne à 0, jamais négatif", () => {
    const tasks = Array.from({ length: 10 }, (_, i) => makeTask({ id: `t${i}` }));
    expect(calculateHeroHp(tasks)).toBe(0);
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
});

describe("titleForStreak", () => {
  it("renvoie null sous le premier palier", () => {
    expect(titleForStreak(0)).toBeNull();
    expect(titleForStreak(6)).toBeNull();
  });
  it("paliers 7 / 30 / 100", () => {
    expect(titleForStreak(7)).toBe("Ceinture Jaune");
    expect(titleForStreak(30)).toBe("Ceinture Noire");
    expect(titleForStreak(100)).toBe("Sensei");
  });
});
