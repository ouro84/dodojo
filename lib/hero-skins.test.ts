import { describe, expect, it } from "vitest";
import {
  SKINS,
  getSkinsForHero,
  getSkin,
  defaultSkinIdFor,
  skinPrice,
  isSkinOwned,
  getHeroSpriteBase,
} from "./hero-skins";
import { HEROES } from "./heroes";

describe("hero-skins catalogue", () => {
  it("chaque héros a exactement une tenue default (price 0, isDefault)", () => {
    for (const hero of HEROES) {
      const skins = getSkinsForHero(hero.id);
      const defaults = skins.filter((s) => s.isDefault);
      expect(defaults).toHaveLength(1);
      expect(defaults[0].price).toBe(0);
      expect(defaults[0].id).toBe(defaultSkinIdFor(hero.id));
    }
  });

  it("Tier A : Water Priestess et Crystal Mauler ont 4 tenues", () => {
    for (const heroId of ["water_priestess", "crystal_mauler"]) {
      expect(getSkinsForHero(heroId)).toHaveLength(4);
    }
  });

  it("Leaf Ranger a 3 tenues (Verdant retiré, jugé redondant)", () => {
    expect(getSkinsForHero("leaf_ranger")).toHaveLength(3);
  });

  it("Tier B (Fire Knight, Ground Monk, Wind Hashashin) a 2 tenues chacun", () => {
    for (const heroId of ["fire_knight", "ground_monk", "wind_hashashin"]) {
      expect(getSkinsForHero(heroId)).toHaveLength(2);
    }
  });

  it("Metal Bladekeeper (Tier C) a 3 tenues", () => {
    expect(getSkinsForHero("metal_bladekeeper")).toHaveLength(3);
  });

  it("ids uniques dans tout le catalogue", () => {
    expect(new Set(SKINS.map((s) => s.id)).size).toBe(SKINS.length);
  });

  it("getSkin retrouve par id, undefined sinon", () => {
    expect(getSkin("fire_knight_default")?.id).toBe("fire_knight_default");
    expect(getSkin("inconnu")).toBeUndefined();
  });

  it("skinPrice = 30% du prix du héros, arrondi à la dizaine", () => {
    expect(skinPrice(150)).toBe(50);
    expect(skinPrice(200)).toBe(60);
    expect(skinPrice(350)).toBe(110);
  });

  it("isSkinOwned : default toujours possédé, alternative nécessite la liste", () => {
    expect(isSkinOwned("fire_knight_default", "fire_knight", [])).toBe(true);
    expect(isSkinOwned("fire_knight_shadow_purple", "fire_knight", [])).toBe(false);
    expect(
      isSkinOwned("fire_knight_shadow_purple", "fire_knight", ["fire_knight_shadow_purple"]),
    ).toBe(true);
  });

  it("renvoie le dossier du héros pour la tenue par défaut", () => {
    expect(getHeroSpriteBase("fire_knight", null)).toBe("/sprites/mc/fire-knight");
    expect(getHeroSpriteBase("fire_knight", "fire_knight_default")).toBe("/sprites/mc/fire-knight");
  });

  it("renvoie le dossier de la tenue pour une tenue non-défaut", () => {
    expect(getHeroSpriteBase("fire_knight", "fire_knight_shadow_purple")).toBe(
      "/sprites/mc/fire-knight/skins/fire_knight_shadow_purple",
    );
  });
});
