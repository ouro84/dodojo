-- US-18 : héros actuellement équipé (affiché dans l'Arène). Défaut = fire_knight.
alter table public.profiles
  add column equipped_hero_id text not null default 'fire_knight';
