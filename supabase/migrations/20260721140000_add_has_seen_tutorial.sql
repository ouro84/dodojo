-- US-29 : le coach du 1er combat ne se joue qu'une fois. Flag par profil.
alter table public.profiles
  add column if not exists has_seen_tutorial boolean not null default false;
