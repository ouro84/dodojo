import { describe, expect, it } from "vitest";
import {
  addPendingHit,
  COALESCE_MAX_WAIT_MS,
  hitStopMs,
  impactDelayMs,
  nextAnimStateAfterEnd,
  pickAttackAnim,
  shouldForceFlush,
} from "./combat-animation";

describe("pickAttackAnim", () => {
  it("sort l'attaque spéciale sur le coup fatal", () => {
    expect(pickAttackAnim(0, true, () => 0)).toBe("sp_atk");
  });

  it("sort l'attaque spéciale à partir d'un combo ×3", () => {
    expect(pickAttackAnim(3, false, () => 0)).toBe("sp_atk");
  });

  it("tire une attaque de base en dessous du seuil de combo", () => {
    expect(pickAttackAnim(2, false, () => 0)).toBe("atk1");
    expect(pickAttackAnim(2, false, () => 0.5)).toBe("atk2");
    expect(pickAttackAnim(2, false, () => 0.99)).toBe("atk3");
  });
});

describe("impactDelayMs", () => {
  it("place l'impact au prorata de la frame de contact", () => {
    expect(impactDelayMs(10, 4, 600)).toBe(240);
  });

  it("renvoie 0 quand l'anim n'a pas de frame d'impact", () => {
    expect(impactDelayMs(8, null, 960)).toBe(0);
  });
});

describe("hitStopMs", () => {
  it("gèle longuement sur le coup fatal", () => {
    expect(hitStopMs({ isFatal: true, comboCount: 0, hits: 1 })).toBe(200);
  });

  it("gèle davantage sur une cascade ou un combo ×3", () => {
    expect(hitStopMs({ isFatal: false, comboCount: 3, hits: 1 })).toBe(120);
    expect(hitStopMs({ isFatal: false, comboCount: 0, hits: 4 })).toBe(120);
  });

  it("gèle brièvement sur un coup simple", () => {
    expect(hitStopMs({ isFatal: false, comboCount: 1, hits: 1 })).toBe(50);
  });
});

describe("coalescing des rafales", () => {
  it("additionne les coups et conserve l'instant du premier", () => {
    const a = addPendingHit(null, 25, 10, 1000);
    const b = addPendingHit(a, 25, 15, 1150);
    expect(b).toEqual({ damage: 50, xp: 25, hits: 2, firstAt: 1000 });
  });

  it("force le flush passé la fenêtre maximale", () => {
    const p = addPendingHit(null, 25, 10, 1000);
    expect(shouldForceFlush(p, 1000 + COALESCE_MAX_WAIT_MS - 1)).toBe(false);
    expect(shouldForceFlush(p, 1000 + COALESCE_MAX_WAIT_MS)).toBe(true);
  });

  it("ne force jamais le flush sans coup en attente", () => {
    expect(shouldForceFlush(null, 99999)).toBe(false);
  });
});

describe("nextAnimStateAfterEnd (issue #156)", () => {
  it("ramène une attaque terminée à l'idle en incrémentant la clé", () => {
    expect(nextAnimStateAfterEnd({ state: "attack", key: 7, anim: "atk2" })).toEqual({
      state: "idle",
      key: 8,
    });
  });

  it("ramène AUSSI un hurt terminé à l'idle", () => {
    // #149 n'avait traité que le cas "attack" : après un hurt, l'état restait
    // figé et les gardes anti-chevauchement lisaient une valeur périmée.
    expect(nextAnimStateAfterEnd({ state: "hurt", key: 3 })).toEqual({
      state: "idle",
      key: 4,
    });
  });

  it("laisse un état déjà idle inchangé", () => {
    const idle = { state: "idle" as const, key: 5 };
    expect(nextAnimStateAfterEnd(idle)).toBe(idle);
  });

  it("laisse un Boss mort inchangé", () => {
    // Le Boss mort ne se relève pas de lui-même : seule la renaissance le
    // remet debout (cf. koOutcome, garde prevBossHp === 0).
    const dead = { state: "death" as const, key: 9 };
    expect(nextAnimStateAfterEnd(dead)).toBe(dead);
  });
});
