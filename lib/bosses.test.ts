import { describe, expect, test } from "vitest";
import { BACKGROUNDS, getBackground } from "./backgrounds";
import {
  BOSSES,
  DEFAULT_BOSS_ID,
  getBoss,
  hasFacedBossBefore,
  pickBackgroundId,
  pickDailyBoss,
} from "./bosses";

describe("catalogue boss (intégrité)", () => {
  test("chaque thème d'un boss a au moins une variante de décor extraite", () => {
    const themes = new Set(BACKGROUNDS.map((b) => b.theme));
    for (const boss of BOSSES) {
      expect(boss.backgroundThemes.length).toBeGreaterThanOrEqual(1);
      for (const theme of boss.backgroundThemes) {
        expect(themes.has(theme), `${boss.id} → ${theme}`).toBe(true);
      }
    }
  });

  test("ids de boss uniques + boss par défaut présent", () => {
    const ids = BOSSES.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(getBoss(DEFAULT_BOSS_ID)).toBeDefined();
  });

  test("spriteBase cohérent avec le slug", () => {
    for (const boss of BOSSES) expect(boss.spriteBase).toBe(`/sprites/bosses/${boss.slug}`);
  });

  test("aucun nom de boss ne commence par un article (issue #119)", () => {
    const leadingArticles = ["le ", "la ", "les ", "un ", "une "];
    for (const boss of BOSSES) {
      const lower = boss.name.toLowerCase();
      const startsWithArticle = leadingArticles.some((article) =>
        lower.startsWith(article),
      );
      expect(startsWithArticle, `"${boss.name}" (${boss.id})`).toBe(false);
    }
  });
});

describe("pickDailyBoss (US roster)", () => {
  test("exclut les 2 derniers boss", () => {
    const recent = [BOSSES[0].id, BOSSES[1].id];
    // rng=0 → premier candidat après exclusion = BOSSES[2]
    const picked = pickDailyBoss(recent, () => 0);
    expect(picked.id).toBe(BOSSES[2].id);
    expect(recent).not.toContain(picked.id);
  });

  test("ne considère que les 2 derniers (un 3e n'est pas exclu)", () => {
    const recent = [BOSSES[0].id, BOSSES[1].id, BOSSES[2].id];
    // BOSSES[2] n'est PAS exclu (slice 0,2) → rng=0 le renvoie
    expect(pickDailyBoss(recent, () => 0).id).toBe(BOSSES[2].id);
  });

  test("retombe sur le pool complet si tout est exclu", () => {
    const smallPool = [BOSSES[0], BOSSES[1]];
    const picked = pickDailyBoss([BOSSES[0].id, BOSSES[1].id], () => 0, smallPool);
    expect([BOSSES[0].id, BOSSES[1].id]).toContain(picked.id);
  });

  test("rng proche de 1 → dernier candidat", () => {
    const picked = pickDailyBoss([], () => 0.999);
    expect(picked.id).toBe(BOSSES[BOSSES.length - 1].id);
  });
});

describe("pickBackgroundId", () => {
  test("renvoie un décor dont le thème est autorisé pour le boss", () => {
    for (const boss of BOSSES) {
      const id = pickBackgroundId(boss, () => 0);
      const bg = getBackground(id);
      expect(bg).toBeDefined();
      expect(boss.backgroundThemes).toContain(bg!.theme);
    }
  });

  test("les variantes d'un thème validé entrent dans le pool", () => {
    // ancient-temple a 3 variantes → un boss ciblant ce thème peut toutes les tirer.
    const boss = BOSSES.find((b) => b.backgroundThemes.includes("ancient-temple"))!;
    const reachable = new Set<string>();
    for (let i = 0; i < 50; i++) {
      reachable.add(pickBackgroundId(boss, () => i / 50));
    }
    expect(reachable.has("ancient-temple")).toBe(true);
    expect(reachable.has("ancient-temple-2")).toBe(true);
  });
});

describe("hasFacedBossBefore (issue #135)", () => {
  test("faux si l'historique est vide", () => {
    expect(hasFacedBossBefore([], BOSSES[0].id)).toBe(false);
  });

  test("vrai si le boss est présent dans l'historique", () => {
    expect(hasFacedBossBefore([BOSSES[1].id, BOSSES[0].id], BOSSES[0].id)).toBe(true);
  });

  test("faux si le boss n'est pas dans l'historique fourni", () => {
    expect(hasFacedBossBefore([BOSSES[1].id, BOSSES[2].id], BOSSES[0].id)).toBe(false);
  });
});
