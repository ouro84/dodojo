import type { Skin } from "../types";
import { getHero } from "./heroes";

// US-53 : catalogue statique des tenues (recolors de héros). Source unique —
// la base ne stocke que la possession (unlocked_skins) et l'équipé
// (profiles.equipped_skin_id). Génération des sprites : scripts/generate-hero-skins.mjs.
// Issue #75 : lore courte (1-2 phrases), registre "récits externes classiques"
// — bio d'origine sur "Défaut", petit événement narratif par tenue
// alternative. Texte fixe, non-leveled (pas de passage par lib/copy/), même
// patron que Boss.lore (lib/bosses.ts).
export const SKINS: Skin[] = [
  // Fire Knight (Tier B — mono-palette, recolor global accepté)
  { id: "fire_knight_default", heroId: "fire_knight", name: "Défaut", price: 0, isDefault: true, swatchColor: "#c0392b", lore: "Autrefois garde d'un royaume déjà réduit en cendres, il a fait du feu son unique allégeance." },
  { id: "fire_knight_shadow_purple", heroId: "fire_knight", name: "Éclipse", price: 300, isDefault: false, swatchColor: "#5b2c8f", lore: "Une nuit sans lune, il a affronté son reflet dans les braises — son armure en a gardé la teinte." },

  // Ground Monk (Tier B)
  { id: "ground_monk_default", heroId: "ground_monk", name: "Défaut", price: 0, isDefault: true, swatchColor: "#8a6a3a", lore: "Formé dans un monastère bâti à même la roche, il n'a jamais quitté la terre qui l'a élevé." },
  { id: "ground_monk_shadow_purple", heroId: "ground_monk", name: "Éclipse", price: 300, isDefault: false, swatchColor: "#5c3a8f", lore: "On raconte qu'il a médité sept jours dans une grotte sans lumière — sa robe en a gardé la couleur." },

  // Wind Hashashin (Tier B)
  { id: "wind_hashashin_default", heroId: "wind_hashashin", name: "Défaut", price: 0, isDefault: true, swatchColor: "#c9a15a", lore: "Ombre entraînée dans les cols balayés par les vents, il frappe et disparaît avant que l'écho ne retombe." },
  { id: "wind_hashashin_azure", heroId: "wind_hashashin", name: "Blizzard", price: 300, isDefault: false, swatchColor: "#2980b9", lore: "Traqué jusqu'aux sommets gelés, il y a survécu — et en est revenu avec le froid dans le regard." },

  // Water Priestess (Tier A — séparation costume/peau nette)
  { id: "water_priestess_default", heroId: "water_priestess", name: "Défaut", price: 0, isDefault: true, swatchColor: "#2980b9", lore: "Gardienne d'un temple englouti, elle continue d'en porter les rites sur la terre ferme." },
  { id: "water_priestess_ember", heroId: "water_priestess", name: "Braise", price: 300, isDefault: false, swatchColor: "#c0392b", lore: "Elle a traversé un désert pour retrouver son temple — la légende dit que l'eau qu'elle portait s'est mise à bouillir." },
  { id: "water_priestess_verdant", heroId: "water_priestess", name: "Sylvestre", price: 300, isDefault: false, swatchColor: "#27ae60", lore: "Initiée par les druides d'une forêt-marais, elle a mêlé leurs rites aux siens." },
  { id: "water_priestess_amethyst", heroId: "water_priestess", name: "Astral", price: 300, isDefault: false, swatchColor: "#8e44ad", lore: "Une nuit, elle a puisé l'eau d'un lac qui reflétait les étoiles plutôt que le ciel — elle ne l'a plus jamais quitté." },

  // Leaf Ranger (Tier A)
  { id: "leaf_ranger_default", heroId: "leaf_ranger", name: "Défaut", price: 0, isDefault: true, swatchColor: "#16a085", lore: "Née dans une forêt qui n'a pas de nom sur les cartes, elle en connaît chaque sentier par cœur." },
  { id: "leaf_ranger_ember", heroId: "leaf_ranger", name: "Braise", price: 300, isDefault: false, swatchColor: "#c0392b", lore: "Elle a traversé un incendie de forêt sans jamais lâcher son arc — les feuilles de sa tenue en ont gardé la marque." },
  { id: "leaf_ranger_amethyst", heroId: "leaf_ranger", name: "Astral", price: 300, isDefault: false, swatchColor: "#8e44ad", lore: "Elle chasse désormais sous un ciel qu'elle est seule à savoir lire." },

  // Crystal Mauler (Tier A)
  { id: "crystal_mauler_default", heroId: "crystal_mauler", name: "Défaut", price: 0, isDefault: true, swatchColor: "#34495e", lore: "Extrait d'une mine effondrée qu'on croyait vide d'âme, il n'a plus jamais reposé son marteau." },
  { id: "crystal_mauler_ember", heroId: "crystal_mauler", name: "Braise", price: 300, isDefault: false, swatchColor: "#c0392b", lore: "Il a forgé son arme dans un volcan actif — seuls les plus déterminés reviennent de cette mine." },
  { id: "crystal_mauler_verdant", heroId: "crystal_mauler", name: "Sylvestre", price: 300, isDefault: false, swatchColor: "#27ae60", lore: "Une mine engloutie par la forêt l'a vu naître — le cristal et la sève y coulent presque de la même veine." },
  { id: "crystal_mauler_amethyst", heroId: "crystal_mauler", name: "Astral", price: 300, isDefault: false, swatchColor: "#8e44ad", lore: "Il a taillé sa dernière arme dans un fragment de météorite tombé une nuit sans témoin." },

  // Metal Bladekeeper (Tier C — overlay tint, pas de hue-rotate) — héroïne, cf. issue #75
  { id: "metal_bladekeeper_default", heroId: "metal_bladekeeper", name: "Défaut", price: 0, isDefault: true, swatchColor: "#7f8c8d", lore: "Dernière de sa garnison encore debout, elle continue de veiller un poste que plus personne ne défend." },
  { id: "metal_bladekeeper_bronze", heroId: "metal_bladekeeper", name: "Bronze Ancien", price: 300, isDefault: false, swatchColor: "#8a6a3a", lore: "Son armure provient d'un champ de bataille oublié depuis des générations — elle n'a jamais rouillé." },
  { id: "metal_bladekeeper_dark_steel", heroId: "metal_bladekeeper", name: "Acier Noirci", price: 300, isDefault: false, swatchColor: "#3a3f47", lore: "Forgée dans les cendres d'une bataille qu'elle fut seule à survivre, cette armure ne réfléchit plus la lumière." },
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

// Issue #122 : tarif plat — 0 pour la tenue "default", 300 pour toute
// alternative. Abroge la formule "30% du prix du héros arrondi à la dizaine"
// (D7 du spec US-53). Le helper reste la "source unique théorique" du prix
// d'une tenue alternative ; personne ne l'appelle dans le code applicatif
// (les prix sont hardcoded dans SKINS ci-dessus), mais le test le verrouille
// — un appelant futur qui voudrait calculer un prix doit passer par ici.
export function skinPrice(isDefault: boolean): number {
  return isDefault ? 0 : 300;
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

export function getHeroSpriteBase(heroId: string, skinId: string | null): string {
  const hero = getHero(heroId);
  if (!hero) throw new Error(`Héros inconnu : ${heroId}`);
  if (!skinId || skinId === defaultSkinIdFor(heroId)) return hero.spriteBase;
  return `${hero.spriteBase}/skins/${skinId}`;
}
