// Accès typé aux métadonnées produites par scripts/build-sprite-sheets.mjs.
// Le JSON est committé : aucun accès disque au runtime.
import raw from "./sprite-metadata.generated.json";

export interface AnimMeta {
  frames: number;
  impactFrame: number | null;
}

export interface CharacterSpriteMeta {
  tileW: number;
  tileH: number;
  /** tileH / hauteur idle de référence (issue #74). Toujours >= 1. */
  renderScale: number;
  /** Espace sous les pieds de l'idle, en fraction de la tuile. */
  groundOffset: number;
  /**
   * Position du centre de la silhouette idle dans la tuile, en fraction de
   * `tileW`. Pendant horizontal de `groundOffset` (issue #156) : la tuile est
   * l'union alpha de TOUTES les anims, donc bien plus large que la silhouette
   * idle, et de façon très variable selon le personnage. Aligner la tuile
   * revient à placer chaque personnage à un endroit différent.
   */
  idleAnchorX: number;
  /** Largeur de la silhouette idle, en fraction de `tileW`. */
  idleWidthRatio: number;
  anims: Record<string, AnimMeta>;
}

const HEROES_META = raw.heroes as Record<string, CharacterSpriteMeta>;
const BOSSES_META = raw.bosses as Record<string, CharacterSpriteMeta>;

export function heroSpriteMeta(slug: string): CharacterSpriteMeta {
  const meta = HEROES_META[slug];
  if (!meta) throw new Error(`Métadonnées de sprite introuvables pour le héros ${slug}`);
  return meta;
}

export function bossSpriteMeta(slug: string): CharacterSpriteMeta {
  const meta = BOSSES_META[slug];
  if (!meta) throw new Error(`Métadonnées de sprite introuvables pour le boss ${slug}`);
  return meta;
}
