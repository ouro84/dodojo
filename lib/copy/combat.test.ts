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

const FORBIDDEN_DOUX = /putain|bordel|merde|\bcon\b|connard|foutre/;

describe("empty state", () => {
  test("titre reste fixe (tag court, pas de pool)", () => {
    expect(emptyStateTitle("direct")).toBe("Terrain vague.");
  });
  test("le corps a un pool d'au moins 5 variantes par niveau, seed stable", () => {
    const seenDirect = new Set<string>();
    for (let seed = 0; seed < 5; seed++) seenDirect.add(emptyStateBody("direct", seed));
    expect(seenDirect.size).toBeGreaterThanOrEqual(5);
    expect(emptyStateBody("direct", 2)).toBe(emptyStateBody("direct", 2));
  });
  test("brut est plus cru que doux sur tout le pool", () => {
    for (let seed = 0; seed < 5; seed++) {
      expect(emptyStateBody("doux", seed)).not.toMatch(FORBIDDEN_DOUX);
    }
  });
});

describe("level up", () => {
  test("titre reste fixe", () => {
    expect(levelUpTitle("direct")).toBe("Level Up !");
  });
  test("le corps a un pool d'au moins 5 variantes, seed stable", () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 5; seed++) seen.add(levelUpBody("direct", 4, seed));
    expect(seen.size).toBeGreaterThanOrEqual(5);
    expect(levelUpBody("direct", 4, 1)).toBe(levelUpBody("direct", 4, 1));
  });
  test("brut jure sur au moins une variante, doux jamais", () => {
    const brutJurons = Array.from({ length: 5 }, (_, seed) => levelUpBody("brut", 4, seed)).some(
      (line) => /putain|bordel/i.test(line),
    );
    expect(brutJurons).toBe(true);
    for (let seed = 0; seed < 5; seed++) {
      expect(levelUpBody("doux", 4, seed)).not.toMatch(FORBIDDEN_DOUX);
    }
  });
});

describe("Perfect / K.O.", () => {
  test("header reste fixe", () => {
    expect(koHeader("direct", true)).toBe("Perfect !");
    expect(koHeader("direct", false)).toBe("K.O. !");
  });

  test("koLine a un pool d'au moins 5 variantes par cas, seed stable", () => {
    const args = { isPerfect: true, firstVictory: false, username: "Thomas", bossName: "le Gardien de Glace" };
    const seen = new Set<string>();
    for (let seed = 0; seed < 5; seed++) seen.add(koLine("direct", args, seed));
    expect(seen.size).toBeGreaterThanOrEqual(5);
    expect(koLine("direct", args, 3)).toBe(koLine("direct", args, 3));
  });

  test("jamais d'attaque personnelle contre le joueur, même en brut, sur tout le pool", () => {
    const args = { isPerfect: true, firstVictory: false, username: "Thomas", bossName: "le Gardien de Glace" };
    for (let seed = 0; seed < 5; seed++) {
      expect(koLine("brut", args, seed)).not.toMatch(/connard|\bcon\b/);
    }
  });

  test("firstVictory a son propre pool, distinct de perfect/ko", () => {
    const perfectArgs = { isPerfect: true, firstVictory: false, username: "T", bossName: "B" };
    const firstVictoryArgs = { isPerfect: true, firstVictory: true, username: "T", bossName: "B" };
    expect(koLine("direct", firstVictoryArgs, 0)).not.toBe(koLine("direct", perfectArgs, 0));
  });

  test("milestone a un pool d'au moins 5 variantes, seed stable", () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 5; seed++) seen.add(milestoneLine("direct", 7, seed));
    expect(seen.size).toBeGreaterThanOrEqual(5);
    expect(milestoneLine("direct", 7, 2)).toBe(milestoneLine("direct", 7, 2));
  });
});
