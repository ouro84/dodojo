alter table public.profiles
  add column aggressivity_level text not null default 'sparring'
  check (aggressivity_level in ('sensei', 'sparring', 'street'));
