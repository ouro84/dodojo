import { describe, expect, test } from "vitest";
import { planningUnlockedLine } from "./planning";

const FORBIDDEN_DOUX = /putain|bordel|merde|\bcon\b|connard|foutre/;

describe("Ligne de La Voix — déblocage section Demain (issue #116)", () => {
  test("pool d'au moins 5 variantes, seed stable", () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 5; seed++) seen.add(planningUnlockedLine("direct", seed));
    expect(seen.size).toBeGreaterThanOrEqual(5);
    expect(planningUnlockedLine("direct", 2)).toBe(planningUnlockedLine("direct", 2));
  });

  test("doux reste sans juron, brut élargit sur tout le pool", () => {
    for (let seed = 0; seed < 5; seed++) {
      expect(planningUnlockedLine("doux", seed)).not.toMatch(FORBIDDEN_DOUX);
    }
    const jurons = Array.from({ length: 5 }, (_, seed) => planningUnlockedLine("brut", seed)).some(
      (line) => /merde|connard/i.test(line),
    );
    expect(jurons).toBe(true);
  });
});
