import { describe, expect, test } from "vitest";
import { wakeUpSubtitle, crepusculeHeader, crepusculeLine } from "./rituals";

const FORBIDDEN_DOUX = /putain|bordel|merde|\bcon\b|connard|foutre/;

describe("Le Réveil", () => {
  test("pool d'au moins 5 variantes, seed stable", () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 5; seed++) seen.add(wakeUpSubtitle("direct", seed));
    expect(seen.size).toBeGreaterThanOrEqual(5);
    expect(wakeUpSubtitle("direct", 2)).toBe(wakeUpSubtitle("direct", 2));
  });
  test("doux reste sans juron sur tout le pool", () => {
    for (let seed = 0; seed < 5; seed++) {
      expect(wakeUpSubtitle("doux", seed)).not.toMatch(FORBIDDEN_DOUX);
    }
  });
});

describe("Dernier Round", () => {
  test("header reste fixe", () => {
    expect(crepusculeHeader("direct", true)).toBe("Perfect !");
    expect(crepusculeHeader("direct", false)).toBe("Dernier Round");
  });

  test("victoire : pool d'au moins 5 variantes, seed stable", () => {
    const args = { victory: true, username: "Thomas", bossName: "le Zombie" };
    const seen = new Set<string>();
    for (let seed = 0; seed < 5; seed++) seen.add(crepusculeLine("direct", args, seed));
    expect(seen.size).toBeGreaterThanOrEqual(5);
    expect(crepusculeLine("direct", args, 3)).toBe(crepusculeLine("direct", args, 3));
  });

  test("retraite : pool d'au moins 5 variantes", () => {
    const args = { victory: false, username: "Thomas", bossName: "le Zombie" };
    const seen = new Set<string>();
    for (let seed = 0; seed < 5; seed++) seen.add(crepusculeLine("direct", args, seed));
    expect(seen.size).toBeGreaterThanOrEqual(5);
  });

  test("brut élargit le vocabulaire sans viser le joueur, sur tout le pool", () => {
    const args = { victory: true, username: "Thomas", bossName: "le Zombie" };
    const jurons = Array.from({ length: 5 }, (_, seed) => crepusculeLine("brut", args, seed)).some((line) =>
      /putain|bordel|merde/i.test(line),
    );
    expect(jurons).toBe(true);
    for (let seed = 0; seed < 5; seed++) {
      expect(crepusculeLine("brut", args, seed)).not.toMatch(/connard|\bcon\b/);
    }
  });
});
