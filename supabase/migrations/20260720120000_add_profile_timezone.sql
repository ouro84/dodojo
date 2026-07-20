alter table public.profiles
  add column timezone text not null default 'UTC';
