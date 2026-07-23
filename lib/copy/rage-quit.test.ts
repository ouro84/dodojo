import { describe, expect, test } from "vitest";
import { rageQuitConfirmBody, rageQuitPunchline } from "./rage-quit";

const FORBIDDEN_SENSEI = /putain|bordel|merde|\bcon\b|connard|foutre/;
const NEVER_AT_PLAYER = /connard|\bcon\b|couilles|pathétique/i;

describe("Rage Quit — confirmation", () => {
  test("pool d'au moins 5 variantes, seed stable", () => {
    const args = { taskTitle: "Facture client", penalty: 5 };
    const seen = new Set<string>();
    for (let seed = 0; seed < 5; seed++) seen.add(rageQuitConfirmBody("sparring", args, seed));
    expect(seen.size).toBeGreaterThanOrEqual(5);
    expect(rageQuitConfirmBody("sparring", args, 2)).toBe(rageQuitConfirmBody("sparring", args, 2));
  });

  test("sensei reste sans juron sur tout le pool", () => {
    const args = { taskTitle: "X", penalty: 5 };
    for (let seed = 0; seed < 5; seed++) {
      expect(rageQuitConfirmBody("sensei", args, seed)).not.toMatch(FORBIDDEN_SENSEI);
    }
  });

  test("jamais d'attaque personnelle contre le joueur, même en street", () => {
    const args = { taskTitle: "X", penalty: 5 };
    for (let seed = 0; seed < 5; seed++) {
      expect(rageQuitConfirmBody("street", args, seed)).not.toMatch(NEVER_AT_PLAYER);
    }
  });
});

describe("Rage Quit — ricanement du Boss", () => {
  test("pool d'au moins 5 variantes, seed stable", () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 5; seed++) seen.add(rageQuitPunchline("sparring", seed));
    expect(seen.size).toBeGreaterThanOrEqual(5);
    expect(rageQuitPunchline("sparring", 1)).toBe(rageQuitPunchline("sparring", 1));
  });

  test("sensei reste sans juron sur tout le pool", () => {
    for (let seed = 0; seed < 5; seed++) {
      expect(rageQuitPunchline("sensei", seed)).not.toMatch(FORBIDDEN_SENSEI);
    }
  });

  test("street élargit le vocabulaire sans jamais viser le joueur", () => {
    const jurons = Array.from({ length: 5 }, (_, seed) => rageQuitPunchline("street", seed)).some((line) =>
      /putain|bordel|merde/i.test(line),
    );
    expect(jurons).toBe(true);
    for (let seed = 0; seed < 5; seed++) {
      expect(rageQuitPunchline("street", seed)).not.toMatch(NEVER_AT_PLAYER);
    }
  });
});
