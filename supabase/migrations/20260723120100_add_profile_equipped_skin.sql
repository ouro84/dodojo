-- US-53 : tenue actuellement équipée (recolor du héros affiché dans l'Arène).
-- null = tenue par défaut (aucune ligne unlocked_skins nécessaire, D4 du spec).
alter table public.profiles
  add column equipped_skin_id text;
