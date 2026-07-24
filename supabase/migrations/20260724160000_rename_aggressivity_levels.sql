-- Renomme les valeurs de profiles.aggressivity_level suite au reframe
-- "Démon Intérieur" (issue #51) : sensei/sparring/street → doux/direct/brut.
alter table public.profiles
  drop constraint if exists profiles_aggressivity_level_check;

update public.profiles set aggressivity_level = 'doux' where aggressivity_level = 'sensei';
update public.profiles set aggressivity_level = 'direct' where aggressivity_level = 'sparring';
update public.profiles set aggressivity_level = 'brut' where aggressivity_level = 'street';

alter table public.profiles
  alter column aggressivity_level set default 'direct';

alter table public.profiles
  add constraint profiles_aggressivity_level_check
  check (aggressivity_level in ('doux', 'direct', 'brut'));
