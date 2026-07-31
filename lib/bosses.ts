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
  boss("frost-guardian", "Gardien de Glace", 6,
    "Colosse de givre gardien des cimes gelées.",
    ["crystal-cave", "mountain-peak"]),
  boss("demon-slime", "Démon de Feu Mineur", 6,
    "Créature démoniaque des donjons, née des braises.",
    ["ancient-temple", "castle-interior"]),
  boss("cthulhu", "Cthulhu l'Abyssal", 15,
    "Horreur cosmique remontée des abysses.",
    ["underwater-world", "ancient-temple", "crystal-cave"], true),
  boss("minotaur", "Minotaure Ancestral", 16,
    "Bête cornue rôdant dans les labyrinthes de pierre.",
    ["ancient-temple", "castle-interior", "desert-oasis"]),
  boss("satyr", "Satyre Sylvestre", 7,
    "Créature mi-homme mi-bouc des mythes anciens.",
    ["ancient-temple", "mountain-peak"], true),
  boss("urban-zombie", "Zombie des Rues", 6,
    "Mort-vivant errant dans les ruelles industrielles.",
    ["steampunk-cityscape"], true),
  boss("mushroom", "Champignon Corrompu", 7,
    "Spore géante née dans les cavernes humides.",
    ["crystal-cave", "ancient-temple"]),
  boss("gorgon", "Gorgone", 7,
    "Femme-serpent au regard pétrifiant des cités perdues.",
    ["ancient-temple", "desert-oasis", "underwater-world"], true),
  boss("fire-wizard", "Mage de Feu", 7,
    "Sorcier retranché dans sa tour, maître des flammes.",
    ["castle-interior", "crystal-cave"], true),
  boss("lightning-mage", "Mage de Foudre", 7,
    "Invocateur d'orages perché sur les hauteurs.",
    ["mountain-peak", "castle-interior"], true),
  boss("gangster", "Caïd", 6,
    "Truand qui règne sur les bas-fonds de la ville.",
    ["steampunk-cityscape"], true),
  boss("knight", "Chevalier Déchu", 4,
    "Ancien champion corrompu, hantant sa forteresse.",
    ["castle-interior", "mountain-peak"], true),
  boss("temptress", "Tentatrice", 7,
    "Voix charmeuse qui jure qu'un jour de repos ne changera rien.",
    ["castle-interior", "steampunk-cityscape"], true),
  boss("idler", "Flâneuse", 6,
    "Ne presse jamais rien, et voudrait bien que tu fasses pareil.",
    ["steampunk-cityscape", "desert-oasis"], true),
  boss("jaded", "Blasé", 6,
    "Plus rien ne l'étonne, plus rien ne presse — modèle dangereux à suivre.",
    ["steampunk-cityscape"], true),
  boss("procrastinator", "Ajourneuse", 6,
    "Garde toujours un « demain » tout prêt au bord des lèvres.",
    ["steampunk-cityscape"], true),
  boss("dock-corpse", "Cadavre des Docks", 7,
    "Traîné jusqu'aux quais par une routine qui ne finit jamais.",
    ["steampunk-cityscape"], true),
  boss("gorgon-ivory", "Gorgone d'Ivoire", 7,
    "Regard pétrifiant, teint pâle des cryptes oubliées.",
    ["ancient-temple", "desert-oasis", "underwater-world"], true),
  boss("gorgon-scarlet", "Gorgone Écarlate", 7,
    "Femme-serpent aux écailles rouges, née des braises anciennes.",
    ["ancient-temple", "desert-oasis", "underwater-world"], true),
  boss("accomplice", "Complice", 7,
    "Ne dirige rien, ne décide rien — suit, comme toi tu remets à plus tard.",
    ["steampunk-cityscape"], true),
  boss("mob-baron", "Baron", 7,
    "Costume impeccable, mains propres : la procrastination qui a l'air productive.",
    ["steampunk-cityscape"], true),
  boss("knight-amethyst", "Chevalier Améthyste", 4,
    "Ancien duelliste pétrifié dans son armure, fier et immobile.",
    ["castle-interior", "mountain-peak"], true),
  boss("knight-garnet", "Chevalier Grenat", 4,
    "Garde écarlate d'une forteresse qui n'existe plus.",
    ["castle-interior", "mountain-peak"], true),
  boss("wandering-mage", "Sorcier Errant", 8,
    "Mage sans but, économe de ses sorts comme toi de ton énergie.",
    ["mountain-peak", "crystal-cave"], true),
  boss("minotaur-warrior", "Minotaure Belliqueux", 10,
    "Bête cornue, lame en main, née pour ne jamais reculer.",
    ["ancient-temple", "castle-interior", "desert-oasis"], true),
  boss("minotaur-ardent", "Minotaure Ardent", 10,
    "Bête cornue à la hache, forgée dans les braises du labyrinthe.",
    ["ancient-temple", "castle-interior", "desert-oasis"], true),
  boss("minotaur-occult", "Minotaure Occulte", 10,
    "Bête cornue aux rites anciens, gardienne des passages secrets.",
    ["ancient-temple", "castle-interior", "desert-oasis", "crystal-cave"], true),
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
