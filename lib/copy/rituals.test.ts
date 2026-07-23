import { describe, expect, test } from "vitest";
import { wakeUpSubtitle, crepusculeHeader, crepusculeLine } from "./rituals";

const FORBIDDEN_SENSEI = /putain|bordel|merde|\bcon\b|connard|foutre/;

describe("Rituel du Réveil", () => {
  test("pool d'au moins 5 variantes, seed stable", () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 5; seed++) seen.add(wakeUpSubtitle("sparring", seed));
    expect(seen.size).toBeGreaterThanOrEqual(5);
    expect(wakeUpSubtitle("sparring", 2)).toBe(wakeUpSubtitle("sparring", 2));
  });
  test("sensei reste sans juron sur tout le pool", () => {
    for (let seed = 0; seed < 5; seed++) {
      expect(wakeUpSubtitle("sensei", seed)).not.toMatch(FORBIDDEN_SENSEI);
    }
  });
});

describe("Rituel du Crépuscule", () => {
  test("header reste fixe", () => {
    expect(crepusculeHeader("sparring", true)).toBe("Perfect !");
    expect(crepusculeHeader("sparring", false)).toBe("Crépuscule");
  });

  test("victoire : pool d'au moins 5 variantes, seed stable", () => {
    const args = { victory: true, username: "Thomas", bossName: "le Zombie" };
    const seen = new Set<string>();
    for (let seed = 0; seed < 5; seed++) seen.add(crepusculeLine("sparring", args, seed));
    expect(seen.size).toBeGreaterThanOrEqual(5);
    expect(crepusculeLine("sparring", args, 3)).toBe(crepusculeLine("sparring", args, 3));
  });

  test("retraite : pool d'au moins 5 variantes", () => {
    const args = { victory: false, username: "Thomas", bossName: "le Zombie" };
    const seen = new Set<string>();
    for (let seed = 0; seed < 5; seed++) seen.add(crepusculeLine("sparring", args, seed));
    expect(seen.size).toBeGreaterThanOrEqual(5);
  });

  test("street élargit le vocabulaire sans viser le joueur, sur tout le pool", () => {
    const args = { victory: true, username: "Thomas", bossName: "le Zombie" };
    const jurons = Array.from({ length: 5 }, (_, seed) => crepusculeLine("street", args, seed)).some((line) =>
      /putain|bordel|merde/i.test(line),
    );
    expect(jurons).toBe(true);
    for (let seed = 0; seed < 5; seed++) {
      expect(crepusculeLine("street", args, seed)).not.toMatch(/connard|\bcon\b/);
    }
  });
});
