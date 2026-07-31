-- Issue #72 : titre équipé manuellement (remplace current_title — cf. Task 12
-- du plan pour la suppression de l'ancienne colonne une fois tous les
-- appelants migrés).
alter table public.profiles
  add column equipped_title_code text null,
  add column title_manually_set boolean not null default false;
