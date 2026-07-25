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

import {
  buildShareCardParams,
  shareCardSearchParams,
  parseShareCardParams,
  type ShareCardParams,
} from "./share-card";

describe("buildShareCardParams", () => {
  const context = {
    username: "Ada",
    heroId: "fire_knight",
    bossId: "frost-guardian",
    level: 4,
    title: "Calme",
    streak: 7,
    dayDate: "2026-07-22",
  };

  test("mapping depuis un résumé de combat en direct (victoire, palier atteint)", () => {
    const summary = {
      outcome: "victory" as const,
      damageDealt: 80,
      tasksCompleted: 4,
      xpEarned: 120,
    };
    const params = buildShareCardParams(summary, context);
    expect(params).toEqual({
      username: "Ada",
      heroId: "fire_knight",
      bossId: "frost-guardian",
      outcome: "victory",
      damageDealt: 80,
      xpEarned: 120,
      tasksCompleted: 4,
      streak: 7,
      level: 4,
      title: "Calme",
      dayDate: "2026-07-22",
      milestone: 7,
    });
  });

  test("mapping depuis un jour clôturé en retraite (pas de flourish)", () => {
    const summary = {
      outcome: "retreat" as const,
      damageDealt: 40,
      tasksCompleted: 2,
      xpEarned: 60,
    };
    const params = buildShareCardParams(summary, { ...context, streak: 0 });
    expect(params.outcome).toBe("retreat");
    expect(params.milestone).toBeNull();
  });

  test("mapping d'une défaite", () => {
    const summary = {
      outcome: "defeat" as const,
      damageDealt: 20,
      tasksCompleted: 1,
      xpEarned: 30,
    };
    const params = buildShareCardParams(summary, { ...context, streak: 2 });
    expect(params.outcome).toBe("defeat");
  });

  test("tronque pseudo et titre au-delà de 24 caractères", () => {
    const summary = {
      outcome: "victory" as const,
      damageDealt: 20,
      tasksCompleted: 1,
      xpEarned: 30,
    };
    const params = buildShareCardParams(summary, {
      ...context,
      username: "Un pseudo vraiment beaucoup trop long",
      title: "Un titre de palier extrêmement long à tronquer",
    });
    expect(params.username.length).toBeLessThanOrEqual(24);
    expect(params.title.length).toBeLessThanOrEqual(24);
  });
});

describe("shareCardSearchParams / parseShareCardParams (aller-retour)", () => {
  const params: ShareCardParams = {
    username: "Ada",
    heroId: "fire_knight",
    bossId: "frost-guardian",
    outcome: "victory",
    damageDealt: 80,
    xpEarned: 120,
    tasksCompleted: 4,
    streak: 7,
    level: 4,
    title: "Calme",
    dayDate: "2026-07-22",
    milestone: 7,
  };

  test("round-trip complet", () => {
    const qs = shareCardSearchParams(params);
    expect(parseShareCardParams(qs)).toEqual(params);
  });

  test("round-trip sans palier (milestone null)", () => {
    const qs = shareCardSearchParams({ ...params, milestone: null });
    expect(parseShareCardParams(qs)?.milestone).toBeNull();
  });

  test("renvoie null si un champ requis est manquant", () => {
    const qs = shareCardSearchParams(params);
    qs.delete("username");
    expect(parseShareCardParams(qs)).toBeNull();
  });

  test("renvoie null si outcome est invalide", () => {
    const qs = shareCardSearchParams(params);
    qs.set("outcome", "cheating");
    expect(parseShareCardParams(qs)).toBeNull();
  });

  test("renvoie null si un nombre est invalide", () => {
    const qs = shareCardSearchParams(params);
    qs.set("damageDealt", "not-a-number");
    expect(parseShareCardParams(qs)).toBeNull();
  });

  test("retronque les champs texte à la lecture (défense en profondeur)", () => {
    const qs = shareCardSearchParams(params);
    qs.set("username", "Un pseudo vraiment beaucoup trop long, forgé à la main");
    expect(parseShareCardParams(qs)?.username.length).toBeLessThanOrEqual(24);
  });
});
