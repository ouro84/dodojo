import { describe, expect, test } from "vitest";
import {
  calculateBossCurrentHp,
  calculateBossMaxHp,
  calculateHeroHp,
  taskHpValue,
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
