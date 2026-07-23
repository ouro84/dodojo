import { describe, expect, test } from "vitest";
import { wakeUpSubtitle, crepusculeHeader, crepusculeLine } from "./rituals";

describe("Rituel du Réveil", () => {
  test("sparring = texte actuel", () => {
    expect(wakeUpSubtitle("sparring")).toBe(
      "Les monstres que tu as fuis hier sont revenus. Règle tes comptes avant d'entrer dans l'Arène.",
    );
  });
  test("sensei reste sans juron", () => {
    expect(wakeUpSubtitle("sensei")).not.toMatch(/putain|bordel|merde|con|connard|foutre/);
  });
});

describe("Rituel du Crépuscule", () => {
  test("sparring = textes actuels", () => {
    expect(crepusculeHeader("sparring", true)).toBe("Perfect !");
    expect(crepusculeHeader("sparring", false)).toBe("Crépuscule");
    expect(
      crepusculeLine("sparring", { victory: true, username: "Thomas", bossName: "le Zombie" }),
    ).toBe("Thomas, tu as terrassé le Zombie. La rue est calme pour ce soir.");
    expect(crepusculeLine("sparring", { victory: false, username: "Thomas", bossName: "le Zombie" })).toBe(
      "Thomas, tu poses les armes. Pas de honte — demain est un autre combat.",
    );
  });
  test("street élargit le vocabulaire sans viser le joueur", () => {
    const line = crepusculeLine("street", { victory: true, username: "Thomas", bossName: "le Zombie" });
    expect(line).toMatch(/putain/);
    expect(line).not.toMatch(/connard|con\b/);
  });
});
