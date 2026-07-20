import type { Hero } from "../types";

// US-18 : catalogue statique des combattants (héros). Source unique — la base
// ne stocke que la possession (unlocked_heroes) et l'équipé (profiles).
// Rendu idle via components/combat/IdleSprite (frames PNG individuelles).
export const DEFAULT_HERO_ID = "fire_knight";

const idlePrefix = (slug: string) => `/sprites/mc/${slug}/idle/frame`;

export const HEROES: Hero[] = [
  {
    id: "fire_knight",
    name: "Chevalier de Feu",
    element: "Feu",
    slug: "fire-knight",
    idleFramePrefix: idlePrefix("fire-knight"),
    idleFrameCount: 8,
    price: 0,
    isDefault: true,
  },
  {
    id: "water_priestess",
    name: "Prêtresse de l'Eau",
    element: "Eau",
    slug: "water-priestess",
    idleFramePrefix: idlePrefix("water-priestess"),
    idleFrameCount: 8,
    price: 200,
    isDefault: false,
  },
  {
    id: "ground_monk",
    name: "Moine de la Terre",
    element: "Terre",
    slug: "ground-monk",
    idleFramePrefix: idlePrefix("ground-monk"),
    idleFrameCount: 6,
    price: 200,
    isDefault: false,
  },
  {
    id: "wind_hashashin",
    name: "Assassin du Vent",
    element: "Vent",
    slug: "wind-hashashin",
    idleFramePrefix: idlePrefix("wind-hashashin"),
    idleFrameCount: 8,
    price: 300,
    isDefault: false,
  },
  {
    id: "leaf_ranger",
    name: "Rôdeur des Feuilles",
    element: "Feuille",
    slug: "leaf-ranger",
    idleFramePrefix: idlePrefix("leaf-ranger"),
    idleFrameCount: 12,
    price: 300,
    isDefault: false,
  },
  {
    id: "crystal_mauler",
    name: "Broyeur de Cristal",
    element: "Cristal",
    slug: "crystal-mauler",
    idleFramePrefix: idlePrefix("crystal-mauler"),
    idleFrameCount: 8,
    price: 350,
    isDefault: false,
  },
  {
    id: "metal_bladekeeper",
    name: "Gardien des Lames",
    element: "Métal",
    slug: "metal-bladekeeper",
    idleFramePrefix: idlePrefix("metal-bladekeeper"),
    idleFrameCount: 8,
    price: 350,
    isDefault: false,
  },
];

export function getHero(id: string): Hero | undefined {
  return HEROES.find((h) => h.id === id);
}

// Le héros par défaut est toujours possédé (aucune ligne requise en base).
export function isHeroOwned(heroId: string, ownedIds: string[]): boolean {
  const hero = getHero(heroId);
  if (hero?.isDefault) return true;
  return ownedIds.includes(heroId);
}
