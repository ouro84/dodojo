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

describe("empty state", () => {
  test("sparring = texte actuel de production", () => {
    expect(emptyStateTitle("sparring")).toBe("Terrain vague.");
    expect(emptyStateBody("sparring")).toBe(
      "Aucun monstre à l'horizon. La rue est calme… trop calme.",
    );
  });
  test("street est plus cru que sensei", () => {
    expect(emptyStateBody("street")).toContain("défonce");
    expect(emptyStateBody("sensei")).not.toMatch(/putain|bordel|merde|con|connard|foutre/);
  });
});

describe("level up", () => {
  test("sparring = texte actuel", () => {
    expect(levelUpTitle("sparring")).toBe("Level Up !");
    expect(levelUpBody("sparring", 4)).toBe(
      "Niveau 4. Le dojo t'a appris quelque chose de plus.",
    );
  });
  test("street jure, sensei jamais", () => {
    expect(levelUpBody("street", 4)).toMatch(/putain/);
    expect(levelUpBody("sensei", 4)).not.toMatch(/putain|bordel|merde|con|connard|foutre/);
  });
});

describe("Perfect / K.O.", () => {
  test("sparring = textes actuels", () => {
    expect(koHeader("sparring", true)).toBe("Perfect !");
    expect(koHeader("sparring", false)).toBe("K.O. !");
    expect(
      koLine("sparring", {
        isPerfect: true,
        firstVictory: false,
        username: "Thomas",
        bossName: "le Gardien de Glace",
      }),
    ).toBe("Sans une égratignure, Thomas. le Gardien de Glace est au tapis.");
    expect(
      koLine("sparring", {
        isPerfect: false,
        firstVictory: false,
        username: "Thomas",
        bossName: "le Gardien de Glace",
      }),
    ).toBe("le Gardien de Glace a mordu la poussière. Tu l'as eu, Thomas.");
    expect(
      koLine("sparring", {
        isPerfect: true,
        firstVictory: true,
        username: "Thomas",
        bossName: "le Gardien de Glace",
      }),
    ).toBe("Premier sang, Thomas ! le Gardien de Glace est au tapis. Bienvenue dans l'Arène.");
  });

  test("jamais d'attaque personnelle contre le joueur, même en street", () => {
    const line = koLine("street", {
      isPerfect: true,
      firstVictory: false,
      username: "Thomas",
      bossName: "le Gardien de Glace",
    });
    expect(line).not.toMatch(/connard|con\b/);
  });

  test("milestone sparring = texte actuel", () => {
    expect(milestoneLine("sparring", 7)).toBe("Série de 7 ! Le dojo se souviendra.");
  });
});
