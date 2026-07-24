import { describe, expect, test } from "vitest";
import { rageQuitConfirmBody, rageQuitPunchline } from "./rage-quit";

const FORBIDDEN_DOUX = /putain|bordel|merde|\bcon\b|connard|foutre/;
const NEVER_AT_PLAYER = /connard|\bcon\b|couilles|pathétique/i;

describe("Rage Quit — confirmation", () => {
  test("pool d'au moins 5 variantes, seed stable", () => {
    const args = { taskTitle: "Facture client", penalty: 5 };
    const seen = new Set<string>();
    for (let seed = 0; seed < 5; seed++) seen.add(rageQuitConfirmBody("direct", args, seed));
    expect(seen.size).toBeGreaterThanOrEqual(5);
    expect(rageQuitConfirmBody("direct", args, 2)).toBe(rageQuitConfirmBody("direct", args, 2));
  });

  test("doux reste sans juron sur tout le pool", () => {
    const args = { taskTitle: "X", penalty: 5 };
    for (let seed = 0; seed < 5; seed++) {
      expect(rageQuitConfirmBody("doux", args, seed)).not.toMatch(FORBIDDEN_DOUX);
    }
  });

  test("jamais d'attaque personnelle contre le joueur, même en brut", () => {
    const args = { taskTitle: "X", penalty: 5 };
    for (let seed = 0; seed < 5; seed++) {
      expect(rageQuitConfirmBody("brut", args, seed)).not.toMatch(NEVER_AT_PLAYER);
    }
  });
});

describe("Rage Quit — ricanement du Boss", () => {
  test("pool d'au moins 5 variantes, seed stable", () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 5; seed++) seen.add(rageQuitPunchline("direct", seed));
    expect(seen.size).toBeGreaterThanOrEqual(5);
    expect(rageQuitPunchline("direct", 1)).toBe(rageQuitPunchline("direct", 1));
  });

  test("doux reste sans juron sur tout le pool", () => {
    for (let seed = 0; seed < 5; seed++) {
      expect(rageQuitPunchline("doux", seed)).not.toMatch(FORBIDDEN_DOUX);
    }
  });

  test("brut élargit le vocabulaire sans jamais viser le joueur", () => {
    const jurons = Array.from({ length: 5 }, (_, seed) => rageQuitPunchline("brut", seed)).some((line) =>
      /putain|bordel|merde/i.test(line),
    );
    expect(jurons).toBe(true);
    for (let seed = 0; seed < 5; seed++) {
      expect(rageQuitPunchline("brut", seed)).not.toMatch(NEVER_AT_PLAYER);
    }
  });
});
