import { describe, expect, test } from "vitest";
import { BACKGROUNDS, getBackground } from "./backgrounds";
import {
  BOSSES,
  DEFAULT_BOSS_ID,
  getBoss,
  pickBackgroundId,
  pickDailyBoss,
} from "./bosses";

describe("catalogue boss (intégrité)", () => {
  test("tous les backgroundIds d'un boss existent dans le catalogue de décors", () => {
    const bgIds = new Set(BACKGROUNDS.map((b) => b.id));
    for (const boss of BOSSES) {
      expect(boss.backgroundIds.length).toBeGreaterThanOrEqual(1);
      expect(boss.backgroundIds.length).toBeLessThanOrEqual(3);
      for (const id of boss.backgroundIds) {
        expect(bgIds.has(id), `${boss.id} → ${id}`).toBe(true);
      }
    }
  });

  test("ids de boss uniques + boss par défaut présent", () => {
    const ids = BOSSES.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(getBoss(DEFAULT_BOSS_ID)).toBeDefined();
  });

  test("frame counts positifs", () => {
    for (const boss of BOSSES) expect(boss.idleFrameCount).toBeGreaterThan(0);
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
  test("renvoie un décor autorisé du boss", () => {
    for (const boss of BOSSES) {
      const bg = pickBackgroundId(boss, () => 0);
      expect(boss.backgroundIds).toContain(bg);
      expect(getBackground(bg)).toBeDefined();
    }
  });
});
