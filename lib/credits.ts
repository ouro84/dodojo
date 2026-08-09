// Issue #134 : crédite les créateurs des assets réellement livrés dans
// public/ (pas tout assets/ — cf. ASSETS.md § usage). Un entry par
// pack/créateur, pas par sprite individuel. Le badge "rencontré en combat"
// (isArtisanSeen) est purement cosmétique : l'attribution elle-même
// (creator/packName/license/lore) reste toujours affichée, jamais masquée
// derrière une progression de jeu — contrainte légale posée en spec.
export type ArtisanCategory = "heros" | "boss" | "decors" | "police" | "icones";

export type ArtisanSpriteRef =
  | { kind: "hero"; heroId: string }
  | { kind: "boss"; bossId: string }
  | { kind: "background"; backgroundId: string }
  | { kind: "font" }
  | { kind: "icon" };

export interface ArtisanEntry {
  id: string;
  creator: string;
  packName: string;
  category: ArtisanCategory;
  lore: string;
  license?: string;
  sourceUrl?: string;
  spriteRef: ArtisanSpriteRef;
}

export const ARTISANS: ArtisanEntry[] = [
  {
    id: "elementals-series",
    creator: 'Auteur non identifié (série "Elementals")',
    packName:
      "Elementals — Fire Knight / Water Priestess / Ground Monk / Wind Hashashin / Leaf Ranger / Crystal Mauler / Metal Bladekeeper",
    category: "heros",
    lore: "Sept silhouettes taillées dans le même feu, prêtes à porter ton reflet au combat.",
    spriteRef: { kind: "hero", heroId: "fire_knight" },
  },
  {
    id: "boss-vrais-boss",
    creator: 'Auteur non identifié (packs "vrais boss")',
    packName: "Frost Guardian / Boss Demon Slime / Free Cthulhu / Mino v1.1",
    category: "boss",
    lore: "Quatre masques que porte le Boss les jours où il ne se contente pas d'un simple sbire.",
    spriteRef: { kind: "boss", bossId: "frost-guardian" },
  },
  {
    id: "boss-low-boss-craftpix",
    creator: "CraftPix",
    packName:
      'Low Boss Bundle (8 packs CraftPix : Satyr, Urban Zombie, Mushroom, Gorgon, Minotaure, Sorciers, Gangster, Chevalier — 23 boss du roster, dont plusieurs recolors)',
    category: "boss",
    license: "Licence CraftPix gratuite — usage produit final OK, revente des fichiers bruts interdite",
    sourceUrl: "https://craftpix.net/file-licenses/",
    lore: "Le plus gros du roster : vingt-trois visages différents pour la même chose qui traîne en toi.",
    spriteRef: { kind: "boss", bossId: "satyr" },
  },
  {
    id: "decors-craftpix",
    creator: "CraftPix",
    packName:
      "7 packs de décors CraftPix (Château, Temple antique, Grotte de cristal, Désert, Sommet montagneux, Ville steampunk, Monde sous-marin)",
    category: "decors",
    license: "Licence CraftPix gratuite — usage produit final OK, revente des fichiers bruts interdite",
    sourceUrl: "https://craftpix.net/file-licenses/",
    lore: "Sept décors, seize variantes : l'arène change de peau, jamais de nature.",
    spriteRef: { kind: "background", backgroundId: "castle-interior" },
  },
  {
    id: "icons-raven-fantasy",
    creator: "Caio / Clockwork Raven Studios",
    packName: "Raven Fantasy Icons",
    category: "icones",
    license: "Non explicite localement — à vérifier auprès de la page itch.io d'origine avant usage commercial",
    lore: "2192 reliques de loot, dont quinze ont fini punaisées au mur du Vestiaire en guise de pictogrammes.",
    spriteRef: { kind: "icon" },
  },
  {
    id: "font-boldpixels",
    creator: "Yūki (YukiPixels)",
    packName: "BoldPixels",
    category: "police",
    license: "CC BY-SA 4.0 — attribution requise",
    sourceUrl: "https://yukipixels.itch.io/",
    lore: "Chaque titre, chaque chiffre de dégâts que tu lis passe par cette police.",
    spriteRef: { kind: "font" },
  },
];

export interface ArtisanSeenContext {
  unlockedHeroIds: string[];
  seenBossIds: string[];
  seenBackgroundIds: string[];
}

// "Rencontré" n'a pas de sens pour une police ni pour les icônes UI (pas de
// mécanique de rencontre en jeu) — toujours vrai, jamais un verrou puisque cette valeur
// ne conditionne l'affichage de rien d'obligatoire (le composant choisit de
// ne pas afficher de badge du tout pour "font", cf. ArtisansCarousel).
export function isArtisanSeen(entry: ArtisanEntry, ctx: ArtisanSeenContext): boolean {
  switch (entry.spriteRef.kind) {
    case "hero":
      return ctx.unlockedHeroIds.includes(entry.spriteRef.heroId);
    case "boss":
      return ctx.seenBossIds.includes(entry.spriteRef.bossId);
    case "background":
      return ctx.seenBackgroundIds.includes(entry.spriteRef.backgroundId);
    case "font":
      return true;
    case "icon":
      return true;
  }
}
