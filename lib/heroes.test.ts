import { describe, expect, it } from "vitest";
import { DEFAULT_HERO_ID, getHero, HEROES, isHeroOwned } from "./heroes";

describe("heroes catalogue", () => {
  it("contient un héros par défaut unique (fallback de rendu)", () => {
    const defaults = HEROES.filter((h) => h.isDefault);
    expect(defaults).toHaveLength(1);
    expect(defaults[0].id).toBe(DEFAULT_HERO_ID);
  });

  it("ids et slugs uniques ; tous les héros ont price === 500 et frames > 0 (issue #122)", () => {
    expect(new Set(HEROES.map((h) => h.id)).size).toBe(HEROES.length);
    expect(new Set(HEROES.map((h) => h.slug)).size).toBe(HEROES.length);
    for (const h of HEROES) {
      expect(h.price).toBe(500);
      expect(h.idleFrameCount).toBeGreaterThan(0);
    }
  });

  it("getHero retrouve par id, undefined sinon", () => {
    expect(getHero(DEFAULT_HERO_ID)?.id).toBe(DEFAULT_HERO_ID);
    expect(getHero("inconnu")).toBeUndefined();
  });

  it("isHeroOwned (US-29) : possession strictement par la liste, pas de défaut implicite", () => {
    expect(isHeroOwned(DEFAULT_HERO_ID, [])).toBe(false);
    expect(isHeroOwned(DEFAULT_HERO_ID, [DEFAULT_HERO_ID])).toBe(true);
    expect(isHeroOwned("water_priestess", [])).toBe(false);
    expect(isHeroOwned("water_priestess", ["water_priestess"])).toBe(true);
  });
});
