// Décors de l'Arène (CraftPix, cf. ASSETS.md). Rendu plat extrait vers
// public/backgrounds/<id>.png par scripts/copy-boss-sprites.mjs.
export interface Background {
  id: string;
  name: string;
  publicPath: string;
}

export const BACKGROUNDS: Background[] = [
  { id: "ancient-temple", name: "Temple antique", publicPath: "/backgrounds/ancient-temple.png" },
  { id: "castle-interior", name: "Château", publicPath: "/backgrounds/castle-interior.png" },
  { id: "crystal-cave", name: "Grotte de cristal", publicPath: "/backgrounds/crystal-cave.png" },
  { id: "desert-oasis", name: "Désert", publicPath: "/backgrounds/desert-oasis.png" },
  { id: "mountain-peak", name: "Sommet montagneux", publicPath: "/backgrounds/mountain-peak.png" },
  { id: "steampunk-cityscape", name: "Ville steampunk", publicPath: "/backgrounds/steampunk-cityscape.png" },
  { id: "underwater-world", name: "Monde sous-marin", publicPath: "/backgrounds/underwater-world.png" },
];

const BY_ID = new Map(BACKGROUNDS.map((b) => [b.id, b]));

export function getBackground(id: string): Background | undefined {
  return BY_ID.get(id);
}

export const DEFAULT_BACKGROUND_ID = "steampunk-cityscape";
