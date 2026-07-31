import type { Hero } from "../types";

// US-18 : catalogue statique des combattants (héros). Source unique — la base
// ne stocke que la possession (unlocked_heroes) et l'équipé (profiles).
// Rendu via components/combat/CharacterSprite (spritesheets, issue #48).
export const DEFAULT_HERO_ID = "fire_knight";

const spriteBase = (slug: string) => `/sprites/mc/${slug}`;

export const HEROES: Hero[] = [
  {
    id: "fire_knight",
    name: "Chevalier de Feu",
    element: "Feu",
    slug: "fire-knight",
    spriteBase: spriteBase("fire-knight"),
    price: 500,
    isDefault: true,
  },
  {
    id: "water_priestess",
    name: "Prêtresse de l'Eau",
    element: "Eau",
    slug: "water-priestess",
    spriteBase: spriteBase("water-priestess"),
    price: 500,
    isDefault: false,
  },
  {
    id: "ground_monk",
    name: "Moine de la Terre",
    element: "Terre",
    slug: "ground-monk",
    spriteBase: spriteBase("ground-monk"),
    price: 500,
    isDefault: false,
  },
  {
    id: "wind_hashashin",
    name: "Assassin du Vent",
    element: "Vent",
    slug: "wind-hashashin",
    spriteBase: spriteBase("wind-hashashin"),
    price: 500,
    isDefault: false,
  },
  {
    id: "leaf_ranger",
    name: "Rôdeur des Feuilles",
    element: "Feuille",
    slug: "leaf-ranger",
    spriteBase: spriteBase("leaf-ranger"),
    price: 500,
    isDefault: false,
  },
  {
    id: "crystal_mauler",
    name: "Broyeur de Cristal",
    element: "Cristal",
    slug: "crystal-mauler",
    spriteBase: spriteBase("crystal-mauler"),
    price: 500,
    isDefault: false,
  },
  {
    id: "metal_bladekeeper",
    name: "Gardien des Lames",
    element: "Métal",
    slug: "metal-bladekeeper",
    spriteBase: spriteBase("metal-bladekeeper"),
    price: 500,
    isDefault: false,
  },
];

export function getHero(id: string): Hero | undefined {
  return HEROES.find((h) => h.id === id);
}

// US-29 : possession strictement en base. Le starter choisi à l'onboarding est
// offert (ligne `unlocked_heroes` à price_paid=0) ; plus aucun héros gratuit
// implicite. `isDefault` ne sert plus que de fallback de rendu (DEFAULT_HERO_ID).
export function isHeroOwned(heroId: string, ownedIds: string[]): boolean {
  return ownedIds.includes(heroId);
}
