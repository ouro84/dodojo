import { describe, expect, test } from "vitest";
import { deadlineAlertLine } from "./deadline";

const FORBIDDEN_SENSEI = /putain|bordel|merde|\bcon\b|connard|foutre/;

describe("Attaque Surprise (deadline ratée)", () => {
  test("pool d'au moins 5 variantes, seed stable", () => {
    const args = { taskTitle: "Appeler le client", damage: 10 };
    const seen = new Set<string>();
    for (let seed = 0; seed < 5; seed++) seen.add(deadlineAlertLine("sparring", args, seed));
    expect(seen.size).toBeGreaterThanOrEqual(5);
    expect(deadlineAlertLine("sparring", args, 2)).toBe(deadlineAlertLine("sparring", args, 2));
  });

  test("sensei reste sans juron, street élargit sur tout le pool", () => {
    const args = { taskTitle: "X", damage: 10 };
    for (let seed = 0; seed < 5; seed++) {
      expect(deadlineAlertLine("sensei", args, seed)).not.toMatch(FORBIDDEN_SENSEI);
    }
    const jurons = Array.from({ length: 5 }, (_, seed) => deadlineAlertLine("street", args, seed)).some((line) =>
      /merde|bordel|putain/i.test(line),
    );
    expect(jurons).toBe(true);
  });
});
