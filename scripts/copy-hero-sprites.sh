#!/usr/bin/env bash
# US-18 : copie/renomme les frames idle des héros achetables vers public/.
# Source : assets/MC/<pack>/**/01_idle/*.png (base 1, ordre naturel)
# Cible  : public/sprites/mc/<slug>/idle/frameNNNN.png (base 0, 4 chiffres)
# Compatible avec components/combat/IdleSprite (framePrefix + index 4 chiffres).
set -euo pipefail

# slug|dossier racine du pack dans assets/MC
map=(
  "water-priestess|Elementals_water_priestess_FREE_v1.1"
  "ground-monk|Elementals_ground_monk_FREE_v1.3.1"
  "wind-hashashin|elementals_wind_hashashin_FREE_v1.1"
  "crystal-mauler|Elementals_Crystal_Mauler_Free_v1.0"
  "leaf-ranger|Elementals_Leaf_ranger_Free_v1.0"
  "metal-bladekeeper|Elementals_metal_bladekeeper_FREE_v1.1"
)

for entry in "${map[@]}"; do
  IFS='|' read -r slug pack <<< "$entry"
  # Recherche tolérante du dossier idle (casse/chemins variables entre packs).
  src=$(find "assets/MC/$pack" -type d -iname "*idle*" | head -n1 || true)
  if [[ -z "$src" ]]; then
    echo "SKIP $slug (dossier idle introuvable dans $pack)"
    continue
  fi
  dest="public/sprites/mc/$slug/idle"
  mkdir -p "$dest"
  i=0
  while IFS= read -r f; do
    printf -v n "%04d" "$i"
    cp "$f" "$dest/frame$n.png"
    i=$((i + 1))
  done < <(ls "$src"/*.png | sort -V)
  echo "$slug : $i frames -> $dest"
done
