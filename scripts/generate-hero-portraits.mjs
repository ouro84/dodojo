// US-18 : génère un portrait tight par héros en rognant le vide transparent
// de la 1re frame idle. Le portrait (tête en haut) est ensuite cadré en CSS
// (object-fit: cover, object-position top) dans la matrice de l'Échoppe.
import sharp from "sharp";

const slugs = [
  "fire-knight",
  "water-priestess",
  "ground-monk",
  "wind-hashashin",
  "leaf-ranger",
  "crystal-mauler",
  "metal-bladekeeper",
];

for (const slug of slugs) {
  const src = `public/sprites/mc/${slug}/idle/frame0000.png`;
  const out = `public/sprites/mc/${slug}/portrait.png`;
  const info = await sharp(src).trim().toFile(out);
  console.log(`${slug}: ${info.width}x${info.height} -> ${out}`);
}
