import { describe, expect, it } from "vitest";
import { DEFAULT_HERO_ID, getHero, HEROES, isHeroOwned } from "./heroes";

describe("heroes catalogue", () => {
  it("contient un héros par défaut unique, gratuit", () => {
    const defaults = HEROES.filter((h) => h.isDefault);
    expect(defaults).toHaveLength(1);
    expect(defaults[0].id).toBe(DEFAULT_HERO_ID);
    expect(defaults[0].price).toBe(0);
  });

  it("ids et slugs uniques ; autres héros price > 0 et frames > 0", () => {
    expect(new Set(HEROES.map((h) => h.id)).size).toBe(HEROES.length);
    expect(new Set(HEROES.map((h) => h.slug)).size).toBe(HEROES.length);
    for (const h of HEROES.filter((x) => !x.isDefault)) {
      expect(h.price).toBeGreaterThan(0);
      expect(h.idleFrameCount).toBeGreaterThan(0);
    }
  });

  it("getHero retrouve par id, undefined sinon", () => {
    expect(getHero(DEFAULT_HERO_ID)?.id).toBe(DEFAULT_HERO_ID);
    expect(getHero("inconnu")).toBeUndefined();
  });

  it("isHeroOwned : défaut toujours possédé, autres selon la liste", () => {
    expect(isHeroOwned(DEFAULT_HERO_ID, [])).toBe(true);
    expect(isHeroOwned("water_priestess", [])).toBe(false);
    expect(isHeroOwned("water_priestess", ["water_priestess"])).toBe(true);
  });
});
