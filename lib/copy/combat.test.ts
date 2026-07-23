import { describe, expect, test } from "vitest";
import {
  emptyStateTitle,
  emptyStateBody,
  levelUpTitle,
  levelUpBody,
  koHeader,
  koLine,
  milestoneLine,
} from "./combat";

const FORBIDDEN_SENSEI = /putain|bordel|merde|\bcon\b|connard|foutre/;

describe("empty state", () => {
  test("titre reste fixe (tag court, pas de pool)", () => {
    expect(emptyStateTitle("sparring")).toBe("Terrain vague.");
  });
  test("le corps a un pool d'au moins 5 variantes par niveau, seed stable", () => {
    const seenSparring = new Set<string>();
    for (let seed = 0; seed < 5; seed++) seenSparring.add(emptyStateBody("sparring", seed));
    expect(seenSparring.size).toBeGreaterThanOrEqual(5);
    expect(emptyStateBody("sparring", 2)).toBe(emptyStateBody("sparring", 2));
  });
  test("street est plus cru que sensei sur tout le pool", () => {
    for (let seed = 0; seed < 5; seed++) {
      expect(emptyStateBody("sensei", seed)).not.toMatch(FORBIDDEN_SENSEI);
    }
  });
});

describe("level up", () => {
  test("titre reste fixe", () => {
    expect(levelUpTitle("sparring")).toBe("Level Up !");
  });
  test("le corps a un pool d'au moins 5 variantes, seed stable", () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 5; seed++) seen.add(levelUpBody("sparring", 4, seed));
    expect(seen.size).toBeGreaterThanOrEqual(5);
    expect(levelUpBody("sparring", 4, 1)).toBe(levelUpBody("sparring", 4, 1));
  });
  test("street jure sur au moins une variante, sensei jamais", () => {
    const streetJurons = Array.from({ length: 5 }, (_, seed) => levelUpBody("street", 4, seed)).some(
      (line) => /putain|bordel/i.test(line),
    );
    expect(streetJurons).toBe(true);
    for (let seed = 0; seed < 5; seed++) {
      expect(levelUpBody("sensei", 4, seed)).not.toMatch(FORBIDDEN_SENSEI);
    }
  });
});

describe("Perfect / K.O.", () => {
  test("header reste fixe", () => {
    expect(koHeader("sparring", true)).toBe("Perfect !");
    expect(koHeader("sparring", false)).toBe("K.O. !");
  });

  test("koLine a un pool d'au moins 5 variantes par cas, seed stable", () => {
    const args = { isPerfect: true, firstVictory: false, username: "Thomas", bossName: "le Gardien de Glace" };
    const seen = new Set<string>();
    for (let seed = 0; seed < 5; seed++) seen.add(koLine("sparring", args, seed));
    expect(seen.size).toBeGreaterThanOrEqual(5);
    expect(koLine("sparring", args, 3)).toBe(koLine("sparring", args, 3));
  });

  test("jamais d'attaque personnelle contre le joueur, même en street, sur tout le pool", () => {
    const args = { isPerfect: true, firstVictory: false, username: "Thomas", bossName: "le Gardien de Glace" };
    for (let seed = 0; seed < 5; seed++) {
      expect(koLine("street", args, seed)).not.toMatch(/connard|\bcon\b/);
    }
  });

  test("firstVictory a son propre pool, distinct de perfect/ko", () => {
    const perfectArgs = { isPerfect: true, firstVictory: false, username: "T", bossName: "B" };
    const firstVictoryArgs = { isPerfect: true, firstVictory: true, username: "T", bossName: "B" };
    expect(koLine("sparring", firstVictoryArgs, 0)).not.toBe(koLine("sparring", perfectArgs, 0));
  });

  test("milestone a un pool d'au moins 5 variantes, seed stable", () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 5; seed++) seen.add(milestoneLine("sparring", 7, seed));
    expect(seen.size).toBeGreaterThanOrEqual(5);
    expect(milestoneLine("sparring", 7, 2)).toBe(milestoneLine("sparring", 7, 2));
  });
});
