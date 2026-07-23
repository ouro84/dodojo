import { describe, expect, test } from "vitest";
import {
  SHARE_CARD_LABEL_MAX_LENGTH,
  truncateForCard,
  milestoneStreak,
  pickShareStrategy,
} from "./share-card";

describe("truncateForCard", () => {
  test("laisse un texte court intact", () => {
    expect(truncateForCard("Ada")).toBe("Ada");
  });

  test("tronque et ajoute une ellipse au-delà de la limite par défaut", () => {
    const longName = "Un pseudo vraiment beaucoup trop long"; // > 24 caractères
    const result = truncateForCard(longName);
    expect(result.length).toBe(SHARE_CARD_LABEL_MAX_LENGTH);
    expect(result.endsWith("…")).toBe(true);
  });

  test("respecte une limite personnalisée", () => {
    expect(truncateForCard("Chevalier de Feu", 8)).toBe("Chevali…");
  });

  test("un texte pile à la limite n'est pas tronqué", () => {
    const exact = "a".repeat(SHARE_CARD_LABEL_MAX_LENGTH);
    expect(truncateForCard(exact)).toBe(exact);
  });
});

describe("milestoneStreak", () => {
  test("renvoie le palier atteint (7/30/100)", () => {
    expect(milestoneStreak(7)).toBe(7);
    expect(milestoneStreak(30)).toBe(30);
    expect(milestoneStreak(100)).toBe(100);
  });

  test("renvoie null hors palier", () => {
    expect(milestoneStreak(0)).toBeNull();
    expect(milestoneStreak(6)).toBeNull();
    expect(milestoneStreak(8)).toBeNull();
    expect(milestoneStreak(101)).toBeNull();
  });
});

describe("pickShareStrategy", () => {
  test("préfère le partage natif si les fichiers sont partageables", () => {
    expect(pickShareStrategy({ canShareFiles: true, canWriteClipboard: true })).toBe("native");
  });

  test("retombe sur le presse-papier si le natif est indisponible", () => {
    expect(pickShareStrategy({ canShareFiles: false, canWriteClipboard: true })).toBe("clipboard");
  });

  test("retombe sur le téléchargement en dernier recours", () => {
    expect(pickShareStrategy({ canShareFiles: false, canWriteClipboard: false })).toBe("download");
  });
});
