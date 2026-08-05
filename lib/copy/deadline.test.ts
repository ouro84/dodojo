import { describe, expect, test } from "vitest";
import { buildDeadlineReminderPayload, deadlineAlertLine } from "./deadline";

const FORBIDDEN_DOUX = /putain|bordel|merde|\bcon\b|connard|foutre/;

describe("Attaque Surprise (deadline ratée)", () => {
  test("pool d'au moins 5 variantes, seed stable", () => {
    const args = { taskTitle: "Appeler le client", damage: 10 };
    const seen = new Set<string>();
    for (let seed = 0; seed < 5; seed++) seen.add(deadlineAlertLine("direct", args, seed));
    expect(seen.size).toBeGreaterThanOrEqual(5);
    expect(deadlineAlertLine("direct", args, 2)).toBe(deadlineAlertLine("direct", args, 2));
  });

  test("doux reste sans juron, brut élargit sur tout le pool", () => {
    const args = { taskTitle: "X", damage: 10 };
    for (let seed = 0; seed < 5; seed++) {
      expect(deadlineAlertLine("doux", args, seed)).not.toMatch(FORBIDDEN_DOUX);
    }
    const jurons = Array.from({ length: 5 }, (_, seed) => deadlineAlertLine("brut", args, seed)).some((line) =>
      /merde|bordel|putain/i.test(line),
    );
    expect(jurons).toBe(true);
  });
});

describe("buildDeadlineReminderPayload", () => {
  const levels = ["doux", "direct", "brut"] as const;

  test("chaque niveau produit un body non vide pour un offset > 0", () => {
    for (const level of levels) {
      const payload = buildDeadlineReminderPayload("Ranger la chambre", 15, level, 0);
      expect(payload.body.length).toBeGreaterThan(0);
      expect(payload.title).toBe("Dodojo — Deadline qui approche");
      expect(payload.url).toBe("/");
    }
  });

  test("gère offsetMinutes === 0 sans jamais écrire 'dans 0 min'", () => {
    for (const level of levels) {
      const payload = buildDeadlineReminderPayload("Ranger la chambre", 0, level, 0);
      expect(payload.body).not.toMatch(/dans 0 min/);
    }
  });

  test("le titre de la tâche apparaît dans le corps du message", () => {
    const payload = buildDeadlineReminderPayload("Appeler le dentiste", 10, "direct", 0);
    expect(payload.body).toContain("Appeler le dentiste");
  });

  test("le seed est déterministe (même seed → même variante)", () => {
    const a = buildDeadlineReminderPayload("Tâche", 10, "direct", 2);
    const b = buildDeadlineReminderPayload("Tâche", 10, "direct", 2);
    expect(a.body).toBe(b.body);
  });
});
