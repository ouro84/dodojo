import { describe, expect, test } from "vitest";
import {
  applyXpDelta,
  calculateBossCurrentHp,
  calculateBossMaxHp,
  calculateHeroHp,
  canNestTask,
  isNestableParent,
  nextSiblingPosition,
  sortTasksHierarchically,
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

describe("canNestTask (US-19, RG-01)", () => {
  test("cas nominal : deux tâches racines simples, imbrication autorisée", () => {
    const a = makeTask({ id: "a", parent_id: null });
    const b = makeTask({ id: "b", parent_id: null });
    expect(canNestTask(b, a, [a, b])).toEqual({ allowed: true });
  });

  test("refuse l'auto-nesting", () => {
    const a = makeTask({ id: "a", parent_id: null });
    expect(canNestTask(a, a, [a]).allowed).toBe(false);
  });

  test("refuse si la cible est déjà une sous-tâche (profondeur 3)", () => {
    const a = makeTask({ id: "a", parent_id: null });
    const b = makeTask({ id: "b", parent_id: "a" });
    const c = makeTask({ id: "c", parent_id: null });
    expect(canNestTask(c, b, [a, b, c]).allowed).toBe(false);
  });

  test("refuse si la tâche source a déjà des enfants", () => {
    const a = makeTask({ id: "a", parent_id: null });
    const a1 = makeTask({ id: "a1", parent_id: "a" });
    const b = makeTask({ id: "b", parent_id: null });
    expect(canNestTask(a, b, [a, a1, b]).allowed).toBe(false);
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
