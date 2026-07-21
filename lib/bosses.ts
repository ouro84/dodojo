import {
  BACKGROUNDS,
  backgroundsForThemes,
  type Background,
  type BackgroundTheme,
} from "./backgrounds";

// Roster des Boss quotidiens. Sprites idle extraits vers
// public/sprites/bosses/<slug>/idle/frameNNNN.png (base 0, 4 chiffres) par
// scripts/copy-boss-sprites.mjs. `backgroundThemes` = thèmes de décor cohérents
// avec le lore du boss ; toutes les variantes de ces thèmes entrent dans son pool
// (on n'envoie pas un monstre marin dans un ciel de montagne).
// Licences : cf. ASSETS.md — à vérifier avant prod monétisée.
export interface Boss {
  id: string;
  name: string;
  slug: string;
  idleFramePrefix: string;
  idleFrameCount: number;
  lore: string;
  backgroundThemes: BackgroundTheme[];
  // Miroir horizontal du sprite : le boss est à droite de l'Arène et doit
  // regarder le héros (à gauche). Vrai pour les sprites qui regardent à droite.
  flip: boolean;
}

function boss(
  id: string,
  name: string,
  idleFrameCount: number,
  lore: string,
  backgroundThemes: BackgroundTheme[],
  flip = false,
): Boss {
  return {
    id,
    name,
    slug: id,
    idleFramePrefix: `/sprites/bosses/${id}/idle/frame`,
    idleFrameCount,
    lore,
    backgroundThemes,
    flip,
  };
}

export const BOSSES: Boss[] = [
  boss("frost-guardian", "le Gardien de Glace", 6,
    "Colosse de givre gardien des cimes gelées.",
    ["crystal-cave", "mountain-peak"]),
  boss("demon-slime", "le Démon de Feu Mineur", 6,
    "Créature démoniaque des donjons, née des braises.",
    ["ancient-temple", "castle-interior"]),
  boss("cthulhu", "Cthulhu l'Abyssal", 15,
    "Horreur cosmique remontée des abysses.",
    ["underwater-world", "ancient-temple", "crystal-cave"], true),
  boss("minotaur", "le Minotaure Ancestral", 16,
    "Bête cornue rôdant dans les labyrinthes de pierre.",
    ["ancient-temple", "castle-interior", "desert-oasis"]),
  boss("satyr", "le Satyre Sylvestre", 7,
    "Créature mi-homme mi-bouc des mythes anciens.",
    ["ancient-temple", "mountain-peak"], true),
  boss("urban-zombie", "le Zombie des Rues", 6,
    "Mort-vivant errant dans les ruelles industrielles.",
    ["steampunk-cityscape"], true),
  boss("mushroom", "le Champignon Corrompu", 7,
    "Spore géante née dans les cavernes humides.",
    ["crystal-cave", "ancient-temple"], true),
  boss("gorgon", "la Gorgone", 7,
    "Femme-serpent au regard pétrifiant des cités perdues.",
    ["ancient-temple", "desert-oasis", "underwater-world"], true),
  boss("fire-wizard", "le Mage de Feu", 7,
    "Sorcier retranché dans sa tour, maître des flammes.",
    ["castle-interior", "crystal-cave"], true),
  boss("lightning-mage", "le Mage de Foudre", 7,
    "Invocateur d'orages perché sur les hauteurs.",
    ["mountain-peak", "castle-interior"], true),
  boss("gangster", "le Caïd", 6,
    "Truand qui règne sur les bas-fonds de la ville.",
    ["steampunk-cityscape"], true),
  boss("knight", "le Chevalier Déchu", 4,
    "Ancien champion corrompu, hantant sa forteresse.",
    ["castle-interior", "mountain-peak"], true),
];

const BY_ID = new Map(BOSSES.map((b) => [b.id, b]));

export function getBoss(id: string): Boss | undefined {
  return BY_ID.get(id);
}

export const DEFAULT_BOSS_ID = "frost-guardian";

// Tire un boss du jour au hasard, en excluant les boss des jours récents fournis
// (typiquement les 2 derniers). Si l'exclusion vide le pool, on retombe sur le
// pool complet. `rng` injecté pour la testabilité.
export function pickDailyBoss(
  recentBossIds: string[],
  rng: () => number = Math.random,
  pool: Boss[] = BOSSES,
): Boss {
  const excluded = new Set(recentBossIds.slice(0, 2));
  const candidates = pool.filter((b) => !excluded.has(b.id));
  const list = candidates.length > 0 ? candidates : pool;
  return list[Math.floor(rng() * list.length)];
}

// Tire un décor cohérent parmi toutes les variantes des thèmes autorisés du boss.
export function pickBackgroundId(
  boss: Boss,
  rng: () => number = Math.random,
  pool: Background[] = BACKGROUNDS,
): string {
  const candidates = backgroundsForThemes(boss.backgroundThemes).filter((b) =>
    pool.includes(b),
  );
  const list = candidates.length > 0 ? candidates : pool;
  return list[Math.floor(rng() * list.length)].id;
}
