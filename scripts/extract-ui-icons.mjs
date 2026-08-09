// Issue #187 (chasse aux emojis) : extrait un lot d'icônes UI 16-bit depuis
// assets/Icons/Free - Raven Fantasy Icons (pack "loot RPG", jamais utilisé en
// code jusqu'ici — cf. ASSETS.md § 5 et dette notée issue #134). Coordonnées
// (row/col sur la grille 16×137 de la feuille 64×64) trouvées par inspection
// visuelle et validées manuellement une à une, pas par nommage de fichier
// (la feuille source n'a aucune métadonnée de catégorie). Ne jamais faire
// pointer le code vers assets/ directement (règle ASSETS.md) : ce script est
// le seul pont vers public/icons/ui/.
import sharp from "sharp";

const SPRITESHEET =
  'assets/Icons/Free - Raven Fantasy Icons/Full Spritesheet/64x64.png';
const TILE = 64;
const OUT_DIR = "public/icons/ui";

const ICONS = [
  { name: "profil", row: 119, col: 4 }, // casque bleu — équipement de héros
  { name: "trophy", row: 0, col: 14 }, // coupe à deux anses
  { name: "artisans", row: 2, col: 6 }, // enclume
  { name: "marche", row: 0, col: 5 }, // coffre au trésor
  { name: "guide", row: 6, col: 5 }, // livre ouvert vert
  { name: "legal", row: 7, col: 11 }, // balance
  { name: "sword", row: 9, col: 10 }, // épée simple
  { name: "gold", row: 8, col: 2 }, // pièce d'or (monnaie + succès "or")
  { name: "bronze", row: 8, col: 0 }, // pièce bronze (succès)
  { name: "silver", row: 8, col: 1 }, // pièce argent (succès)
  { name: "platinum", row: 10, col: 4 }, // diamant violet (succès platine)
  { name: "streak", row: 62, col: 0 }, // flamme simple
  { name: "warning", row: 42, col: 0 }, // crâne et tibias
  { name: "sleep", row: 65, col: 1 }, // "Z Z" sommeil
];

for (const { name, row, col } of ICONS) {
  const out = `${OUT_DIR}/${name}.png`;
  const info = await sharp(SPRITESHEET)
    .extract({ left: col * TILE, top: row * TILE, width: TILE, height: TILE })
    .toFile(out);
  console.log(`${name}: (row ${row}, col ${col}) -> ${out} (${info.width}x${info.height})`);
}
