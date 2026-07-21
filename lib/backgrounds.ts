// Décors de l'Arène (CraftPix, cf. ASSETS.md). Rendu plat extrait vers
// public/backgrounds/<id>.png par scripts/copy-boss-sprites.mjs. Plusieurs
// variantes par thème : le boss cible un ou plusieurs THÈMES (cohérents avec son
// lore) et toutes les variantes de ces thèmes entrent dans son pool.
export type BackgroundTheme =
  | "ancient-temple"
  | "castle-interior"
  | "crystal-cave"
  | "desert-oasis"
  | "mountain-peak"
  | "steampunk-cityscape"
  | "underwater-world";

export interface Background {
  id: string;
  name: string;
  theme: BackgroundTheme;
  publicPath: string;
}

const THEME_LABEL: Record<BackgroundTheme, string> = {
  "ancient-temple": "Temple antique",
  "castle-interior": "Château",
  "crystal-cave": "Grotte de cristal",
  "desert-oasis": "Désert",
  "mountain-peak": "Sommet montagneux",
  "steampunk-cityscape": "Ville steampunk",
  "underwater-world": "Monde sous-marin",
};

// Variantes réellement extraites (cf. sortie de copy-boss-sprites.mjs).
const VARIANTS: Record<BackgroundTheme, number> = {
  "ancient-temple": 3,
  "castle-interior": 3,
  "crystal-cave": 2,
  "desert-oasis": 2,
  "mountain-peak": 2,
  "steampunk-cityscape": 2,
  "underwater-world": 2,
};

const ROMAN = ["", "", " II", " III", " IV"];

function build(): Background[] {
  const list: Background[] = [];
  for (const theme of Object.keys(VARIANTS) as BackgroundTheme[]) {
    for (let v = 1; v <= VARIANTS[theme]; v++) {
      const id = v === 1 ? theme : `${theme}-${v}`;
      list.push({
        id,
        theme,
        name: THEME_LABEL[theme] + ROMAN[v],
        publicPath: `/backgrounds/${id}.png`,
      });
    }
  }
  return list;
}

export const BACKGROUNDS: Background[] = build();

const BY_ID = new Map(BACKGROUNDS.map((b) => [b.id, b]));

export function getBackground(id: string): Background | undefined {
  return BY_ID.get(id);
}

export function backgroundsForThemes(themes: BackgroundTheme[]): Background[] {
  const set = new Set(themes);
  return BACKGROUNDS.filter((b) => set.has(b.theme));
}

export const DEFAULT_BACKGROUND_ID = "steampunk-cityscape";
