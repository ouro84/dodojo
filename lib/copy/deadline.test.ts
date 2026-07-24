import { describe, expect, test } from "vitest";
import { deadlineAlertLine } from "./deadline";

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
