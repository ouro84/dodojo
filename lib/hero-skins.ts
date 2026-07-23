import type { Skin } from "../types";
import { getHero } from "./heroes";

// US-53 : catalogue statique des tenues (recolors de héros). Source unique —
// la base ne stocke que la possession (unlocked_skins) et l'équipé
// (profiles.equipped_skin_id). Génération des sprites : scripts/generate-hero-skins.mjs.
export const SKINS: Skin[] = [
  // Fire Knight (Tier B — mono-palette, recolor global accepté)
  { id: "fire_knight_default", heroId: "fire_knight", name: "Défaut", price: 0, isDefault: true, swatchColor: "#c0392b" },
  { id: "fire_knight_shadow_purple", heroId: "fire_knight", name: "Shadow Purple", price: 50, isDefault: false, swatchColor: "#5b2c8f" },

  // Ground Monk (Tier B)
  { id: "ground_monk_default", heroId: "ground_monk", name: "Défaut", price: 0, isDefault: true, swatchColor: "#8a6a3a" },
  { id: "ground_monk_verdant", heroId: "ground_monk", name: "Verdant", price: 60, isDefault: false, swatchColor: "#27ae60" },

  // Wind Hashashin (Tier B)
  { id: "wind_hashashin_default", heroId: "wind_hashashin", name: "Défaut", price: 0, isDefault: true, swatchColor: "#c9a15a" },
  { id: "wind_hashashin_azure", heroId: "wind_hashashin", name: "Azure", price: 90, isDefault: false, swatchColor: "#2980b9" },

  // Water Priestess (Tier A — séparation costume/peau nette)
  { id: "water_priestess_default", heroId: "water_priestess", name: "Défaut", price: 0, isDefault: true, swatchColor: "#2980b9" },
  { id: "water_priestess_ember", heroId: "water_priestess", name: "Ember", price: 60, isDefault: false, swatchColor: "#c0392b" },
  { id: "water_priestess_verdant", heroId: "water_priestess", name: "Verdant", price: 60, isDefault: false, swatchColor: "#27ae60" },
  { id: "water_priestess_amethyst", heroId: "water_priestess", name: "Amethyst", price: 60, isDefault: false, swatchColor: "#8e44ad" },

  // Leaf Ranger (Tier A)
  { id: "leaf_ranger_default", heroId: "leaf_ranger", name: "Défaut", price: 0, isDefault: true, swatchColor: "#16a085" },
  { id: "leaf_ranger_ember", heroId: "leaf_ranger", name: "Ember", price: 90, isDefault: false, swatchColor: "#c0392b" },
  { id: "leaf_ranger_verdant", heroId: "leaf_ranger", name: "Verdant", price: 90, isDefault: false, swatchColor: "#27ae60" },
  { id: "leaf_ranger_amethyst", heroId: "leaf_ranger", name: "Amethyst", price: 90, isDefault: false, swatchColor: "#8e44ad" },

  // Crystal Mauler (Tier A)
  { id: "crystal_mauler_default", heroId: "crystal_mauler", name: "Défaut", price: 0, isDefault: true, swatchColor: "#34495e" },
  { id: "crystal_mauler_ember", heroId: "crystal_mauler", name: "Ember", price: 110, isDefault: false, swatchColor: "#c0392b" },
  { id: "crystal_mauler_verdant", heroId: "crystal_mauler", name: "Verdant", price: 110, isDefault: false, swatchColor: "#27ae60" },
  { id: "crystal_mauler_amethyst", heroId: "crystal_mauler", name: "Amethyst", price: 110, isDefault: false, swatchColor: "#8e44ad" },

  // Metal Bladekeeper (Tier C — overlay tint, pas de hue-rotate)
  { id: "metal_bladekeeper_default", heroId: "metal_bladekeeper", name: "Défaut", price: 0, isDefault: true, swatchColor: "#7f8c8d" },
  { id: "metal_bladekeeper_bronze", heroId: "metal_bladekeeper", name: "Bronze", price: 110, isDefault: false, swatchColor: "#8a6a3a" },
  { id: "metal_bladekeeper_dark_steel", heroId: "metal_bladekeeper", name: "Acier sombre", price: 110, isDefault: false, swatchColor: "#3a3f47" },
];

export function getSkinsForHero(heroId: string): Skin[] {
  return SKINS.filter((s) => s.heroId === heroId);
}

export function getSkin(id: string): Skin | undefined {
  return SKINS.find((s) => s.id === id);
}

export function defaultSkinIdFor(heroId: string): string {
  return `${heroId}_default`;
}

export function skinPrice(heroPrice: number): number {
  return Math.round((heroPrice * 0.3) / 10) * 10;
}

// US-53 : la tenue "default" est toujours possédée dès que le héros l'est
// (aucune ligne unlocked_skins pour ce cas — D4 du spec). Une alternative
// nécessite une ligne dans la liste passée par l'appelant.
export function isSkinOwned(
  skinId: string,
  heroId: string,
  ownedSkinIds: string[],
): boolean {
  if (skinId === defaultSkinIdFor(heroId)) return true;
  return ownedSkinIds.includes(skinId);
}

export function getHeroSpritePrefix(
  heroId: string,
  skinId: string | null,
): string {
  const hero = getHero(heroId);
  if (!hero) throw new Error(`Héros inconnu : ${heroId}`);
  if (!skinId || skinId === defaultSkinIdFor(heroId)) return hero.idleFramePrefix;
  return `/sprites/mc/${hero.slug}/skins/${skinId}/idle/frame`;
}
