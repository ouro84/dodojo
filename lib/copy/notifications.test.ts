import { describe, expect, test } from "vitest";
import { buildReminderPayload } from "./notifications";

const metrics = { remainingTaskCount: 3, remainingHp: 30 };

describe("buildReminderPayload — direct", () => {
  test("titre et deep-link fixes, quel que soit le gabarit tiré", () => {
    const payload = buildReminderPayload(metrics, "direct", () => 0);
    expect(payload.title).toBe("Dodojo — Le Boss t'attend");
    expect(payload.url).toBe("/");
  });

  test("un gabarit 'tasks' utilise remainingTaskCount, jamais remainingHp", () => {
    const payload = buildReminderPayload({ remainingTaskCount: 1, remainingHp: 99 }, "direct", () => 0);
    expect(payload.body).toContain("1 tâche");
    expect(payload.body).not.toContain("99");
  });

  test("un gabarit 'hp' utilise remainingHp, jamais remainingTaskCount", () => {
    const payload = buildReminderPayload({ remainingTaskCount: 99, remainingHp: 1 }, "direct", () => 1);
    expect(payload.body).toContain("1 point de vie");
    expect(payload.body).not.toContain("99");
  });

  test("accorde au singulier quand il reste 1 unité", () => {
    const payload = buildReminderPayload({ remainingTaskCount: 1, remainingHp: 1 }, "direct", () => 0);
    expect(payload.body).toContain("1 tâche");
    expect(payload.body).not.toContain("tâches");
  });

  test("accorde au pluriel quand il reste plusieurs unités", () => {
    const payload = buildReminderPayload({ remainingTaskCount: 4, remainingHp: 4 }, "direct", () => 0);
    expect(payload.body).toContain("4 tâches");
  });

  test("pickIndex sélectionne le gabarit correspondant (index 2)", () => {
    const payload = buildReminderPayload(metrics, "direct", () => 2);
    expect(payload.body).toContain("La journée s'achève");
  });

  test("pickIndex hors bornes retombe sur le premier gabarit", () => {
    const payload = buildReminderPayload(metrics, "direct", () => 99);
    expect(payload.body).toContain("Le Boss ricane");
  });
});

describe("buildReminderPayload — niveaux", () => {
  test("doux reste sans juron sur tous les gabarits", () => {
    for (let i = 0; i < 6; i++) {
      const payload = buildReminderPayload(metrics, "doux", () => i);
      expect(payload.body).not.toMatch(/putain|bordel|merde|\bcon\b|connard|foutre/);
    }
  });

  test("brut élargit le vocabulaire", () => {
    const payload = buildReminderPayload(metrics, "brut", () => 0);
    expect(payload.body).toMatch(/marre/);
  });

  test("6 gabarits disponibles par niveau, tous distincts", () => {
    const bodies = new Set<string>();
    for (let i = 0; i < 6; i++) bodies.add(buildReminderPayload(metrics, "direct", () => i).body);
    expect(bodies.size).toBe(6);
  });
});

describe("buildReminderPayload — fiction : un seul Boss par jour (issue #160)", () => {
  test("aucun gabarit, à aucun niveau, ne personnifie plusieurs monstres/adversaires", () => {
    for (const level of ["doux", "direct", "brut"] as const) {
      for (let i = 0; i < 6; i++) {
        const payload = buildReminderPayload(metrics, level, () => i);
        expect(payload.body).not.toMatch(/monstres?\b/i);
        expect(payload.body).not.toMatch(/adversaires?\b/i);
      }
    }
  });
});
