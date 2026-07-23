import { describe, expect, test } from "vitest";
import { rageQuitConfirmBody, rageQuitPunchline } from "./rage-quit";

describe("Rage Quit", () => {
  test("sparring = textes actuels", () => {
    expect(rageQuitConfirmBody("sparring", { taskTitle: "Facture client", penalty: 5 })).toBe(
      "Abandonner « Facture client » coûte −5 XP. Le Boss rétrécit, mais il ricanera.",
    );
    expect(rageQuitPunchline("sparring")).toBe("Le Boss ricane : « Déjà à terre ? Relève-toi. »");
  });

  test("sensei reste sans juron", () => {
    expect(rageQuitConfirmBody("sensei", { taskTitle: "X", penalty: 5 })).not.toMatch(
      /putain|bordel|merde|\bcon\b|connard|foutre/,
    );
    expect(rageQuitPunchline("sensei")).not.toMatch(/putain|bordel|merde|\bcon\b|connard|foutre/);
  });

  test("street élargit le vocabulaire sans viser le joueur", () => {
    expect(rageQuitPunchline("street")).not.toMatch(/connard|con\b/);
  });
});
